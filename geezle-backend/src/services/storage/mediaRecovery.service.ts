/**
 * Phase 2 — Historical Media Recovery & Auto Repair
 *
 * Audits File rows + optional GCS orphan scan (prefix-scoped, bounded).
 * Dry-run: report only (zero mutations).
 * Repair: copy recoverable bytes into GCS and update storageProvider/storageKey only.
 *
 * Safety invariants:
 * - Never delete objects or File rows
 * - Never modify healthy (already durable) media
 * - Never overwrite existing different GCS objects
 * - Preserve fileId, ownerId, visibility, mimeType, size, url, entity refs
 * - No HTTP/SSRF fetching of stored URLs
 * - Path traversal rejected for local keys
 * - Concurrent same-file repair protected (in-process lock + compare-before-update)
 * - Failed GCS verify → no DB update
 * - Failed DB update after new GCS object → cleanup-required (no auto-delete)
 */

import fs from 'fs';
import path from 'path';
import {
  GOOGLE_CLOUD_STORAGE_PROVIDER,
  downloadGcsMediaBuffer,
  gcsMediaExists,
  getGcsMediaMetadata,
  listGcsMediaObjectKeys,
  uploadToGcsMedia,
  isGcsMediaConfigured
} from './gcsMediaStorage';
import {
  databaseStorageExistsByName,
  downloadDatabaseStorageBufferByName
} from './databaseStorage';
import {
  downloadFirebaseStorageBufferByName,
  firebaseStorageExistsByName
} from './firebaseStorage';
import { blobExistsByName, downloadBlobByName } from './blobStorage';
import { buildMediaObjectKey } from './mediaStorage.service';
import prisma from '../../utils/prismaClient';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MediaHealthClass =
  | 'healthy'
  | 'missing_storage'
  | 'missing_database'
  | 'missing_both'
  | 'legacy_local'
  | 'unknown_provider';

export type RecoverySource =
  | 'gcs'
  | 'legacy_uploads'
  | 'database_storage'
  | 'firebase_storage'
  | 'azure_blob';

export type MediaRecoveryMode = 'dry-run' | 'repair';

export type FileAuditRow = {
  id: string;
  storageKey: string;
  storageProvider: string;
  filename: string;
  originalName: string;
  mimeType: string;
  size: bigint | number;
  url: string;
  ownerId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  usageTypes?: string[];
};

export type MediaFileAuditResult = {
  fileId: string;
  classification: MediaHealthClass;
  storageProvider: string;
  storageKey: string;
  declaredExists: boolean;
  recoverable: boolean;
  recoverySource: RecoverySource | null;
  recoveryKey: string | null;
  proposedGcsKey?: string | null;
  action:
    | 'none'
    | 'would_repair'
    | 'repaired'
    | 'skipped_healthy'
    | 'unrecoverable'
    | 'error'
    | 'skipped_locked'
    | 'skipped_concurrent'
    | 'cleanup_required';
  message?: string;
  newStorageKey?: string | null;
  newStorageProvider?: string | null;
  cleanupRequired?: boolean;
  cleanupObjectKey?: string | null;
  mediaUse?: string | null;
  conflictingDestination?: boolean;
};

export type OrphanGcsObject = {
  objectKey: string;
  classification: 'missing_database';
  matchedFileId: string | null;
};

export type RecoverableBySource = Record<RecoverySource, number>;

export type MediaRecoveryStatistics = {
  totalFiles: number;
  scannedFiles: number;
  healthy: number;
  recovered: number;
  recoverable: number;
  missing: number;
  orphaned: number;
  duplicates: number;
  legacyLocal: number;
  unknownProvider: number;
  unrecoverable: number;
  conflictingDestinationKeys: number;
  classifications: Record<MediaHealthClass, number>;
  storageProviderCounts: Record<string, number>;
  recoverableBySource: RecoverableBySource;
  mediaUseCounts: Record<string, number>;
};

export type MediaRecoveryReport = {
  mode: MediaRecoveryMode;
  dryRun: boolean;
  statistics: MediaRecoveryStatistics;
  results: MediaFileAuditResult[];
  orphans: OrphanGcsObject[];
  nextCursor: string | null;
  generatedAt: string;
  mutations: {
    dbUpdates: number;
    gcsUploads: number;
    gcsDeletes: number;
  };
};

export type MediaRecoveryOptions = {
  mode?: MediaRecoveryMode;
  limit?: number;
  cursor?: string | null;
  batchSize?: number;
  includeOrphanScan?: boolean;
  orphanScanLimit?: number;
  orphanPrefix?: string;
  maxResultDetails?: number;
};

