import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';
import { addFileUsage, removeUsage } from '../utils/fileUsage';
import {
  getOrCreateScrollConfig,
  updateScrollConfig,
  isScrollSchemaMissingError
} from '../services/scroll.service';

const SCROLL_VISIBILITIES = new Set(['public', 'network', 'followers', 'private']);
const SCROLL_FILTER_PRESETS = new Set(['none', 'vibrant', 'cinematic', 'bw', 'sepia', 'warm']);
const SCROLL_ENGAGEMENT_TYPES = new Set([
  'like',
  'comment',
  'repost',
  'dash',
  'send',
  'impression',
  'view_3s',
  'view_10s',
  'view_25',
  'view_50',
  'view_95'
]);

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

const buildFileContentUrl = (fileId: string, baseUrl: string) =>
  `${baseUrl}/api/files/content/${encodeURIComponent(fileId)}`;

const resolveStoredFileUrl = (
  file: { id?: string; url?: string | null; storageKey?: string | null; storageProvider?: string | null },
  baseUrl: string
) => {
  const provider = String(file.storageProvider || '').trim().toLowerCase();
  if (provider === 'azure_blob') {
    if (file.id) return buildFileContentUrl(file.id, baseUrl);
    return file.url || null;
  }
  if (file.storageKey) {
    return `${baseUrl}/uploads/${String(file.storageKey).replace(/^\/+/, '')}`;
  }
  return file.url || null;
};

const toInt = (value: any, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
};

const normalizeVisibility = (value: any, fallback = 'public') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (SCROLL_VISIBILITIES.has(normalized)) return normalized;
  return fallback;
};

const normalizeFilterPreset = (value: any) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return 'none';
  if (SCROLL_FILTER_PRESETS.has(normalized)) return normalized;
  return 'none';
};

const normalizeTagRows = (rawTags: any): Array<{ taggedUserId: string | null; taggedPageId: string | null }> => {
  if (!Array.isArray(rawTags)) return [];
  const unique = new Set<string>();
  const rows: Array<{ taggedUserId: string | null; taggedPageId: string | null }> = [];
  for (const entry of rawTags) {
    const taggedUserId = String(entry?.taggedUserId || entry?.userId || '').trim() || null;
    const taggedPageId = String(entry?.taggedPageId || entry?.pageId || '').trim() || null;
    if (!taggedUserId && !taggedPageId) continue;
    const key = `${taggedUserId || ''}:${taggedPageId || ''}`;
    if (unique.has(key)) continue;
    unique.add(key);
    rows.push({ taggedUserId, taggedPageId });
  }
  return rows;
};

const isAdminRequest = (req: Request) => String((req as any)?.user?.role || '').toLowerCase().includes('admin');

const emitScrollEvent = (req: Request, event: string, payload: any) => {
  const io = (req.app as any).get('communityIo') || (req.app as any).get('io');
  try {
    io?.emit(event, payload);
  } catch {}
  try {
    realtime.emitToRoom('community:global', event, payload);
  } catch {}
  if (payload?.scroll?.authorId) {
    try {
      realtime.emitToUser(payload.scroll.authorId, event, payload);
    } catch {}
  }
};

const resolveScrollMedia = async (fileId: string, req: Request) => {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      ownerId: true,
      originalName: true,
      mimeType: true,
      duration: true,
      storageKey: true,
      storageProvider: true,
      thumbnailUrl: true,
      width: true,
      height: true,
      url: true
    }
  });
  if (!file) return null;
  const baseUrl = getBaseFileUrl(req);
  return {
    id: file.id,
    ownerId: file.ownerId,
    name: file.originalName,
    mimeType: file.mimeType,
    duration: file.duration ?? null,
    url: resolveStoredFileUrl(file, baseUrl),
    thumbnailUrl: file.thumbnailUrl || null,
    width: file.width ?? null,
    height: file.height ?? null
  };
};

