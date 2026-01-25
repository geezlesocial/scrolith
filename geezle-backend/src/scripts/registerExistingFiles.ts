import fs from 'fs';
import path from 'path';
import { PrismaClient, FileOwnerRole, FileVisibility } from '@prisma/client';

const prisma = new PrismaClient();

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
const DEFAULT_OWNER_ID = 'system-admin';
const DEFAULT_OWNER_ROLE = FileOwnerRole.ADMIN;

const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.zip': 'application/zip',
  '.rar': 'application/vnd.rar',
  '.7z': 'application/x-7z-compressed'
};

const normalizeSlashes = (value: string) => value.replace(/\\/g, '/');

const getBaseFileUrl = () => {
  const envBase = process.env.FILE_BASE_URL || process.env.APP_URL || process.env.FRONTEND_URL;
  if (envBase) return envBase.replace(/\/$/, '');

  const host = process.env.HOST || 'localhost';
  const port = process.env.PORT || '5000';
  return `http://${host}:${port}`;
};

const getMimeTypeFromFilename = (filename: string) => {
  const ext = path.extname(filename).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
};

const inferCategory = (mimeType: string) => {
  if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) return 'portfolio';
  return 'document';
};

const getCreatedAtFromStats = (stats: fs.Stats) => {
  const birthTime = stats.birthtime && !Number.isNaN(stats.birthtime.getTime())
    ? stats.birthtime
    : null;
  const modTime = stats.mtime && !Number.isNaN(stats.mtime.getTime())
    ? stats.mtime
    : null;
  return (birthTime || modTime || new Date()).toISOString();
};

const listUploadFiles = (dir: string, prefix = ''): { relativePath: string; fullPath: string; stats: fs.Stats }[] => {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: { relativePath: string; fullPath: string; stats: fs.Stats }[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = prefix ? path.join(prefix, entry.name) : entry.name;

    if (entry.isDirectory()) {
      files.push(...listUploadFiles(fullPath, relativePath));
      continue;
    }

    if (entry.isFile()) {
      const stats = fs.statSync(fullPath);
      files.push({
        relativePath: normalizeSlashes(relativePath),
        fullPath,
        stats
      });
    }
  }

  return files;
};

const registerFile = async (entry: { relativePath: string; fullPath: string; stats: fs.Stats }) => {
  const storageKey = entry.relativePath;
  const filename = path.basename(entry.fullPath);
  const mimeType = getMimeTypeFromFilename(filename);
  const createdAt = getCreatedAtFromStats(entry.stats);
  const baseUrl = getBaseFileUrl();
  const url = `${baseUrl}/uploads/${storageKey.replace(/^\/+/, '')}`;

  await prisma.file.upsert({
    where: { storageKey },
    update: {
      url,
      mimeType,
      size: BigInt(entry.stats.size),
      visibility: FileVisibility.PUBLIC,
      ownerId: DEFAULT_OWNER_ID,
      ownerRole: DEFAULT_OWNER_ROLE,
      filename,
      originalName: filename
    },
    create: {
      storageKey,
      url,
      mimeType,
      size: BigInt(entry.stats.size),
      visibility: FileVisibility.PUBLIC,
      ownerId: DEFAULT_OWNER_ID,
      ownerRole: DEFAULT_OWNER_ROLE,
      filename,
      originalName: filename,
      createdAt: new Date(createdAt)
    }
  });

  const category = inferCategory(mimeType);
  // Log registration details
  console.log(`Registered file: ${storageKey} (${category})`);
};

const main = async () => {
  if (!fs.existsSync(UPLOAD_DIR)) {
    console.log('Uploads directory not found. Nothing to register.');
    return;
  }

  const entries = listUploadFiles(UPLOAD_DIR);
  if (entries.length === 0) {
    console.log('No files found in uploads directory.');
    return;
  }

  console.log(`Found ${entries.length} files. Registering...`);

  let processed = 0;
  for (const entry of entries) {
    await registerFile(entry);
    processed += 1;
  }

  console.log(`Completed registration. Processed ${processed} files.`);
};

main()
  .catch((error) => {
    console.error('Failed to register existing files:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });