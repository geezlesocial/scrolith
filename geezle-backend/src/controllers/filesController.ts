import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
// Prefer Node's crypto.randomUUID to avoid importing `uuid` (ESM issues in some test runners)
const crypto = require('crypto');
const uuidv4 = () => {
  try {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch (e) {}
  // Fallback to a simple RFC4122 v4-like generator
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (crypto.randomBytes(1)[0] % 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
import { FileVisibility, FileOwnerRole } from '@prisma/client';
import prisma from '../utils/prismaClient';

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');

const ensureUploadDir = () => {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
};

ensureUploadDir();

const safeFilename = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');
const DISK_ID_PREFIX = 'disk:';
const DEFAULT_VISIBILITY: FileVisibility = 'PUBLIC';
const DEFAULT_STORAGE_PROVIDER = 'local';
const DEFAULT_VIDEO_THUMBNAIL_FILENAME = '__video_fallback_thumbnail.svg';
const UPLOAD_THUMBNAILS_DIR = path.join(UPLOAD_DIR, 'thumbnails');

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);

const ALLOWED_VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime'
]);

const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]);

const MAX_UPLOAD_BYTES: Record<'image' | 'video' | 'document', number> = {
  image: 15 * 1024 * 1024,
  video: 200 * 1024 * 1024,
  document: 20 * 1024 * 1024
};

type UploadKind = 'image' | 'video' | 'document';

type MediaMetadata = {
  width: number | null;
  height: number | null;
  duration: number | null;
  thumbnailRelativePath: string | null;
  thumbnailUrl: string | null;
};

let ffmpegAvailableCache: boolean | null = null;
let ffprobeAvailableCache: boolean | null = null;

const normalizeSlashes = (value: string) => value.replace(/\\/g, '/');
const getPathFromUrl = (value: string) => {
  try {
    return new URL(value).pathname;
  } catch {
    return value;
  }
};

const normalizeUploadsUrl = (value: string) => {
  const pathValue = normalizeSlashes(getPathFromUrl(value));
  const uploadsIndex = pathValue.indexOf('/uploads/');
  if (uploadsIndex >= 0) return pathValue.slice(uploadsIndex);
  if (pathValue.startsWith('uploads/')) return `/${pathValue}`;
  return pathValue;
};

const stripUploadsPrefix = (value: string) => {
  const pathValue = normalizeSlashes(getPathFromUrl(value));
  const uploadsIndex = pathValue.indexOf('/uploads/');
  if (uploadsIndex >= 0) return pathValue.slice(uploadsIndex + '/uploads/'.length);
  return pathValue.replace(/^\/?uploads\//, '');
};

const getBaseFileUrl = (req?: Request) => {
  const envBase =
    process.env.FILE_BASE_URL ||
    process.env.BACKEND_URL ||
    process.env.API_BASE_URL ||
    process.env.APP_URL;
  if (envBase) return envBase.replace(/\/$/, '');

  if (req?.headers?.host) {
    const proto = req.headers['x-forwarded-proto']?.toString().split(',')[0] || req.protocol || 'http';
    return `${proto}://${req.headers.host}`;
  }

  const host = process.env.HOST || 'localhost';
  const port = process.env.PORT || '5000';
  return `http://${host}:${port}`;
};

const buildUploadsUrl = (relativePath: string, baseUrl?: string) => {
  const normalized = normalizeSlashes(relativePath).replace(/^\/+/, '');
  const base = baseUrl || getBaseFileUrl();
  return `${base}/uploads/${normalized}`;
};

const getRelativeUploadPath = (filePath: string) =>
  normalizeSlashes(path.relative(UPLOAD_DIR, filePath));

const ensureThumbnailsDir = () => {
  if (!fs.existsSync(UPLOAD_THUMBNAILS_DIR)) {
    fs.mkdirSync(UPLOAD_THUMBNAILS_DIR, { recursive: true });
  }
};

const getFallbackVideoThumbnailPath = () => {
  ensureUploadDir();
  const fallbackPath = path.join(UPLOAD_DIR, DEFAULT_VIDEO_THUMBNAIL_FILENAME);
  if (!fs.existsSync(fallbackPath)) {
    const fallbackSvg = [
      '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice">',
      '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#1e293b"/></linearGradient></defs>',
      '<rect width="640" height="360" fill="url(#g)" />',
      '<rect x="64" y="60" width="512" height="240" rx="24" fill="#111827" fill-opacity="0.65" />',
      '<polygon points="292,160 292,220 352,190" fill="#f8fafc" />',
      '<text x="320" y="276" font-family="Arial, Helvetica, sans-serif" font-size="22" text-anchor="middle" fill="#e2e8f0">Video Preview</text>',
      '</svg>'
    ].join('');
    fs.writeFileSync(fallbackPath, fallbackSvg, 'utf8');
  }
  return fallbackPath;
};
getFallbackVideoThumbnailPath();

const safeUnlink = (filePath?: string | null) => {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (error) {
    console.warn('Failed to remove file from disk:', error);
  }
};

const execFileAsync = (command: string, args: string[], timeout = 8000) =>
  new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    execFile(command, args, { timeout }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });

const checkBinary = async (binary: 'ffmpeg' | 'ffprobe') => {
  try {
    await execFileAsync(binary, ['-version'], 2500);
    return true;
  } catch {
    return false;
  }
};

const hasFfmpeg = async () => {
  if (ffmpegAvailableCache !== null) return ffmpegAvailableCache;
  ffmpegAvailableCache = await checkBinary('ffmpeg');
  return ffmpegAvailableCache;
};

const hasFfprobe = async () => {
  if (ffprobeAvailableCache !== null) return ffprobeAvailableCache;
  ffprobeAvailableCache = await checkBinary('ffprobe');
  return ffprobeAvailableCache;
};

const resolveUploadKind = (mimeType: string): UploadKind | null => {
  if (ALLOWED_IMAGE_MIME_TYPES.has(mimeType)) return 'image';
  if (ALLOWED_VIDEO_MIME_TYPES.has(mimeType)) return 'video';
  if (ALLOWED_DOCUMENT_MIME_TYPES.has(mimeType)) return 'document';
  return null;
};

const validateUploadFile = (file: Express.Multer.File) => {
  const mimeType = String(file?.mimetype || '').toLowerCase();
  const kind = resolveUploadKind(mimeType);
  if (!kind) {
    throw new Error(`Unsupported file type: ${mimeType || 'unknown'}`);
  }
  const maxSize = MAX_UPLOAD_BYTES[kind];
  if (typeof maxSize === 'number' && Number(file?.size || 0) > maxSize) {
    throw new Error(`File exceeds ${kind} upload limit (${Math.floor(maxSize / (1024 * 1024))}MB)`);
  }
  return { kind };
};

const getUploadUrlFromFile = (file: Express.Multer.File, baseUrl?: string) => {
  const filePath = file.path || path.join(UPLOAD_DIR, file.filename);
  const relativePath = getRelativeUploadPath(filePath);
  return buildUploadsUrl(relativePath, baseUrl);
};

const resolveUploadPath = (value: string) => {
  const relativePath = stripUploadsPrefix(value);
  if (!relativePath) return '';
  return path.join(UPLOAD_DIR, relativePath);
};

const getRole = (req: Request) =>
  (req.body?.role || req.body?.owner_role || req.user?.role || 'guest').toString().toLowerCase();

const resolveOwnerRole = (value?: string | null) => {
  const normalized = (value || '').toString().toLowerCase();
  if (['admin', 'superadmin'].includes(normalized)) return FileOwnerRole.ADMIN;
  if (['freelancer', 'seller'].includes(normalized)) return FileOwnerRole.FREELANCER;
  if (['client', 'employer', 'buyer'].includes(normalized)) return FileOwnerRole.CLIENT;
  return FileOwnerRole.CLIENT;
};