const buildScrollMediaMap = async (fileIds: string[], req: Request) => {
  const ids = Array.from(new Set((fileIds || []).map((value) => String(value || '').trim()).filter(Boolean)));
  if (!ids.length) return new Map<string, any>();
  const files = await prisma.file.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      ownerId: true,
      originalName: true,
      mimeType: true,
      duration: true,
      storageKey: true,
      storageProvider: true,
      thumbnailUrl: true,
      width: true,
      height: true,
      url: true
    }
  });
  const baseUrl = getBaseFileUrl(req);
  return new Map(
    files.map((file) => [
      file.id,
      {
        id: file.id,
        ownerId: file.ownerId,
        name: file.originalName,
        mimeType: file.mimeType,
        duration: file.duration ?? null,
        url: resolveStoredFileUrl(file, baseUrl),
        thumbnailUrl: file.thumbnailUrl || null,
        width: file.width ?? null,
        height: file.height ?? null
      }
    ])
  );
};

const scrollVideoListSelect: any = {
  id: true,
  authorId: true,
  fileId: true,
  title: true,
  description: true,
  location: true,
  visibility: true,
  isAIEnhanced: true,
  filterPreset: true,
  filterStrength: true,
  status: true,
  impressions: true,
  views3s: true,
  views10s: true,
  views25pct: true,
  views50pct: true,
  views95pct: true,
  likesCount: true,
  commentsCount: true,
  repostsCount: true,
  sharesCount: true,
  sendCount: true,
  createdAt: true,
  updatedAt: true
};

const fetchScrollPayload = async (req: Request, scroll: any, viewerId?: string | null) => {
  const rows = await fetchScrollPayloadList(req, [scroll], viewerId);
  return rows[0] || null;
};

const fetchScrollPayloadList = async (req: Request, rows: any[], viewerId?: string | null) => {
  const prismaAny = prisma as any;
  const scrolls = Array.isArray(rows) ? rows : [];
  if (!scrolls.length) return [];
  const authorIds = Array.from(new Set(scrolls.map((scroll) => String(scroll?.authorId || '').trim()).filter(Boolean)));
  const fileIds = Array.from(new Set(scrolls.map((scroll) => String(scroll?.fileId || '').trim()).filter(Boolean)));
  const scrollIds = Array.from(new Set(scrolls.map((scroll) => String(scroll?.id || '').trim()).filter(Boolean)));
  const [authors, mediaMap, tags, viewerLikes] = await Promise.all([
    authorIds.length
      ? prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, name: true, avatar: true, username: true, isVerified: true }
        })
      : Promise.resolve([]),
    buildScrollMediaMap(fileIds, req),
    scrollIds.length
      ? prismaAny.scrollTag.findMany({
          where: { scrollId: { in: scrollIds } },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            scrollId: true,
            taggedUserId: true,
            taggedPageId: true,
            createdAt: true
          }
        })
      : Promise.resolve([]),
    viewerId && scrollIds.length
      ? prismaAny.scrollEngagement.findMany({
          where: { scrollId: { in: scrollIds }, userId: viewerId, type: { in: ['like', 'impression'] } },
          select: { scrollId: true, type: true }
        })
      : Promise.resolve([])
  ]);
  const authorMap = new Map<string, any>((authors as any[]).map((author: any) => [String(author.id), author]));
  const tagsMap = new Map<string, any[]>();
  (tags || []).forEach((tag: any) => {
    const scrollId = String(tag?.scrollId || '').trim();
    if (!scrollId) return;
    if (!tagsMap.has(scrollId)) tagsMap.set(scrollId, []);
    tagsMap.get(scrollId)!.push(tag);
  });
  const viewerStateMap = new Map<string, Set<string>>();
  (viewerLikes || []).forEach((entry: any) => {
    const scrollId = String(entry?.scrollId || '').trim();
    const type = String(entry?.type || '').trim();
    if (!scrollId || !type) return;
    if (!viewerStateMap.has(scrollId)) viewerStateMap.set(scrollId, new Set<string>());
    viewerStateMap.get(scrollId)!.add(type);
  });

  return scrolls.map((scroll: any) => {
    const author = authorMap.get(String(scroll.authorId)) || null;
    const viewerState = viewerStateMap.get(String(scroll.id)) || new Set<string>();
    return {
      id: scroll.id,
      authorId: scroll.authorId,
      author: {
        id: author?.id || scroll.authorId,
        name: author?.name || 'Community member',
        avatar: author?.avatar || null,
        username: author?.username || null,
        isVerified: Boolean(author?.isVerified)
      },
      title: scroll.title || null,
      description: scroll.description || null,
      location: scroll.location || null,
      visibility: scroll.visibility,
      isAIEnhanced: Boolean(scroll.isAIEnhanced),
      filterPreset: scroll.filterPreset || 'none',
      filterStrength: typeof scroll.filterStrength === 'number' ? scroll.filterStrength : null,
      media: mediaMap.get(String(scroll.fileId)) || null,
      tags: tagsMap.get(String(scroll.id)) || [],
      status: scroll.status,
      metrics: {
        impressions: Number(scroll.impressions || 0),
        views3s: Number(scroll.views3s || 0),
        views10s: Number(scroll.views10s || 0),
        views25pct: Number(scroll.views25pct || 0),
        views50pct: Number(scroll.views50pct || 0),
        views95pct: Number(scroll.views95pct || 0),
        likes: Number(scroll.likesCount || 0),
        comments: Number(scroll.commentsCount || 0),
        reposts: Number(scroll.repostsCount || 0),
        shares: Number(scroll.sharesCount || 0),
        sends: Number(scroll.sendCount || 0)
      },
      viewer: {
        liked: viewerState.has('like'),
        impressed: viewerState.has('impression')
      },
      createdAt: scroll.createdAt,
      updatedAt: scroll.updatedAt
    };
  });
};

