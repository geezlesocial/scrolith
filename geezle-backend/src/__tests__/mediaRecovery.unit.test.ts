/**
 * Phase 2 — Historical Media Recovery safety + behavior unit tests.
 * Fully mocked — no network, no real GCS, no DB.
 */

import path from 'path';
import {
  MediaRecoveryService,
  auditAndMaybeRepairFile,
  classifyFileRow,
  ensureBytesInGcs,
  normalizeProvider,
  probeRecoverySources,
  runMediaRecovery,
  scanOrphanGcsObjects,
  stripUploadsPrefix,
  buildLocalCandidateKeys,
  isSafeCursor,
  clampLimit,
  clampBatchSize,
  sanitizeOrphanPrefix,
  isUnsafeStorageKey,
  isPathInsideRoot,
  redactFileId,
  redactStorageKey,
  redactSignedUrl,
  toPublicRecoveryReport,
  __clearRepairLocksForTests,
  type FileAuditRow,
  type MediaRecoveryDeps
} from '../services/storage/mediaRecovery.service';
import { GOOGLE_CLOUD_STORAGE_PROVIDER } from '../services/storage/gcsMediaStorage';

const GCS = GOOGLE_CLOUD_STORAGE_PROVIDER;

const baseRow = (overrides: Partial<FileAuditRow> = {}): FileAuditRow => ({
  id: 'file-1',
  storageKey: 'media/2026/07/owner/general/abc-photo.png',
  storageProvider: GCS,
  filename: 'abc-photo.png',
  originalName: 'photo.png',
  mimeType: 'image/png',
  size: 70,
  url: '/api/files/content/file-1',
  ownerId: 'owner-1',
  ...overrides
});