export type MediaRecoveryDeps = {
  findFiles: (args: {
    take: number;
    cursorId?: string | null;
  }) => Promise<FileAuditRow[]>;
  countFiles: () => Promise<number>;
  /**
   * Conditional update: only updates when current provider+key still match expected.
   * Returns number of rows updated (0 or 1).
   */
  updateFileStorageConditional: (args: {
    id: string;
    expectedProvider: string;
    expectedStorageKey: string;
    storageProvider: string;
    storageKey: string;
  }) => Promise<number>;
  findFileIdsByStorageKeys: (keys: string[]) => Promise<Map<string, string>>;
  loadFileUsages?: (fileIds: string[]) => Promise<Map<string, string[]>>;
  gcsExists: (key: string) => Promise<boolean>;
  gcsDownload: (key: string) => Promise<Buffer | null>;
  gcsMetadataSize: (key: string) => Promise<number | null>;
  gcsUpload: (params: {
    buffer: Buffer;
    contentType: string;
    objectKey: string;
  }) => Promise<{ objectKey: string; sizeBytes: number }>;
  listGcsKeys: (opts: {
    prefix: string;
    maxResults: number;
  }) => Promise<string[]>;
  databaseExists: (key: string) => Promise<boolean>;
  databaseDownload: (key: string) => Promise<Buffer | null>;
  firebaseExists: (key: string) => Promise<boolean>;
  firebaseDownload: (key: string) => Promise<Buffer | null>;
  azureExists: (key: string) => Promise<boolean>;
  azureDownload: (key: string) => Promise<Buffer | null>;
  resolveLocalCandidates: (row: FileAuditRow) => string[];
  localExists: (absolutePath: string) => boolean;
  localRead: (absolutePath: string) => Buffer;
  isGcsConfigured: () => boolean;
  buildGcsObjectKey: (row: FileAuditRow) => string;
  uploadsRoot: string;
  /** Optional re-read for idempotency / concurrent detection */
  findFileById?: (id: string) => Promise<FileAuditRow | null>;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GCS = GOOGLE_CLOUD_STORAGE_PROVIDER;
const DATABASE = 'database_storage';
const FIREBASE = 'firebase_storage';
const AZURE = 'azure_blob';
const LOCAL = 'local';

const KNOWN_DURABLE = new Set([GCS, DATABASE, FIREBASE, AZURE]);

export const ALLOWED_ORPHAN_PREFIX = 'media/';
export const MAX_LIMIT = 5000;
export const MAX_BATCH = 200;
export const MAX_ORPHAN_LIMIT = 5000;
export const MAX_DETAILS = 500;
export const DEFAULT_BATCH = 100;
export const DEFAULT_LIMIT = 500;
export const DEFAULT_ORPHAN_LIMIT = 1000;

/** In-process lock for concurrent same-file repair protection */
const repairLocks = new Set<string>();

const emptyClassCounts = (): Record<MediaHealthClass, number> => ({
  healthy: 0,
  missing_storage: 0,
  missing_database: 0,
  missing_both: 0,
  legacy_local: 0,
  unknown_provider: 0
});

const emptyRecoverableBySource = (): RecoverableBySource => ({
  gcs: 0,
  legacy_uploads: 0,
  database_storage: 0,
  firebase_storage: 0,
  azure_blob: 0
});

// ---------------------------------------------------------------------------
// Redaction & validation helpers (exported for tests/controllers)
// ---------------------------------------------------------------------------

export const redactFileId = (id: string) => {
  const s = String(id || '');
  if (s.length <= 8) return `${s.slice(0, 4)}…`;
  return `${s.slice(0, 8)}…`;
};

export const redactStorageKey = (key: string | null | undefined) => {
  const s = normalizeStorageKey(key);
  if (!s) return '';
  // Never expose signed URL query strings
  const noQuery = s.split('?')[0];
  const base = path.basename(noQuery);
  if (base.length <= 24) return `…/${base}`;
  return `…/${base.slice(-24)}`;
};

export const redactSignedUrl = (value: unknown) => {
  const raw = String(value || '');
  if (!raw) return '';
  if (/X-Goog-Signature|Signature=|X-Amz-Signature|sig=/i.test(raw) || raw.includes('?')) {
    return '[redacted-signed-or-query-url]';
  }
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw);
      return `${u.origin}${u.pathname.split('/').slice(0, 3).join('/')}…`;
    } catch {
      return '[redacted-url]';
    }
  }
  return redactStorageKey(raw);
};

export const isSafeCursor = (cursor: unknown): cursor is string => {
  if (cursor === null || cursor === undefined || cursor === '') return true as any;
  const s = String(cursor).trim();
  if (!s || s.length > 128) return false;
  // CUID / UUID / alphanumeric id — reject path/URL payloads
  if (/[\/\\?&#\s]/.test(s) || s.includes('..') || /^https?:/i.test(s)) return false;
  return /^[A-Za-z0-9_-]+$/.test(s);
};

export const clampLimit = (value: unknown, fallback = DEFAULT_LIMIT, max = MAX_LIMIT) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.floor(n));
};

export const clampBatchSize = (value: unknown, fallback = DEFAULT_BATCH, max = MAX_BATCH) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(max, Math.floor(n));
};

export const sanitizeOrphanPrefix = (value: unknown): string => {
  const raw = normalizeStorageKey(value || ALLOWED_ORPHAN_PREFIX);
  // Force media/ namespace only — reject escape attempts
  if (!raw || raw.includes('..') || raw.startsWith('/') || /^https?:/i.test(raw)) {
    return ALLOWED_ORPHAN_PREFIX;
  }
  if (raw === 'media' || raw.startsWith('media/')) {
    return raw.endsWith('/') || raw === 'media' ? (raw === 'media' ? 'media/' : raw) : `${raw}/`.replace(/\/+$/, '/');
  }
  return ALLOWED_ORPHAN_PREFIX;
};

