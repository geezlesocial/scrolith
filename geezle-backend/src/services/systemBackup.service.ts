import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import bcrypt from 'bcryptjs';
import { Client } from 'pg';
import prisma from '../utils/prismaClient';
import { resolveDirectMediaUrl, resolveFileBaseUrl } from '../utils/mediaUrl';
import {
  blobExistsByName,
  deleteBlobByName,
  downloadBlobByName,
  getBlobUrl,
  getBlobPropertiesByName,
  isAzureBlobConfigured,
  uploadBufferToBlob
} from './storage/blobStorage';

export type BackupMode = 'full' | 'partial';
export type RestoreMode = 'replace' | 'append';
export type BackupSection =
  | 'settings'
  | 'users'
  | 'content'
  | 'community'
  | 'commerce'
  | 'marketing'
  | 'developer'
  | 'security'
  | 'analytics'
  | 'forms'
  | 'custom';

export interface BackupCatalogRecord {
  id: string;
  fileName: string;
  formatVersion: string;
  mode: BackupMode;
  sections: BackupSection[];
  tables: string[];
  includeFiles: boolean;
  fileCount: number;
  sizeBytes: number;
  checksumSha256: string;
  notes: string | null;
  createdAt: string;
  createdByAdminId: string;
  createdByAdminEmail: string | null;
  importedAt: string | null;
  lastRestoredAt: string | null;
  lastRestoredByAdminId: string | null;
  restoreCount: number;
  licenseHash: string;
  licenseHint: string;
}

export type BackupJobType = 'create';
export type BackupJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface BackupJobRecord {
  id: string;
  type: BackupJobType;
  status: BackupJobStatus;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  completedAt: string | null;
  failedAt: string | null;
  requestedByAdminId: string;
  requestedByAdminEmail: string | null;
  mode: BackupMode;
  sections: BackupSection[];
  customTables: string[];
  includeFiles: boolean;
  notes: string | null;
  backupId: string | null;
  fileName: string | null;
  scrolithLicense: string | null;
  message: string | null;
  errorCode: string | null;
}

type FileSnapshot = {
  sourceId: string;
  relativePath: string;
  sizeBytes: number;
  mtime: string;
  sha256: string;
  contentBase64: string;
  contentType?: string | null;
};

type BackupPackage = {
  formatVersion: '1.0';
  platform: {
    name: 'Scrolith';
    generatedAt: string;
    generatedByAdminId: string;
    generatedByAdminEmail: string | null;
    generator: 'scrolith-admin-system-backup';
  };
  backup: {
    id: string;
    mode: BackupMode;
    sections: BackupSection[];
    tables: string[];
    includeFiles: boolean;
    notes: string | null;
    createdAt: string;
    licenseHash: string;
    licenseHint: string;
  };
  payload: {
    database: Record<string, any[]>;
    files: FileSnapshot[];
  };
};

const BACKUP_FORMAT_VERSION = '1.0';
const BACKUP_LICENSE_PREFIX = 'SCROLITH';
const BACKUP_ROOT_DIR = path.resolve(__dirname, '../../data/system-backups');
const BACKUP_CATALOG_FILE = path.join(BACKUP_ROOT_DIR, 'catalog.json');
const BACKUP_JOBS_FILE = path.join(BACKUP_ROOT_DIR, 'jobs.json');
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');
const BACKUP_BLOB_PREFIX = String(process.env.SYSTEM_BACKUP_BLOB_PREFIX || 'system-backups')
  .trim()
  .replace(/^\/+|\/+$/g, '');
const BACKUP_CATALOG_BLOB = `${BACKUP_BLOB_PREFIX}/catalog.json`;
const BACKUP_JOBS_BLOB = `${BACKUP_BLOB_PREFIX}/jobs.json`;
const BACKUP_IMPORT_LIMIT_BYTES = Math.max(
  10 * 1024 * 1024,
  Number(process.env.BACKUP_IMPORT_LIMIT_BYTES || 512 * 1024 * 1024)
);
const BACKUP_MAX_FILE_BYTES = Math.max(
  64 * 1024,
  Number(process.env.BACKUP_MAX_FILE_BYTES || 12 * 1024 * 1024)
);
const BACKUP_MAX_TOTAL_FILE_BYTES = Math.max(
  BACKUP_MAX_FILE_BYTES,
  Number(process.env.BACKUP_MAX_TOTAL_FILE_BYTES || 200 * 1024 * 1024)
);
const BACKUP_LICENSE_PEPPER =
  process.env.BACKUP_LICENSE_PEPPER || process.env.JWT_SECRET || 'scrolith-backup-license-pepper';
const EXCLUDED_TABLES = new Set<string>(['_prisma_migrations']);
const DEFAULT_STORAGE_PROVIDER = 'local';
const AZURE_BLOB_STORAGE_PROVIDER = 'azure_blob';
const DEFAULT_VIDEO_THUMBNAIL_FILENAME = '__video_fallback_thumbnail.svg';
const MANAGED_UPLOAD_SOURCE_ID = 'managed_upload';
const MANAGED_THUMBNAIL_SOURCE_ID = 'managed_thumbnail';

const SECTION_KEYWORDS: Record<Exclude<BackupSection, 'custom'>, string[]> = {
  settings: ['setting', 'config', 'cms', 'translation', 'i18n', 'navigation', 'homepage'],
  users: ['user', 'profile', 'staff', 'role', 'permission', 'notification', 'subscriber', 'kyc'],
  content: ['blog', 'post', 'comment', 'page', 'content', 'media', 'story', 'hashtag', 'review'],
  community: ['community', 'forum', 'club', 'event', 'thread'],
  commerce: ['gig', 'job', 'order', 'wallet', 'escrow', 'contract', 'proposal', 'cart', 'favorite'],
  marketing: ['marketing', 'campaign', 'affiliate', 'roi'],
  developer: ['developer', 'oauth', 'dev_'],
  security: ['fraud', 'audit', 'moderation', 'rbac'],
  analytics: ['analytic', 'insight', 'metric', 'prediction', 'forecast', 'tracker'],
  forms: ['form', 'submission', 'template']
};

type CreateBackupInput = {
  adminId: string;
  adminEmail: string | null;
  mode: BackupMode;
  sections: BackupSection[];
  customTables: string[];
  includeFiles: boolean;
  notes?: string | null;
};

type RestoreBackupInput = {
  backupId: string;
  adminId: string;
  adminEmail: string;
  adminPassword: string;
  scrolithLicense: string;
  mode: RestoreMode;
  sections: BackupSection[];
  customTables: string[];
  includeFiles: boolean;
};

const toError = (message: string, statusCode = 400, code = 'SYSTEM_BACKUP_ERROR') => {
  const error = new Error(message) as Error & { statusCode?: number; code?: string };
  error.statusCode = statusCode;
  error.code = code;
  return error;
};

const toIso = (date = new Date()) => date.toISOString();

const ensureBackupDir = () => {
  fs.mkdirSync(BACKUP_ROOT_DIR, { recursive: true });
};

function resolveBackupStorageProvider() {
  const explicitDriver = String(
    process.env.SYSTEM_BACKUP_STORAGE_DRIVER || process.env.BACKUP_STORAGE_DRIVER || ''
  )
    .trim()
    .toLowerCase();

  if (['azure_blob', 'azure', 'blob'].includes(explicitDriver)) {
    return isAzureBlobConfigured() ? AZURE_BLOB_STORAGE_PROVIDER : DEFAULT_STORAGE_PROVIDER;
  }
  if (['local', 'disk', 'filesystem'].includes(explicitDriver)) {
    return DEFAULT_STORAGE_PROVIDER;
  }

  return resolveManagedStorageProvider();
}

const shouldUseAzureBackupStorage = () => resolveBackupStorageProvider() === AZURE_BLOB_STORAGE_PROVIDER;

const buildBackupBlobName = (fileName: string) =>
  `${BACKUP_BLOB_PREFIX}/${path.basename(String(fileName || '').trim())}`;

const streamToBuffer = async (stream: NodeJS.ReadableStream) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.once('error', reject);
    stream.once('end', () => resolve(Buffer.concat(chunks)));
  });

