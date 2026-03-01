import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import bcrypt from 'bcryptjs';
import { Client } from 'pg';
import prisma from '../utils/prismaClient';

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

type FileSnapshot = {
  sourceId: string;
  relativePath: string;
  sizeBytes: number;
  mtime: string;
  sha256: string;
  contentBase64: string;
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

const readCatalog = (): BackupCatalogRecord[] => {
  ensureBackupDir();
  if (!fs.existsSync(BACKUP_CATALOG_FILE)) return [];
  try {
    const raw = fs.readFileSync(BACKUP_CATALOG_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed
          .map((entry: any) => ({
            ...entry,
            sections: normalizeSections(entry?.sections),
            tables: normalizeTableList(entry?.tables),
            restoreCount: Number(entry?.restoreCount || 0),
            includeFiles: Boolean(entry?.includeFiles),
            fileCount: Number(entry?.fileCount || 0),
            notes: entry?.notes ? String(entry.notes) : null,
            importedAt: entry?.importedAt ? String(entry.importedAt) : null,
            lastRestoredAt: entry?.lastRestoredAt ? String(entry.lastRestoredAt) : null,
            lastRestoredByAdminId: entry?.lastRestoredByAdminId ? String(entry.lastRestoredByAdminId) : null
          }))
          .filter((entry: BackupCatalogRecord) => entry?.id && entry?.fileName)
      : [];
  } catch {
    return [];
  }
};

const writeCatalog = (records: BackupCatalogRecord[]) => {
  ensureBackupDir();
  const sorted = [...records].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const tempFile = `${BACKUP_CATALOG_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(sorted, null, 2), 'utf-8');
  fs.renameSync(tempFile, BACKUP_CATALOG_FILE);
};

const resolveBackupPath = (fileName: string) => path.join(BACKUP_ROOT_DIR, path.basename(fileName));

const getDataDirectoriesForSnapshot = () => {
  const candidates = [
    { sourceId: 'backend_data', absolutePath: path.resolve(__dirname, '../../data') },
    { sourceId: 'backend_uploads', absolutePath: path.resolve(__dirname, '../../uploads') },
    { sourceId: 'cwd_data', absolutePath: path.resolve(process.cwd(), 'data') },
    { sourceId: 'cwd_uploads', absolutePath: path.resolve(process.cwd(), 'uploads') }
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

const collectFileSnapshots = () => {
  const directories = getDataDirectoriesForSnapshot();
  let remainingBytes = BACKUP_MAX_TOTAL_FILE_BYTES;
  const allFiles: FileSnapshot[] = [];
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
    return [...ordered, ...remaining];
  }
  return ordered;
};

const restoreFileSnapshots = (files: FileSnapshot[]) => {
  if (!Array.isArray(files) || !files.length) return 0;
  const knownDirectories = getDataDirectoriesForSnapshot();
  const sourceMap = new Map<string, string>();
  knownDirectories.forEach((entry) => sourceMap.set(entry.sourceId, entry.absolutePath));

  let restoredCount = 0;
  files.forEach((file) => {
    const sourceRoot = sourceMap.get(String(file.sourceId || '').trim());
    if (!sourceRoot) return;
    const relativePath = String(file.relativePath || '').replace(/\\/g, '/');
    if (!relativePath || relativePath.includes('..')) return;
    const targetFile = path.resolve(sourceRoot, relativePath);
    if (!targetFile.startsWith(path.resolve(sourceRoot))) return;

    const content = Buffer.from(String(file.contentBase64 || ''), 'base64');
    if (!content.length) return;
    if (content.length > BACKUP_MAX_FILE_BYTES) return;

    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.writeFileSync(targetFile, content);
    restoredCount += 1;
  });

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

export const listSystemBackups = () => {
  const records = readCatalog().map((record) => {
    const backupFilePath = resolveBackupPath(record.fileName);
    const exists = fs.existsSync(backupFilePath);
    const sizeBytes = exists ? fs.statSync(backupFilePath).size : record.sizeBytes;
    return {
      ...record,
      sizeBytes,
      fileMissing: !exists
    };
  });
  return records.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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

    const files = includeFiles ? collectFileSnapshots() : [];
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
    const compressed = zlib.gzipSync(packageBuffer, { level: 9 });
    const checksumSha256 = hashBytes(compressed);
    const timestamp = createdAt.replace(/[-:.TZ]/g, '').slice(0, 14);
    const fileName = `${timestamp}_${backupId}.scrolith-backup.json.gz`;
    const absolutePath = resolveBackupPath(fileName);
    fs.writeFileSync(absolutePath, compressed);

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

    const catalog = readCatalog();
    catalog.push(record);
    writeCatalog(catalog);

    return {
      backup: record,
      scrolithLicense: license
    };
  } finally {
    await dbClient.end().catch(() => undefined);
  }
};

export const getSystemBackupDownload = (backupId: string) => {
  const catalog = readCatalog();
  const record = resolveRecordById(catalog, backupId);
  const absolutePath = resolveBackupPath(record.fileName);
  if (!fs.existsSync(absolutePath)) {
    throw toError('Backup file is missing on the server.', 404, 'BACKUP_FILE_MISSING');
  }
  return { record, absolutePath };
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
  const catalog = readCatalog();

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
  fs.writeFileSync(resolveBackupPath(outputName), normalizedBuffer);

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
  writeCatalog(catalog);

  return {
    backup: record,
    scrolithLicense: license
  };
};

export const deleteSystemBackups = (backupIds: string[]) => {
  const ids = Array.from(new Set(backupIds.map((id) => String(id || '').trim()).filter(Boolean)));
  if (!ids.length) {
    throw toError('Select at least one backup file to delete.', 400, 'BACKUP_DELETE_SELECTION_REQUIRED');
  }

  const catalog = readCatalog();
  const remaining: BackupCatalogRecord[] = [];
  const deleted: BackupCatalogRecord[] = [];

  catalog.forEach((record) => {
    if (ids.includes(record.id)) {
      deleted.push(record);
      try {
        const absolutePath = resolveBackupPath(record.fileName);
        if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath);
      } catch {
        // ignore file delete failures to keep catalog cleanup moving
      }
      return;
    }
    remaining.push(record);
  });

  writeCatalog(remaining);
  return deleted;
};

export const restoreSystemBackup = async (input: RestoreBackupInput) => {
  const catalog = readCatalog();
  const record = resolveRecordById(catalog, input.backupId);
  const admin = await assertAdminCredentials(input.adminEmail, input.adminPassword);
  const providedLicense = String(input.scrolithLicense || '').trim();
  if (!providedLicense) {
    throw toError('Scrolith license is required to restore a backup.', 400, 'BACKUP_LICENSE_REQUIRED');
  }
  if (hashLicense(providedLicense) !== record.licenseHash) {
    throw toError('Invalid Scrolith license for this backup file.', 401, 'BACKUP_LICENSE_INVALID');
  }

  const backupFile = resolveBackupPath(record.fileName);
  if (!fs.existsSync(backupFile)) {
    throw toError('Backup file is missing on the server.', 404, 'BACKUP_FILE_MISSING');
  }

  const backupBuffer = fs.readFileSync(backupFile);
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
    restoredFiles = restoreFileSnapshots(backupPackage.payload.files);
  }

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
  writeCatalog(updated);

  return {
    backupId: record.id,
    restoredTables: selectedTables.length,
    restoredFiles,
    restoredByAdminId: admin.id,
    restoredAt: now
  };
};