const resolveVisibility = (value?: unknown) => {
  const normalized = (value || '').toString().toUpperCase();
  if (normalized === FileVisibility.PRIVATE) return FileVisibility.PRIVATE;
  return FileVisibility.PUBLIC;
};

const getUserId = (req: Request) =>
  (req.body?.userId || req.body?.user_id || req.query?.userId || req.user?.id || 'system')
    .toString();

const inferCategory = (mimeType: string, explicit?: string) => {
  if (explicit) return explicit;
  if (mimeType.startsWith('image/') || mimeType.startsWith('video/')) return 'portfolio';
  return 'document';
};

const getMimeTypeFromFilename = (filename: string) => {
  const ext = path.extname(filename).toLowerCase();
  const map: Record<string, string> = {
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
  return map[ext] || 'application/octet-stream';
};

const parseImageDimensionsFromBuffer = (buffer: Buffer, mimeType: string) => {
  try {
    if (mimeType === 'image/png' && buffer.length >= 24) {
      const isPng =
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4e &&
        buffer[3] === 0x47;
      if (isPng) {
        return {
          width: buffer.readUInt32BE(16),
          height: buffer.readUInt32BE(20)
        };
      }
    }

    if (mimeType === 'image/gif' && buffer.length >= 10) {
      return {
        width: buffer.readUInt16LE(6),
        height: buffer.readUInt16LE(8)
      };
    }

    if (mimeType === 'image/webp' && buffer.length >= 30) {
      const riff = buffer.toString('ascii', 0, 4) === 'RIFF';
      const webp = buffer.toString('ascii', 8, 12) === 'WEBP';
      if (riff && webp) {
        const chunkType = buffer.toString('ascii', 12, 16);
        if (chunkType === 'VP8X' && buffer.length >= 30) {
          const width = 1 + buffer.readUIntLE(24, 3);
          const height = 1 + buffer.readUIntLE(27, 3);
          return { width, height };
        }
      }
    }

    if (mimeType === 'image/jpeg' && buffer.length > 4) {
      let offset = 2;
      while (offset < buffer.length) {
        if (buffer[offset] !== 0xff) {
          offset += 1;
          continue;
        }
        const marker = buffer[offset + 1];
        const hasSegmentLength = marker !== 0xd8 && marker !== 0xd9 && marker !== 0x01;
        if (!hasSegmentLength) {
          offset += 2;
          continue;
        }
        const segmentLength = buffer.readUInt16BE(offset + 2);
        const isSofMarker = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
        if (isSofMarker && segmentLength >= 7) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { width, height };
        }
        offset += 2 + segmentLength;
      }
    }
  } catch (error) {
    console.warn('Failed to parse image dimensions from buffer:', error);
  }
  return { width: null, height: null };
};

const probeWithFfprobe = async (filePath: string) => {
  if (!(await hasFfprobe())) return null;
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', filePath],
      7000
    );
    return JSON.parse(stdout);
  } catch {
    return null;
  }
};

const extractMediaMetadata = async (filePath: string, mimeType: string) => {
  const metadata: { width: number | null; height: number | null; duration: number | null } = {
    width: null,
    height: null,
    duration: null
  };

  const probe = await probeWithFfprobe(filePath);
  if (probe) {
    const streams = Array.isArray(probe?.streams) ? probe.streams : [];
    const videoStream = streams.find((stream: any) => Number(stream?.width) > 0 && Number(stream?.height) > 0);
    if (videoStream) {
      metadata.width = Number(videoStream.width) || null;
      metadata.height = Number(videoStream.height) || null;
      const streamDuration = Number(videoStream.duration);
      if (Number.isFinite(streamDuration) && streamDuration > 0) {
        metadata.duration = Number(streamDuration.toFixed(3));
      }
    }
    if (metadata.duration === null) {
      const formatDuration = Number(probe?.format?.duration);
      if (Number.isFinite(formatDuration) && formatDuration > 0) {
        metadata.duration = Number(formatDuration.toFixed(3));
      }
    }
  }

  if (mimeType.startsWith('image/') && (metadata.width === null || metadata.height === null)) {
    try {
      const buffer = fs.readFileSync(filePath);
      const parsed = parseImageDimensionsFromBuffer(buffer, mimeType);
      metadata.width = parsed.width ?? metadata.width;
      metadata.height = parsed.height ?? metadata.height;
    } catch (error) {
      console.warn('Failed to read uploaded image for dimension parsing:', error);
    }
  }

  return metadata;
};