const isSafeIdentifier = (value: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);

const normalizeTableList = (value: unknown): string[] => {
  const arr = Array.isArray(value) ? value : String(value || '').split(/[\n,]/g);
  const unique = new Set<string>();
  arr
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .forEach((entry) => {
      if (isSafeIdentifier(entry)) unique.add(entry);
    });
  return Array.from(unique);
};

const normalizeSections = (value: unknown): BackupSection[] => {
  const arr = Array.isArray(value) ? value : String(value || '').split(/[\n,]/g);
  const valid = new Set<BackupSection>([
    'settings',
    'users',
    'content',
    'community',
    'commerce',
    'marketing',
    'developer',
    'security',
    'analytics',
    'forms',
    'custom'
  ]);
  const unique = new Set<BackupSection>();
  arr
    .map((entry) => String(entry || '').trim().toLowerCase())
    .forEach((entry) => {
      if (valid.has(entry as BackupSection)) unique.add(entry as BackupSection);
    });
  return Array.from(unique);
};

const hashBytes = (value: Buffer | string) => crypto.createHash('sha256').update(value).digest('hex');

const hashLicense = (license: string) =>
  hashBytes(`${String(license || '').trim()}:${BACKUP_LICENSE_PEPPER}`);

const generateBackupLicense = (backupId: string) => {
  const entropy = crypto.randomBytes(18).toString('base64url').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const license = `${BACKUP_LICENSE_PREFIX}-${backupId.slice(-8).toUpperCase()}-${entropy.slice(0, 20)}`;
  return {
    license,
    licenseHash: hashLicense(license),
    licenseHint: license.slice(-6)
  };
};

const normalizeCatalogRecord = (entry: any): BackupCatalogRecord | null => {
  if (!entry?.id || !entry?.fileName) return null;
  return {
    ...entry,
    sections: normalizeSections(entry?.sections),
    tables: normalizeTableList(entry?.tables),
    restoreCount: Number(entry?.restoreCount || 0),
    includeFiles: Boolean(entry?.includeFiles),
    fileCount: Number(entry?.fileCount || 0),
    sizeBytes: Number(entry?.sizeBytes || 0),
    notes: entry?.notes ? String(entry.notes) : null,
    importedAt: entry?.importedAt ? String(entry.importedAt) : null,
    lastRestoredAt: entry?.lastRestoredAt ? String(entry.lastRestoredAt) : null,
    lastRestoredByAdminId: entry?.lastRestoredByAdminId ? String(entry.lastRestoredByAdminId) : null,
    createdByAdminEmail: entry?.createdByAdminEmail ? String(entry.createdByAdminEmail) : null,
    licenseHash: String(entry?.licenseHash || ''),
    licenseHint: String(entry?.licenseHint || '')
  } as BackupCatalogRecord;
};

const parseCatalogPayload = (raw: string): BackupCatalogRecord[] => {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed
          .map(normalizeCatalogRecord)
          .filter((entry): entry is BackupCatalogRecord => Boolean(entry))
      : [];
  } catch {
    return [];
  }
};

const normalizeBackupJobRecord = (entry: any): BackupJobRecord | null => {
  if (!entry?.id || !entry?.type || !entry?.status) return null;
  const type = String(entry.type || '').trim().toLowerCase();
  const status = String(entry.status || '').trim().toLowerCase();
  if (type !== 'create') return null;
  if (!['queued', 'running', 'completed', 'failed'].includes(status)) return null;

  return {
    id: String(entry.id),
    type: 'create',
    status: status as BackupJobStatus,
    createdAt: String(entry.createdAt || toIso()),
    updatedAt: String(entry.updatedAt || entry.createdAt || toIso()),
    startedAt: entry?.startedAt ? String(entry.startedAt) : null,
    completedAt: entry?.completedAt ? String(entry.completedAt) : null,
    failedAt: entry?.failedAt ? String(entry.failedAt) : null,
    requestedByAdminId: String(entry.requestedByAdminId || ''),
    requestedByAdminEmail: entry?.requestedByAdminEmail ? String(entry.requestedByAdminEmail) : null,
    mode: entry?.mode === 'partial' ? 'partial' : 'full',
    sections: normalizeSections(entry?.sections),
    customTables: normalizeTableList(entry?.customTables),
    includeFiles: Boolean(entry?.includeFiles),
    notes: entry?.notes ? String(entry.notes) : null,
    backupId: entry?.backupId ? String(entry.backupId) : null,
    fileName: entry?.fileName ? String(entry.fileName) : null,
    scrolithLicense: entry?.scrolithLicense ? String(entry.scrolithLicense) : null,
    message: entry?.message ? String(entry.message) : null,
    errorCode: entry?.errorCode ? String(entry.errorCode) : null
  };
};

const parseJobsPayload = (raw: string): BackupJobRecord[] => {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed
          .map(normalizeBackupJobRecord)
          .filter((entry): entry is BackupJobRecord => Boolean(entry))
      : [];
  } catch {
    return [];
  }
};

const readCatalogLocal = (): BackupCatalogRecord[] => {
  ensureBackupDir();
  if (!fs.existsSync(BACKUP_CATALOG_FILE)) return [];
  try {
    const raw = fs.readFileSync(BACKUP_CATALOG_FILE, 'utf-8');
    return parseCatalogPayload(raw);
  } catch {
    return [];
  }
};

const readJobsLocal = (): BackupJobRecord[] => {
  ensureBackupDir();
  if (!fs.existsSync(BACKUP_JOBS_FILE)) return [];
  try {
    const raw = fs.readFileSync(BACKUP_JOBS_FILE, 'utf-8');
    return parseJobsPayload(raw);
  } catch {
    return [];
  }
};

const readCatalog = async (): Promise<BackupCatalogRecord[]> => {
  ensureBackupDir();
  if (!shouldUseAzureBackupStorage()) {
    return readCatalogLocal();
  }
  try {
    const exists = await blobExistsByName(BACKUP_CATALOG_BLOB);
    if (!exists) return readCatalogLocal();
    const blobResponse = await downloadBlobByName(BACKUP_CATALOG_BLOB);
    const stream = blobResponse.readableStreamBody;
    if (!stream) return readCatalogLocal();
    const raw = (await streamToBuffer(stream as NodeJS.ReadableStream)).toString('utf-8');
    return parseCatalogPayload(raw);
  } catch {
    return readCatalogLocal();
  }
};

const readJobs = async (): Promise<BackupJobRecord[]> => {
  ensureBackupDir();
  if (!shouldUseAzureBackupStorage()) {
    return readJobsLocal();
  }
  try {
    const exists = await blobExistsByName(BACKUP_JOBS_BLOB);
    if (!exists) return readJobsLocal();
    const blobResponse = await downloadBlobByName(BACKUP_JOBS_BLOB);
    const stream = blobResponse.readableStreamBody;
    if (!stream) return readJobsLocal();
    const raw = (await streamToBuffer(stream as NodeJS.ReadableStream)).toString('utf-8');
    return parseJobsPayload(raw);
  } catch {
    return readJobsLocal();
  }
};

const writeCatalogLocal = (records: BackupCatalogRecord[]) => {
  ensureBackupDir();
  const sorted = [...records].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const tempFile = `${BACKUP_CATALOG_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(sorted, null, 2), 'utf-8');
  fs.renameSync(tempFile, BACKUP_CATALOG_FILE);
};

const sanitizeJobsForWrite = (records: BackupJobRecord[]) => {
  const sorted = [...records].sort(
    (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
  );
  return sorted.map((record) => {
    const ageMs = Date.now() - new Date(record.updatedAt || record.createdAt).getTime();
    if (ageMs > 24 * 60 * 60 * 1000 && record.status === 'completed') {
      return {
        ...record,
        scrolithLicense: null
      };
    }
    return record;
  });
};

const persistJobsLocal = (records: BackupJobRecord[]) => {
  ensureBackupDir();
  const tempFile = `${BACKUP_JOBS_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(records, null, 2), 'utf-8');
  fs.renameSync(tempFile, BACKUP_JOBS_FILE);
};

