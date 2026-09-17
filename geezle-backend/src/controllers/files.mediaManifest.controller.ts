/**
 * Phase 3A — additive file manifest / processing-status / variant content APIs.
 * Authorization mirrors original File visibility rules used by serveFileContent.
 */
import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prismaClient';
import { FileVisibility } from '@prisma/client';
import { jwtSecret } from '../utils/security/requiredSecret';
import {
  buildVariantsManifest,
  MediaProcessingService
} from '../services/media/mediaProcessing.service';
import { isEligibleVideoMime } from '../services/media/mediaVideoProbe.service';
import { findVariantById } from '../services/media/mediaVariant.service';
import {
  createGcsMediaReadStream,
  getGcsMediaMetadata,
  gcsMediaExists,
  GOOGLE_CLOUD_STORAGE_PROVIDER
} from '../services/storage/gcsMediaStorage';
import { downloadMediaByProvider } from '../services/storage/mediaStorage.service';

const resolveOptionalRequester = (req: Request) => {
  if (req.user?.id) {
    return { id: String(req.user.id), role: String(req.user.role || '').toLowerCase() };
  }
  let authHeader = req.headers.authorization as string | undefined;
  if (!authHeader && req.headers.cookie) {
    const cookies = String(req.headers.cookie)
      .split(';')
      .map((p) => p.trim())
      .filter(Boolean);
    for (const part of cookies) {
      const [k, ...rest] = part.split('=');
      if (k === 'Scrolith_token' || k === 'token') {
        authHeader = `Bearer ${decodeURIComponent(rest.join('=') || '')}`;
        break;
      }
    }
  }
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], jwtSecret()) as any;
    const id = String(decoded?.id || '').trim();
    if (!id) return null;
    return { id, role: String(decoded?.role || '').toLowerCase() };
  } catch {
    return null;
  }
};

const canAccessFile = async (file: {
  id: string;
  ownerId?: string | null;
  visibility?: string | null;
  mimeType?: string | null;
}, req: Request) => {
  const visibility = String(file.visibility || 'PUBLIC').toUpperCase();
  if (visibility === FileVisibility.PUBLIC || visibility === 'PUBLIC') return true;

  const requester = resolveOptionalRequester(req);
  const isAdmin = Boolean(requester?.role && requester.role.includes('admin'));
  if (isAdmin) return true;
  if (requester?.id && requester.id === file.ownerId) return true;

  // Public-identity media exceptions (profile photo / cover / marketplace / page)
  const isImage = String(file.mimeType || '').startsWith('image/');
  if (isImage) {
    const isProfile = await prisma.user
      .count({
        where: { OR: [{ profilePhotoFileId: file.id }, { avatar: file.id }] }
      })
      .then((c) => c > 0)
      .catch(() => false);
    if (isProfile) return true;

    const isCover = await prisma.profile
      .count({
        where: {
          OR: [
            { coverPhotoUrl: { equals: file.id } },
            { coverPhotoUrl: { contains: file.id } }
          ]
        }
      })
      .then((c) => c > 0)
      .catch(() => false);
    if (isCover) return true;

    const isBiz = await prisma.communityBusinessPage
      .count({
        where: { OR: [{ logoFileId: file.id }, { coverFileId: file.id }] }
      })
      .then((c) => c > 0)
      .catch(() => false);
    if (isBiz) return true;

    const isMarket = await prisma.marketplaceListingMedia
      .count({
        where: {
          fileId: file.id,
          listing: {
            removedAt: null,
            status: { in: ['active', 'reserved'] },
            reviewStatus: 'approved'
          }
        }
      })
      .then((c) => c > 0)
      .catch(() => false);
    if (isMarket) return true;
  }

  return false;
};

export const getFileProcessingStatus = async (req: Request, res: Response) => {
  try {
    const fileId = String(req.params?.fileId || req.params?.id || '').trim();
    if (!fileId) {
      res.status(400).json({ success: false, error: 'fileId is required' });
      return;
    }
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        ownerId: true,
        visibility: true,
        mimeType: true,
        processingStatus: true,
        processingVersion: true,
        processingErrorCode: true,
        processingStartedAt: true,
        processingCompletedAt: true,
        width: true,
        height: true,
        duration: true
      }
    });
    if (!file) {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }
    if (!(await canAccessFile(file, req))) {
      res.status(403).json({ success: false, error: 'You do not have access to this file' });
      return;
    }
    res.json({
      success: true,
      data: {
        fileId: file.id,
        processingStatus: file.processingStatus,
        processingVersion: file.processingVersion,
        processingErrorCode: file.processingErrorCode,
        processingStartedAt: file.processingStartedAt,
        processingCompletedAt: file.processingCompletedAt,
        width: file.width,
        height: file.height,
        durationSeconds: file.duration != null ? Number(file.duration) : null,
        eligibleImage: MediaProcessingService.isEligibleImageMime(file.mimeType),
        eligibleVideo: isEligibleVideoMime(file.mimeType)
      }
    });
  } catch (error: any) {
    console.error('getFileProcessingStatus failed:', error?.message || error);
    res.status(500).json({ success: false, error: 'Failed to load processing status' });
  }
};