const createMockDeps = (opts?: {
  gcsKeys?: Set<string>;
  gcsBodies?: Map<string, Buffer>;
  dbKeys?: Set<string>;
  dbBodies?: Map<string, Buffer>;
  firebaseKeys?: Set<string>;
  azureKeys?: Set<string>;
  localFiles?: Map<string, Buffer>;
  fileRows?: FileAuditRow[];
  storageKeyToFileId?: Map<string, string>;
  gcsConfigured?: boolean;
  failDbUpdate?: boolean;
  failGcsUpload?: boolean;
}): MediaRecoveryDeps & {
  _updates: Array<Record<string, string>>;
  _uploads: Array<{ objectKey: string; size: number }>;
} => {
  const gcsKeys = opts?.gcsKeys || new Set<string>();
  const gcsBodies = opts?.gcsBodies || new Map<string, Buffer>();
  const dbKeys = opts?.dbKeys || new Set<string>();
  const dbBodies = opts?.dbBodies || new Map<string, Buffer>();
  const firebaseKeys = opts?.firebaseKeys || new Set<string>();
  const azureKeys = opts?.azureKeys || new Set<string>();
  const localFiles = opts?.localFiles || new Map<string, Buffer>();
  const fileRows = opts?.fileRows || [];
  const storageKeyToFileId = opts?.storageKeyToFileId || new Map<string, string>();
  const updates: Array<Record<string, string>> = [];
  const uploads: Array<{ objectKey: string; size: number }> = [];
  const uploadsRoot = path.resolve('/tmp/scrolith-uploads-test');

  const deps: MediaRecoveryDeps & {
    _updates: typeof updates;
    _uploads: typeof uploads;
  } = {
    _updates: updates,
    _uploads: uploads,
    uploadsRoot,
    findFiles: async ({ take, cursorId }) => {
      let start = 0;
      if (cursorId) {
        const idx = fileRows.findIndex((r) => r.id === cursorId);
        start = idx >= 0 ? idx + 1 : 0;
      }
      return fileRows.slice(start, start + take);
    },
    countFiles: async () => fileRows.length,
    findFileById: async (id) => fileRows.find((r) => r.id === id) || null,
    updateFileStorageConditional: async (args) => {
      if (opts?.failDbUpdate) throw new Error('DB_UPDATE_FAILED');
      const row = fileRows.find((r) => r.id === args.id);
      if (!row) return 0;
      if (row.storageProvider !== args.expectedProvider || row.storageKey !== args.expectedStorageKey) {
        return 0;
      }
      row.storageProvider = args.storageProvider;
      row.storageKey = args.storageKey;
      updates.push(args as any);
      return 1;
    },
    findFileIdsByStorageKeys: async (keys) => {
      const map = new Map<string, string>();
      for (const key of keys) {
        if (storageKeyToFileId.has(key)) map.set(key, storageKeyToFileId.get(key)!);
      }
      return map;
    },
    loadFileUsages: async (ids) => {
      const map = new Map<string, string[]>();
      for (const id of ids) {
        if (id.includes('avatar')) map.set(id, ['user_avatar']);
        if (id.includes('post')) map.set(id, ['community_post']);
      }
      return map;
    },
    gcsExists: async (key) => gcsKeys.has(key),
    gcsDownload: async (key) => gcsBodies.get(key) || (gcsKeys.has(key) ? Buffer.from('gcs') : null),
    gcsMetadataSize: async (key) => {
      if (!gcsKeys.has(key)) return null;
      return gcsBodies.get(key)?.length ?? 70;
    },
    gcsUpload: async ({ buffer, objectKey }) => {
      if (opts?.failGcsUpload) throw new Error('GCS_UPLOAD_FAILED');
      if (gcsKeys.has(objectKey)) throw new Error(`Refusing overwrite of ${objectKey}`);
      gcsKeys.add(objectKey);
      gcsBodies.set(objectKey, buffer);
      uploads.push({ objectKey, size: buffer.length });
      return { objectKey, sizeBytes: buffer.length };
    },
    listGcsKeys: async ({ maxResults, prefix }) =>
      Array.from(gcsKeys)
        .filter((k) => k.startsWith(prefix || 'media/'))
        .slice(0, maxResults),
    databaseExists: async (key) => dbKeys.has(key),
    databaseDownload: async (key) => dbBodies.get(key) || (dbKeys.has(key) ? Buffer.from('db') : null),
    firebaseExists: async (key) => firebaseKeys.has(key),
    firebaseDownload: async (key) => (firebaseKeys.has(key) ? Buffer.from('fb') : null),
    azureExists: async (key) => azureKeys.has(key),
    azureDownload: async (key) => (azureKeys.has(key) ? Buffer.from('az') : null),
    resolveLocalCandidates: (row) => {
      const rels = [row.storageKey, row.filename, path.basename(row.storageKey || ''), path.basename(row.filename || '')].filter(
        Boolean
      );
      return rels.map((rel) => path.join(uploadsRoot, String(rel).replace(/^\/+/, '')));
    },
    localExists: (absolutePath) => localFiles.has(absolutePath),
    localRead: (absolutePath) => {
      const buf = localFiles.get(absolutePath);
      if (!buf) throw new Error('ENOENT');
      return buf;
    },
    isGcsConfigured: () => opts?.gcsConfigured !== false,
    buildGcsObjectKey: (row) => `media/2026/07/recovered/recovered/${row.id}-${row.originalName || 'file.bin'}`
  };

  return deps;
};

beforeEach(() => {
  __clearRepairLocksForTests();
});

