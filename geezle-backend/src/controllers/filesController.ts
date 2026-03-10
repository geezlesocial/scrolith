import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import jwt from 'jsonwebtoken';
import { Jimp } from 'jimp';
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
import {
  downloadBlobByName,
  deleteBlobByName,
  extractBlobNameFromUrl,
  isAzureBlobConfigured,
  uploadBufferToBlob
} from '../services/storage/blobStorage';

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
const TEMP_UPLOAD_DIR = path.join(UPLOAD_DIR, '.tmp');

const ensureUploadDir = () => {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
};
const ensureTempUploadDir = () => {
  if (!fs.existsSync(TEMP_UPLOAD_DIR)) {
    fs.mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });
  }
};

ensureUploadDir();
ensureTempUploadDir();

const safeFilename = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, '_');
const DISK_ID_PREFIX = 'disk:';
const DEFAULT_VISIBILITY: FileVisibility = 'PUBLIC';
const DEFAULT_STORAGE_PROVIDER = 'local';
const AZURE_BLOB_STORAGE_PROVIDER = 'azure_blob';
const DEFAULT_VIDEO_THUMBNAIL_FILENAME = '__video_fallback_thumbnail.svg';
const UPLOAD_THUMBNAILS_DIR = path.join(UPLOAD_DIR, 'thumbnails');

const resolveUploadDriver = () =>
  String(process.env.UPLOAD_DRIVER || process.env.STORAGE_DRIVER || DEFAULT_STORAGE_PROVIDER)
    .trim()
    .toLowerCase();

const shouldUseAzureBlobStorage = () => {
  const driver = resolveUploadDriver();
  return ['azure_blob', 'azure', 'blob'].includes(driver) && isAzureBlobConfigured();
};

const resolveStorageProvider = () =>
  shouldUseAzureBlobStorage() ? AZURE_BLOB_STORAGE_PROVIDER : DEFAULT_STORAGE_PROVIDER;

const ALLOWED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif'
]);

const RESIZABLE_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/bmp',
  'image/tiff'
]);

const IMAGE_VARIANT_CACHE_LIMIT = 200;
const IMAGE_VARIANT_MAX_DIMENSION = 2048;
const IMAGE_VARIANT_MIN_QUALITY = 40;
const IMAGE_VARIANT_MAX_QUALITY = 90;
const imageVariantCache = new Map<string, { buffer: Buffer; contentType: string }>();

const ALLOWED_VIDEO_MIME_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-ms-wmv',
  'video/x-matroska',
  'video/x-m4v',
  'video/x-flv',
  'video/3gpp',
  'video/3gpp2',
  'video/mpeg'
]);

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/x-m4a',
  'audio/m4a',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/aac',
  'audio/flac'
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

const ALLOWED_IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.bmp',
  '.svg',
  '.tif',
  '.tiff'
]);

const ALLOWED_VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.webm',
  '.mov',
  '.avi',
  '.wmv',
  '.mkv',
  '.m4v',
  '.3gp',
  '.3g2',
  '.mpeg',
  '.mpg',
  '.flv'
]);

const ALLOWED_AUDIO_EXTENSIONS = new Set([
  '.webm',
  '.ogg',
  '.opus',
  '.m4a',
  '.mp3',
  '.wav',
  '.aac',
  '.flac'
]);

const ALLOWED_DOCUMENT_EXTENSIONS = new Set([
  '.pdf',
  '.txt',
  '.csv',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx'
]);

// APK binaries are intentionally restricted to admin/staff uploads.
const ALLOWED_ADMIN_BINARY_MIME_TYPES = new Set([
  'application/vnd.android.package-archive',
  'application/octet-stream'
]);

const ALLOWED_ADMIN_BINARY_EXTENSIONS = new Set(['.apk']);
const MAX_ADMIN_BINARY_BYTES = 200 * 1024 * 1024;

const MAX_UPLOAD_BYTES: Record<'image' | 'video' | 'audio' | 'document', number> = {
  image: 15 * 1024 * 1024,
  video: 200 * 1024 * 1024,
  audio: 50 * 1024 * 1024,
  document: 20 * 1024 * 1024
};

type UploadKind = 'image' | 'video' | 'audio' | 'document';

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