const writeCatalog = async (records: BackupCatalogRecord[]) => {
  const sorted = [...records].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  writeCatalogLocal(sorted);
  if (!shouldUseAzureBackupStorage()) return;
  await uploadBufferToBlob({
    buffer: Buffer.from(JSON.stringify(sorted, null, 2), 'utf-8'),
    contentType: 'application/json',
    fileName: BACKUP_CATALOG_BLOB
  });
};

const writeJobs = async (records: BackupJobRecord[]) => {
  const trimmed = sanitizeJobsForWrite(records);
  persistJobsLocal(trimmed);
  if (!shouldUseAzureBackupStorage()) return;
  await uploadBufferToBlob({
    buffer: Buffer.from(JSON.stringify(trimmed, null, 2), 'utf-8'),
    contentType: 'application/json',
    fileName: BACKUP_JOBS_BLOB
  });
};

const resolveBackupPath = (fileName: string) => path.join(BACKUP_ROOT_DIR, path.basename(fileName));

const writeBackupBinary = async (fileName: string, buffer: Buffer) => {
  ensureBackupDir();
  if (!shouldUseAzureBackupStorage()) {
    fs.writeFileSync(resolveBackupPath(fileName), buffer);
    return;
  }
  await uploadBufferToBlob({
    buffer,
    contentType: 'application/gzip',
    fileName: buildBackupBlobName(fileName)
  });
};

const readBackupBinary = async (fileName: string) => {
  const localPath = resolveBackupPath(fileName);
  if (!shouldUseAzureBackupStorage()) {
    return fs.readFileSync(localPath);
  }
  const blobName = buildBackupBlobName(fileName);
  if (await blobExistsByName(blobName)) {
    const blobResponse = await downloadBlobByName(blobName);
    const stream = blobResponse.readableStreamBody;
    if (stream) {
      return streamToBuffer(stream as NodeJS.ReadableStream);
    }
  }
  if (fs.existsSync(localPath)) {
    return fs.readFileSync(localPath);
  }
  throw toError('Backup file is missing on the server.', 404, 'BACKUP_FILE_MISSING');
};

const getBackupFileStatus = async (fileName: string, fallbackSizeBytes: number) => {
  const absolutePath = resolveBackupPath(fileName);
  if (!shouldUseAzureBackupStorage()) {
    const exists = fs.existsSync(absolutePath);
    return {
      exists,
      sizeBytes: exists ? fs.statSync(absolutePath).size : fallbackSizeBytes,
      storage: exists ? ('local' as const) : null
    };
  }
  try {
    const blobName = buildBackupBlobName(fileName);
    const exists = await blobExistsByName(blobName);
    if (!exists) {
      const localExists = fs.existsSync(absolutePath);
      return {
        exists: localExists,
        sizeBytes: localExists ? fs.statSync(absolutePath).size : fallbackSizeBytes,
        storage: localExists ? ('local' as const) : null
      };
    }
    const properties = await getBlobPropertiesByName(blobName);
    return {
      exists: true,
      sizeBytes: Number(properties.contentLength || fallbackSizeBytes || 0),
      storage: 'azure_blob' as const
    };
  } catch {
    const localExists = fs.existsSync(absolutePath);
    return {
      exists: localExists,
      sizeBytes: localExists ? fs.statSync(absolutePath).size : fallbackSizeBytes,
      storage: localExists ? ('local' as const) : null
    };
  }
};

const deleteBackupBinary = async (fileName: string) => {
  const absolutePath = resolveBackupPath(fileName);
  if (shouldUseAzureBackupStorage()) {
    await deleteBlobByName(buildBackupBlobName(fileName)).catch(() => undefined);
  }
  if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
};

const getPathFromUrl = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).pathname;
  } catch {
    return raw;
  }
};

const stripUploadsPrefix = (value: string) =>
  getPathFromUrl(String(value || ''))
    .replace(/^\/+/, '')
    .replace(/^uploads\/+/i, '');

const resolveManagedStorageProvider = () => {
  const driver = String(process.env.UPLOAD_DRIVER || process.env.STORAGE_DRIVER || DEFAULT_STORAGE_PROVIDER)
    .trim()
    .toLowerCase();
  return ['azure_blob', 'azure', 'blob'].includes(driver) && isAzureBlobConfigured()
    ? AZURE_BLOB_STORAGE_PROVIDER
    : DEFAULT_STORAGE_PROVIDER;
};

const getSystemBackupBaseUrl = () => {
  return resolveFileBaseUrl();
};

const buildUploadsUrlForRestore = (relativePath: string) =>
  `${getSystemBackupBaseUrl()}/uploads/${String(relativePath || '').replace(/^\/+/, '')}`;

const buildFileContentUrlForRestore = (fileId: string) =>
  `${getSystemBackupBaseUrl()}/api/files/content/${encodeURIComponent(String(fileId || '').trim())}`;

const resolveStoredThumbnailRelativePath = (value: string | null | undefined) => {
  const relativePath = stripUploadsPrefix(String(value || ''));
  if (!relativePath || relativePath.includes('..')) return null;
  if (relativePath === DEFAULT_VIDEO_THUMBNAIL_FILENAME) return null;
  if (relativePath.startsWith('api/files/content/')) return null;
  return relativePath;
};

const rewriteLegacyLocalMediaUrlForRestore = (value: string | null | undefined) => {
  const raw = String(value || '').trim();
  if (!raw) return raw;

  const normalized = resolveDirectMediaUrl(raw, getSystemBackupBaseUrl());
  if (!normalized) return raw;

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const parsed = new URL(raw);
      const hostname = parsed.hostname.trim().toLowerCase();
      if (!['localhost', '127.0.0.1', '0.0.0.0', '::1'].includes(hostname)) {
        return raw;
      }
    } catch {
      return raw;
    }
  } else if (!raw.startsWith('/uploads/') && !raw.startsWith('uploads/') && !raw.startsWith('/api/files/content/')) {
    return raw;
  }

  return normalized;
};

const normalizeLegacyMediaPayload = (value: any): any => {
  if (typeof value === 'string') {
    return rewriteLegacyLocalMediaUrlForRestore(value);
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((entry) => {
      const normalized = normalizeLegacyMediaPayload(entry);
      if (normalized !== entry) changed = true;
      return normalized;
    });
    return changed ? next : value;
  }
  if (value && typeof value === 'object') {
    let changed = false;
    const next: Record<string, any> = {};
    Object.entries(value).forEach(([key, entry]) => {
      const normalized = normalizeLegacyMediaPayload(entry);
      next[key] = normalized;
      if (normalized !== entry) changed = true;
    });
    return changed ? next : value;
  }
  return value;
};

const guessContentTypeFromPath = (value: string) => {
  switch (path.extname(String(value || '')).toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    case '.jpeg':
    case '.jpg':
    default:
      return 'image/jpeg';
  }
};

const buildRestoredThumbnailUrl = (relativePath: string | null, mimeType: string) => {
  if (relativePath) {
    return resolveManagedStorageProvider() === AZURE_BLOB_STORAGE_PROVIDER
      ? getBlobUrl(relativePath)
      : buildUploadsUrlForRestore(relativePath);
  }
  return String(mimeType || '').toLowerCase().startsWith('video/')
    ? buildUploadsUrlForRestore(DEFAULT_VIDEO_THUMBNAIL_FILENAME)
    : null;
};

const getDataDirectoriesForSnapshot = () => {
  const candidates = [
    { sourceId: 'backend_data', absolutePath: path.resolve(__dirname, '../../data') },
    { sourceId: 'cwd_data', absolutePath: path.resolve(process.cwd(), 'data') }
  ];
  const seen = new Set<string>();
  return candidates.filter((entry) => {
    const resolved = path.resolve(entry.absolutePath);
    if (resolved.startsWith(BACKUP_ROOT_DIR)) return false;
    if (!fs.existsSync(resolved)) return false;
    if (!fs.statSync(resolved).isDirectory()) return false;
    if (seen.has(resolved)) return false;
    seen.add(resolved);
    return true;
  });
};