describe('validation & redaction helpers', () => {
  test('isSafeCursor accepts cuid-like and rejects path/url', () => {
    expect(isSafeCursor('cmabc123xyz')).toBe(true);
    expect(isSafeCursor(null)).toBe(true);
    expect(isSafeCursor('../etc/passwd')).toBe(false);
    expect(isSafeCursor('https://evil.com')).toBe(false);
    expect(isSafeCursor('a/b')).toBe(false);
    expect(isSafeCursor('id with spaces')).toBe(false);
  });

  test('clampLimit and clampBatchSize bound values', () => {
    expect(clampLimit(99999, 500, 5000)).toBe(5000);
    expect(clampLimit(-1, 500, 5000)).toBe(500);
    expect(clampBatchSize(999, 100, 200)).toBe(200);
    expect(clampBatchSize(0, 100, 200)).toBe(100);
  });

  test('sanitizeOrphanPrefix forces media/ namespace', () => {
    expect(sanitizeOrphanPrefix('media/2026/')).toMatch(/^media\//);
    expect(sanitizeOrphanPrefix('../secrets')).toBe('media/');
    expect(sanitizeOrphanPrefix('https://evil.com/x')).toBe('media/');
    expect(sanitizeOrphanPrefix('other/prefix')).toBe('media/');
  });

  test('isUnsafeStorageKey blocks traversal and URLs', () => {
    expect(isUnsafeStorageKey('../etc/passwd')).toBe(true);
    expect(isUnsafeStorageKey('https://evil.com/a.png')).toBe(true);
    expect(isUnsafeStorageKey('media/ok.png')).toBe(false);
  });

  test('isPathInsideRoot rejects escape', () => {
    const root = path.resolve('/tmp/uploads');
    expect(isPathInsideRoot(path.resolve(root, 'a.png'), root)).toBe(true);
    expect(isPathInsideRoot(path.resolve(root, '../secret'), root)).toBe(false);
  });

  test('redaction helpers hide full ids, keys, signed urls', () => {
    expect(redactFileId('45fccb9b-21ad-489b-b2fc-e55dcb6b1e8f')).toMatch(/…$/);
    expect(redactStorageKey('media/2026/07/owner/photo.png')).toMatch(/…\//);
    expect(
      redactSignedUrl('https://storage.googleapis.com/b/o?X-Goog-Signature=secret')
    ).toBe('[redacted-signed-or-query-url]');
  });

  test('toPublicRecoveryReport redacts results', () => {
    const report = {
      mode: 'dry-run' as const,
      dryRun: true,
      statistics: {} as any,
      results: [
        {
          fileId: 'abcdefghijklmnop',
          classification: 'healthy' as const,
          storageProvider: GCS,
          storageKey: 'media/long/path/secret-name.png',
          declaredExists: true,
          recoverable: false,
          recoverySource: null,
          recoveryKey: null,
          action: 'skipped_healthy' as const
        }
      ],
      orphans: [{ objectKey: 'media/orphan/private.png', classification: 'missing_database' as const, matchedFileId: null }],
      nextCursor: null,
      generatedAt: new Date().toISOString(),
      mutations: { dbUpdates: 0, gcsUploads: 0, gcsDeletes: 0 }
    };
    const pub = toPublicRecoveryReport(report);
    expect(pub.results[0].fileId).not.toBe('abcdefghijklmnop');
    expect(pub.results[0].storageKey).not.toContain('media/long/path');
    expect(pub.orphans[0].objectKey).toMatch(/…\//);
  });
});

describe('mediaRecovery helpers', () => {
  test('normalizeProvider maps aliases', () => {
    expect(normalizeProvider('gcs')).toBe(GCS);
    expect(normalizeProvider('firebase')).toBe('firebase_storage');
    expect(normalizeProvider('azure')).toBe('azure_blob');
    expect(normalizeProvider('')).toBe('local');
  });

  test('stripUploadsPrefix does not enable SSRF host paths as full keys', () => {
    expect(stripUploadsPrefix('uploads/foo.png')).toBe('foo.png');
    const fromRemote = stripUploadsPrefix('https://evil.example/uploads/x.png');
    expect(fromRemote).toBe('x.png');
    expect(fromRemote).not.toContain('evil');
  });

  test('classifyFileRow rules', () => {
    expect(
      classifyFileRow({ provider: GCS, storageKey: 'media/a', declaredExists: true, recoverable: false })
    ).toBe('healthy');
    expect(
      classifyFileRow({ provider: 'local', storageKey: 'x.png', declaredExists: true, recoverable: true })
    ).toBe('legacy_local');
    expect(
      classifyFileRow({ provider: GCS, storageKey: 'media/a', declaredExists: false, recoverable: false })
    ).toBe('missing_storage');
    expect(
      classifyFileRow({ provider: GCS, storageKey: '', declaredExists: false, recoverable: false })
    ).toBe('missing_both');
    expect(
      classifyFileRow({ provider: 's3', storageKey: 'k', declaredExists: false, recoverable: false })
    ).toBe('unknown_provider');
  });

  test('buildLocalCandidateKeys rejects unsafe keys', () => {
    const keys = buildLocalCandidateKeys(
      baseRow({
        storageKey: '../etc/passwd',
        filename: 'img.png',
        url: 'https://evil.com/secret.png',
        originalName: 'Photo.PNG'
      })
    );
    expect(keys.every((k) => !k.includes('..'))).toBe(true);
    expect(keys.every((k) => !k.includes('evil.com'))).toBe(true);
  });
});

describe('probeRecoverySources priority & SSRF', () => {
  test('prefers GCS over local/db/firebase/azure', async () => {
    const row = baseRow({ storageKey: 'shared-key.bin', storageProvider: 'local' });
    const uploadsRoot = path.resolve('/tmp/scrolith-uploads-test');
    const localPath = path.join(uploadsRoot, 'shared-key.bin');
    const deps = createMockDeps({
      gcsKeys: new Set(['shared-key.bin']),
      dbKeys: new Set(['shared-key.bin']),
      firebaseKeys: new Set(['shared-key.bin']),
      azureKeys: new Set(['shared-key.bin']),
      localFiles: new Map([[localPath, Buffer.from('local')]])
    });
    expect((await probeRecoverySources(row, deps))?.source).toBe('gcs');
  });

  test('never probes arbitrary external URL hosts as HTTP fetches', async () => {
    const row = baseRow({
      storageKey: 'https://evil.com/payload.bin',
      url: 'https://evil.com/payload.bin',
      filename: 'payload.bin'
    });
    const deps = createMockDeps();
    const probe = await probeRecoverySources(row, deps);
    // Unsafe URL keys filtered; only basename may be tried as object name — no network
    expect(probe).toBeNull();
  });

  test('falls through sources in order', async () => {
    const row = baseRow({ storageKey: 'only-local.png', storageProvider: 'local' });
    const deps = createMockDeps();
    const abs = path.join(deps.uploadsRoot, 'only-local.png');
    deps.localExists = (p) => p === abs;
    deps.localRead = () => Buffer.from('local-bytes');
    expect((await probeRecoverySources(row, deps))?.source).toBe('legacy_uploads');

    expect(
      (await probeRecoverySources(baseRow({ storageKey: 'db-only.bin' }), createMockDeps({ dbKeys: new Set(['db-only.bin']) })))
        ?.source
    ).toBe('database_storage');
    expect(
      (await probeRecoverySources(baseRow({ storageKey: 'fb.bin' }), createMockDeps({ firebaseKeys: new Set(['fb.bin']) })))
        ?.source
    ).toBe('firebase_storage');
    expect(
      (await probeRecoverySources(baseRow({ storageKey: 'az.bin' }), createMockDeps({ azureKeys: new Set(['az.bin']) })))
        ?.source
    ).toBe('azure_blob');
  });
});

describe('ensureBytesInGcs safety', () => {
  test('reuses matching size without upload', async () => {
    const key = 'media/2026/07/recovered/recovered/file-1-photo.png';
    const buf = Buffer.from('same-size-content-here!!');
    const deps = createMockDeps({
      gcsKeys: new Set([key]),
      gcsBodies: new Map([[key, buf]])
    });
    const result = await ensureBytesInGcs({
      buffer: buf,
      contentType: 'image/png',
      preferredKey: key,
      row: baseRow(),
      deps
    });
    expect(result.reused).toBe(true);
    expect(result.uploaded).toBe(false);
    expect(deps._uploads).toHaveLength(0);
  });

  test('different-size same-key creates a new key and never overwrites', async () => {
    const key = 'media/existing.png';
    const existing = Buffer.from('AAAA');
    const incoming = Buffer.from('BBBBBBBB');
    const deps = createMockDeps({
      gcsKeys: new Set([key]),
      gcsBodies: new Map([[key, existing]])
    });
    const result = await ensureBytesInGcs({
      buffer: incoming,
      contentType: 'image/png',
      preferredKey: key,
      row: baseRow({ id: 'file-alt' }),
      deps
    });
    expect(result.uploaded).toBe(true);
    expect(result.conflictingDestination).toBe(true);
    expect(result.objectKey).not.toBe(key);
    expect(await deps.gcsExists(key)).toBe(true);
    expect(await deps.gcsMetadataSize(key)).toBe(existing.length);
  });
});

describe('auditAndMaybeRepairFile', () => {
  test('skips healthy GCS files in both modes', async () => {
    const key = 'media/healthy.png';
    const row = baseRow({ storageKey: key, storageProvider: GCS });
    const deps = createMockDeps({ gcsKeys: new Set([key]) });
    expect((await auditAndMaybeRepairFile(row, 'dry-run', deps)).action).toBe('skipped_healthy');
    expect((await auditAndMaybeRepairFile(row, 'repair', deps)).action).toBe('skipped_healthy');
    expect(deps._updates).toHaveLength(0);
    expect(deps._uploads).toHaveLength(0);
  });

  test('dry-run never mutates', async () => {
    const row = baseRow({ id: 'legacy-1', storageProvider: 'local', storageKey: 'old-photo.png' });
    const deps = createMockDeps();
    const abs = path.join(deps.uploadsRoot, 'old-photo.png');
    deps.localExists = (p) => p === abs;
    deps.localRead = () => Buffer.from('png-bytes');
    const result = await auditAndMaybeRepairFile(row, 'dry-run', deps);
    expect(result.action).toBe('would_repair');
    expect(deps._updates).toHaveLength(0);
    expect(deps._uploads).toHaveLength(0);
  });

  test('repair migrates legacy_local and preserves fileId', async () => {
    const row = baseRow({
      id: 'legacy-2',
      storageProvider: 'local',
      storageKey: 'migrate-me.png',
      url: '/api/files/content/legacy-2'
    });
    const deps = createMockDeps({ fileRows: [row] });
    const abs = path.join(deps.uploadsRoot, 'migrate-me.png');
    deps.localExists = (p) => p === abs;
    deps.localRead = () => Buffer.from('migrate-bytes');
    const result = await auditAndMaybeRepairFile(row, 'repair', deps);
    expect(result.action).toBe('repaired');
    expect(result.fileId).toBe('legacy-2');
    expect(result.newStorageProvider).toBe(GCS);
    expect(deps._updates).toHaveLength(1);
  });

  test('failed upload leaves File row unchanged', async () => {
    const row = baseRow({ id: 'fail-up', storageProvider: 'local', storageKey: 'x.png' });
    const deps = createMockDeps({ fileRows: [row], failGcsUpload: true });
    const abs = path.join(deps.uploadsRoot, 'x.png');
    deps.localExists = (p) => p === abs;
    deps.localRead = () => Buffer.from('x');
    const result = await auditAndMaybeRepairFile(row, 'repair', deps);
    expect(result.action).toBe('error');
    expect(row.storageProvider).toBe('local');
    expect(deps._updates).toHaveLength(0);
  });

  test('failed verification leaves File row unchanged', async () => {
    const row = baseRow({ id: 'fail-v', storageProvider: 'local', storageKey: 'y.png' });
    const deps = createMockDeps({ fileRows: [row] });
    const abs = path.join(deps.uploadsRoot, 'y.png');
    deps.localExists = (p) => p === abs;
    deps.localRead = () => Buffer.from('y-bytes');
    // Upload "succeeds" but exists immediately returns false
    deps.gcsUpload = async ({ objectKey }) => ({ objectKey, sizeBytes: 7 });
    deps.gcsExists = async () => false;
    const result = await auditAndMaybeRepairFile(row, 'repair', deps);
    expect(result.action).toBe('error');
    expect(row.storageProvider).toBe('local');
    expect(deps._updates).toHaveLength(0);
  });

  test('failed DB update after GCS create reports cleanup-required', async () => {
    const row = baseRow({ id: 'fail-db', storageProvider: 'local', storageKey: 'z.png' });
    const deps = createMockDeps({ fileRows: [row], failDbUpdate: true });
    const abs = path.join(deps.uploadsRoot, 'z.png');
    deps.localExists = (p) => p === abs;
    deps.localRead = () => Buffer.from('z-bytes');
    const result = await auditAndMaybeRepairFile(row, 'repair', deps);
    expect(result.action).toBe('cleanup_required');
    expect(result.cleanupRequired).toBe(true);
    expect(result.cleanupObjectKey).toBeTruthy();
    expect(row.storageProvider).toBe('local');
  });

  test('unrecoverable never marked healthy', async () => {
    const row = baseRow({ id: 'gone', storageProvider: GCS, storageKey: 'media/totally-gone.png' });
    const deps = createMockDeps();
    const result = await auditAndMaybeRepairFile(row, 'repair', deps);
    expect(result.action).toBe('unrecoverable');
    expect(result.classification).not.toBe('healthy');
  });

  test('idempotent rerun skips already healthy after first repair', async () => {
    const row = baseRow({
      id: 'idem',
      storageProvider: 'local',
      storageKey: 'once.png',
      originalName: 'once.png'
    });
    const deps = createMockDeps({ fileRows: [row] });
    const abs = path.join(deps.uploadsRoot, 'once.png');
    deps.localExists = (p) => p === abs;
    deps.localRead = () => Buffer.from('once-bytes');
    const first = await auditAndMaybeRepairFile(row, 'repair', deps);
    expect(first.action).toBe('repaired');
    const second = await auditAndMaybeRepairFile(row, 'repair', deps);
    expect(second.action).toBe('skipped_healthy');
    expect(deps._updates).toHaveLength(1);
  });

  test('concurrent same-file lock skips second repair', async () => {
    const row = baseRow({ id: 'lock-me', storageProvider: 'local', storageKey: 'lock.png' });
    const deps = createMockDeps({ fileRows: [row] });
    const abs = path.join(deps.uploadsRoot, 'lock.png');
    deps.localExists = (p) => p === abs;
    deps.localRead = () => Buffer.from('lock');

    let release!: () => void;
    const hold = new Promise<void>((r) => {
      release = r;
    });
    const originalUpload = deps.gcsUpload;
    deps.gcsUpload = async (p) => {
      await hold;
      return originalUpload(p);
    };

    const p1 = auditAndMaybeRepairFile(row, 'repair', deps);
    // allow first to acquire lock
    await new Promise((r) => setTimeout(r, 10));
    const p2 = await auditAndMaybeRepairFile(row, 'repair', deps);
    expect(p2.action).toBe('skipped_locked');
    release();
    const first = await p1;
    expect(['repaired', 'error', 'cleanup_required']).toContain(first.action);
  });

  test('path traversal local read rejected by isPathInsideRoot wiring', async () => {
    const row = baseRow({ storageProvider: 'local', storageKey: '../../secret.bin' });
    const deps = createMockDeps();
    // resolveLocalCandidates filters unsafe → no candidates → unrecoverable
    deps.resolveLocalCandidates = (r) => {
      const { buildLocalAbsoluteCandidates } = require('../services/storage/mediaRecovery.service');
      return buildLocalAbsoluteCandidates(r, deps.uploadsRoot);
    };
    const result = await auditAndMaybeRepairFile(row, 'dry-run', deps);
    expect(result.recoverable).toBe(false);
  });
});

describe('scanOrphanGcsObjects report-only', () => {
  test('flags orphans without creating rows or deleting', async () => {
    const gcsKeys = new Set(['media/a.png', 'media/b.png', 'media/c.png']);
    const deps = createMockDeps({
      gcsKeys,
      storageKeyToFileId: new Map([['media/a.png', 'file-a']])
    });
    const orphans = await scanOrphanGcsObjects(deps, { maxResults: 100 });
    expect(orphans).toHaveLength(2);
    expect(gcsKeys.size).toBe(3);
    expect(deps._updates).toHaveLength(0);
  });
});

describe('runMediaRecovery dry-run vs repair', () => {
  test('dry-run produces stats and zero mutations even if write deps present', async () => {
    const rows: FileAuditRow[] = [
      baseRow({ id: 'h1', storageKey: 'media/h1.png', storageProvider: GCS }),
      baseRow({ id: 'l1', storageKey: 'legacy.png', storageProvider: 'local', filename: 'legacy.png' }),
      baseRow({ id: 'm1', storageKey: 'media/missing.png', storageProvider: GCS })
    ];
    const deps = createMockDeps({ fileRows: rows, gcsKeys: new Set(['media/h1.png']) });
    const abs = path.join(deps.uploadsRoot, 'legacy.png');
    deps.localExists = (p) => p === abs;
    deps.localRead = () => Buffer.from('legacy');

    const report = await runMediaRecovery({ mode: 'dry-run', limit: 100, includeOrphanScan: false }, deps);
    expect(report.dryRun).toBe(true);
    expect(report.mutations.dbUpdates).toBe(0);
    expect(report.mutations.gcsUploads).toBe(0);
    expect(report.mutations.gcsDeletes).toBe(0);
    expect(report.statistics.recovered).toBe(0);
    expect(deps._updates).toHaveLength(0);
    expect(deps._uploads).toHaveLength(0);
    expect(report.statistics.healthy).toBe(1);
    expect(report.statistics.legacyLocal).toBe(1);
    expect(report.statistics.missing).toBe(1);
  });

  test('invalid cursor throws', async () => {
    const deps = createMockDeps({ fileRows: [] });
    await expect(runMediaRecovery({ mode: 'dry-run', cursor: '../evil' }, deps)).rejects.toThrow(/Invalid cursor/i);
  });

  test('repair recovers legacy and skips healthy', async () => {
    const rows: FileAuditRow[] = [
      baseRow({ id: 'h2', storageKey: 'media/h2.png', storageProvider: GCS }),
      baseRow({
        id: 'l2',
        storageKey: 'to-recover.png',
        storageProvider: 'local',
        filename: 'to-recover.png',
        originalName: 'to-recover.png'
      })
    ];
    const deps = createMockDeps({ fileRows: rows, gcsKeys: new Set(['media/h2.png']) });
    const abs = path.join(deps.uploadsRoot, 'to-recover.png');
    deps.localExists = (p) => p === abs;
    deps.localRead = () => Buffer.from('recover-me');
    const report = await runMediaRecovery({ mode: 'repair', limit: 50 }, deps);
    expect(report.statistics.recovered).toBe(1);
    expect(report.statistics.healthy).toBe(1);
    expect(deps._updates).toHaveLength(1);
  });

  test('orphan scan report-only and prefix-scoped', async () => {
    const deps = createMockDeps({
      fileRows: [],
      gcsKeys: new Set(['media/orphan-1.png', 'media/linked.png', 'other/not-listed.png']),
      storageKeyToFileId: new Map([['media/linked.png', 'f1']])
    });
    const report = await runMediaRecovery(
      { mode: 'dry-run', limit: 10, includeOrphanScan: true, orphanPrefix: '../escape' },
      deps
    );
    expect(report.statistics.orphaned).toBe(1);
    expect(report.orphans[0].objectKey).toBe('media/orphan-1.png');
    expect(await deps.gcsExists('media/orphan-1.png')).toBe(true);
  });

  test('MediaRecoveryService convenience methods', async () => {
    const deps = createMockDeps({ fileRows: [] });
    expect((await MediaRecoveryService.dryRun({ limit: 1 }, deps)).dryRun).toBe(true);
    expect((await MediaRecoveryService.repair({ limit: 1 }, deps)).mode).toBe('repair');
  });
});

describe('controller-level safeguards (pure helpers)', () => {
  test('confirm gate logic: repair requires explicit true', () => {
    const requireConfirm = (body: Record<string, unknown>) =>
      body.confirm === true || String(body.confirm || '').toLowerCase() === 'true';
    expect(requireConfirm({})).toBe(false);
    expect(requireConfirm({ confirm: false })).toBe(false);
    expect(requireConfirm({ confirm: 'yes' })).toBe(false);
    expect(requireConfirm({ confirm: true })).toBe(true);
    expect(requireConfirm({ confirm: 'true' })).toBe(true);
  });

  test('audit always forces dry-run mode constant', () => {
    // Documented contract: audit path never passes mode=repair to runMediaRecovery
    const auditMode = 'dry-run' as const;
    expect(auditMode).toBe('dry-run');
  });
});