const buildFileContentUrl = (fileId: string, baseUrl?: string) => {
  const base = baseUrl || getBaseFileUrl();
  return `${base}/api/files/content/${encodeURIComponent(fileId)}`;
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

const writeBufferToTempFile = (buffer: Buffer, originalName?: string) => {
  ensureTempUploadDir();
  const ext = path.extname(String(originalName || '')).toLowerCase() || '.bin';
  const tempName = `upload-${Date.now()}-${uuidv4().slice(0, 8)}${ext}`;
  const tempPath = path.join(TEMP_UPLOAD_DIR, tempName);
  fs.writeFileSync(tempPath, buffer);
  return tempPath;
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

const isAdminUploadRequest = (req?: Request) => {
  const roleCandidates = [
    req?.user?.role,
    req?.body?.role,
    req?.body?.owner_role,
    req?.query?.role
  ];
  return roleCandidates.some((value) =>
    ['admin', 'superadmin', 'moderator'].includes(String(value || '').toLowerCase())
  );
};

const resolveUploadKind = (
  mimeType: string,
  originalName?: string,
  allowAdminBinary = false
): UploadKind | null => {
  const normalizedMime = String(mimeType || '').toLowerCase();
  const ext = path.extname(String(originalName || '')).toLowerCase();

  // Accept the full image/video MIME families so new browser/device formats
  // can be uploaded without backend patching.
  if (normalizedMime.startsWith('image/')) return 'image';
  if (normalizedMime.startsWith('video/')) return 'video';
  if (normalizedMime.startsWith('audio/')) return 'audio';
  if (ALLOWED_IMAGE_MIME_TYPES.has(normalizedMime)) return 'image';
  if (ALLOWED_VIDEO_MIME_TYPES.has(normalizedMime)) return 'video';
  if (ALLOWED_AUDIO_MIME_TYPES.has(normalizedMime)) return 'audio';
  if (ALLOWED_DOCUMENT_MIME_TYPES.has(normalizedMime)) return 'document';

  // Some clients upload supported files as generic octet-stream.
  if (!normalizedMime || normalizedMime === 'application/octet-stream') {
    if (ALLOWED_IMAGE_EXTENSIONS.has(ext)) return 'image';
    if (ALLOWED_VIDEO_EXTENSIONS.has(ext)) return 'video';
    if (ALLOWED_AUDIO_EXTENSIONS.has(ext)) return 'audio';
    if (ALLOWED_DOCUMENT_EXTENSIONS.has(ext)) return 'document';
  }

  if (allowAdminBinary) {
    const isAdminBinaryMime =
      ALLOWED_ADMIN_BINARY_MIME_TYPES.has(normalizedMime) ||
      normalizedMime === '';
    const isAdminBinaryExtension = ALLOWED_ADMIN_BINARY_EXTENSIONS.has(ext);
    if (isAdminBinaryMime && isAdminBinaryExtension) return 'document';
  }
  return null;
};

const validateUploadFile = (file: Express.Multer.File, req?: Request) => {
  const mimeType = String(file?.mimetype || '').toLowerCase();
  const originalName = String(file?.originalname || file?.filename || '');
  const allowAdminBinary = isAdminUploadRequest(req);
  const ext = path.extname(originalName).toLowerCase();
  const isAdminBinaryUpload =
    allowAdminBinary &&
    ALLOWED_ADMIN_BINARY_EXTENSIONS.has(ext) &&
    (ALLOWED_ADMIN_BINARY_MIME_TYPES.has(mimeType) || !mimeType);
  const kind = resolveUploadKind(mimeType, originalName, allowAdminBinary);
  if (!kind) {
    throw new Error(`Unsupported file type: ${mimeType || 'unknown'}`);
  }
  const maxSize = isAdminBinaryUpload ? MAX_ADMIN_BINARY_BYTES : MAX_UPLOAD_BYTES[kind];
  if (typeof maxSize === 'number' && Number(file?.size || 0) > maxSize) {
    const label = isAdminBinaryUpload ? 'APK' : kind;
    throw new Error(`File exceeds ${label} upload limit (${Math.floor(maxSize / (1024 * 1024))}MB)`);
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

const parseCookies = (cookieHeader?: string): Record<string, string> => {
  const jar: Record<string, string> = {};
  if (!cookieHeader) return jar;
  cookieHeader.split(';').forEach((part) => {
    const [rawKey, ...rest] = part.trim().split('=');
    if (!rawKey) return;
    const key = rawKey.trim();
    const value = rest.join('=').trim();
    if (!key) return;
    try {
      jar[key] = decodeURIComponent(value);
    } catch {
      jar[key] = value;
    }
  });
  return jar;
};

const resolveOptionalRequester = (req: Request) => {
  const middlewareUser = req.user?.id ? req.user : null;
  if (middlewareUser?.id) return middlewareUser;

  let authHeader = req.headers.authorization as string | undefined;
  if (!authHeader) {
    const cookies = parseCookies(req.headers.cookie as string | undefined);
    const cookieToken = cookies['Scrolith_token'] || cookies['token'];
    if (cookieToken) authHeader = `Bearer ${cookieToken}`;
  }
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;

  const token = authHeader.split(' ')[1];
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev_jwt_secret') as any;
    const id = String(decoded?.id || '').trim();
    if (!id) return null;
    return {
      id,
      email: decoded?.email,
      role: decoded?.role
    };
  } catch {
    return null;
  }
};

const canRequesterAccessPrivateMessengerFile = async (fileId: string, requesterId: string) => {
  const normalizedFileId = String(fileId || '').trim();
  const normalizedRequesterId = String(requesterId || '').trim();
  if (!normalizedFileId || !normalizedRequesterId) return false;

  const usages = await prisma.fileUsage.findMany({
    where: {
      fileId: normalizedFileId,
      usageType: { in: ['direct_message', 'voice_note'] }
    },
    select: {
      usageType: true,
      usageId: true
    },
    take: 16
  });

  if (!usages.length) return false;

  const directMessageIds = usages
    .filter((entry) => entry.usageType === 'direct_message')
    .map((entry) => String(entry.usageId || '').trim())
    .filter(Boolean);

  if (directMessageIds.length) {
    const messageMatch = await prisma.directMessage.findFirst({
      where: {
        id: { in: directMessageIds },
        conversation: {
          participants: {
            some: {
              userId: normalizedRequesterId,
              deletedAt: null
            }
          }
        }
      },
      select: { id: true }
    });

    if (messageMatch?.id) return true;
  }

  const voiceNoteIds = usages
    .filter((entry) => entry.usageType === 'voice_note')
    .map((entry) => String(entry.usageId || '').trim())
    .filter(Boolean);

  if (!voiceNoteIds.length) return false;

  const voiceNoteMatch = await prisma.voiceNote.findFirst({
    where: {
      id: { in: voiceNoteIds },
      conversation: {
        participants: {
          some: {
            userId: normalizedRequesterId,
            deletedAt: null
          }
        }
      }
    },
    select: { id: true }
  });

  return Boolean(voiceNoteMatch?.id);
};

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
    '.wmv': 'video/x-ms-wmv',
    '.mkv': 'video/x-matroska',
    '.flv': 'video/x-flv',
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
    '.apk': 'application/vnd.android.package-archive',
    '.zip': 'application/zip',
    '.rar': 'application/vnd.rar',
    '.7z': 'application/x-7z-compressed'
  };
  return map[ext] || 'application/octet-stream';
};

type ImageVariantRequest = {
  width: number | null;
  height: number | null;
  fit: 'inside' | 'cover' | 'contain';
  quality: number;
};

const parseBoundedPositiveInt = (value: unknown, max: number) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.max(1, Math.min(max, parsed));
};

