import type { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
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

const normalizeRecord = (record: any) => {
  const createdAt = record?.created_at || record?.createdAt || record?.uploadedAt || new Date().toISOString();
  return {
    ...record,
    created_at: createdAt,
    createdAt,
    uploadedAt: createdAt
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
  return normalizeRecord({
    id: `${DISK_ID_PREFIX}${entry.relativePath}`,
    user_id: 'system',
    owner_role: 'admin',
    name,
    type: mimeType,
    size: entry.stats.size,
    url: buildUploadsUrl(entry.relativePath, baseUrl),
    storage_key: entry.relativePath,
    category: inferCategory(mimeType),
    created_at: createdAt
  });
};

const toClientFile = (record: any) => {
  const createdAt = record?.created_at || record?.createdAt || record?.uploadedAt || new Date().toISOString();
  const mimeType = record?.type || '';
  const url = record?.url || '';
  const storageKey = record?.storage_key || record?.storageKey || '';
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
    mime_type: record.mime_type || record.mimeType || mimeType,
    mimeType: record.mime_type || record.mimeType || mimeType,
    size: Number(record.size ?? 0),
    category: record.category,
    owner_id: record.owner_id || record.ownerId,
    owner_role: record.owner_role || record.ownerRole,
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
    size: clientFile.size,
    created_at: clientFile.created_at
  };
};

export const getUploadDir = () => UPLOAD_DIR;

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

    const whereClause: { ownerId?: string | null; ownerRole?: FileOwnerRole } = {};

    if (isAdmin) {
      if (requestedUserId) whereClause.ownerId = requestedUserId;
      if (resolvedQueryRole) whereClause.ownerRole = resolvedQueryRole;
    } else {
      whereClause.ownerId = effectiveUserId;
      whereClause.ownerRole = resolveOwnerRole(role);
    }

    let dbFiles: any[] = [];
    try {
      dbFiles = await prisma.file.findMany({
        where: Object.keys(whereClause).length ? whereClause : undefined,
        orderBy: { createdAt: 'desc' }
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

export const uploadFile = async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, error: 'No file uploaded' });
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
    const category = inferCategory(req.file.mimetype, req.body?.category || req.body?.file_category);
    const now = new Date();
    const fileId = uuidv4();
    const relativePath = getRelativeUploadPath(req.file.path || path.join(UPLOAD_DIR, req.file.filename));
    const url = buildUploadsUrl(relativePath, getBaseFileUrl(req));
    const visibility = resolveVisibility(req.body?.visibility);

    const created = await prisma.file.create({
      data: {
        id: fileId,
        ownerId: userId || null,
        ownerRole,
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: BigInt(req.file.size),
        url,
        storageKey: relativePath,
        visibility,
        createdAt: now
      }
    });

    const responseRecord = normalizeRecord({
      id: created.id,
      user_id: created.ownerId,
      owner_role: created.ownerRole?.toLowerCase(),
      name: created.originalName,
      type: created.mimeType,
      size: Number(created.size),
      url: created.url,
      storage_key: created.storageKey,
      visibility: created.visibility,
      category,
      created_at: created.createdAt
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
      try {
        if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (error) {
        console.warn('Failed to remove file from disk:', error);
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

    const userId = getUserId(req);
    const ownerRole = resolveOwnerRole(getRole(req));
    const category = inferCategory(req.file.mimetype, req.body?.category || req.body?.file_category);
    const now = new Date();
    const fileId = uuidv4();
    const relativePath = getRelativeUploadPath(req.file.path || path.join(UPLOAD_DIR, req.file.filename));
    const url = buildUploadsUrl(relativePath, getBaseFileUrl(req));
    const visibility = resolveVisibility(req.body?.visibility);

    const created = await prisma.file.create({
      data: {
        id: fileId,
        ownerId: userId || null,
        ownerRole,
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: BigInt(req.file.size),
        url,
        storageKey: relativePath,
        visibility,
        createdAt: now
      }
    });

    const responseRecord = normalizeRecord({
      id: created.id,
      user_id: created.ownerId,
      owner_role: created.ownerRole?.toLowerCase(),
      name: created.originalName,
      type: created.mimeType,
      size: Number(created.size),
      url: created.url,
      storage_key: created.storageKey,
      visibility: created.visibility,
      category,
      created_at: created.createdAt
    });

    res.json(toMediaItem(responseRecord));
  } catch (error) {
    console.error('Failed to upload media:', error);
    res.status(500).json({ success: false, error: 'Failed to upload file' });
  }
};