const collectDirectoryFiles = (sourceId: string, absolutePath: string, remainingBytes: number) => {
  const snapshots: FileSnapshot[] = [];
  let consumed = 0;
  const queue: string[] = [absolutePath];

  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const nextPath = path.join(current, entry.name);
      if (nextPath.startsWith(BACKUP_ROOT_DIR)) continue;
      if (entry.isDirectory()) {
        queue.push(nextPath);
        continue;
      }
      if (!entry.isFile()) continue;

      const stat = fs.statSync(nextPath);
      if (stat.size <= 0) continue;
      if (stat.size > BACKUP_MAX_FILE_BYTES) continue;
      if (consumed + stat.size > remainingBytes) continue;

      const fileBuffer = fs.readFileSync(nextPath);
      const relativePath = path.relative(absolutePath, nextPath).replace(/\\/g, '/');
      snapshots.push({
        sourceId,
        relativePath,
        sizeBytes: stat.size,
        mtime: stat.mtime.toISOString(),
        sha256: hashBytes(fileBuffer),
        contentBase64: fileBuffer.toString('base64')
      });
      consumed += stat.size;
    }
  }

  return { snapshots, consumedBytes: consumed };
};

const readManagedFileBuffer = async (file: {
  storageKey?: string | null;
  storageProvider?: string | null;
  url?: string | null;
}) => {
  const normalizedStorageKey = stripUploadsPrefix(String(file.storageKey || file.url || ''));
  if (!normalizedStorageKey) {
    throw toError('Managed file snapshot is missing a storage key.', 400, 'BACKUP_FILE_STORAGE_KEY_MISSING');
  }

  const provider = String(file.storageProvider || '').trim().toLowerCase();
  if (provider === 'azure_blob' && isAzureBlobConfigured()) {
    const blobResponse = await downloadBlobByName(normalizedStorageKey);
    const stream = blobResponse.readableStreamBody;
    if (!stream) {
      throw toError('Managed upload blob is not available for backup.', 404, 'BACKUP_FILE_BLOB_MISSING');
    }
    return {
      relativePath: normalizedStorageKey,
      buffer: await streamToBuffer(stream as NodeJS.ReadableStream)
    };
  }

  const localPath = path.resolve(UPLOAD_DIR, normalizedStorageKey);
  if (localPath.startsWith(path.resolve(UPLOAD_DIR)) && fs.existsSync(localPath)) {
    return {
      relativePath: normalizedStorageKey,
      buffer: fs.readFileSync(localPath)
    };
  }

  if (isAzureBlobConfigured()) {
    const blobResponse = await downloadBlobByName(normalizedStorageKey);
    const stream = blobResponse.readableStreamBody;
    if (stream) {
      return {
        relativePath: normalizedStorageKey,
        buffer: await streamToBuffer(stream as NodeJS.ReadableStream)
      };
    }
  }

  throw toError('Managed upload file is missing from storage.', 404, 'BACKUP_FILE_SOURCE_MISSING');
};

const collectManagedUploadSnapshots = async (remainingBytes: number) => {
  const snapshots: FileSnapshot[] = [];
  let consumedBytes = 0;
  const files = await prisma.file.findMany({
    select: {
      id: true,
      storageKey: true,
      storageProvider: true,
      url: true,
      mimeType: true,
      size: true,
      thumbnailUrl: true,
      createdAt: true
    },
    orderBy: { createdAt: 'asc' }
  });

  for (const file of files) {
    const numericSize = Number(file.size || 0);
    if (!Number.isFinite(numericSize) || numericSize <= 0) continue;
    if (numericSize > BACKUP_MAX_FILE_BYTES) continue;
    if (consumedBytes + numericSize > remainingBytes) continue;

    try {
      const { relativePath, buffer } = await readManagedFileBuffer(file);
      if (!buffer.length) continue;
      if (buffer.length > BACKUP_MAX_FILE_BYTES) continue;
      if (consumedBytes + buffer.length > remainingBytes) continue;

      snapshots.push({
        sourceId: MANAGED_UPLOAD_SOURCE_ID,
        relativePath,
        sizeBytes: buffer.length,
        mtime: file.createdAt ? file.createdAt.toISOString() : toIso(),
        sha256: hashBytes(buffer),
        contentBase64: buffer.toString('base64'),
        contentType: file.mimeType || 'application/octet-stream'
      });
      consumedBytes += buffer.length;

      const thumbnailRelativePath = resolveStoredThumbnailRelativePath(file.thumbnailUrl);
      if (!thumbnailRelativePath) continue;
      if (consumedBytes >= remainingBytes) continue;

      try {
        const thumbnailBufferResult = await readManagedFileBuffer({
          storageKey: thumbnailRelativePath,
          storageProvider: file.storageProvider,
          url: file.thumbnailUrl
        });
        const thumbnailBuffer = thumbnailBufferResult.buffer;
        if (!thumbnailBuffer.length) continue;
        if (thumbnailBuffer.length > BACKUP_MAX_FILE_BYTES) continue;
        if (consumedBytes + thumbnailBuffer.length > remainingBytes) continue;

        snapshots.push({
          sourceId: MANAGED_THUMBNAIL_SOURCE_ID,
          relativePath: thumbnailRelativePath,
          sizeBytes: thumbnailBuffer.length,
          mtime: file.createdAt ? file.createdAt.toISOString() : toIso(),
          sha256: hashBytes(thumbnailBuffer),
          contentBase64: thumbnailBuffer.toString('base64'),
          contentType: guessContentTypeFromPath(thumbnailRelativePath)
        });
        consumedBytes += thumbnailBuffer.length;
      } catch {
        // Skip missing thumbnails so backup generation stays resilient.
      }
    } catch {
      // Skip missing/unreadable managed files so backup generation stays resilient.
    }
  }

  return { snapshots, consumedBytes };
};

const collectFileSnapshots = async () => {
  const directories = getDataDirectoriesForSnapshot();
  let remainingBytes = BACKUP_MAX_TOTAL_FILE_BYTES;
  const allFiles: FileSnapshot[] = [];
  const managedUploads = await collectManagedUploadSnapshots(remainingBytes);
  allFiles.push(...managedUploads.snapshots);
  remainingBytes -= managedUploads.consumedBytes;
  for (const directory of directories) {
    if (remainingBytes <= 0) break;
    const { snapshots, consumedBytes } = collectDirectoryFiles(
      directory.sourceId,
      directory.absolutePath,
      remainingBytes
    );
    allFiles.push(...snapshots);
    remainingBytes -= consumedBytes;
  }
  return allFiles;
};

const createDbClient = () => {
  const connectionString = process.env.DATABASE_URL || '';
  if (!connectionString) {
    throw toError('DATABASE_URL is not configured for backup operations.', 500, 'BACKUP_DATABASE_URL_MISSING');
  }
  return new Client({
    connectionString,
    ssl:
      process.env.NODE_ENV === 'production'
        ? {
            rejectUnauthorized: false
          }
        : undefined
  });
};

const listPublicTables = async (client: Client) => {
  const result = await client.query<{ table_name: string }>(
    `
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name ASC
    `
  );
  return result.rows
    .map((row) => String(row.table_name || '').trim())
    .filter((tableName) => tableName && !EXCLUDED_TABLES.has(tableName) && isSafeIdentifier(tableName));
};

const resolveTablesBySections = (allTables: string[], sections: BackupSection[], customTables: string[]) => {
  const target = new Set<string>();
  const normalizedSections = sections.filter((section) => section !== 'custom');
  for (const section of normalizedSections) {
    const keywords = SECTION_KEYWORDS[section];
    if (!keywords?.length) continue;
    allTables.forEach((table) => {
      const lower = table.toLowerCase();
      if (keywords.some((keyword) => lower.includes(keyword))) {
        target.add(table);
      }
    });
  }
  customTables.forEach((table) => {
    if (allTables.includes(table)) target.add(table);
  });
  return Array.from(target).sort();
};