const parseImageVariantRequest = (req: Request): ImageVariantRequest | null => {
  const width = parseBoundedPositiveInt(req.query?.w ?? req.query?.width, IMAGE_VARIANT_MAX_DIMENSION);
  const height = parseBoundedPositiveInt(req.query?.h ?? req.query?.height, IMAGE_VARIANT_MAX_DIMENSION);
  if (!width && !height) return null;

  const fitRaw = String(req.query?.fit || '').trim().toLowerCase();
  const fit: ImageVariantRequest['fit'] =
    fitRaw === 'cover' || fitRaw === 'contain' ? fitRaw : 'inside';
  const quality =
    parseBoundedPositiveInt(req.query?.q ?? req.query?.quality, IMAGE_VARIANT_MAX_QUALITY) ??
    76;

  return {
    width,
    height,
    fit,
    quality: Math.max(IMAGE_VARIANT_MIN_QUALITY, Math.min(IMAGE_VARIANT_MAX_QUALITY, quality))
  };
};

const isResizableImageMimeType = (mimeType?: string | null) =>
  RESIZABLE_IMAGE_MIME_TYPES.has(String(mimeType || '').toLowerCase());

const buildImageVariantCacheKey = (
  file: { id: string; storageKey?: string | null; filename?: string | null; url?: string | null; mimeType?: string | null },
  variant: ImageVariantRequest
) =>
  [
    file.id,
    file.storageKey || file.filename || file.url || '',
    String(file.mimeType || '').toLowerCase(),
    variant.width || '',
    variant.height || '',
    variant.fit,
    variant.quality
  ].join(':');