const ensureScrollOwnership = (scroll: any, userId: string, isAdmin: boolean) => {
  if (!scroll) return { ok: false, status: 404, message: 'Scroll video not found' };
  if (scroll.authorId !== userId && !isAdmin) return { ok: false, status: 403, message: 'Forbidden' };
  return { ok: true, status: 200, message: 'ok' };
};

const mapTypeToCounterField = (type: string): string | null => {
  if (type === 'comment') return 'commentsCount';
  if (type === 'repost') return 'repostsCount';
  if (type === 'send') return 'sendCount';
  if (type === 'dash') return 'sharesCount';
  if (type === 'view_3s') return 'views3s';
  if (type === 'view_10s') return 'views10s';
  if (type === 'view_25') return 'views25pct';
  if (type === 'view_50') return 'views50pct';
  if (type === 'view_95') return 'views95pct';
  return null;
};

export const createScroll = async (req: Request, res: Response) => {
  try {
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const config = await getOrCreateScrollConfig();
    if (config.enabled === false) {
      return res.status(403).json({ success: false, error: 'Scroll is disabled by admin.' });
    }

    const fileId = String(req.body?.fileId || '').trim();
    if (!fileId) return res.status(400).json({ success: false, error: 'fileId is required.' });

    const media = await resolveScrollMedia(fileId, req);
    if (!media) return res.status(400).json({ success: false, error: 'Selected file was not found.' });
    if (!String(media.mimeType || '').startsWith('video/')) {
      return res.status(400).json({ success: false, error: 'Scroll only supports video uploads.' });
    }
    const admin = isAdminRequest(req);
    if (!admin && String(media.ownerId || '') !== userId) {
      return res.status(403).json({ success: false, error: 'You can only use your own uploaded files.' });
    }
    if (typeof media.duration === 'number' && media.duration > Number(config.maxDurationSeconds || 90)) {
      return res.status(400).json({
        success: false,
        error: `Video is too long. Max duration is ${Number(config.maxDurationSeconds || 90)} seconds.`
      });
    }

    const isAIEnhanced = Boolean(req.body?.isAIEnhanced);
    if (config.aiLabelRequired && !isAIEnhanced) {
      return res.status(400).json({ success: false, error: 'AI label is required by admin settings.' });
    }

    const visibility = normalizeVisibility(req.body?.visibility, config.defaultVisibility || 'public');
    const filterPreset = normalizeFilterPreset(req.body?.filterPreset);
    const filterStrength =
      req.body?.filterStrength === undefined || req.body?.filterStrength === null
        ? null
        : Number(req.body?.filterStrength);
    const tags = normalizeTagRows(req.body?.tags);

    const prismaAny = prisma as any;
    const created = await prismaAny.scrollVideo.create({
      data: {
        authorId: userId,
        fileId,
        title: String(req.body?.title || '').trim() || null,
        description: String(req.body?.description || '').trim() || null,
        location: String(req.body?.location || '').trim() || null,
        visibility,
        isAIEnhanced,
        filterPreset,
        filterStrength: Number.isFinite(filterStrength as number) ? Number(filterStrength) : null
      }
    });

    if (tags.length > 0) {
      await prismaAny.scrollTag.createMany({
        data: tags.map((tag) => ({
          scrollId: created.id,
          taggedUserId: tag.taggedUserId,
          taggedPageId: tag.taggedPageId
        }))
      });
    }

    try {
      await addFileUsage({
        fileId,
        usageType: 'scroll_video',
        usageId: created.id,
        label: 'Scroll Video'
      });
    } catch {}

    const payload = await fetchScrollPayload(req, created, userId);
    emitScrollEvent(req, 'scroll:new', { scroll: payload });

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('createScroll error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to create scroll video.' });
  }
};