const createVideoThumbnail = async (
  filePath: string,
  sourceRelativePath: string,
  baseUrl: string
): Promise<{ thumbnailRelativePath: string | null; thumbnailUrl: string }> => {
  getFallbackVideoThumbnailPath();
  const fallbackUrl = buildUploadsUrl(DEFAULT_VIDEO_THUMBNAIL_FILENAME, baseUrl);

  if (!(await hasFfmpeg())) {
    return { thumbnailRelativePath: null, thumbnailUrl: fallbackUrl };
  }

  try {
    ensureThumbnailsDir();
    const sourceName = path.basename(sourceRelativePath, path.extname(sourceRelativePath));
    const safeSourceName = safeFilename(sourceName || `video-${Date.now()}`);
    const thumbName = `${safeSourceName}-${Date.now()}.jpg`;
    const thumbnailRelativePath = normalizeSlashes(path.join('thumbnails', thumbName));
    const thumbnailPath = path.join(UPLOAD_DIR, thumbnailRelativePath);

    await execFileAsync(
      'ffmpeg',
      ['-y', '-ss', '00:00:01.000', '-i', filePath, '-frames:v', '1', '-vf', 'scale=960:-1', thumbnailPath],
      12000
    );

    if (fs.existsSync(thumbnailPath)) {
      return {
        thumbnailRelativePath,
        thumbnailUrl: buildUploadsUrl(thumbnailRelativePath, baseUrl)
      };
    }
  } catch (error) {
    console.warn('Failed to generate video thumbnail with ffmpeg. Using fallback thumbnail.', error);
  }

  return { thumbnailRelativePath: null, thumbnailUrl: fallbackUrl };
};

const buildMediaMetadata = async (
  file: Express.Multer.File,
  relativePath: string,
  baseUrl: string
): Promise<MediaMetadata> => {
  const metadata = await extractMediaMetadata(file.path || path.join(UPLOAD_DIR, file.filename), file.mimetype);

  if (file.mimetype.startsWith('video/')) {
    const generated = await createVideoThumbnail(file.path || path.join(UPLOAD_DIR, file.filename), relativePath, baseUrl);
    return {
      width: metadata.width,
      height: metadata.height,
      duration: metadata.duration,
      thumbnailRelativePath: generated.thumbnailRelativePath,
      thumbnailUrl: generated.thumbnailUrl
    };
  }

  return {
    width: metadata.width,
    height: metadata.height,
    duration: null,
    thumbnailRelativePath: null,
    thumbnailUrl: null
  };
};