const rememberImageVariant = (key: string, value: { buffer: Buffer; contentType: string }) => {
  if (imageVariantCache.has(key)) {
    imageVariantCache.delete(key);
  }
  imageVariantCache.set(key, value);
  while (imageVariantCache.size > IMAGE_VARIANT_CACHE_LIMIT) {
    const oldestKey = imageVariantCache.keys().next().value;
    if (!oldestKey) break;
    imageVariantCache.delete(oldestKey);
  }
};

const streamToBuffer = async (stream: NodeJS.ReadableStream) =>
  new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });

const resolveLocalStoredFilePath = (file: {
  storageKey?: string | null;
  url?: string | null;
  filename?: string | null;
}) => {
  const storageKeyPath = file.storageKey ? stripUploadsPrefix(file.storageKey) : '';
  const candidatePath = storageKeyPath
    ? path.resolve(UPLOAD_DIR, storageKeyPath)
    : file.url
      ? path.resolve(UPLOAD_DIR, stripUploadsPrefix(file.url))
      : path.resolve(UPLOAD_DIR, file.filename || '');

  if (!candidatePath.startsWith(path.resolve(UPLOAD_DIR))) {
    return null;
  }

  return candidatePath;
};

const loadStoredFileBuffer = async (file: {
  storageProvider?: string | null;
  storageKey?: string | null;
  url?: string | null;
  filename?: string | null;
}) => {
  const storedProvider = String(file.storageProvider || DEFAULT_STORAGE_PROVIDER).toLowerCase();
  if (storedProvider === AZURE_BLOB_STORAGE_PROVIDER) {
    if (!file.storageKey) return null;
    const blobResponse = await downloadBlobByName(file.storageKey);
    const stream = blobResponse.readableStreamBody;
    if (!stream) return null;
    return streamToBuffer(stream);
  }

  const localPath = resolveLocalStoredFilePath(file);
  if (!localPath || !fs.existsSync(localPath)) return null;
  return fs.readFileSync(localPath);
};

const resolveTransformedImageMimeType = (image: any, originalMimeType?: string | null) => {
  const normalized = String(originalMimeType || '').toLowerCase();
  if (normalized === 'image/png' || normalized === 'image/gif' || image.hasAlpha()) {
    return 'image/png';
  }
  if (normalized === 'image/tiff' || normalized === 'image/bmp') {
    return 'image/png';
  }
  return 'image/jpeg';
};