export const updateScroll = async (req: Request, res: Response) => {
  try {
    const scrollId = String(req.params.id || '').trim();
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const isAdmin = isAdminRequest(req);
    const prismaAny = prisma as any;
    const existing = await prismaAny.scrollVideo.findUnique({ where: { id: scrollId } });
    const ownership = ensureScrollOwnership(existing, userId, isAdmin);
    if (!ownership.ok) return res.status(ownership.status).json({ success: false, error: ownership.message });

    const config = await getOrCreateScrollConfig();
    const updateData: Record<string, any> = {};

    if (typeof req.body?.title !== 'undefined') {
      updateData.title = String(req.body?.title || '').trim() || null;
    }
    if (typeof req.body?.description !== 'undefined') {
      updateData.description = String(req.body?.description || '').trim() || null;
    }
    if (typeof req.body?.location !== 'undefined') {
      updateData.location = String(req.body?.location || '').trim() || null;
    }
    if (typeof req.body?.visibility !== 'undefined') {
      updateData.visibility = normalizeVisibility(req.body?.visibility, existing.visibility || config.defaultVisibility || 'public');
    }
    if (typeof req.body?.isAIEnhanced !== 'undefined') {
      updateData.isAIEnhanced = Boolean(req.body?.isAIEnhanced);
    }
    if (typeof req.body?.filterPreset !== 'undefined') {
      updateData.filterPreset = normalizeFilterPreset(req.body?.filterPreset);
    }
    if (typeof req.body?.filterStrength !== 'undefined') {
      const nextStrength = Number(req.body?.filterStrength);
      updateData.filterStrength = Number.isFinite(nextStrength) ? nextStrength : null;
    }

    if (typeof req.body?.fileId !== 'undefined') {
      const nextFileId = String(req.body?.fileId || '').trim();
      if (!nextFileId) {
        return res.status(400).json({ success: false, error: 'fileId cannot be empty.' });
      }
      const media = await resolveScrollMedia(nextFileId, req);
      if (!media) return res.status(400).json({ success: false, error: 'Selected file was not found.' });
      if (!String(media.mimeType || '').startsWith('video/')) {
        return res.status(400).json({ success: false, error: 'Scroll only supports video uploads.' });
      }
      if (!isAdmin && String(media.ownerId || '') !== userId) {
        return res.status(403).json({ success: false, error: 'You can only use your own uploaded files.' });
      }
      if (typeof media.duration === 'number' && media.duration > Number(config.maxDurationSeconds || 90)) {
        return res.status(400).json({
          success: false,
          error: `Video is too long. Max duration is ${Number(config.maxDurationSeconds || 90)} seconds.`
        });
      }
      updateData.fileId = nextFileId;
    }

    if (config.aiLabelRequired && updateData.isAIEnhanced === false) {
      return res.status(400).json({ success: false, error: 'AI label is required by admin settings.' });
    }

    const updated = await prismaAny.scrollVideo.update({
      where: { id: scrollId },
      data: updateData
    });

    if (Array.isArray(req.body?.tags)) {
      const tags = normalizeTagRows(req.body?.tags);
      await prismaAny.scrollTag.deleteMany({ where: { scrollId } });
      if (tags.length > 0) {
        await prismaAny.scrollTag.createMany({
          data: tags.map((tag) => ({
            scrollId,
            taggedUserId: tag.taggedUserId,
            taggedPageId: tag.taggedPageId
          }))
        });
      }
    }

    if (updateData.fileId && updateData.fileId !== existing.fileId) {
      try {
        await removeUsage('scroll_video', scrollId);
      } catch {}
      try {
        await addFileUsage({
          fileId: updateData.fileId,
          usageType: 'scroll_video',
          usageId: scrollId,
          label: 'Scroll Video'
        });
      } catch {}
    }

    const payload = await fetchScrollPayload(req, updated, userId);
    return res.json({ success: true, data: payload });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('updateScroll error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to update scroll video.' });
  }
};