const resolveTargetTables = (
  allTables: string[],
  mode: BackupMode,
  sections: BackupSection[],
  customTables: string[]
) => {
  if (mode === 'full') return [...allTables];
  const selected = resolveTablesBySections(allTables, sections, customTables);
  if (!selected.length) {
    throw toError(
      'No tables matched the selected partial backup sections. Select at least one feature area or custom table.',
      400,
      'BACKUP_NO_TARGET_TABLES'
    );
  }
  return selected;
};

const loadTableRows = async (client: Client, tableName: string) => {
  if (!isSafeIdentifier(tableName)) {
    throw toError(`Unsafe table identifier detected: ${tableName}`, 400, 'BACKUP_UNSAFE_TABLE');
  }
  const result = await client.query(`SELECT * FROM "${tableName}"`);
  return result.rows;
};

const parseBackupBuffer = (buffer: Buffer): BackupPackage => {
  if (!buffer?.length) throw toError('Backup file is empty.', 400, 'BACKUP_EMPTY_FILE');
  const isGzip = buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;

  let rawText = '';
  try {
    rawText = isGzip ? zlib.gunzipSync(buffer).toString('utf-8') : buffer.toString('utf-8');
  } catch {
    throw toError(
      'Backup file archive is invalid or corrupted. Upload a valid .scrolith-backup.json.gz file.',
      400,
      'BACKUP_INVALID_ARCHIVE'
    );
  }

  let parsed: any = {};
  try {
    parsed = JSON.parse(rawText || '{}');
  } catch {
    throw toError('Backup file JSON payload is invalid.', 400, 'BACKUP_INVALID_JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw toError('Invalid backup package format.', 400, 'BACKUP_INVALID_FORMAT');
  }
  const pkg = parsed as BackupPackage;
  if (pkg.formatVersion !== '1.0' || !pkg.backup?.id || !pkg.payload?.database) {
    throw toError('Unsupported backup package format.', 400, 'BACKUP_UNSUPPORTED_FORMAT');
  }
  return pkg;
};

const extractInsertableColumns = async (client: Client, tableName: string) => {
  const columns = await client.query<{ column_name: string; data_type: string; udt_name: string }>(
    `
      SELECT column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position ASC
    `,
    [tableName]
  );
  return columns.rows.filter((column) => isSafeIdentifier(column.column_name));
};

const normalizeColumnValue = (dataType: string, value: any) => {
  if (value === undefined) return null;
  if (value === null) return null;
  if (dataType === 'json' || dataType === 'jsonb') {
    if (typeof value === 'string') return value;
    return JSON.stringify(value);
  }
  return value;
};

const insertRows = async (client: Client, tableName: string, rows: any[], mode: RestoreMode) => {
  if (!rows.length) return;

  const columnsMeta = await extractInsertableColumns(client, tableName);
  const availableColumns = columnsMeta.map((column) => column.column_name);
  if (!availableColumns.length) return;

  const first = rows.find((row) => row && typeof row === 'object');
  if (!first) return;
  const selectedColumns = availableColumns.filter((column) => Object.prototype.hasOwnProperty.call(first, column));
  if (!selectedColumns.length) return;

  const columnTypeMap = new Map<string, string>();
  columnsMeta.forEach((column) => columnTypeMap.set(column.column_name, column.data_type));

  const chunkSize = 200;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize);
    const values: any[] = [];
    const tuples = chunk
      .map((row) => {
        const placeholders = selectedColumns.map((column) => {
          const dataType = columnTypeMap.get(column) || '';
          values.push(normalizeColumnValue(dataType, row?.[column]));
          return `$${values.length}`;
        });
        return `(${placeholders.join(', ')})`;
      })
      .join(', ');

    const onConflictClause = mode === 'append' ? ' ON CONFLICT DO NOTHING' : '';
    const sql = `INSERT INTO "${tableName}" (${selectedColumns.map((column) => `"${column}"`).join(', ')}) VALUES ${tuples}${onConflictClause}`;
    await client.query(sql, values);
  }
};

const resolveRestoreOrder = async (client: Client, tables: string[]) => {
  const tableSet = new Set(tables);
  const dependencyResult = await client.query<{ table_name: string; referenced_table: string }>(
    `
      SELECT
        tc.table_name AS table_name,
        ccu.table_name AS referenced_table
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_name = tc.constraint_name
       AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
    `
  );

  const inDegree = new Map<string, number>();
  const parentsToChildren = new Map<string, Set<string>>();
  tables.forEach((table) => {
    inDegree.set(table, 0);
    parentsToChildren.set(table, new Set());
  });

  dependencyResult.rows.forEach((dep) => {
    const child = String(dep.table_name || '').trim();
    const parent = String(dep.referenced_table || '').trim();
    if (!child || !parent) return;
    // Self-referencing tables are restorable within the same table payload and
    // should not force the whole table into the cyclic fallback bucket.
    if (child === parent) return;
    if (!tableSet.has(child) || !tableSet.has(parent)) return;
    const children = parentsToChildren.get(parent);
    if (!children) return;
    if (children.has(child)) return;
    children.add(child);
    inDegree.set(child, Number(inDegree.get(child) || 0) + 1);
  });

  const queue = Array.from(inDegree.entries())
    .filter(([, degree]) => degree === 0)
    .map(([table]) => table)
    .sort();

  const ordered: string[] = [];
  while (queue.length) {
    const table = queue.shift();
    if (!table) continue;
    ordered.push(table);
    const children = parentsToChildren.get(table);
    if (!children) continue;
    children.forEach((child) => {
      const next = Number(inDegree.get(child) || 0) - 1;
      inDegree.set(child, next);
      if (next === 0) {
        queue.push(child);
      }
    });
    queue.sort();
  }

  if (ordered.length !== tables.length) {
    const remaining = tables.filter((table) => !ordered.includes(table)).sort();
    if (remaining.length) {
      console.warn('[system-backup] unresolved restore order tables, using fallback order:', remaining);
    }
    return [...ordered, ...remaining];
  }
  return ordered;
};

const restoreManagedStorageSnapshot = async (file: FileSnapshot) => {
  const relativePath = stripUploadsPrefix(file.relativePath);
  if (!relativePath || relativePath.includes('..')) return false;
  const content = Buffer.from(String(file.contentBase64 || ''), 'base64');
  if (!content.length) return false;
  if (content.length > BACKUP_MAX_FILE_BYTES) return false;

  const localTarget = path.resolve(UPLOAD_DIR, relativePath);
  if (!localTarget.startsWith(path.resolve(UPLOAD_DIR))) return false;
  fs.mkdirSync(path.dirname(localTarget), { recursive: true });
  fs.writeFileSync(localTarget, content);

  if (resolveManagedStorageProvider() === AZURE_BLOB_STORAGE_PROVIDER) {
    await uploadBufferToBlob({
      buffer: content,
      contentType: String(file.contentType || 'application/octet-stream'),
      fileName: relativePath
    });
  }

  return true;
};

const restoreFileSnapshots = async (files: FileSnapshot[]) => {
  if (!Array.isArray(files) || !files.length) return 0;
  const knownDirectories = getDataDirectoriesForSnapshot();
  const sourceMap = new Map<string, string>();
  knownDirectories.forEach((entry) => sourceMap.set(entry.sourceId, entry.absolutePath));

  let restoredCount = 0;
  for (const file of files) {
    const sourceId = String(file.sourceId || '').trim();
    if (sourceId === MANAGED_UPLOAD_SOURCE_ID || sourceId === MANAGED_THUMBNAIL_SOURCE_ID) {
      if (await restoreManagedStorageSnapshot(file)) {
        restoredCount += 1;
      }
      continue;
    }

    const sourceRoot = sourceMap.get(String(file.sourceId || '').trim());
    if (!sourceRoot) continue;
    const relativePath = String(file.relativePath || '').replace(/\\/g, '/');
    if (!relativePath || relativePath.includes('..')) continue;
    const targetFile = path.resolve(sourceRoot, relativePath);
    if (!targetFile.startsWith(path.resolve(sourceRoot))) continue;

    const content = Buffer.from(String(file.contentBase64 || ''), 'base64');
    if (!content.length) continue;
    if (content.length > BACKUP_MAX_FILE_BYTES) continue;

    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, content);
    restoredCount += 1;
  }

  return restoredCount;
};