const normalizeRecord = (record: any) => {
  const createdAt = record?.created_at || record?.createdAt || record?.uploadedAt || new Date().toISOString();
  const mimeType = record?.mime_type || record?.mimeType || record?.type || '';
  const isVideo = String(mimeType || '').toLowerCase().startsWith('video/');
  const thumbnailUrl =
    record?.thumbnail_url ||
    record?.thumbnailUrl ||
    (isVideo ? buildUploadsUrl(DEFAULT_VIDEO_THUMBNAIL_FILENAME) : null);
  return {
    ...record,
    created_at: createdAt,
    createdAt,
    uploadedAt: createdAt,
    mime_type: mimeType,
    mimeType,
    storage_provider: record?.storage_provider || record?.storageProvider || DEFAULT_STORAGE_PROVIDER,
    storageProvider: record?.storage_provider || record?.storageProvider || DEFAULT_STORAGE_PROVIDER,
    thumbnail_url: thumbnailUrl,
    thumbnailUrl,
    width: record?.width !== undefined && record?.width !== null ? Number(record.width) : null,
    height: record?.height !== undefined && record?.height !== null ? Number(record.height) : null,
    duration: record?.duration !== undefined && record?.duration !== null ? Number(record.duration) : null
  };
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

const buildDiskRecord = (entry: { relativePath: string; fullPath: string; stats: fs.Stats }, baseUrl?: string) => {
  const name = path.basename(entry.relativePath);
  const mimeType = getMimeTypeFromFilename(name);
  const createdAt = getCreatedAtFromStats(entry.stats);
  const isVideo = mimeType.startsWith('video/');
  return normalizeRecord({
    id: `${DISK_ID_PREFIX}${entry.relativePath}`,
    user_id: 'system',
    owner_role: 'admin',
    name,
    type: mimeType,
    size: entry.stats.size,
    url: buildUploadsUrl(entry.relativePath, baseUrl),
    storage_key: entry.relativePath,
    storage_provider: DEFAULT_STORAGE_PROVIDER,
    thumbnail_url: isVideo ? buildUploadsUrl(DEFAULT_VIDEO_THUMBNAIL_FILENAME, baseUrl) : null,
    width: null,
    height: null,
    duration: null,
    category: inferCategory(mimeType),
    created_at: createdAt
  });
};

const toClientFile = (record: any) => {
  const createdAt = record?.created_at || record?.createdAt || record?.uploadedAt || new Date().toISOString();
  const mimeType = record?.mime_type || record?.mimeType || record?.type || '';
  const url = record?.url || '';
  const storageKey = record?.storage_key || record?.storageKey || '';
  const isVideo = String(mimeType || '').toLowerCase().startsWith('video/');
  const thumbnailUrl = record?.thumbnail_url || record?.thumbnailUrl || (isVideo ? buildUploadsUrl(DEFAULT_VIDEO_THUMBNAIL_FILENAME) : null);
  const mediaType = mimeType.startsWith('image/')
    ? 'image'
    : mimeType.startsWith('video/')
      ? 'video'
      : 'document';

  return {
    id: record.id,
    name: record.name,
    url,
    storage_key: storageKey,
    storageKey,
    type: mediaType,
    mime_type: mimeType,
    mimeType,
    size: Number(record.size ?? 0),
    category: record.category,
    owner_id: record.owner_id || record.ownerId,
    ownerId: record.owner_id || record.ownerId,
    owner_role: record.owner_role || record.ownerRole,
    ownerRole: record.owner_role || record.ownerRole,
    storage_provider: record.storage_provider || record.storageProvider || DEFAULT_STORAGE_PROVIDER,
    storageProvider: record.storage_provider || record.storageProvider || DEFAULT_STORAGE_PROVIDER,
    thumbnail_url: thumbnailUrl,
    thumbnailUrl,
    width: record?.width !== undefined && record?.width !== null ? Number(record.width) : null,
    height: record?.height !== undefined && record?.height !== null ? Number(record.height) : null,
    duration: record?.duration !== undefined && record?.duration !== null ? Number(record.duration) : null,
    visibility: (record.visibility || DEFAULT_VISIBILITY).toString().toLowerCase(),
    created_at: createdAt,
    usedIn: Array.isArray(record.usedIn) ? record.usedIn : []
  };
};

const toMediaItem = (record: any) => {
  const clientFile = toClientFile(record);
  return {
    id: clientFile.id,
    name: clientFile.name,
    url: clientFile.url,
    type: clientFile.type,
    mimeType: clientFile.mimeType,
    thumbnailUrl: clientFile.thumbnailUrl,
    width: clientFile.width,
    height: clientFile.height,
    duration: clientFile.duration,
    size: clientFile.size,
    created_at: clientFile.created_at
  };
};

export const getUploadDir = () => UPLOAD_DIR;

const parsePositiveInt = (value: unknown, fallback: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(parsed)));
};