export const deleteScroll = async (req: Request, res: Response) => {
  try {
    const scrollId = String(req.params.id || '').trim();
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const isAdmin = isAdminRequest(req);
    const prismaAny = prisma as any;
    const existing = await prismaAny.scrollVideo.findUnique({ where: { id: scrollId } });
    const ownership = ensureScrollOwnership(existing, userId, isAdmin);
    if (!ownership.ok) return res.status(ownership.status).json({ success: false, error: ownership.message });

    await prismaAny.scrollVideo.delete({ where: { id: scrollId } });
    try {
      await removeUsage('scroll_video', scrollId);
    } catch {}

    emitScrollEvent(req, 'scroll:removed', { scrollId });
    return res.json({ success: true });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('deleteScroll error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to delete scroll video.' });
  }
};

export const getScrollFeed = async (req: Request, res: Response) => {
  try {
    const userId = String((req as any)?.user?.id || '').trim() || null;
    const limit = Math.max(1, Math.min(60, toInt(req.query?.limit, 20)));
    const cursor = String(req.query?.cursor || '').trim();

    const config = await getOrCreateScrollConfig();
    if (config.enabled === false) {
      return res.json({ success: true, data: { items: [], nextCursor: null, config } });
    }

    const prismaAny = prisma as any;
    let cursorWhere: any = {};
    if (cursor) {
      const cursorRow = await prismaAny.scrollVideo.findUnique({
        where: { id: cursor },
        select: { id: true, createdAt: true }
      });
      if (cursorRow) {
        cursorWhere = {
          OR: [
            { createdAt: { lt: cursorRow.createdAt } },
            { createdAt: cursorRow.createdAt, id: { lt: cursorRow.id } }
          ]
        };
      }
    }

    const visibilityWhere = userId
      ? {
          OR: [{ visibility: { in: ['public', 'network', 'followers'] } }, { authorId: userId }]
        }
      : { visibility: { in: ['public'] } };

    const rows = await prismaAny.scrollVideo.findMany({
      where: {
        status: 'active',
        ...visibilityWhere,
        ...cursorWhere
      },
      select: scrollVideoListSelect,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1
    });

    const hasNext = rows.length > limit;
    const slice = hasNext ? rows.slice(0, limit) : rows;
    const items = await fetchScrollPayloadList(req, slice, userId);

    return res.json({
      success: true,
      data: {
        items,
        nextCursor: hasNext ? String(slice[slice.length - 1]?.id || '') : null,
        config
      }
    });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('getScrollFeed error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load scroll feed.' });
  }
};