export const isUnsafeStorageKey = (value: unknown): boolean => {
  const s = String(value || '');
  if (!s) return false;
  if (s.includes('\0')) return true;
  if (s.includes('..')) return true;
  if (/^https?:\/\//i.test(s)) return true; // never treat URLs as storage keys for IO
  if (s.includes('://')) return true;
  if (/^[A-Za-z]:\\/.test(s)) return true; // windows abs
  return false;
};

export const isPathInsideRoot = (absolutePath: string, root: string) => {
  const resolved = path.resolve(absolutePath);
  const resolvedRoot = path.resolve(root);
  const rel = path.relative(resolvedRoot, resolved);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

export const resolveUploadsRoot = (cwd = process.cwd()) => {
  const fromEnv = String(process.env.UPLOADS_DIR || process.env.UPLOAD_DIR || '').trim();
  if (fromEnv) return path.resolve(fromEnv);
  return path.resolve(cwd, 'uploads');
};

export const normalizeStorageKey = (value: unknown) =>
  String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .trim();

export const stripUploadsPrefix = (value: unknown) => {
  const normalized = normalizeStorageKey(value);
  if (!normalized) return '';
  // Reject absolute URLs for path derivation (SSRF prevention)
  if (/^https?:\/\//i.test(normalized) || normalized.includes('://')) {
    try {
      const u = new URL(normalized.startsWith('http') ? normalized : `https://${normalized}`);
      const p = u.pathname.replace(/^\/+/, '');
      const lower = p.toLowerCase();
      if (lower.startsWith('uploads/')) return p.slice('uploads/'.length);
      const idx = lower.indexOf('/uploads/');
      if (idx >= 0) return p.slice(idx + '/uploads/'.length);
      // Do not use arbitrary remote path segments as local keys
      return path.basename(p);
    } catch {
      return path.basename(normalized.split('?')[0]);
    }
  }
  const lower = normalized.toLowerCase();
  if (lower.startsWith('uploads/')) return normalized.slice('uploads/'.length);
  const idx = lower.indexOf('/uploads/');
  if (idx >= 0) return normalized.slice(idx + '/uploads/'.length);
  return normalized;
};

export const normalizeProvider = (value: unknown) => {
  const raw = String(value || LOCAL)
    .trim()
    .toLowerCase();
  if (raw === 'gcs' || raw === 'google_cloud_storage') return GCS;
  if (raw === 'firebase' || raw === 'firebase_storage') return FIREBASE;
  if (raw === 'azure' || raw === 'blob' || raw === 'azure_blob') return AZURE;
  if (
    raw === 'database_storage' ||
    raw === 'database' ||
    raw === 'db' ||
    raw === 'postgres' ||
    raw === 'postgresql'
  ) {
    return DATABASE;
  }
  if (!raw || raw === 'local' || raw === 'disk' || raw === 'filesystem') return LOCAL;
  return raw;
};

export const isKnownProvider = (provider: string) => {
  const p = normalizeProvider(provider);
  return p === GCS || p === DATABASE || p === FIREBASE || p === AZURE || p === LOCAL;
};

export const buildLocalCandidateKeys = (row: FileAuditRow): string[] => {
  const keys = [
    stripUploadsPrefix(row.storageKey),
    normalizeStorageKey(row.storageKey),
    stripUploadsPrefix(row.url),
    normalizeStorageKey(row.filename),
    path.basename(normalizeStorageKey(row.storageKey).split('?')[0]),
    path.basename(normalizeStorageKey(row.filename)),
    path.basename(stripUploadsPrefix(row.url)),
    path.basename(normalizeStorageKey(row.originalName))
  ]
    .map((v) => String(v || '').trim())
    .filter((v) => v && !isUnsafeStorageKey(v) && !v.includes('..'));
  return Array.from(new Set(keys));
};

export const buildLocalAbsoluteCandidates = (row: FileAuditRow, uploadsRoot: string): string[] => {
  const root = path.resolve(uploadsRoot);
  return buildLocalCandidateKeys(row)
    .map((rel) => path.resolve(root, rel.replace(/^\/+/, '')))
    .filter((abs) => isPathInsideRoot(abs, root));
};

export const inferMediaUse = (usageTypes?: string[] | null, mimeType?: string | null): string => {
  const types = (usageTypes || []).map((t) => String(t || '').toLowerCase());
  const join = types.join(' ');
  if (/avatar|profile.?image|user.?avatar/.test(join)) return 'user_avatar';
  if (/cover|banner|user.?cover/.test(join)) return 'user_cover';
  if (/page.?logo|community.?logo/.test(join)) return 'page_logo';
  if (/page.?cover|community.?cover/.test(join)) return 'page_cover';
  if (/post|feed|community.?post/.test(join)) {
    return String(mimeType || '').startsWith('video/') ? 'post_video' : 'post_image';
  }
  if (/story/.test(join)) return 'story';
  if (/scroll/.test(join)) return 'scroll';
  if (/marketplace|listing|product/.test(join)) return 'marketplace';
  if (/ad|campaign|boost/.test(join)) return 'ads';
  if (/chat|message|voice|messenger/.test(join)) return 'chat_voice';
  if (/cms|upload|admin.?file/.test(join)) return 'cms_uploaded';
  if (String(mimeType || '').startsWith('video/')) return 'video_unclassified';
  if (String(mimeType || '').startsWith('image/')) return 'image_unclassified';
  return 'other';
};

export const redactAuditResult = (r: MediaFileAuditResult): MediaFileAuditResult => ({
  ...r,
  fileId: redactFileId(r.fileId),
  storageKey: redactStorageKey(r.storageKey),
  recoveryKey: r.recoveryKey ? redactStorageKey(r.recoveryKey) : null,
  proposedGcsKey: r.proposedGcsKey ? redactStorageKey(r.proposedGcsKey) : r.proposedGcsKey,
  newStorageKey: r.newStorageKey ? redactStorageKey(r.newStorageKey) : r.newStorageKey,
  cleanupObjectKey: r.cleanupObjectKey ? redactStorageKey(r.cleanupObjectKey) : r.cleanupObjectKey,
  message: r.message
    ? String(r.message)
        .replace(/https?:\/\/[^\s]+/gi, '[redacted-url]')
        .replace(/X-Goog-Signature=[^\s&]+/gi, 'X-Goog-Signature=[redacted]')
    : r.message
});

export const redactOrphan = (o: OrphanGcsObject): OrphanGcsObject => ({
  ...o,
  objectKey: redactStorageKey(o.objectKey),
  matchedFileId: o.matchedFileId ? redactFileId(o.matchedFileId) : null
});

export const toPublicRecoveryReport = (report: MediaRecoveryReport): MediaRecoveryReport => ({
  ...report,
  results: report.results.map(redactAuditResult),
  orphans: report.orphans.map(redactOrphan)
});

// ---------------------------------------------------------------------------
// Default dependencies
// ---------------------------------------------------------------------------

const streamToBuffer = async (stream: NodeJS.ReadableStream): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

export const createDefaultMediaRecoveryDeps = (uploadsRoot = resolveUploadsRoot()): MediaRecoveryDeps => ({
  uploadsRoot,
  findFiles: async ({ take, cursorId }) => {
    if (cursorId && !isSafeCursor(cursorId)) {
      throw new Error('Invalid cursor');
    }
    const rows = await prisma.file.findMany({
      take,
      ...(cursorId
        ? {
            skip: 1,
            cursor: { id: cursorId }
          }
        : {}),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        storageKey: true,
        storageProvider: true,
        filename: true,
        originalName: true,
        mimeType: true,
        size: true,
        url: true,
        ownerId: true,
        createdAt: true
      }
    });
    return rows as FileAuditRow[];
  },
  countFiles: async () => prisma.file.count(),
  updateFileStorageConditional: async ({
    id,
    expectedProvider,
    expectedStorageKey,
    storageProvider,
    storageKey
  }) => {
    const result = await prisma.file.updateMany({
      where: {
        id,
        storageProvider: expectedProvider,
        storageKey: expectedStorageKey
      },
      data: {
        storageProvider,
        storageKey
        // url, ownerId, visibility, mimeType, size intentionally untouched
      }
    });
    return Number(result.count || 0);
  },
  findFileById: async (id) => {
    const row = await prisma.file.findUnique({
      where: { id },
      select: {
        id: true,
        storageKey: true,
        storageProvider: true,
        filename: true,
        originalName: true,
        mimeType: true,
        size: true,
        url: true,
        ownerId: true,
        createdAt: true
      }
    });
    return (row as FileAuditRow) || null;
  },
  findFileIdsByStorageKeys: async (keys) => {
    if (!keys.length) return new Map();
    const rows = await prisma.file.findMany({
      where: { storageKey: { in: keys } },
      select: { id: true, storageKey: true }
    });
    const map = new Map<string, string>();
    for (const row of rows) map.set(row.storageKey, row.id);
    return map;
  },
  loadFileUsages: async (fileIds) => {
    const map = new Map<string, string[]>();
    if (!fileIds.length) return map;
    try {
      const usages = await prisma.fileUsage.findMany({
        where: { fileId: { in: fileIds } },
        select: { fileId: true, usageType: true }
      });
      for (const u of usages) {
        const list = map.get(u.fileId) || [];
        list.push(u.usageType);
        map.set(u.fileId, list);
      }
    } catch {
      // FileUsage optional for recovery
    }
    return map;
  },
  gcsExists: async (key) => {
    if (isUnsafeStorageKey(key)) return false;
    try {
      return await gcsMediaExists(key);
    } catch {
      return false;
    }
  },
  gcsDownload: async (key) => {
    if (isUnsafeStorageKey(key)) return null;
    try {
      return await downloadGcsMediaBuffer(key);
    } catch {
      return null;
    }
  },
  gcsMetadataSize: async (key) => {
    if (isUnsafeStorageKey(key)) return null;
    try {
      const meta = await getGcsMediaMetadata(key);
      return Number(meta?.size || 0) || null;
    } catch {
      return null;
    }
  },
  gcsUpload: async ({ buffer, contentType, objectKey }) => {
    if (isUnsafeStorageKey(objectKey) || !normalizeStorageKey(objectKey).startsWith('media/')) {
      throw new Error('GCS upload rejected: object key must be under media/ and safe');
    }
    const result = await uploadToGcsMedia({
      buffer,
      contentType,
      objectKey,
      cacheControl: 'public, max-age=31536000, immutable'
    });
    return { objectKey: result.objectKey, sizeBytes: result.sizeBytes };
  },
  listGcsKeys: async ({ prefix, maxResults }) => {
    const safePrefix = sanitizeOrphanPrefix(prefix);
    try {
      const { keys } = await listGcsMediaObjectKeys({ prefix: safePrefix, maxResults });
      return keys.filter((k) => !isUnsafeStorageKey(k) && normalizeStorageKey(k).startsWith('media/'));
    } catch {
      return [];
    }
  },
  databaseExists: async (key) => {
    if (isUnsafeStorageKey(key)) return false;
    try {
      return await databaseStorageExistsByName(key);
    } catch {
      return false;
    }
  },
  databaseDownload: async (key) => {
    if (isUnsafeStorageKey(key)) return null;
    try {
      return await downloadDatabaseStorageBufferByName(key);
    } catch {
      return null;
    }
  },
  firebaseExists: async (key) => {
    if (isUnsafeStorageKey(key)) return false;
    try {
      return await firebaseStorageExistsByName(key);
    } catch {
      return false;
    }
  },
  firebaseDownload: async (key) => {
    if (isUnsafeStorageKey(key)) return null;
    try {
      return await downloadFirebaseStorageBufferByName(key);
    } catch {
      return null;
    }
  },
  azureExists: async (key) => {
    if (isUnsafeStorageKey(key)) return false;
    try {
      return await blobExistsByName(key);
    } catch {
      return false;
    }
  },
  azureDownload: async (key) => {
    if (isUnsafeStorageKey(key)) return null;
    try {
      const response = await downloadBlobByName(key);
      const stream = response.readableStreamBody;
      if (!stream) return null;
      return streamToBuffer(stream as NodeJS.ReadableStream);
    } catch {
      return null;
    }
  },
  resolveLocalCandidates: (row) => buildLocalAbsoluteCandidates(row, uploadsRoot),
  localExists: (absolutePath) => {
    try {
      if (!isPathInsideRoot(absolutePath, uploadsRoot)) return false;
      return fs.existsSync(absolutePath) && fs.statSync(absolutePath).isFile();
    } catch {
      return false;
    }
  },
  localRead: (absolutePath) => {
    if (!isPathInsideRoot(absolutePath, uploadsRoot)) {
      throw new Error('Path traversal rejected');
    }
    return fs.readFileSync(absolutePath);
  },
  isGcsConfigured: () => isGcsMediaConfigured(),
  buildGcsObjectKey: (row) =>
    buildMediaObjectKey({
      originalName: row.originalName || row.filename || 'recovered.bin',
      ownerId: row.ownerId || 'recovered',
      category: 'recovered'
    })
});

// ---------------------------------------------------------------------------
// Existence + probe
// ---------------------------------------------------------------------------

export type RecoveryProbe = {
  source: RecoverySource;
  key: string;
  absoluteLocalPath?: string | null;
};

const declaredExists = async (
  provider: string,
  storageKey: string,
  deps: MediaRecoveryDeps,
  row: FileAuditRow
): Promise<boolean> => {
  const key = normalizeStorageKey(storageKey);
  if (isUnsafeStorageKey(key) && provider !== LOCAL) return false;
  if (provider === GCS) {
    if (!key) return false;
    return deps.gcsExists(key);
  }
  if (provider === DATABASE) {
    if (!key) return false;
    return deps.databaseExists(key);
  }
  if (provider === FIREBASE) {
    if (!key) return false;
    return deps.firebaseExists(key);
  }
  if (provider === AZURE) {
    if (!key) return false;
    return deps.azureExists(key);
  }
  if (provider === LOCAL) {
    return deps.resolveLocalCandidates(row).some((p) => deps.localExists(p));
  }
  return false;
};

/**
 * Recovery priority: GCS → legacy uploads → database → firebase → azure.
 * Never fetches arbitrary HTTP URLs (no SSRF).
 */
export const probeRecoverySources = async (
  row: FileAuditRow,
  deps: MediaRecoveryDeps
): Promise<RecoveryProbe | null> => {
  const keyCandidates = Array.from(
    new Set(
      [
        normalizeStorageKey(row.storageKey),
        stripUploadsPrefix(row.storageKey),
        stripUploadsPrefix(row.url),
        normalizeStorageKey(row.filename),
        path.basename(normalizeStorageKey(row.storageKey).split('?')[0]),
        path.basename(normalizeStorageKey(row.filename)),
        path.basename(stripUploadsPrefix(row.url))
      ]
        .map((v) => String(v || '').trim())
        .filter((v) => v && !isUnsafeStorageKey(v) && !v.includes('..'))
    )
  );

  for (const key of keyCandidates) {
    if (await deps.gcsExists(key)) return { source: 'gcs', key };
  }

  const localPaths = deps.resolveLocalCandidates(row);
  for (const abs of localPaths) {
    if (deps.localExists(abs)) {
      const rel = normalizeStorageKey(path.relative(deps.uploadsRoot, abs));
      return {
        source: 'legacy_uploads',
        key: rel || path.basename(abs),
        absoluteLocalPath: abs
      };
    }
  }

  for (const key of keyCandidates) {
    if (await deps.databaseExists(key)) return { source: 'database_storage', key };
  }
  for (const key of keyCandidates) {
    if (await deps.firebaseExists(key)) return { source: 'firebase_storage', key };
  }
  for (const key of keyCandidates) {
    if (await deps.azureExists(key)) return { source: 'azure_blob', key };
  }

  return null;
};

export const classifyFileRow = (params: {
  provider: string;
  storageKey: string;
  declaredExists: boolean;
  recoverable: boolean;
}): MediaHealthClass => {
  const { provider, storageKey, declaredExists: exists, recoverable } = params;
  if (provider === LOCAL) return 'legacy_local';
  if (!isKnownProvider(provider)) return 'unknown_provider';
  if (exists && KNOWN_DURABLE.has(provider)) return 'healthy';
  if (!normalizeStorageKey(storageKey) && !exists && !recoverable) return 'missing_both';
  if (!exists) return 'missing_storage';
  return 'healthy';
};

const loadBytesFromProbe = async (
  probe: RecoveryProbe,
  deps: MediaRecoveryDeps
): Promise<Buffer | null> => {
  switch (probe.source) {
    case 'gcs':
      return deps.gcsDownload(probe.key);
    case 'legacy_uploads': {
      const abs = probe.absoluteLocalPath;
      if (!abs || !deps.localExists(abs)) return null;
      return deps.localRead(abs);
    }
    case 'database_storage':
      return deps.databaseDownload(probe.key);
    case 'firebase_storage':
      return deps.firebaseDownload(probe.key);
    case 'azure_blob':
      return deps.azureDownload(probe.key);
    default:
      return null;
  }
};

/**
 * Ensure bytes live in GCS without overwriting a different object.
 * matching size → reuse; different size → new key; missing → upload under media/.
 */
export const ensureBytesInGcs = async (params: {
  buffer: Buffer;
  contentType: string;
  preferredKey: string | null;
  row: FileAuditRow;
  deps: MediaRecoveryDeps;
}): Promise<{ objectKey: string; uploaded: boolean; reused: boolean; conflictingDestination: boolean }> => {
  const { buffer, contentType, row, deps } = params;
  let preferred = normalizeStorageKey(params.preferredKey || '');
  let conflictingDestination = false;

  if (!preferred || !preferred.startsWith('media/') || isUnsafeStorageKey(preferred)) {
    preferred = deps.buildGcsObjectKey(row);
  }
  if (!preferred.startsWith('media/')) {
    preferred = deps.buildGcsObjectKey(row);
  }

  const exists = await deps.gcsExists(preferred);
  if (exists) {
    const size = await deps.gcsMetadataSize(preferred);
    if (size !== null && size === buffer.length) {
      return { objectKey: preferred, uploaded: false, reused: true, conflictingDestination: false };
    }
    // Different size or unknown size with existing object → never overwrite
    conflictingDestination = true;
    let alternate = deps.buildGcsObjectKey(row);
    if (alternate === preferred || (await deps.gcsExists(alternate))) {
      const extMatch = alternate.match(/(\.[^./]+)$/);
      const ext = extMatch ? extMatch[1] : '';
      const stem = ext ? alternate.slice(0, -ext.length) : alternate;
      alternate = `${stem}-alt-${Date.now()}${ext}`;
      if (!alternate.startsWith('media/')) {
        alternate = deps.buildGcsObjectKey(row);
      }
    }
    const uploaded = await deps.gcsUpload({
      buffer,
      contentType,
      objectKey: alternate
    });
    return {
      objectKey: uploaded.objectKey,
      uploaded: true,
      reused: false,
      conflictingDestination
    };
  }

  const uploaded = await deps.gcsUpload({
    buffer,
    contentType,
    objectKey: preferred
  });
  return {
    objectKey: uploaded.objectKey,
    uploaded: true,
    reused: false,
    conflictingDestination: false
  };
};

// ---------------------------------------------------------------------------
// Per-file audit / repair
// ---------------------------------------------------------------------------

const withRepairLock = async <T>(fileId: string, fn: () => Promise<T>): Promise<T | 'locked'> => {
  if (repairLocks.has(fileId)) return 'locked';
  repairLocks.add(fileId);
  try {
    return await fn();
  } finally {
    repairLocks.delete(fileId);
  }
};

/** Test helper */
export const __clearRepairLocksForTests = () => repairLocks.clear();
export const __getRepairLockCountForTests = () => repairLocks.size;

export const auditAndMaybeRepairFile = async (
  row: FileAuditRow,
  mode: MediaRecoveryMode,
  deps: MediaRecoveryDeps
): Promise<MediaFileAuditResult> => {
  const provider = normalizeProvider(row.storageProvider);
  const storageKey = normalizeStorageKey(row.storageKey);
  const mediaUse = inferMediaUse(row.usageTypes, row.mimeType);
  const base = {
    fileId: row.id,
    storageProvider: provider,
    storageKey,
    mediaUse
  };

  // Unknown provider — never executes dynamic/arbitrary code paths
  if (provider !== LOCAL && !KNOWN_DURABLE.has(provider)) {
    const probe = await probeRecoverySources(row, deps);
    if (!probe) {
      return {
        ...base,
        classification: 'unknown_provider',
        declaredExists: false,
        recoverable: false,
        recoverySource: null,
        recoveryKey: null,
        action: 'unrecoverable',
        message: 'Unknown storage provider; no recovery source'
      };
    }
    if (mode === 'dry-run') {
      return {
        ...base,
        classification: 'unknown_provider',
        declaredExists: false,
        recoverable: true,
        recoverySource: probe.source,
        recoveryKey: probe.key,
        proposedGcsKey: deps.buildGcsObjectKey(row),
        action: 'would_repair',
        message: `Would recover unknown provider from ${probe.source}`
      };
    }
    return repairFromProbe(row, provider, storageKey, false, probe, deps, 'unknown_provider', mediaUse);
  }

  const exists = await declaredExists(provider, storageKey, deps, row);

  if (exists && provider !== LOCAL && KNOWN_DURABLE.has(provider)) {
    return {
      ...base,
      classification: 'healthy',
      declaredExists: true,
      recoverable: false,
      recoverySource: null,
      recoveryKey: null,
      action: 'skipped_healthy',
      message: 'Declared storage object present; left untouched'
    };
  }

  if (provider === LOCAL) {
    let effectiveProbe: RecoveryProbe | null = null;
    if (exists) {
      const localAbs = deps.resolveLocalCandidates(row).find((p) => deps.localExists(p));
      if (localAbs) {
        effectiveProbe = {
          source: 'legacy_uploads',
          key: normalizeStorageKey(path.relative(deps.uploadsRoot, localAbs)) || path.basename(localAbs),
          absoluteLocalPath: localAbs
        };
      }
    }
    if (!effectiveProbe) {
      effectiveProbe = await probeRecoverySources(row, deps);
    }

    if (!effectiveProbe) {
      return {
        ...base,
        classification: 'legacy_local',
        declaredExists: false,
        recoverable: false,
        recoverySource: null,
        recoveryKey: null,
        action: 'unrecoverable',
        message: 'Legacy local file missing from disk and all fallbacks'
      };
    }

    if (mode === 'dry-run') {
      return {
        ...base,
        classification: 'legacy_local',
        declaredExists: exists,
        recoverable: true,
        recoverySource: effectiveProbe.source,
        recoveryKey: effectiveProbe.key,
        proposedGcsKey: deps.buildGcsObjectKey(row),
        action: 'would_repair',
        message: `Would migrate legacy local → GCS from ${effectiveProbe.source}`
      };
    }
    return repairFromProbe(row, provider, storageKey, exists, effectiveProbe, deps, 'legacy_local', mediaUse);
  }

  const probe = await probeRecoverySources(row, deps);
  if (!probe) {
    const classification: MediaHealthClass = !storageKey ? 'missing_both' : 'missing_storage';
    return {
      ...base,
      classification,
      declaredExists: false,
      recoverable: false,
      recoverySource: null,
      recoveryKey: null,
      action: 'unrecoverable',
      message: 'No recovery source found'
    };
  }

  if (mode === 'dry-run') {
    return {
      ...base,
      classification: !storageKey ? 'missing_both' : 'missing_storage',
      declaredExists: false,
      recoverable: true,
      recoverySource: probe.source,
      recoveryKey: probe.key,
      proposedGcsKey:
        probe.source === 'gcs' && probe.key.startsWith('media/')
          ? probe.key
          : deps.buildGcsObjectKey(row),
      action: 'would_repair',
      message: `Would recover from ${probe.source}`
    };
  }

  return repairFromProbe(
    row,
    provider,
    storageKey,
    false,
    probe,
    deps,
    !storageKey ? 'missing_both' : 'missing_storage',
    mediaUse
  );
};

const repairFromProbe = async (
  row: FileAuditRow,
  provider: string,
  storageKey: string,
  declaredExistsFlag: boolean,
  probe: RecoveryProbe,
  deps: MediaRecoveryDeps,
  classification: MediaHealthClass,
  mediaUse: string
): Promise<MediaFileAuditResult> => {
  const locked = await withRepairLock(row.id, async () => {
    try {
      if (!deps.isGcsConfigured()) {
        return {
          fileId: row.id,
          classification,
          storageProvider: provider,
          storageKey,
          declaredExists: declaredExistsFlag,
          recoverable: true,
          recoverySource: probe.source,
          recoveryKey: probe.key,
          action: 'error' as const,
          message: 'GCS not configured; refusing repair',
          mediaUse
        };
      }

      // Re-read for idempotency / concurrent detection
      let expectedProvider = String(row.storageProvider || provider);
      let expectedKey = String(row.storageKey || storageKey);
      if (deps.findFileById) {
        const fresh = await deps.findFileById(row.id);
        if (!fresh) {
          return {
            fileId: row.id,
            classification,
            storageProvider: provider,
            storageKey,
            declaredExists: declaredExistsFlag,
            recoverable: false,
            recoverySource: probe.source,
            recoveryKey: probe.key,
            action: 'unrecoverable' as const,
            message: 'File row disappeared before repair',
            mediaUse
          };
        }
        // Already repaired to GCS with existing object — idempotent skip
        const freshProvider = normalizeProvider(fresh.storageProvider);
        if (freshProvider === GCS && (await deps.gcsExists(normalizeStorageKey(fresh.storageKey)))) {
          return {
            fileId: row.id,
            classification: 'healthy' as const,
            storageProvider: GCS,
            storageKey: normalizeStorageKey(fresh.storageKey),
            declaredExists: true,
            recoverable: false,
            recoverySource: null,
            recoveryKey: null,
            action: 'skipped_healthy' as const,
            message: 'Already healthy on re-read (idempotent)',
            mediaUse
          };
        }
        expectedProvider = fresh.storageProvider;
        expectedKey = fresh.storageKey;
      }

      // 1. Positive source bytes before any mutation
      const buffer = await loadBytesFromProbe(probe, deps);
      if (!buffer || !buffer.length) {
        return {
          fileId: row.id,
          classification,
          storageProvider: provider,
          storageKey,
          declaredExists: declaredExistsFlag,
          recoverable: false,
          recoverySource: probe.source,
          recoveryKey: probe.key,
          action: 'unrecoverable' as const,
          message: 'Recovery source yielded empty bytes',
          mediaUse
        };
      }

      const preferredKey =
        probe.source === 'gcs' && probe.key.startsWith('media/')
          ? probe.key
          : storageKey.startsWith('media/')
            ? storageKey
            : deps.buildGcsObjectKey(row);

      // 2. Destination upload (or reuse)
      const ensured = await ensureBytesInGcs({
        buffer,
        contentType: row.mimeType || 'application/octet-stream',
        preferredKey,
        row,
        deps
      });

      // 3. Verify existence + size before DB update
      const verified = await deps.gcsExists(ensured.objectKey);
      if (!verified) {
        return {
          fileId: row.id,
          classification,
          storageProvider: provider,
          storageKey,
          declaredExists: declaredExistsFlag,
          recoverable: true,
          recoverySource: probe.source,
          recoveryKey: probe.key,
          proposedGcsKey: ensured.objectKey,
          action: 'error' as const,
          message: 'GCS write verification failed (exists=false); File row unchanged',
          mediaUse,
          conflictingDestination: ensured.conflictingDestination
        };
      }
      const size = await deps.gcsMetadataSize(ensured.objectKey);
      if (size !== null && size !== buffer.length) {
        return {
          fileId: row.id,
          classification,
          storageProvider: provider,
          storageKey,
          declaredExists: declaredExistsFlag,
          recoverable: true,
          recoverySource: probe.source,
          recoveryKey: probe.key,
          proposedGcsKey: ensured.objectKey,
          action: 'error' as const,
          message: 'GCS size verification failed; File row unchanged',
          mediaUse,
          conflictingDestination: true
        };
      }

      // 4. Conditional DB update only
      let updated = 0;
      try {
        updated = await deps.updateFileStorageConditional({
          id: row.id,
          expectedProvider,
          expectedStorageKey: expectedKey,
          storageProvider: GCS,
          storageKey: ensured.objectKey
        });
      } catch (dbError: any) {
        if (ensured.uploaded) {
          return {
            fileId: row.id,
            classification,
            storageProvider: provider,
            storageKey,
            declaredExists: declaredExistsFlag,
            recoverable: true,
            recoverySource: probe.source,
            recoveryKey: probe.key,
            proposedGcsKey: ensured.objectKey,
            action: 'cleanup_required' as const,
            cleanupRequired: true,
            cleanupObjectKey: ensured.objectKey,
            message: `DB update failed after GCS object created; cleanup-required (not auto-deleted): ${
              dbError?.message || 'db error'
            }`,
            mediaUse
          };
        }
        throw dbError;
      }

      if (updated === 0) {
        // Concurrent winner or state changed
        if (ensured.uploaded) {
          return {
            fileId: row.id,
            classification,
            storageProvider: provider,
            storageKey,
            declaredExists: declaredExistsFlag,
            recoverable: true,
            recoverySource: probe.source,
            recoveryKey: probe.key,
            proposedGcsKey: ensured.objectKey,
            action: 'cleanup_required' as const,
            cleanupRequired: true,
            cleanupObjectKey: ensured.objectKey,
            message:
              'Conditional DB update matched 0 rows (concurrent repair or already changed); new GCS object cleanup-required (not auto-deleted)',
            mediaUse
          };
        }
        return {
          fileId: row.id,
          classification,
          storageProvider: provider,
          storageKey,
          declaredExists: declaredExistsFlag,
          recoverable: true,
          recoverySource: probe.source,
          recoveryKey: probe.key,
          action: 'skipped_concurrent' as const,
          message: 'Skipped: concurrent update or already repaired (reused GCS object)',
          mediaUse
        };
      }

      return {
        fileId: row.id,
        classification,
        storageProvider: provider,
        storageKey,
        declaredExists: declaredExistsFlag,
        recoverable: true,
        recoverySource: probe.source,
        recoveryKey: probe.key,
        proposedGcsKey: ensured.objectKey,
        action: 'repaired' as const,
        newStorageKey: ensured.objectKey,
        newStorageProvider: GCS,
        message: ensured.reused
          ? 'Reused existing GCS object; File row updated'
          : 'Copied to GCS; File row updated',
        mediaUse,
        conflictingDestination: ensured.conflictingDestination
      };
    } catch (error: any) {
      return {
        fileId: row.id,
        classification,
        storageProvider: provider,
        storageKey,
        declaredExists: declaredExistsFlag,
        recoverable: true,
        recoverySource: probe.source,
        recoveryKey: probe.key,
        action: 'error' as const,
        message: error?.message || 'Repair failed',
        mediaUse
      };
    }
  });

  if (locked === 'locked') {
    return {
      fileId: row.id,
      classification,
      storageProvider: provider,
      storageKey,
      declaredExists: declaredExistsFlag,
      recoverable: true,
      recoverySource: probe.source,
      recoveryKey: probe.key,
      action: 'skipped_locked',
      message: 'Same File is already being repaired in this process',
      mediaUse
    };
  }
  return locked;
};

// ---------------------------------------------------------------------------
// Orphan scan — report only
// ---------------------------------------------------------------------------

export const scanOrphanGcsObjects = async (
  deps: MediaRecoveryDeps,
  opts?: { prefix?: string; maxResults?: number }
): Promise<OrphanGcsObject[]> => {
  const prefix = sanitizeOrphanPrefix(opts?.prefix);
  const maxResults = clampLimit(opts?.maxResults, DEFAULT_ORPHAN_LIMIT, MAX_ORPHAN_LIMIT);
  const keys = await deps.listGcsKeys({ prefix, maxResults });
  if (!keys.length) return [];

  const mapped = await deps.findFileIdsByStorageKeys(keys);
  const orphans: OrphanGcsObject[] = [];
  for (const key of keys) {
    if (!normalizeStorageKey(key).startsWith('media/')) continue;
    const fileId = mapped.get(key) || null;
    if (!fileId) {
      orphans.push({
        objectKey: key,
        classification: 'missing_database',
        matchedFileId: null
      });
    }
  }
  // Never create File rows, never delete, never attach ownership
  return orphans;
};

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export const runMediaRecovery = async (
  options: MediaRecoveryOptions = {},
  deps: MediaRecoveryDeps = createDefaultMediaRecoveryDeps()
): Promise<MediaRecoveryReport> => {
  const mode: MediaRecoveryMode = options.mode === 'repair' ? 'repair' : 'dry-run';
  const limit = clampLimit(options.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const batchSize = clampBatchSize(options.batchSize, DEFAULT_BATCH, MAX_BATCH);
  const maxDetails = clampLimit(options.maxResultDetails, MAX_DETAILS, MAX_DETAILS);
  const includeOrphanScan = Boolean(options.includeOrphanScan);

  if (options.cursor != null && options.cursor !== '' && !isSafeCursor(options.cursor)) {
    throw new Error('Invalid cursor');
  }
  const cursor = options.cursor || null;

  // Dry-run hard guarantee: never call write deps
  const safeDeps: MediaRecoveryDeps =
    mode === 'dry-run'
      ? {
          ...deps,
          updateFileStorageConditional: async () => {
            throw new Error('DRY_RUN_MUTATION_BLOCKED: updateFileStorageConditional');
          },
          gcsUpload: async () => {
            throw new Error('DRY_RUN_MUTATION_BLOCKED: gcsUpload');
          }
        }
      : deps;

  const totalFiles = await safeDeps.countFiles();
  const classifications = emptyClassCounts();
  const storageProviderCounts: Record<string, number> = {};
  const recoverableBySource = emptyRecoverableBySource();
  const mediaUseCounts: Record<string, number> = {};
  const results: MediaFileAuditResult[] = [];

  let scanned = 0;
  let recovered = 0;
  let recoverable = 0;
  let missing = 0;
  let legacyLocal = 0;
  let unknownProvider = 0;
  let healthy = 0;
  let duplicates = 0;
  let unrecoverable = 0;
  let conflictingDestinationKeys = 0;
  let nextCursor: string | null = null;
  let lastId: string | null = cursor;
  let dbUpdates = 0;
  let gcsUploads = 0;

  const basenameIndex = new Map<string, string[]>();

  while (scanned < limit) {
    const take = Math.min(batchSize, limit - scanned);
    const batch = await safeDeps.findFiles({ take, cursorId: lastId });
    if (!batch.length) break;

    let usageMap = new Map<string, string[]>();
    if (safeDeps.loadFileUsages) {
      usageMap = await safeDeps.loadFileUsages(batch.map((r) => r.id));
    }

    for (const row of batch) {
      const withUsage: FileAuditRow = {
        ...row,
        usageTypes: usageMap.get(row.id) || row.usageTypes || []
      };
      const result = await auditAndMaybeRepairFile(withUsage, mode, safeDeps);
      scanned += 1;
      lastId = row.id;
      nextCursor = row.id;

      classifications[result.classification] = (classifications[result.classification] || 0) + 1;
      const providerKey = result.storageProvider || 'unknown';
      storageProviderCounts[providerKey] = (storageProviderCounts[providerKey] || 0) + 1;

      const use = result.mediaUse || 'other';
      mediaUseCounts[use] = (mediaUseCounts[use] || 0) + 1;

      if (result.classification === 'healthy') healthy += 1;
      if (result.classification === 'legacy_local') legacyLocal += 1;
      if (result.classification === 'unknown_provider') unknownProvider += 1;
      if (result.classification === 'missing_storage' || result.classification === 'missing_both') {
        missing += 1;
      }
      if (result.recoverable) {
        recoverable += 1;
        if (result.recoverySource) {
          recoverableBySource[result.recoverySource] =
            (recoverableBySource[result.recoverySource] || 0) + 1;
        }
      }
      if (result.action === 'repaired') {
        recovered += 1;
        dbUpdates += 1;
        // upload count inferred from message not perfect; track via cleanup/new only when not reused
        if (result.message && /Copied to GCS/i.test(result.message)) gcsUploads += 1;
      }
      if (result.action === 'unrecoverable') unrecoverable += 1;
      if (result.conflictingDestination) conflictingDestinationKeys += 1;

      const baseName = path.basename(result.storageKey || row.filename || '');
      if (baseName) {
        const list = basenameIndex.get(baseName) || [];
        list.push(row.id);
        basenameIndex.set(baseName, list);
      }

      if (results.length < maxDetails) results.push(result);
    }

    if (batch.length < take) break;
  }

  for (const ids of basenameIndex.values()) {
    if (ids.length > 1) duplicates += ids.length;
  }

  let orphans: OrphanGcsObject[] = [];
  if (includeOrphanScan) {
    orphans = await scanOrphanGcsObjects(safeDeps, {
      prefix: sanitizeOrphanPrefix(options.orphanPrefix),
      maxResults: clampLimit(options.orphanScanLimit, DEFAULT_ORPHAN_LIMIT, MAX_ORPHAN_LIMIT)
    });
    classifications.missing_database = (classifications.missing_database || 0) + orphans.length;
  }

  // Dry-run must report zero mutations
  if (mode === 'dry-run') {
    dbUpdates = 0;
    gcsUploads = 0;
  }

  return {
    mode,
    dryRun: mode === 'dry-run',
    statistics: {
      totalFiles,
      scannedFiles: scanned,
      healthy,
      recovered: mode === 'dry-run' ? 0 : recovered,
      recoverable,
      missing,
      orphaned: orphans.length,
      duplicates,
      legacyLocal,
      unknownProvider,
      unrecoverable,
      conflictingDestinationKeys,
      classifications,
      storageProviderCounts,
      recoverableBySource,
      mediaUseCounts
    },
    results,
    orphans,
    nextCursor: scanned > 0 ? nextCursor : null,
    generatedAt: new Date().toISOString(),
    mutations: {
      dbUpdates,
      gcsUploads,
      gcsDeletes: 0
    }
  };
};

export const runMediaRecoveryDryRun = (
  options?: Omit<MediaRecoveryOptions, 'mode'>,
  deps?: MediaRecoveryDeps
) => runMediaRecovery({ ...options, mode: 'dry-run' }, deps);

export const runMediaRecoveryRepair = (
  options?: Omit<MediaRecoveryOptions, 'mode'>,
  deps?: MediaRecoveryDeps
) => runMediaRecovery({ ...options, mode: 'repair' }, deps);

export const MediaRecoveryService = {
  run: runMediaRecovery,
  dryRun: runMediaRecoveryDryRun,
  repair: runMediaRecoveryRepair,
  auditAndMaybeRepairFile,
  probeRecoverySources,
  classifyFileRow,
  scanOrphanGcsObjects,
  ensureBytesInGcs,
  createDefaultMediaRecoveryDeps,
  normalizeProvider,
  redactAuditResult,
  toPublicRecoveryReport,
  isSafeCursor,
  clampLimit,
  clampBatchSize,
  sanitizeOrphanPrefix,
  isUnsafeStorageKey,
  GOOGLE_CLOUD_STORAGE_PROVIDER: GCS
};