const buildMimeTypeFilter = (value: unknown) => {
  const type = String(value || '').trim().toLowerCase();
  if (!type || type === 'all') return null;
  if (type === 'image') return { startsWith: 'image/' };
  if (type === 'video') return { startsWith: 'video/' };
  if (type === 'pdf') return { equals: 'application/pdf' };
  if (type === 'document') return { notIn: [...ALLOWED_IMAGE_MIME_TYPES, ...ALLOWED_VIDEO_MIME_TYPES] };
  return null;
};

export const listFiles = async (req: Request, res: Response) => {
  try {
    const role = (req.user?.role || '').toString().toLowerCase();
    const isAdmin = role === 'admin';
    const requestedUserId = req.query?.userId?.toString() || req.query?.user_id?.toString() || '';
    const effectiveUserId = requestedUserId || req.user?.id?.toString() || '';
    const queryRoleInput = (req.query?.role || req.query?.ownerRole) as string | undefined;
    const resolvedQueryRole = queryRoleInput ? resolveOwnerRole(queryRoleInput) : undefined;

    if (!isAdmin && !effectiveUserId) {
      res.json({ success: true, data: [] });
      return;
    }

    const whereClause: {
      ownerId?: string | null;
      ownerRole?: FileOwnerRole;
      mimeType?: any;
      OR?: any[];
    } = {};

    if (isAdmin) {
      if (requestedUserId) whereClause.ownerId = requestedUserId;
      if (resolvedQueryRole) whereClause.ownerRole = resolvedQueryRole;
    } else {
      whereClause.ownerId = effectiveUserId;
      whereClause.ownerRole = resolveOwnerRole(role);
    }

    const mimeTypeFilter = buildMimeTypeFilter(req.query?.type);
    if (mimeTypeFilter) whereClause.mimeType = mimeTypeFilter;

    const search = String(req.query?.search || '').trim();
    if (search) {
      whereClause.OR = [
        { originalName: { contains: search, mode: 'insensitive' } },
        { filename: { contains: search, mode: 'insensitive' } }
      ];
    }

    const limit = parsePositiveInt(req.query?.limit, 50, 200);
    const page = parsePositiveInt(req.query?.page, 1, 10000);
    const skip = (page - 1) * limit;

    let dbFiles: any[] = [];
    try {
      dbFiles = await prisma.file.findMany({
        where: Object.keys(whereClause).length ? whereClause : undefined,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      });
    } catch (error) {
      console.error('File table lookup failed:', error);
      dbFiles = [];
    }

    const fileIds = dbFiles.map((file) => file.id);
    const usageMap = new Map<string, Array<{ type: string; id: string; label?: string }>>();
    if (fileIds.length) {
      try {
        const usages = await prisma.fileUsage.findMany({
          where: { fileId: { in: fileIds } },
          orderBy: { createdAt: 'desc' }
        });
        for (const usage of usages) {
          const list = usageMap.get(usage.fileId) || [];
          list.push({ type: usage.usageType, id: usage.usageId, label: usage.label || undefined });
          usageMap.set(usage.fileId, list);
        }
      } catch (error) {
        console.warn('File usage lookup failed:', error);
      }
    }

    const baseUrl = getBaseFileUrl(req);
    const normalized = dbFiles.map((file) =>
      normalizeRecord({
        id: file.id,
        user_id: file.ownerId,
        owner_role: file.ownerRole?.toLowerCase(),
        name: file.originalName,
        type: file.mimeType,
        size: Number(file.size),
        url: file.storageKey ? buildUploadsUrl(file.storageKey, baseUrl) : file.url,
        storage_key: file.storageKey,
        storage_provider: file.storageProvider || DEFAULT_STORAGE_PROVIDER,
        thumbnail_url: file.thumbnailUrl || (String(file.mimeType || '').startsWith('video/') ? buildUploadsUrl(DEFAULT_VIDEO_THUMBNAIL_FILENAME, baseUrl) : null),
        width: file.width,
        height: file.height,
        duration: file.duration,
        visibility: file.visibility,
        created_at: file.createdAt,
        category: inferCategory(file.mimeType),
        usedIn: usageMap.get(file.id) || []
      })
    );

    const seenUrls = new Set(normalized.map((file) => normalizeUploadsUrl(file.url || '')));

    if (isAdmin) {
      const diskEntries = listUploadFiles(UPLOAD_DIR);
      for (const entry of diskEntries) {
        const record = buildDiskRecord(entry, baseUrl);
        const normalizedUrl = normalizeUploadsUrl(record.url);
        if (normalizedUrl && !seenUrls.has(normalizedUrl)) {
          normalized.push(record);
          seenUrls.add(normalizedUrl);
        }
      }
    }

    res.json({ success: true, data: normalized.map(toClientFile) });
  } catch (error) {
    console.error('Failed to list files:', error);
    res.status(500).json({ success: false, error: 'Failed to list files' });
  }
};