export const engageScroll = async (req: Request, res: Response) => {
  try {
    const scrollId = String(req.params.id || '').trim();
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const type = String(req.body?.type || '').trim().toLowerCase();
    if (!SCROLL_ENGAGEMENT_TYPES.has(type)) {
      return res.status(400).json({ success: false, error: 'Unsupported engagement type.' });
    }

    const prismaAny = prisma as any;
    const scroll = await prismaAny.scrollVideo.findUnique({ where: { id: scrollId } });
    if (!scroll || scroll.status !== 'active') {
      return res.status(404).json({ success: false, error: 'Scroll video not found.' });
    }

    const config = await getOrCreateScrollConfig();
    let created = false;
    let liked = false;

    if (type === 'like') {
      const existingLike = await prismaAny.scrollEngagement.findFirst({
        where: { scrollId, userId, type: 'like' }
      });
      if (existingLike) {
        await prismaAny.scrollEngagement.delete({ where: { id: existingLike.id } });
        await prismaAny.scrollVideo.update({
          where: { id: scrollId },
          data: { likesCount: { decrement: 1 } }
        });
        created = false;
        liked = false;
      } else {
        await prismaAny.scrollEngagement.create({ data: { scrollId, userId, type: 'like' } });
        await prismaAny.scrollVideo.update({
          where: { id: scrollId },
          data: { likesCount: { increment: 1 } }
        });
        created = true;
        liked = true;
      }
    } else {
      if (type === 'impression') {
        const watchedSeconds = Number(req.body?.watchedSeconds ?? req.body?.watchSeconds ?? 0);
        const threshold = Number(config.impressionThresholdSeconds || 2);
        if (!Number.isFinite(watchedSeconds) || watchedSeconds < threshold) {
          return res.json({
            success: true,
            data: {
              applied: false,
              reason: 'threshold_not_met',
              thresholdSeconds: threshold
            }
          });
        }
      }
      try {
        await prismaAny.scrollEngagement.create({ data: { scrollId, userId, type } });
        created = true;
      } catch (error: any) {
        const code = String(error?.code || '').toUpperCase();
        if (code !== 'P2002') throw error;
        created = false;
      }

      if (created) {
        if (type === 'impression') {
          await prismaAny.scrollVideo.update({
            where: { id: scrollId },
            data: { impressions: { increment: 1 }, lastImpressionIncrementAt: new Date() }
          });
        } else {
          const field = mapTypeToCounterField(type);
          if (field) {
            await prismaAny.scrollVideo.update({
              where: { id: scrollId },
              data: { [field]: { increment: 1 } }
            });
          }
        }
      }
    }

    const updated = await prismaAny.scrollVideo.findUnique({ where: { id: scrollId } });
    const payload = {
      scrollId,
      type,
      userId,
      created,
      liked,
      metrics: {
        impressions: Number(updated?.impressions || 0),
        views3s: Number(updated?.views3s || 0),
        views10s: Number(updated?.views10s || 0),
        views25pct: Number(updated?.views25pct || 0),
        views50pct: Number(updated?.views50pct || 0),
        views95pct: Number(updated?.views95pct || 0),
        likes: Number(updated?.likesCount || 0),
        comments: Number(updated?.commentsCount || 0),
        reposts: Number(updated?.repostsCount || 0),
        shares: Number(updated?.sharesCount || 0),
        sends: Number(updated?.sendCount || 0)
      }
    };

    const eventName = type === 'impression' ? 'scroll:impression_update' : 'scroll:engagement_update';
    emitScrollEvent(req, eventName, payload);
    return res.json({ success: true, data: payload });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('engageScroll error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to update engagement.' });
  }
};

export const reportScroll = async (req: Request, res: Response) => {
  try {
    const scrollId = String(req.params.id || '').trim();
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ success: false, error: 'Reason is required.' });

    const prismaAny = prisma as any;
    const existing = await prismaAny.scrollVideo.findUnique({ where: { id: scrollId } });
    if (!existing) return res.status(404).json({ success: false, error: 'Scroll video not found.' });

    const report = await prismaAny.scrollReport.create({
      data: {
        scrollId,
        reportedById: userId,
        reason,
        status: 'pending'
      }
    });

    const config = await getOrCreateScrollConfig();
    if (config.autoModeration) {
      await prismaAny.scrollVideo.update({
        where: { id: scrollId },
        data: { status: 'flagged' }
      });
      emitScrollEvent(req, 'scroll:removed', { scrollId, reason: 'auto_moderation' });
    }

    try {
      realtime.emitToRoom('community:admin', 'scroll:engagement_update', {
        scrollId,
        type: 'report',
        reportId: report.id,
        status: report.status
      });
    } catch {}

    return res.json({ success: true, data: report });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('reportScroll error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to report scroll video.' });
  }
};