const transformImageBuffer = async (
  sourceBuffer: Buffer,
  originalMimeType: string,
  variant: ImageVariantRequest
) => {
  const image: any = await Jimp.read(sourceBuffer);
  const width = variant.width;
  const height = variant.height;

  if (width && height) {
    if (variant.fit === 'cover') {
      image.cover({ w: width, h: height });
    } else if (variant.fit === 'contain') {
      image.contain({ w: width, h: height });
    } else {
      image.scaleToFit({ w: width, h: height });
    }
  } else if (width) {
    image.resize({ w: width });
  } else if (height) {
    image.resize({ h: height });
  }

  const contentType = resolveTransformedImageMimeType(image, originalMimeType);
  const buffer =
    contentType === 'image/jpeg'
      ? await image.getBuffer(contentType, { quality: variant.quality })
      : await image.getBuffer(contentType);

  return { buffer, contentType };
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

const buildStorageKeyForUpload = (originalName: string, prefix = '') => {
  const cleanPrefix = prefix.trim().replace(/^\/+|\/+$/g, '');
  const safeOriginalName = safeFilename(path.basename(originalName || 'upload.bin'));
  const uniqueName = `${Date.now()}-${uuidv4().slice(0, 8)}-${safeOriginalName}`;
  return cleanPrefix ? `${cleanPrefix}/${uniqueName}` : uniqueName;
};

const buildMediaMetadataForAzure = async (
  file: Express.Multer.File,
  storageKey: string,
  baseUrl: string
): Promise<MediaMetadata> => {
  const mimeType = String(file.mimetype || '').toLowerCase();
  const metadata: MediaMetadata = {
    width: null,
    height: null,
    duration: null,
    thumbnailRelativePath: null,
    thumbnailUrl: null
  };

  if (!file.buffer || !Buffer.isBuffer(file.buffer)) {
    return metadata;
  }

  if (mimeType.startsWith('image/')) {
    const parsed = parseImageDimensionsFromBuffer(file.buffer, mimeType);
    metadata.width = parsed.width ?? null;
    metadata.height = parsed.height ?? null;
    return metadata;
  }

  if (!mimeType.startsWith('video/')) {
    return metadata;
  }

  const tempInput = writeBufferToTempFile(file.buffer, file.originalname);
  try {
    const extracted = await extractMediaMetadata(tempInput, mimeType);
    metadata.width = extracted.width;
    metadata.height = extracted.height;
    metadata.duration = extracted.duration;

    const generated = await createVideoThumbnail(tempInput, storageKey, baseUrl);
    if (generated.thumbnailRelativePath) {
      const localThumbnailPath = path.join(UPLOAD_DIR, generated.thumbnailRelativePath);
      if (fs.existsSync(localThumbnailPath)) {
        const thumbnailBuffer = fs.readFileSync(localThumbnailPath);
        const thumbnailMimeType = getMimeTypeFromFilename(localThumbnailPath);
        const thumbnailStorageKey = `thumbnails/${path.basename(generated.thumbnailRelativePath)}`;
        metadata.thumbnailRelativePath = thumbnailStorageKey;
        metadata.thumbnailUrl = await uploadBufferToBlob({
          buffer: thumbnailBuffer,
          contentType: thumbnailMimeType,
          fileName: thumbnailStorageKey
        });
        safeUnlink(localThumbnailPath);
      } else {
        metadata.thumbnailUrl = generated.thumbnailUrl;
      }
    } else {
      metadata.thumbnailUrl = generated.thumbnailUrl;
    }
  } finally {
    safeUnlink(tempInput);
  }

  if (!metadata.thumbnailUrl) {
    metadata.thumbnailUrl = buildUploadsUrl(DEFAULT_VIDEO_THUMBNAIL_FILENAME, baseUrl);
  }

  return metadata;
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

const parseBooleanQuery = (value: unknown, fallback: boolean) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
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

const applyFileResponseHeaders = (
  res: Response,
  options: {
    cacheControl: string;
    contentType?: string;
    contentLength?: number | null;
  }
) => {
  // Required for assets loaded cross-origin (scrolith.com -> api.scrolith.com).
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cache-Control', options.cacheControl);
  if (options.contentType) res.setHeader('Content-Type', options.contentType);
  if (options.contentLength !== undefined && options.contentLength !== null) {
    res.setHeader('Content-Length', String(options.contentLength));
  }
};

const sendDefaultLogoFallback = (res: Response) => {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256" role="img" aria-label="Scrolith logo fallback">',
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#2563eb"/><stop offset="100%" stop-color="#1d4ed8"/></linearGradient></defs>',
    '<rect width="256" height="256" rx="48" fill="#0f172a"/>',
    '<rect x="28" y="28" width="200" height="200" rx="40" fill="url(#g)" opacity="0.22"/>',
    '<path d="M86 72h38c29 0 46 15 46 38 0 13-6 23-17 31l23 43h-31l-19-35h-14v35H86V72zm26 56h12c14 0 21-6 21-17 0-10-7-16-20-16h-13v33z" fill="#e2e8f0"/>',
    '</svg>'
  ].join('');
  applyFileResponseHeaders(res, {
    contentType: 'image/svg+xml; charset=utf-8',
    cacheControl: 'public, max-age=300'
  });
  res.status(200).send(svg);
};

export const listFiles = async (req: Request, res: Response) => {
  try {
    const role = (req.user?.role || '').toString().toLowerCase();
    const isAdmin = role === 'admin';
    const includeUsage = parseBooleanQuery(req.query?.includeUsage, true);
    const includeDiskFallback = parseBooleanQuery(req.query?.includeDisk, true);
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
    if (includeUsage && fileIds.length) {
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
      normalizeRecord((() => {
        const storageProvider = (file.storageProvider || DEFAULT_STORAGE_PROVIDER).toString().toLowerCase();
        const isAzure = storageProvider === AZURE_BLOB_STORAGE_PROVIDER;
        const resolvedUrl =
          isAzure
            ? buildFileContentUrl(file.id, baseUrl)
            : file.storageKey
              ? buildUploadsUrl(file.storageKey, baseUrl)
              : file.url;
        const resolvedThumb =
          file.thumbnailUrl ||
          (String(file.mimeType || '').startsWith('video/')
            ? buildUploadsUrl(DEFAULT_VIDEO_THUMBNAIL_FILENAME, baseUrl)
            : null);
        return {
        id: file.id,
        user_id: file.ownerId,
        owner_role: file.ownerRole?.toLowerCase(),
        name: file.originalName,
        type: file.mimeType,
        size: Number(file.size),
        url: resolvedUrl,
        storage_key: file.storageKey,
        storage_provider: storageProvider || DEFAULT_STORAGE_PROVIDER,
        thumbnail_url: resolvedThumb,
        width: file.width,
        height: file.height,
        duration: file.duration,
        visibility: file.visibility,
        created_at: file.createdAt,
        category: inferCategory(file.mimeType),
        usedIn: usageMap.get(file.id) || []
      };
      })())
    );

    const seenUrls = new Set(normalized.map((file) => normalizeUploadsUrl(file.url || '')));

    if (isAdmin && includeDiskFallback) {
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

export const serveFileContent = async (req: Request, res: Response) => {
  try {
    const id = String(req.params?.id || '').trim();
    if (!id) {
      res.status(400).json({ success: false, error: 'File id is required' });
      return;
    }

    const requester = resolveOptionalRequester(req);
    const requesterRole = String(requester?.role || '').toLowerCase();
    const isAdmin = requesterRole.includes('admin');

    if (id.startsWith(DISK_ID_PREFIX)) {
      const relativePath = id.slice(DISK_ID_PREFIX.length).replace(/^(\.\.[/\\])+/, '');
      const diskPath = path.resolve(UPLOAD_DIR, relativePath);
      if (!diskPath.startsWith(path.resolve(UPLOAD_DIR))) {
        res.status(400).json({ success: false, error: 'Invalid file path' });
        return;
      }
      if (!fs.existsSync(diskPath)) {
        res.status(404).json({ success: false, error: 'File not found' });
        return;
      }
      const mimeType = getMimeTypeFromFilename(diskPath);
      applyFileResponseHeaders(res, {
        contentType: mimeType,
        cacheControl: 'public, max-age=86400'
      });
      res.sendFile(diskPath);
      return;
    }

    const file = await prisma.file.findUnique({
      where: { id },
      select: {
        id: true,
        ownerId: true,
        filename: true,
        mimeType: true,
        visibility: true,
        storageKey: true,
        storageProvider: true,
        url: true
      }
    });
    if (!file) {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }

    const isPrivate = String(file.visibility || DEFAULT_VISIBILITY).toUpperCase() === FileVisibility.PRIVATE;
    const canAccessPrivate =
      Boolean(requester?.id) &&
      (isAdmin ||
        requester?.id === file.ownerId ||
        (await canRequesterAccessPrivateMessengerFile(file.id, String(requester?.id || ''))));
    if (isPrivate && !canAccessPrivate) {
      res.status(403).json({ success: false, error: 'You do not have access to this file' });
      return;
    }

    const cacheControl = isPrivate
      ? 'private, no-store, max-age=0'
      : 'public, max-age=31536000, immutable';
    const imageVariant = parseImageVariantRequest(req);

    if (imageVariant && isResizableImageMimeType(file.mimeType)) {
      try {
        const cacheKey = buildImageVariantCacheKey(file, imageVariant);
        const cachedVariant = !isPrivate ? imageVariantCache.get(cacheKey) : null;
        if (cachedVariant) {
          applyFileResponseHeaders(res, {
            contentType: cachedVariant.contentType,
            contentLength: cachedVariant.buffer.length,
            cacheControl
          });
          res.end(cachedVariant.buffer);
          return;
        }

        const sourceBuffer = await loadStoredFileBuffer(file);
        if (sourceBuffer) {
          const transformed = await transformImageBuffer(
            sourceBuffer,
            String(file.mimeType || ''),
            imageVariant
          );

          if (!isPrivate) {
            rememberImageVariant(cacheKey, transformed);
          }

          applyFileResponseHeaders(res, {
            contentType: transformed.contentType,
            contentLength: transformed.buffer.length,
            cacheControl
          });
          res.end(transformed.buffer);
          return;
        }
      } catch (error) {
        console.warn('Failed to serve optimized image variant, falling back to original asset.', {
          fileId: file.id,
          error
        });
      }
    }

    const storedProvider = String(file.storageProvider || DEFAULT_STORAGE_PROVIDER).toLowerCase();

    if (storedProvider === AZURE_BLOB_STORAGE_PROVIDER) {
      if (!file.storageKey) {
        res.status(404).json({ success: false, error: 'File storage key missing' });
        return;
      }

      try {
        const blobResponse = await downloadBlobByName(file.storageKey);
        const contentType = blobResponse.contentType || file.mimeType || 'application/octet-stream';
        applyFileResponseHeaders(res, {
          contentType,
          contentLength: blobResponse.contentLength,
          cacheControl
        });

        const stream = blobResponse.readableStreamBody;
        if (!stream) {
          res.status(404).json({ success: false, error: 'File not found in storage' });
          return;
        }

        stream.on('error', (streamError) => {
          console.error('Azure blob stream error:', streamError);
          if (!res.headersSent) {
            res.status(500).end();
          } else {
            res.end();
          }
        });
        stream.pipe(res);
        return;
      } catch (error: any) {
        const statusCode = Number(error?.statusCode || 0);
        const errorCode = String(error?.code || '');
        if (statusCode === 404 || errorCode === 'BlobNotFound') {
          res.status(404).json({ success: false, error: 'File not found in storage' });
          return;
        }
        console.error('Failed to stream Azure blob:', error);
        res.status(500).json({ success: false, error: 'Failed to read file from storage' });
        return;
      }
    }

    const storageKeyPath = file.storageKey ? stripUploadsPrefix(file.storageKey) : '';
    const localPath = storageKeyPath
      ? path.resolve(UPLOAD_DIR, storageKeyPath)
      : path.resolve(resolveUploadPath(file.url || ''));

    if (!localPath.startsWith(path.resolve(UPLOAD_DIR))) {
      res.status(400).json({ success: false, error: 'Invalid file path' });
      return;
    }

    if (!fs.existsSync(localPath)) {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }

    const contentType = file.mimeType || getMimeTypeFromFilename(file.filename || localPath);
    applyFileResponseHeaders(res, {
      contentType,
      cacheControl
    });
    res.sendFile(localPath);
  } catch (error) {
    console.error('Failed to serve file content:', error);
    res.status(500).json({ success: false, error: 'Failed to load file content' });
  }
};

export const serveLegacyUploadAsset = async (req: Request, res: Response) => {
  try {
    const wildcard = String((req.params as any)?.[0] || (req.params as any)?.path || '').trim();
    const relativePath = normalizeSlashes(wildcard).replace(/^\/+/, '');
    if (!relativePath) {
      res.status(404).end();
      return;
    }

    const uploadsRoot = path.resolve(UPLOAD_DIR);
    const directLocalPath = path.resolve(UPLOAD_DIR, relativePath);
    const directMimeType = getMimeTypeFromFilename(relativePath);
    if (directLocalPath.startsWith(uploadsRoot) && fs.existsSync(directLocalPath)) {
      applyFileResponseHeaders(res, {
        contentType: directMimeType,
        cacheControl: 'public, max-age=86400'
      });
      res.sendFile(directLocalPath);
      return;
    }

    const baseName = path.basename(relativePath);
    const isLikelyBrandAsset = /(logo|favicon)/i.test(baseName);
    const legacyMatch = await prisma.file.findFirst({
      where: {
        OR: [
          { storageKey: relativePath },
          { storageKey: baseName },
          { storageKey: { endsWith: `/${baseName}` } },
          { filename: relativePath },
          { filename: baseName },
          { url: { endsWith: `/uploads/${relativePath}` } },
          { url: { endsWith: `/uploads/${baseName}` } }
        ]
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        filename: true,
        mimeType: true,
        storageKey: true,
        storageProvider: true,
        url: true
      }
    });

    if (!legacyMatch) {
      if (isLikelyBrandAsset) {
        sendDefaultLogoFallback(res);
        return;
      }
      res.status(404).end();
      return;
    }

    const storageProvider = String(legacyMatch.storageProvider || DEFAULT_STORAGE_PROVIDER).toLowerCase();
    if (storageProvider === AZURE_BLOB_STORAGE_PROVIDER) {
      const blobCandidates = Array.from(
        new Set(
          [
            legacyMatch.storageKey,
            legacyMatch.url ? extractBlobNameFromUrl(legacyMatch.url) : null,
            relativePath,
            baseName
          ].filter(Boolean)
        )
      ) as string[];

      for (const blobName of blobCandidates) {
        try {
          const blobResponse = await downloadBlobByName(blobName);
          const contentType =
            blobResponse.contentType ||
            legacyMatch.mimeType ||
            getMimeTypeFromFilename(legacyMatch.filename || baseName);

          applyFileResponseHeaders(res, {
            contentType,
            contentLength: blobResponse.contentLength,
            cacheControl: 'public, max-age=86400'
          });

          const stream = blobResponse.readableStreamBody;
          if (!stream) continue;
          stream.on('error', (streamError) => {
            console.error('Azure blob stream error (legacy upload):', streamError);
            if (!res.headersSent) {
              res.status(500).end();
            } else {
              res.end();
            }
          });
          stream.pipe(res);
          return;
        } catch (error: any) {
          const statusCode = Number(error?.statusCode || 0);
          const errorCode = String(error?.code || '');
          if (statusCode === 404 || errorCode === 'BlobNotFound') {
            continue;
          }
          throw error;
        }
      }

      if (isLikelyBrandAsset) {
        sendDefaultLogoFallback(res);
        return;
      }
      res.status(404).end();
      return;
    }

    const localCandidates = Array.from(
      new Set(
        [
          legacyMatch.storageKey ? path.resolve(UPLOAD_DIR, stripUploadsPrefix(legacyMatch.storageKey)) : '',
          legacyMatch.url ? path.resolve(resolveUploadPath(legacyMatch.url)) : '',
          directLocalPath
        ].filter(Boolean)
      )
    ) as string[];

    for (const candidate of localCandidates) {
      if (!candidate.startsWith(uploadsRoot)) continue;
      if (!fs.existsSync(candidate)) continue;
      const contentType = legacyMatch.mimeType || getMimeTypeFromFilename(candidate);
      applyFileResponseHeaders(res, {
        contentType,
        cacheControl: 'public, max-age=86400'
      });
      res.sendFile(candidate);
      return;
    }

    if (isLikelyBrandAsset) {
      sendDefaultLogoFallback(res);
      return;
    }
    res.status(404).end();
  } catch (error) {
    console.error('Failed to serve legacy upload asset:', error);
    res.status(500).end();
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
  const storageProvider = resolveStorageProvider();
  const visibility = resolveVisibility(req.body?.visibility);
  const category = inferCategory(file.mimetype, req.body?.category || req.body?.file_category);

  let storageKey = '';
  let url = '';
  let filename = file.filename || safeFilename(file.originalname || `upload-${Date.now()}`);
  let mediaMetadata: MediaMetadata;

  if (storageProvider === AZURE_BLOB_STORAGE_PROVIDER) {
    if (!file.buffer || !Buffer.isBuffer(file.buffer)) {
      throw new Error('Azure Blob upload requires multer memoryStorage (file.buffer is missing)');
    }
    storageKey = buildStorageKeyForUpload(file.originalname || file.filename || 'upload.bin');
    filename = storageKey;
    await uploadBufferToBlob({
      buffer: file.buffer,
      contentType: file.mimetype,
      fileName: storageKey
    });
    url = buildFileContentUrl(fileId, baseUrl);
    mediaMetadata = await buildMediaMetadataForAzure(file, storageKey, baseUrl);
  } else {
    const fallbackFilename =
      file.filename || `${Date.now()}-${safeFilename(file.originalname || 'upload.bin')}`;
    const filePath = file.path || path.join(UPLOAD_DIR, fallbackFilename);
    storageKey = getRelativeUploadPath(filePath);
    filename = fallbackFilename;
    url = buildUploadsUrl(storageKey, baseUrl);
    mediaMetadata = await buildMediaMetadata(
      { ...file, filename: fallbackFilename, path: filePath },
      storageKey,
      baseUrl
    );
  }

  const created = await prisma.file.create({
    data: {
      id: fileId,
      ownerId: userId || null,
      ownerRole,
      filename,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: BigInt(file.size),
      url,
      storageKey,
      storageProvider,
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
    storage_provider: created.storageProvider || storageProvider,
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
      validateUploadFile(req.file, req);
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
        const ext =
          path.extname(req.file.originalname || '') ||
          path.extname(req.file.filename || '') ||
          '.png';
        const faviconName = `favicon${ext}`;
        try {
          if (resolveStorageProvider() === AZURE_BLOB_STORAGE_PROVIDER && req.file.buffer) {
            await uploadBufferToBlob({
              buffer: req.file.buffer,
              contentType: req.file.mimetype || getMimeTypeFromFilename(faviconName),
              fileName: faviconName
            });
            console.log('Created favicon copy in Azure Blob:', faviconName);
          } else {
            const faviconPath = path.join(UPLOAD_DIR, faviconName);
            if (req.file.path && fs.existsSync(req.file.path)) {
              fs.copyFileSync(req.file.path, faviconPath);
            } else if (req.file.buffer) {
              fs.writeFileSync(faviconPath, req.file.buffer);
            }
            fs.chmodSync(faviconPath, 0o644);
            console.log('Created favicon copy at uploads/', faviconName);
          }
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

    const storageProvider = (existing.storageProvider || DEFAULT_STORAGE_PROVIDER).toString().toLowerCase();
    if (storageProvider === AZURE_BLOB_STORAGE_PROVIDER) {
      try {
        await deleteBlobByName(existing.storageKey);
      } catch (blobError) {
        console.warn('Failed to delete Azure blob object:', blobError);
      }

      if (existing.thumbnailUrl) {
        try {
          const thumbnailBlobName = extractBlobNameFromUrl(existing.thumbnailUrl);
          if (thumbnailBlobName) await deleteBlobByName(thumbnailBlobName);
        } catch (thumbError) {
          console.warn('Failed to delete Azure thumbnail object:', thumbError);
        }
      }
    } else {
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
      validateUploadFile(req.file, req);
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