const assertAdminCredentials = async (email: string, password: string) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail || !password) {
    throw toError('Admin email and password are required for restore.', 400, 'BACKUP_ADMIN_AUTH_REQUIRED');
  }

  const admin = await prisma.user.findFirst({
    where: {
      email: { equals: normalizedEmail, mode: 'insensitive' }
    },
    select: {
      id: true,
      email: true,
      role: true,
      passwordHash: true,
      isActive: true
    }
  });

  if (!admin || !admin.passwordHash || admin.isActive === false) {
    throw toError('Invalid admin credentials.', 401, 'BACKUP_ADMIN_AUTH_INVALID');
  }

  const role = String(admin.role || '').toLowerCase();
  if (role !== 'admin' && role !== 'superadmin') {
    throw toError('Only admins can restore backups.', 403, 'BACKUP_ADMIN_ROLE_REQUIRED');
  }

  const isValidPassword = await bcrypt.compare(String(password), String(admin.passwordHash));
  if (!isValidPassword) {
    throw toError('Invalid admin credentials.', 401, 'BACKUP_ADMIN_AUTH_INVALID');
  }

  return admin;
};

const assertBackupAdminEmailMatches = (record: BackupCatalogRecord, email: string) => {
  const expectedEmail = String(record.createdByAdminEmail || '').trim().toLowerCase();
  if (!expectedEmail) return;
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    throw toError('Backup admin email is required for restore.', 400, 'BACKUP_ADMIN_EMAIL_REQUIRED');
  }
  if (normalizedEmail !== expectedEmail) {
    throw toError(
      'Backup admin email does not match the selected backup file.',
      401,
      'BACKUP_ADMIN_EMAIL_MISMATCH'
    );
  }
};

const reconcileRestoredFileRecords = async (rows: any[]) => {
  const targetProvider = resolveManagedStorageProvider();
  const uniqueRows = Array.from(
    new Map(
      (Array.isArray(rows) ? rows : [])
        .map((row) => [String(row?.id || '').trim(), row] as const)
        .filter(([id]) => Boolean(id))
    ).values()
  );

  const chunkSize = 50;
  for (let index = 0; index < uniqueRows.length; index += chunkSize) {
    const chunk = uniqueRows.slice(index, index + chunkSize);
    await Promise.all(
      chunk.map(async (row) => {
        const fileId = String(row?.id || '').trim();
        const storageKey = stripUploadsPrefix(String(row?.storage_key || row?.storageKey || row?.url || ''));
        if (!fileId || !storageKey || storageKey.includes('..')) return;

        const mimeType = String(row?.mime_type || row?.mimeType || row?.type || '').trim().toLowerCase();
        const thumbnailRelativePath = resolveStoredThumbnailRelativePath(row?.thumbnail_url || row?.thumbnailUrl);
        const nextUrl =
          targetProvider === AZURE_BLOB_STORAGE_PROVIDER
            ? buildFileContentUrlForRestore(fileId)
            : buildUploadsUrlForRestore(storageKey);

        await prisma.file.updateMany({
          where: { id: fileId },
          data: {
            storageKey,
            storageProvider: targetProvider,
            url: nextUrl,
            thumbnailUrl: buildRestoredThumbnailUrl(thumbnailRelativePath, mimeType)
          }
        });
      })
    );
  }
};

const normalizeRestoredLegacyMediaReferences = async (tables: string[]) => {
  const normalizedTables = new Set((tables || []).map((table) => String(table || '').trim().toLowerCase()));
  if (!normalizedTables.size) return;

  if (normalizedTables.has('user')) {
    const users = await prisma.user.findMany({
      where: { avatar: { not: null } },
      select: { id: true, avatar: true }
    });
    for (const user of users) {
      const nextAvatar = rewriteLegacyLocalMediaUrlForRestore(user.avatar);
      if (nextAvatar !== String(user.avatar || '')) {
        await prisma.user.update({
          where: { id: user.id },
          data: { avatar: nextAvatar || null }
        });
      }
    }
  }

  if (normalizedTables.has('gig')) {
    const gigs = await prisma.gig.findMany({
      select: { id: true, image: true, images: true }
    });
    for (const gig of gigs) {
      const nextImage = rewriteLegacyLocalMediaUrlForRestore(gig.image);
      const nextImages = normalizeLegacyMediaPayload(gig.images);
      if (nextImage !== (gig.image || '') || nextImages !== gig.images) {
        await prisma.gig.update({
          where: { id: gig.id },
          data: {
            image: nextImage || null,
            images: nextImages as any
          }
        });
      }
    }
  }

  if (normalizedTables.has('communitypost')) {
    const posts = await prisma.communityPost.findMany({
      select: { id: true, attachments: true }
    });
    for (const post of posts) {
      const nextAttachments = normalizeLegacyMediaPayload(post.attachments);
      if (nextAttachments !== post.attachments) {
        await prisma.communityPost.update({
          where: { id: post.id },
          data: { attachments: nextAttachments as any }
        });
      }
    }
  }

  if (normalizedTables.has('communityclub')) {
    const clubs = await prisma.communityClub.findMany({
      where: { coverImage: { not: null } },
      select: { id: true, coverImage: true }
    });
    for (const club of clubs) {
      const nextCoverImage = rewriteLegacyLocalMediaUrlForRestore(club.coverImage);
      if (nextCoverImage !== String(club.coverImage || '')) {
        await prisma.communityClub.update({
          where: { id: club.id },
          data: { coverImage: nextCoverImage || null }
        });
      }
    }
  }

  if (normalizedTables.has('communityevent')) {
    const events = await prisma.communityEvent.findMany({
      where: { image: { not: null } },
      select: { id: true, image: true }
    });
    for (const event of events) {
      const nextImage = rewriteLegacyLocalMediaUrlForRestore(event.image);
      if (nextImage !== String(event.image || '')) {
        await prisma.communityEvent.update({
          where: { id: event.id },
          data: { image: nextImage || null }
        });
      }
    }
  }

  if (normalizedTables.has('communitybusinesspage')) {
    const pages = await prisma.communityBusinessPage.findMany({
      select: { id: true, logoFileId: true, coverFileId: true }
    });
    for (const page of pages) {
      const nextLogo = rewriteLegacyLocalMediaUrlForRestore(page.logoFileId);
      const nextCover = rewriteLegacyLocalMediaUrlForRestore(page.coverFileId);
      if (nextLogo !== String(page.logoFileId || '') || nextCover !== String(page.coverFileId || '')) {
        await prisma.communityBusinessPage.update({
          where: { id: page.id },
          data: {
            logoFileId: nextLogo || null,
            coverFileId: nextCover || null
          }
        });
      }
    }
  }

  if (normalizedTables.has('appsetting')) {
    const settings = await prisma.appSetting.findMany({
      select: { id: true, data: true }
    });
    for (const setting of settings) {
      const nextData = normalizeLegacyMediaPayload(setting.data);
      if (nextData !== setting.data) {
        await prisma.appSetting.update({
          where: { id: setting.id },
          data: { data: nextData as any }
        });
      }
    }
  }
};

const resolveRecordById = (records: BackupCatalogRecord[], backupId: string) => {
  const id = String(backupId || '').trim();
  if (!id) throw toError('Backup id is required.', 400, 'BACKUP_ID_REQUIRED');
  const found = records.find((record) => record.id === id);
  if (!found) throw toError('Backup not found.', 404, 'BACKUP_NOT_FOUND');
  return found;
};

const sanitizeNotes = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return raw.slice(0, 1500);
};

const resolveJobById = (records: BackupJobRecord[], jobId: string) => {
  const id = String(jobId || '').trim();
  if (!id) throw toError('Backup job id is required.', 400, 'BACKUP_JOB_ID_REQUIRED');
  const found = records.find((record) => record.id === id);
  if (!found) throw toError('Backup job not found.', 404, 'BACKUP_JOB_NOT_FOUND');
  return found;
};