export const getScrollAdminConfig = async (_req: Request, res: Response) => {
  try {
    const config = await getOrCreateScrollConfig();
    return res.json({
      success: true,
      data: config,
      ...(config?._schemaMissing
        ? {
            message: 'Scroll module tables are not ready. Run the latest backend migration.'
          }
        : {})
    });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load scroll config.' });
  }
};

export const updateScrollAdminConfig = async (req: Request, res: Response) => {
  try {
    const actorId = String((req as any)?.user?.id || '').trim() || null;
    const config = await updateScrollConfig(req.body || {}, actorId);
    return res.json({ success: true, data: config, message: 'Scroll config saved.' });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    return res.status(500).json({ success: false, error: error?.message || 'Failed to save scroll config.' });
  }
};

export const getScrollAdminVideos = async (req: Request, res: Response) => {
  try {
    const prismaAny = prisma as any;
    const limit = Math.max(1, Math.min(100, toInt(req.query?.limit, 50)));
    const statusFilter = String(req.query?.status || '').trim().toLowerCase();
    const where: any = {};
    if (statusFilter) where.status = statusFilter;

    const rows = await prismaAny.scrollVideo.findMany({
      where,
      select: scrollVideoListSelect,
      orderBy: [{ createdAt: 'desc' }],
      take: limit
    });
    const payload = await fetchScrollPayloadList(req, rows, null);
    return res.json({ success: true, data: payload });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load videos.' });
  }
};

export const removeScrollAdmin = async (req: Request, res: Response) => {
  try {
    const scrollId = String(req.params.id || '').trim();
    const reason = String(req.body?.reason || '').trim() || 'Removed by admin';
    const actorId = String((req as any)?.user?.id || '').trim() || null;

    const prismaAny = prisma as any;
    const existing = await prismaAny.scrollVideo.findUnique({ where: { id: scrollId } });
    if (!existing) return res.status(404).json({ success: false, error: 'Scroll video not found.' });

    const updated = await prismaAny.scrollVideo.update({
      where: { id: scrollId },
      data: { status: 'removed' }
    });

    try {
      await prismaAny.scrollReport.create({
        data: {
          scrollId,
          reportedById: actorId || existing.authorId,
          reason,
          status: 'resolved',
          reviewedAt: new Date(),
          reviewedById: actorId,
          reviewNote: reason
        }
      });
    } catch {}

    emitScrollEvent(req, 'scroll:removed', { scrollId, reason });
    return res.json({ success: true, data: updated });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    return res.status(500).json({ success: false, error: error?.message || 'Failed to remove video.' });
  }
};

export const getScrollAdminReports = async (req: Request, res: Response) => {
  try {
    const prismaAny = prisma as any;
    const status = String(req.query?.status || '').trim().toLowerCase();
    const where: any = {};
    if (status) where.status = status;

    const rows = await prismaAny.scrollReport.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      take: Math.max(1, Math.min(200, toInt(req.query?.limit, 100)))
    });

    const scrollIds = Array.from(new Set(rows.map((row: any) => String(row.scrollId || '')).filter(Boolean)));
    const videos = scrollIds.length
      ? await prismaAny.scrollVideo.findMany({
          where: { id: { in: scrollIds } },
          select: { id: true, title: true, authorId: true, status: true, createdAt: true }
        })
      : [];
    const map = new Map((videos || []).map((video: any) => [video.id, video]));

    return res.json({
      success: true,
      data: rows.map((row: any) => ({
        ...row,
        scroll: map.get(row.scrollId) || null
      }))
    });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll module tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load reports.' });
  }
};