const persistUploadedFile = async (params: {
  req: Request;
  file: Express.Multer.File;
  userId: string | null;
  ownerRole: FileOwnerRole;
}) => {
  const { req, file, userId, ownerRole } = params;
  const now = new Date();
  const fileId = uuidv4();
  const baseUrl = getBaseFileUrl(req);
  const relativePath = getRelativeUploadPath(file.path || path.join(UPLOAD_DIR, file.filename));
  const url = buildUploadsUrl(relativePath, baseUrl);
  const visibility = resolveVisibility(req.body?.visibility);
  const category = inferCategory(file.mimetype, req.body?.category || req.body?.file_category);
  const mediaMetadata = await buildMediaMetadata(file, relativePath, baseUrl);

  const created = await prisma.file.create({
    data: {
      id: fileId,
      ownerId: userId || null,
      ownerRole,
      filename: file.filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: BigInt(file.size),
      url,
      storageKey: relativePath,
      storageProvider: DEFAULT_STORAGE_PROVIDER,
      thumbnailUrl: mediaMetadata.thumbnailUrl,
      width: mediaMetadata.width,
      height: mediaMetadata.height,
      duration: mediaMetadata.duration,
      visibility,
      createdAt: now
    }
  });

  return normalizeRecord({
    id: created.id,
    user_id: created.ownerId,
    owner_role: created.ownerRole?.toLowerCase(),
    name: created.originalName,
    type: created.mimeType,
    size: Number(created.size),
    url: created.url,
    storage_key: created.storageKey,
    storage_provider: created.storageProvider || DEFAULT_STORAGE_PROVIDER,
    thumbnail_url:
      created.thumbnailUrl ||
      (String(created.mimeType || '').startsWith('video/') ? buildUploadsUrl(DEFAULT_VIDEO_THUMBNAIL_FILENAME, baseUrl) : null),
    width: created.width,
    height: created.height,
    duration: created.duration,
    visibility: created.visibility,
    category,
    created_at: created.createdAt
  });
};