const saveBackupJob = async (record: BackupJobRecord) => {
  const jobs = await readJobs();
  const nextJobs = jobs.filter((entry) => entry.id !== record.id);
  nextJobs.push({
    ...record,
    updatedAt: record.updatedAt || toIso()
  });
  await writeJobs(nextJobs);
  return record;
};

const patchBackupJob = async (jobId: string, patch: Partial<BackupJobRecord>) => {
  const jobs = await readJobs();
  const record = resolveJobById(jobs, jobId);
  const next: BackupJobRecord = {
    ...record,
    ...patch,
    updatedAt: toIso()
  };
  await writeJobs(jobs.map((entry) => (entry.id === jobId ? next : entry)));
  return next;
};

const gzipBuffer = (buffer: Buffer, level = 6) =>
  new Promise<Buffer>((resolve, reject) => {
    zlib.gzip(buffer, { level }, (error, output) => {
      if (error) return reject(error);
      return resolve(output);
    });
  });

export const getSystemBackupSections = (): BackupSection[] => [
  'settings',
  'users',
  'content',
  'community',
  'commerce',
  'marketing',
  'developer',
  'security',
  'analytics',
  'forms',
  'custom'
];

export const listSystemBackups = async () => {
  const catalog = await readCatalog();
  const records = await Promise.all(
    catalog.map(async (record) => {
      const status = await getBackupFileStatus(record.fileName, record.sizeBytes);
      return {
        ...record,
        sizeBytes: status.sizeBytes,
        fileMissing: !status.exists
      };
    })
  );
  return records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
};