export const getFileManifest = async (req: Request, res: Response) => {
  try {
    const fileId = String(req.params?.fileId || req.params?.id || '').trim();
    if (!fileId) {
      res.status(400).json({ success: false, error: 'fileId is required' });
      return;
    }
    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        ownerId: true,
        visibility: true,
        mimeType: true,
        processingStatus: true
      }
    });
    if (!file) {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }
    if (!(await canAccessFile(file, req))) {
      res.status(403).json({ success: false, error: 'You do not have access to this file' });
      return;
    }
    const manifest = await buildVariantsManifest(fileId);
    res.json({ success: true, data: manifest });
  } catch (error: any) {
    console.error('getFileManifest failed:', error?.message || error);
    res.status(500).json({ success: false, error: 'Failed to load file manifest' });
  }
};

export const serveFileVariantContent = async (req: Request, res: Response) => {
  try {
    const fileId = String(req.params?.fileId || '').trim();
    const variantId = String(req.params?.variantId || '').trim();
    if (!fileId || !variantId) {
      res.status(400).json({ success: false, error: 'fileId and variantId are required' });
      return;
    }

    const file = await prisma.file.findUnique({
      where: { id: fileId },
      select: {
        id: true,
        ownerId: true,
        visibility: true,
        mimeType: true
      }
    });
    if (!file) {
      res.status(404).json({ success: false, error: 'File not found' });
      return;
    }
    if (!(await canAccessFile(file, req))) {
      res.status(403).json({ success: false, error: 'You do not have access to this file' });
      return;
    }

    const variant = await findVariantById(fileId, variantId);
    if (!variant) {
      res.status(404).json({ success: false, error: 'Variant not found' });
      return;
    }

    // Never accept user-supplied storage keys — only DB-backed variant keys
    const key = String(variant.storageKey || '').trim();
    if (!key.startsWith(`media/${fileId}/`)) {
      res.status(404).json({ success: false, error: 'Variant not found' });
      return;
    }

    const isPrivate = String(file.visibility || '').toUpperCase() === 'PRIVATE';
    // Public-identity exceptions still use public cache when canAccessFile allowed without owner
    const requester = resolveOptionalRequester(req);
    const ownerMatch = requester?.id && requester.id === file.ownerId;
    const cacheControl =
      isPrivate && ownerMatch
        ? 'private, no-store, max-age=0'
        : isPrivate
          ? 'public, max-age=86400'
          : 'public, max-age=31536000, immutable';

    const provider = String(variant.storageProvider || GOOGLE_CLOUD_STORAGE_PROVIDER).toLowerCase();
    if (provider === GOOGLE_CLOUD_STORAGE_PROVIDER || provider === 'gcs') {
      const exists = await gcsMediaExists(key);
      if (!exists) {
        res.status(404).json({ success: false, error: 'Variant not found' });
        return;
      }
      let contentLength: number | undefined;
      try {
        const meta = await getGcsMediaMetadata(key);
        contentLength = Number(meta?.size || 0) || undefined;
      } catch {
        contentLength = Number(variant.sizeBytes || 0) || undefined;
      }
      res.setHeader('Content-Type', variant.mimeType || 'application/octet-stream');
      res.setHeader('Cache-Control', cacheControl);
      if (contentLength) res.setHeader('Content-Length', String(contentLength));
      const stream = createGcsMediaReadStream(key);
      stream.on('error', () => {
        if (!res.headersSent) res.status(500).end();
        else res.end();
      });
      stream.pipe(res);
      return;
    }

    // Fallback download path for non-GCS variants (should not occur in Phase 3A)
    const buf = await downloadMediaByProvider({
      storageProvider: variant.storageProvider,
      storageKey: key
    });
    if (!buf) {
      res.status(404).json({ success: false, error: 'Variant not found' });
      return;
    }
    res.setHeader('Content-Type', variant.mimeType || 'application/octet-stream');
    res.setHeader('Cache-Control', cacheControl);
    res.setHeader('Content-Length', String(buf.length));
    res.end(buf);
  } catch (error: any) {
    console.error('serveFileVariantContent failed:', error?.message || error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Failed to serve variant' });
    }
  }
};