export const uploadFile = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded' });
      return;
    }

    try {
      validateUploadFile(req.file);
    } catch (validationError: any) {
      safeUnlink(req.file?.path);
      res.status(400).json({ success: false, error: validationError?.message || 'Invalid file upload' });
      return;
    }

    let userId = getUserId(req);
    if (userId) {
      const existingUser = await prisma.user.findUnique({ where: { id: userId } });
      if (!existingUser) {
        if (userId.startsWith('dev-') && process.env.NODE_ENV !== 'production') {
          try {
            await prisma.user.create({
              data: {
                id: userId,
                email: `${userId}@dev.local`,
                isActive: true,
                isVerified: true
              } as any
            });
          } catch (error) {
            console.warn('Failed to create dev user for upload:', error);
            userId = '';
          }
        } else {
          userId = '';
        }
      }
    }
    const ownerRole = resolveOwnerRole(getRole(req));
    const responseRecord = await persistUploadedFile({
      req,
      file: req.file,
      userId: userId || null,
      ownerRole
    });

    // If caller requested this upload to be used as the site's favicon,
    // create a canonical copy in the uploads folder named starting with 'favicon'.
    try {
      const applyAsFavicon = (req.body?.applyAsFavicon || req.body?.asFavicon || req.body?.favicon) as any;
      if (applyAsFavicon && typeof applyAsFavicon !== 'undefined') {
        const uploadedPath = req.file.path || path.join(UPLOAD_DIR, req.file.filename);
        const ext = path.extname(req.file.originalname) || path.extname(req.file.filename) || '.png';
        const faviconName = `favicon${ext}`;
        const faviconPath = path.join(UPLOAD_DIR, faviconName);
        try {
          fs.copyFileSync(uploadedPath, faviconPath);
          // Ensure the file is readable
          fs.chmodSync(faviconPath, 0o644);
          console.log('✅ Created favicon copy at uploads/', faviconName);
        } catch (e) {
          console.warn('Failed to create favicon copy:', e);
        }
      }
    } catch (e) {
      console.warn('Error while handling favicon copy flag:', e);
    }

    res.json({ success: true, data: toClientFile(responseRecord) });
  } catch (error) {
    safeUnlink(req.file?.path);
    console.error('Failed to upload file:', error);
    res.status(500).json({ success: false, error: 'Failed to upload file' });
  }
};

export const deleteFile = async (req: Request, res: Response) => {
  try {
    const id = req.params.id;
    const role = (req.user?.role || '').toString().toLowerCase();
    const isAdmin = role === 'admin';
    const requesterId = req.user?.id?.toString() || '';

    const existing = await prisma.file.findUnique({ where: { id } });
    if (!existing) {
      if (id.startsWith(DISK_ID_PREFIX)) {
        const relativePath = id.slice(DISK_ID_PREFIX.length);
        const safePath = relativePath.replace(/^(\.\.[/\\])+/, '');
        const filePath = path.join(UPLOAD_DIR, safePath);
        try {
          if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          res.json({ success: true, data: { id } });
        } catch (error) {
          console.error('Failed to delete disk file:', error);
          res.status(500).json({ success: false, error: 'Failed to delete file from disk' });
        }
        return;
      }
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }

    if (!isAdmin && existing.ownerId && existing.ownerId !== requesterId) {
      res.status(403).json({ success: false, error: 'Not allowed to delete this file' });
      return;
    }

    await prisma.file.delete({ where: { id } });

    if (existing.url) {
      const filePath = resolveUploadPath(existing.url);
      safeUnlink(filePath);
    }

    if (existing.thumbnailUrl) {
      const thumbnailPath = resolveUploadPath(existing.thumbnailUrl);
      if (thumbnailPath && thumbnailPath.includes(path.join('uploads', 'thumbnails'))) {
        safeUnlink(thumbnailPath);
      }
    }

    res.json({ success: true, data: { id } });
  } catch (error) {
    console.error('Failed to delete file:', error);
    res.status(500).json({ success: false, error: 'Failed to delete file' });
  }
};

export const uploadMedia = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded' });
      return;
    }

    try {
      validateUploadFile(req.file);
    } catch (validationError: any) {
      safeUnlink(req.file?.path);
      res.status(400).json({ success: false, error: validationError?.message || 'Invalid file upload' });
      return;
    }

    const userId = getUserId(req) || null;
    const ownerRole = resolveOwnerRole(getRole(req));
    const responseRecord = await persistUploadedFile({
      req,
      file: req.file,
      userId,
      ownerRole
    });

    res.json(toMediaItem(responseRecord));
  } catch (error) {
    safeUnlink(req.file?.path);
    console.error('Failed to upload media:', error);
    res.status(500).json({ success: false, error: 'Failed to upload file' });
  }
};