export const listSystemBackupJobs = async () => {
  const jobs = await readJobs();
  return jobs.sort(
    (a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime()
  );
};

export const createSystemBackup = async (input: CreateBackupInput) => {
  ensureBackupDir();
  const mode = input.mode === 'partial' ? 'partial' : 'full';
  const sections = normalizeSections(input.sections);
  const customTables = normalizeTableList(input.customTables);
  const includeFiles = Boolean(input.includeFiles);
  const notes = sanitizeNotes(input.notes);

  const dbClient = createDbClient();
  await dbClient.connect();
  try {
    const allTables = await listPublicTables(dbClient);
    const selectedTables = resolveTargetTables(allTables, mode, sections, customTables);
    const database: Record<string, any[]> = {};
    for (const table of selectedTables) {
      database[table] = await loadTableRows(dbClient, table);
    }

    const files = includeFiles ? await collectFileSnapshots() : [];
    const backupId = crypto.randomUUID();
    const createdAt = toIso();
    const { license, licenseHash, licenseHint } = generateBackupLicense(backupId);

    const backupPackage: BackupPackage = {
      formatVersion: '1.0',
      platform: {
        name: 'Scrolith',
        generatedAt: createdAt,
        generatedByAdminId: input.adminId,
        generatedByAdminEmail: input.adminEmail || null,
        generator: 'scrolith-admin-system-backup'
      },
      backup: {
        id: backupId,
        mode,
        sections,
        tables: selectedTables,
        includeFiles,
        notes,
        createdAt,
        licenseHash,
        licenseHint
      },
      payload: {
        database,
        files
      }
    };

    const packageBuffer = Buffer.from(JSON.stringify(backupPackage), 'utf-8');
    const compressed = await gzipBuffer(packageBuffer, 6);
    const checksumSha256 = hashBytes(compressed);
    const timestamp = createdAt.replace(/[-:.TZ]/g, '').slice(0, 14);
    const fileName = `${timestamp}_${backupId}.scrolith-backup.json.gz`;
    await writeBackupBinary(fileName, compressed);

    const record: BackupCatalogRecord = {
      id: backupId,
      fileName,
      formatVersion: BACKUP_FORMAT_VERSION,
      mode,
      sections,
      tables: selectedTables,
      includeFiles,
      fileCount: files.length,
      sizeBytes: compressed.byteLength,
      checksumSha256,
      notes,
      createdAt,
      createdByAdminId: input.adminId,
      createdByAdminEmail: input.adminEmail || null,
      importedAt: null,
      lastRestoredAt: null,
      lastRestoredByAdminId: null,
      restoreCount: 0,
      licenseHash,
      licenseHint
    };

    const catalog = await readCatalog();
    catalog.push(record);
    await writeCatalog(catalog);

    return {
      backup: record,
      scrolithLicense: license
    };
  } finally {
    await dbClient.end().catch(() => undefined);
  }
};

export const queueSystemBackupCreation = async (input: CreateBackupInput) => {
  const jobs = await readJobs();
  const existingActiveJob = jobs.find(
    (entry) => entry.type === 'create' && (entry.status === 'queued' || entry.status === 'running')
  );
  if (existingActiveJob) {
    throw toError(
      'Another system backup is already running. Wait for it to finish before starting a new one.',
      409,
      'BACKUP_JOB_ALREADY_RUNNING'
    );
  }

  const job: BackupJobRecord = {
    id: crypto.randomUUID(),
    type: 'create',
    status: 'queued',
    createdAt: toIso(),
    updatedAt: toIso(),
    startedAt: null,
    completedAt: null,
    failedAt: null,
    requestedByAdminId: input.adminId,
    requestedByAdminEmail: input.adminEmail || null,
    mode: input.mode === 'partial' ? 'partial' : 'full',
    sections: normalizeSections(input.sections),
    customTables: normalizeTableList(input.customTables),
    includeFiles: Boolean(input.includeFiles),
    notes: sanitizeNotes(input.notes),
    backupId: null,
    fileName: null,
    scrolithLicense: null,
    message: 'Queued for background processing.',
    errorCode: null
  };

  await saveBackupJob(job);
  return job;
};

export const runSystemBackupCreationJob = async (
  jobId: string,
  input: CreateBackupInput,
  hooks?: {
    onUpdate?: (payload: Record<string, any>) => void | Promise<void>;
  }
) => {
  const emitUpdate = async (payload: Record<string, any>) => {
    try {
      await hooks?.onUpdate?.(payload);
    } catch (error) {
      console.warn('[system-backup] job update emit failed:', (error as any)?.message || error);
    }
  };

  await patchBackupJob(jobId, {
    status: 'running',
    startedAt: toIso(),
    failedAt: null,
    completedAt: null,
    message: 'Generating backup package.',
    errorCode: null
  });
  await emitUpdate({
    action: 'job_running',
    jobId,
    status: 'running'
  });

  try {
    const result = await createSystemBackup(input);
    const completedJob = await patchBackupJob(jobId, {
      status: 'completed',
      completedAt: toIso(),
      failedAt: null,
      backupId: result.backup.id,
      fileName: result.backup.fileName,
      scrolithLicense: result.scrolithLicense,
      message: 'Backup completed successfully.',
      errorCode: null
    });

    await emitUpdate({
      action: 'job_completed',
      jobId: completedJob.id,
      status: completedJob.status,
      backupId: result.backup.id,
      createdAt: result.backup.createdAt,
      scrolithLicense: result.scrolithLicense
    });

    return completedJob;
  } catch (error: any) {
    const failedJob = await patchBackupJob(jobId, {
      status: 'failed',
      failedAt: toIso(),
      message: String(error?.message || 'System backup generation failed.'),
      errorCode: String(error?.code || 'SYSTEM_BACKUP_ERROR'),
      scrolithLicense: null
    });

    console.warn('[system-backup] create job failed:', {
      jobId,
      code: failedJob.errorCode,
      message: failedJob.message
    });

    await emitUpdate({
      action: 'job_failed',
      jobId: failedJob.id,
      status: failedJob.status,
      error: failedJob.message,
      code: failedJob.errorCode
    });

    return failedJob;
  }
};

export const getSystemBackupDownload = async (backupId: string) => {
  const catalog = await readCatalog();
  const record = resolveRecordById(catalog, backupId);
  const status = await getBackupFileStatus(record.fileName, record.sizeBytes);
  if (!status.exists) {
    throw toError('Backup file is missing on the server.', 404, 'BACKUP_FILE_MISSING');
  }
  if (status.storage === 'azure_blob') {
    return {
      record,
      storage: 'azure_blob' as const,
      blobName: buildBackupBlobName(record.fileName)
    };
  }
  return {
    record,
    storage: 'local' as const,
    absolutePath: resolveBackupPath(record.fileName)
  };
};

export const importSystemBackup = async (params: {
  adminId: string;
  adminEmail: string | null;
  fileName: string;
  fileBuffer: Buffer;
  notes?: string | null;
}) => {
  ensureBackupDir();
  if (!params.fileBuffer?.length) {
    throw toError('Backup file content is required.', 400, 'BACKUP_IMPORT_FILE_REQUIRED');
  }
  if (params.fileBuffer.length > BACKUP_IMPORT_LIMIT_BYTES) {
    throw toError('Backup file exceeds the allowed import size.', 400, 'BACKUP_IMPORT_FILE_TOO_LARGE');
  }

  const parsed = parseBackupBuffer(params.fileBuffer);
  const catalog = await readCatalog();

  let backupId = String(parsed.backup.id || '').trim() || crypto.randomUUID();
  if (catalog.some((entry) => entry.id === backupId)) {
    backupId = crypto.randomUUID();
  }

  const createdAt = String(parsed.backup.createdAt || toIso());
  const mode = parsed.backup.mode === 'partial' ? 'partial' : 'full';
  const sections = normalizeSections(parsed.backup.sections);
  const tables = normalizeTableList(parsed.backup.tables);
  const includeFiles = Boolean(parsed.backup.includeFiles);
  const importNotes = sanitizeNotes(params.notes ?? parsed.backup.notes);

  const { license, licenseHash, licenseHint } = generateBackupLicense(backupId);
  const normalizedPackage: BackupPackage = {
    ...parsed,
    backup: {
      ...parsed.backup,
      id: backupId,
      mode,
      sections,
      tables,
      includeFiles,
      notes: importNotes,
      createdAt,
      licenseHash,
      licenseHint
    }
  };

  const normalizedBuffer = zlib.gzipSync(Buffer.from(JSON.stringify(normalizedPackage), 'utf-8'), { level: 9 });
  const checksumSha256 = hashBytes(normalizedBuffer);
  const timestamp = toIso().replace(/[-:.TZ]/g, '').slice(0, 14);
  const safeInputName = path.basename(String(params.fileName || '').trim() || 'imported-backup');
  const extension = safeInputName.endsWith('.gz') ? '.json.gz' : '.json.gz';
  const outputName = `${timestamp}_${backupId}_imported.scrolith-backup${extension}`;
  await writeBackupBinary(outputName, normalizedBuffer);

  const record: BackupCatalogRecord = {
    id: backupId,
    fileName: outputName,
    formatVersion: BACKUP_FORMAT_VERSION,
    mode,
    sections,
    tables,
    includeFiles,
    fileCount: Array.isArray(normalizedPackage.payload?.files)
      ? normalizedPackage.payload.files.length
      : 0,
    sizeBytes: normalizedBuffer.byteLength,
    checksumSha256,
    notes: importNotes,
    createdAt,
    createdByAdminId: params.adminId,
    createdByAdminEmail: params.adminEmail || null,
    importedAt: toIso(),
    lastRestoredAt: null,
    lastRestoredByAdminId: null,
    restoreCount: 0,
    licenseHash,
    licenseHint
  };

  catalog.push(record);
  await writeCatalog(catalog);

  return {
    backup: record,
    scrolithLicense: license
  };
};

export const deleteSystemBackups = async (backupIds: string[]) => {
  const ids = Array.from(new Set(backupIds.map((id) => String(id || '').trim()).filter(Boolean)));
  if (!ids.length) {
    throw toError('Select at least one backup file to delete.', 400, 'BACKUP_DELETE_SELECTION_REQUIRED');
  }

  const catalog = await readCatalog();
  const remaining: BackupCatalogRecord[] = [];
  const deleted: BackupCatalogRecord[] = [];

  for (const record of catalog) {
    if (ids.includes(record.id)) {
      deleted.push(record);
      try {
        await deleteBackupBinary(record.fileName);
      } catch {
        // ignore file delete failures to keep catalog cleanup moving
      }
      continue;
    }
    remaining.push(record);
  }

  await writeCatalog(remaining);
  return deleted;
};

export const restoreSystemBackup = async (input: RestoreBackupInput) => {
  const catalog = await readCatalog();
  const record = resolveRecordById(catalog, input.backupId);
  assertBackupAdminEmailMatches(record, input.adminEmail);
  const admin = await assertAdminCredentials(input.adminEmail, input.adminPassword);
  const providedLicense = String(input.scrolithLicense || '').trim();
  if (!providedLicense) {
    throw toError('Scrolith license is required to restore a backup.', 400, 'BACKUP_LICENSE_REQUIRED');
  }
  if (hashLicense(providedLicense) !== record.licenseHash) {
    throw toError('Invalid Scrolith license for this backup file.', 401, 'BACKUP_LICENSE_INVALID');
  }

  const fileStatus = await getBackupFileStatus(record.fileName, record.sizeBytes);
  if (!fileStatus.exists) {
    throw toError('Backup file is missing on the server.', 404, 'BACKUP_FILE_MISSING');
  }

  const backupBuffer = await readBackupBinary(record.fileName);
  const backupPackage = parseBackupBuffer(backupBuffer);
  const packageTables = Object.keys(backupPackage.payload?.database || {}).filter(isSafeIdentifier);
  const mode: RestoreMode = input.mode === 'append' ? 'append' : 'replace';
  const sections = normalizeSections(input.sections);
  const customTables = normalizeTableList(input.customTables);
  const selectedTables =
    sections.length || customTables.length
      ? resolveTargetTables(packageTables, 'partial', sections, customTables)
      : packageTables;

  if (!selectedTables.length) {
    throw toError('No restorable tables found for the selected backup.', 400, 'BACKUP_RESTORE_NO_TABLES');
  }

  const dbClient = createDbClient();
  let restoredFileRows: any[] = [];
  await dbClient.connect();
  try {
    const existingTables = new Set(await listPublicTables(dbClient));
    const restorableTables = selectedTables.filter((table) => existingTables.has(table));
    if (!restorableTables.length) {
      throw toError(
        'No matching tables exist on this server for the selected backup scope.',
        400,
        'BACKUP_RESTORE_TABLES_MISSING'
      );
    }

    if (restorableTables.includes('files')) {
      restoredFileRows = Array.isArray(backupPackage.payload?.database?.files)
        ? backupPackage.payload.database.files
        : [];
    }

    const insertionOrder = await resolveRestoreOrder(dbClient, restorableTables);
    await dbClient.query('BEGIN');

    if (mode === 'replace') {
      const truncateTargets = restorableTables.map((table) => `"${table}"`).join(', ');
      await dbClient.query(`TRUNCATE TABLE ${truncateTargets} RESTART IDENTITY CASCADE`);
    }

    for (const table of insertionOrder) {
      const rows = Array.isArray(backupPackage.payload?.database?.[table])
        ? backupPackage.payload.database[table]
        : [];
      if (!rows.length) continue;
      await insertRows(dbClient, table, rows, mode);
    }

    await dbClient.query('COMMIT');
  } catch (error) {
    await dbClient.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await dbClient.end().catch(() => undefined);
  }

  let restoredFiles = 0;
  if (input.includeFiles && Array.isArray(backupPackage.payload?.files)) {
    restoredFiles = await restoreFileSnapshots(backupPackage.payload.files);
  }
  if (restoredFileRows.length) {
    await reconcileRestoredFileRecords(restoredFileRows);
  }
  await normalizeRestoredLegacyMediaReferences(selectedTables);

  const now = toIso();
  const updated = catalog.map((entry) =>
    entry.id === record.id
      ? {
          ...entry,
          lastRestoredAt: now,
          lastRestoredByAdminId: admin.id,
          restoreCount: Number(entry.restoreCount || 0) + 1
        }
      : entry
  );
  await writeCatalog(updated);

  return {
    backupId: record.id,
    restoredTables: selectedTables.length,
    restoredFiles,
    restoredByAdminId: admin.id,
    restoredAt: now
  };
};
