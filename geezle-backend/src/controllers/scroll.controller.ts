import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';
import { addFileUsage, removeUsage } from '../utils/fileUsage';
import { resolveDirectMediaUrl, resolveFileBaseUrl } from '../utils/mediaUrl';
import {
  getOrCreateScrollConfig,
  updateScrollConfig,
  isScrollSchemaMissingError
} from '../services/scroll.service';
import {
  assessVideoIntegrityByFile,
  buildVideoIntegrityUpdate
} from '../services/videoIntegrity.service';
import { getScrollDashTotals } from '../services/gcoinDonationTotals.service';
import {
  normalizeStoredContentOfferTags,
  resolveSubmittedContentOfferTags
} from '../services/contentOfferTagging.service';

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

const getBaseFileUrl = (req?: Request) => resolveFileBaseUrl(req);

const buildFileContentUrl = (fileId: string, baseUrl: string) =>
  `${baseUrl}/api/files/content/${encodeURIComponent(fileId)}`;

const absolutizeMediaUrl = (value: string | null | undefined, baseUrl: string) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith('/')) return `${baseUrl}${raw}`;
  return `${baseUrl}/${raw.replace(/^\/+/, '')}`;
};

const resolveStoredFileUrl = (
  file: { id?: string; url?: string | null; storageKey?: string | null; storageProvider?: string | null },
  baseUrl: string
) => {
  const provider = String(file.storageProvider || '').trim().toLowerCase();
  const directUrl = resolveDirectMediaUrl(file.url, baseUrl);
  if (['database_storage', 'firebase_storage', 'azure_blob'].includes(provider)) {
    if (file.id) return buildFileContentUrl(file.id, baseUrl);
    return absolutizeMediaUrl(directUrl || file.url || null, baseUrl);
  }
  if (directUrl) {
    return absolutizeMediaUrl(directUrl, baseUrl);
  }
  if (file.storageKey) {
    return `${baseUrl}/uploads/${String(file.storageKey).replace(/^\/+/, '')}`;
  }
  return absolutizeMediaUrl(file.url || null, baseUrl);
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

const hasUserBlockRelation = async (userId?: string | null, otherUserId?: string | null) => {
  const actorId = String(userId || '').trim();
  const targetId = String(otherUserId || '').trim();
  if (!actorId || !targetId || actorId === targetId) return false;
  const row = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: actorId, blockedId: targetId },
        { blockerId: targetId, blockedId: actorId }
      ]
    },
    select: { id: true }
  });
  return Boolean(row);
};

const isPrivilegedUser = (user: any) => {
  const role = String(user?.role || '').trim().toLowerCase();
  return role.includes('admin') || role.includes('moderator') || role.includes('superadmin');
};

const canAccessScroll = async (
  scroll: { id: string; authorId: string; visibility?: string | null; status?: string | null } | null,
  viewerId?: string | null,
  privileged = false
) => {
  if (!scroll || String(scroll.status || '').toLowerCase() !== 'active') {
    return { ok: false, status: 404, error: 'Scroll video not found.' };
  }
  if (viewerId && await hasUserBlockRelation(viewerId, scroll.authorId)) {
    return { ok: false, status: 404, error: 'Scroll video not found.' };
  }
  const visibility = String(scroll.visibility || '').trim().toLowerCase();
  if (visibility === 'private' && !privileged && String(scroll.authorId) !== String(viewerId || '').trim()) {
    return { ok: false, status: 403, error: 'You are not allowed to access this scroll.' };
  }
  return { ok: true, status: 200, error: '' };
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
    thumbnailUrl: absolutizeMediaUrl(resolveDirectMediaUrl(file.thumbnailUrl, baseUrl) || file.thumbnailUrl || null, baseUrl),
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
        thumbnailUrl: absolutizeMediaUrl(resolveDirectMediaUrl(file.thumbnailUrl, baseUrl) || file.thumbnailUrl || null, baseUrl),
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
  offerTags: true,
  location: true,
  visibility: true,
  graphicWarning: true,
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
  videoIntegrityStatus: true,
  videoIntegrityMatchMethod: true,
  videoIntegrityMatchScore: true,
  videoMonetizationBlocked: true,
  createdAt: true,
  updatedAt: true
};

const scrollCommentListSelect: any = {
  id: true,
  scrollId: true,
  parentId: true,
  authorId: true,
  content: true,
  status: true,
  deletedAt: true,
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
  const [authors, mediaMap, tags, viewerLikes, dashTotals] = await Promise.all([
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
      : Promise.resolve([]),
    getScrollDashTotals(scrollIds)
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
        avatar: resolveDirectMediaUrl(author?.avatar, getBaseFileUrl(req)) || author?.avatar || null,
        username: author?.username || null,
        isVerified: Boolean(author?.isVerified)
      },
      title: scroll.title || null,
      description: scroll.description || null,
      location: scroll.location || null,
      visibility: scroll.visibility,
      graphicWarning: Boolean(scroll.graphicWarning),
      isAIEnhanced: Boolean(scroll.isAIEnhanced),
      dashGcoinTotal: dashTotals.get(String(scroll.id)) || 0,
      filterPreset: scroll.filterPreset || 'none',
      filterStrength: typeof scroll.filterStrength === 'number' ? scroll.filterStrength : null,
      videoIntegrityStatus: scroll.videoIntegrityStatus || 'clear',
      videoIntegrityMatchMethod: scroll.videoIntegrityMatchMethod || null,
      videoIntegrityMatchScore:
        typeof scroll.videoIntegrityMatchScore === 'number' ? scroll.videoIntegrityMatchScore : null,
      videoMonetizationBlocked: Boolean(scroll.videoMonetizationBlocked),
      media: mediaMap.get(String(scroll.fileId)) || null,
      offerTags: normalizeStoredContentOfferTags(scroll.offerTags),
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
        sends: Number(scroll.sendCount || 0),
        dashGcoinTotal: dashTotals.get(String(scroll.id)) || 0
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

const countActiveScrollComments = (items: any[]) =>
  (Array.isArray(items) ? items : []).reduce((count, item) => {
    if (String(item?.status || '').toLowerCase() === 'deleted') return count;
    return count + 1;
  }, 0);

const loadScrollCommentReactionSummaryMap = async (commentIds: string[], viewerId?: string | null) => {
  const ids = Array.from(new Set((commentIds || []).map((value) => String(value || '').trim()).filter(Boolean)));
  if (!ids.length) return new Map<string, { counts: Record<string, number>; userReaction: string | null }>();

  const [grouped, mine] = await Promise.all([
    prisma.reaction.groupBy({
      by: ['targetId', 'reactionKey'],
      where: {
        targetType: 'COMMENT',
        targetId: { in: ids }
      },
      _count: { _all: true }
    }),
    viewerId
      ? prisma.reaction.findMany({
          where: { targetType: 'COMMENT', targetId: { in: ids }, userId: viewerId },
          select: { targetId: true, reactionKey: true }
        })
      : Promise.resolve([])
  ]);

  const map = new Map<string, { counts: Record<string, number>; userReaction: string | null }>();
  ids.forEach((id) => {
    map.set(id, { counts: {}, userReaction: null });
  });
  (grouped as Array<{ targetId: string; reactionKey: string; _count: { _all: number } }>).forEach((row) => {
    const current = map.get(row.targetId) || { counts: {}, userReaction: null };
    current.counts[row.reactionKey] = row._count._all;
    map.set(row.targetId, current);
  });
  (mine as Array<{ targetId: string; reactionKey: string }>).forEach((row) => {
    const current = map.get(row.targetId) || { counts: {}, userReaction: null };
    current.userReaction = row.reactionKey;
    map.set(row.targetId, current);
  });

  return map;
};

const buildScrollCommentPayload = (
  req: Request,
  comment: any,
  authorMap: Map<string, any>,
  reactionSummaryMap: Map<string, { counts: Record<string, number>; userReaction: string | null }>,
  viewerId?: string | null
) => {
  const author = authorMap.get(String(comment.authorId || '')) || null;
  const isDeleted = String(comment.status || '').toLowerCase() === 'deleted';
  return {
    id: comment.id,
    scrollId: comment.scrollId,
    parentId: comment.parentId || null,
    userId: comment.authorId,
    userName: author?.name || 'Community member',
    userUsername: author?.username || null,
    userAvatar: author?.avatar || null,
    content: isDeleted ? '' : String(comment.content || ''),
    status: comment.status,
    deletedAt: comment.deletedAt ? new Date(comment.deletedAt).toISOString() : null,
    createdAt: new Date(comment.createdAt).toISOString(),
    updatedAt: new Date(comment.updatedAt).toISOString(),
    canEdit: Boolean(viewerId) && (String(comment.authorId) === String(viewerId) || isPrivilegedUser((req as any)?.user)),
    canDelete: Boolean(viewerId) && (String(comment.authorId) === String(viewerId) || isPrivilegedUser((req as any)?.user)),
    reactionSummary: reactionSummaryMap.get(String(comment.id)) || { counts: {}, userReaction: null },
    replies: [] as any[]
  };
};

const loadScrollCommentsBundle = async (req: Request, scrollId: string, viewerId?: string | null) => {
  const prismaAny = prisma as any;
  const comments = await prismaAny.scrollComment.findMany({
    where: { scrollId },
    select: scrollCommentListSelect,
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }]
  });
  const authorIds = Array.from(
    new Set((comments || []).map((comment: any) => String(comment?.authorId || '').trim()).filter(Boolean))
  );
  const [authors, reactionSummaryMap] = await Promise.all([
    authorIds.length
      ? prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, name: true, username: true, avatar: true }
        })
      : Promise.resolve([]),
    loadScrollCommentReactionSummaryMap(
      comments.map((comment: any) => String(comment.id)),
      viewerId
    )
  ]);
  const authorMap = new Map<string, any>((authors as any[]).map((author: any) => [String(author.id), author]));
  const payloadMap = new Map<string, any>();
  (comments || []).forEach((comment: any) => {
    payloadMap.set(
      String(comment.id),
      buildScrollCommentPayload(req, comment, authorMap, reactionSummaryMap, viewerId)
    );
  });
  const roots: any[] = [];
  (comments || []).forEach((comment: any) => {
    const payload = payloadMap.get(String(comment.id));
    if (!payload) return;
    const parentId = String(comment.parentId || '').trim();
    if (parentId && payloadMap.has(parentId)) {
      payloadMap.get(parentId).replies.push(payload);
      return;
    }
    roots.push(payload);
  });
  return {
    items: roots,
    count: countActiveScrollComments(comments)
  };
};

const buildSingleScrollCommentPayload = async (req: Request, comment: any, viewerId?: string | null) => {
  const authorIds = Array.from(new Set([String(comment?.authorId || '').trim()].filter(Boolean)));
  const [authors, reactionSummaryMap] = await Promise.all([
    authorIds.length
      ? prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, name: true, username: true, avatar: true }
        })
      : Promise.resolve([]),
    loadScrollCommentReactionSummaryMap([String(comment.id)], viewerId)
  ]);
  const authorMap = new Map<string, any>((authors as any[]).map((author: any) => [String(author.id), author]));
  return buildScrollCommentPayload(req, comment, authorMap, reactionSummaryMap, viewerId);
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
    const graphicWarning = Boolean(req.body?.graphicWarning);
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
    const offerTags = await resolveSubmittedContentOfferTags(
      req.body?.offerTags ?? req.body?.offer_tags,
      {
        actorUserId: userId,
        actorRole: (req as any)?.user?.role,
        contentType: 'scroll'
      }
    );
    const videoIntegrity = await assessVideoIntegrityByFile(fileId, userId);

    const prismaAny = prisma as any;
    const created = await prismaAny.scrollVideo.create({
      data: {
        authorId: userId,
        fileId,
        title: String(req.body?.title || '').trim() || null,
        description: String(req.body?.description || '').trim() || null,
        offerTags: offerTags.length ? offerTags : null,
        location: String(req.body?.location || '').trim() || null,
        visibility,
        graphicWarning,
        isAIEnhanced,
        filterPreset,
        filterStrength: Number.isFinite(filterStrength as number) ? Number(filterStrength) : null,
        ...buildVideoIntegrityUpdate(videoIntegrity)
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
    if (typeof req.body?.graphicWarning !== 'undefined') {
      updateData.graphicWarning = Boolean(req.body?.graphicWarning);
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
    if (typeof req.body?.offerTags !== 'undefined' || typeof req.body?.offer_tags !== 'undefined') {
      const offerTags = await resolveSubmittedContentOfferTags(
        req.body?.offerTags ?? req.body?.offer_tags,
        {
          actorUserId: userId,
          actorRole: (req as any)?.user?.role,
          contentType: 'scroll'
        }
      );
      updateData.offerTags = offerTags.length ? offerTags : null;
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
      Object.assign(updateData, buildVideoIntegrityUpdate(await assessVideoIntegrityByFile(nextFileId, userId)));
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

export const getScrollComments = async (req: Request, res: Response) => {
  try {
    const scrollId = String(req.params.id || '').trim();
    const viewerId = String((req as any)?.user?.id || '').trim() || null;
    const privileged = isPrivilegedUser((req as any)?.user);
    const prismaAny = prisma as any;

    const scroll = await prismaAny.scrollVideo.findUnique({
      where: { id: scrollId },
      select: { id: true, authorId: true, visibility: true, status: true }
    });
    const access = await canAccessScroll(scroll, viewerId, privileged);
    if (!access.ok) return res.status(access.status).json({ success: false, error: access.error });

    const bundle = await loadScrollCommentsBundle(req, scrollId, viewerId);
    return res.json({ success: true, data: bundle });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll comment tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('getScrollComments error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load scroll comments.' });
  }
};

export const createScrollComment = async (req: Request, res: Response) => {
  try {
    const scrollId = String(req.params.id || '').trim();
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const content = String(req.body?.content || '').trim();
    const parentId = String(req.body?.parentId || '').trim() || null;
    if (!content) {
      return res.status(400).json({ success: false, error: 'Content required.' });
    }

    const privileged = isPrivilegedUser((req as any)?.user);
    const prismaAny = prisma as any;
    const scroll = await prismaAny.scrollVideo.findUnique({
      where: { id: scrollId },
      select: { id: true, authorId: true, visibility: true, status: true }
    });
    const access = await canAccessScroll(scroll, userId, privileged);
    if (!access.ok) return res.status(access.status).json({ success: false, error: access.error });

    let parentComment: any = null;
    if (parentId) {
      parentComment = await prismaAny.scrollComment.findUnique({
        where: { id: parentId },
        select: { id: true, scrollId: true, authorId: true, status: true }
      });
      if (!parentComment || String(parentComment.scrollId) !== scrollId) {
        return res.status(404).json({ success: false, error: 'Reply target not found.' });
      }
      if (String(parentComment.status || '').toLowerCase() === 'deleted') {
        return res.status(400).json({ success: false, error: 'Cannot reply to a deleted comment.' });
      }
      if (await hasUserBlockRelation(userId, parentComment.authorId)) {
        return res.status(403).json({ success: false, error: 'Interaction is not allowed for this comment.' });
      }
    }

    const [created, updatedScroll] = await prisma.$transaction([
      prismaAny.scrollComment.create({
        data: {
          scrollId,
          parentId,
          authorId: userId,
          content
        },
        select: scrollCommentListSelect
      }),
      prismaAny.scrollVideo.update({
        where: { id: scrollId },
        data: { commentsCount: { increment: 1 } },
        select: { commentsCount: true }
      })
    ]);

    const payload = await buildSingleScrollCommentPayload(req, created, userId);
    const metrics = { comments: Number(updatedScroll?.commentsCount || 0) };
    emitScrollEvent(req, 'scroll:comment_created', { scrollId, comment: payload, metrics });
    emitScrollEvent(req, 'scroll:engagement_update', { scrollId, type: 'comment', metrics });

    return res.json({ success: true, data: { comment: payload, metrics } });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll comment tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('createScrollComment error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to create scroll comment.' });
  }
};

export const updateScrollComment = async (req: Request, res: Response) => {
  try {
    const commentId = String(req.params.id || '').trim();
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const content = String(req.body?.content || '').trim();
    if (!content) {
      return res.status(400).json({ success: false, error: 'Content required.' });
    }

    const prismaAny = prisma as any;
    const existing = await prismaAny.scrollComment.findUnique({
      where: { id: commentId },
      select: scrollCommentListSelect
    });
    if (!existing) return res.status(404).json({ success: false, error: 'Comment not found.' });
    if (String(existing.status || '').toLowerCase() === 'deleted') {
      return res.status(400).json({ success: false, error: 'Cannot edit a deleted comment.' });
    }
    if (String(existing.authorId) !== userId && !isPrivilegedUser((req as any)?.user)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const updated = await prismaAny.scrollComment.update({
      where: { id: commentId },
      data: { content },
      select: scrollCommentListSelect
    });
    const payload = await buildSingleScrollCommentPayload(req, updated, userId);
    emitScrollEvent(req, 'scroll:comment_updated', { scrollId: updated.scrollId, comment: payload });

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll comment tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('updateScrollComment error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to update scroll comment.' });
  }
};

export const deleteScrollComment = async (req: Request, res: Response) => {
  try {
    const commentId = String(req.params.id || '').trim();
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const prismaAny = prisma as any;
    const existing = await prismaAny.scrollComment.findUnique({
      where: { id: commentId },
      select: scrollCommentListSelect
    });
    if (!existing) return res.status(404).json({ success: false, error: 'Comment not found.' });
    if (String(existing.authorId) !== userId && !isPrivilegedUser((req as any)?.user)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    if (String(existing.status || '').toLowerCase() === 'deleted') {
      return res.json({ success: true });
    }

    const [, updatedScroll] = await prisma.$transaction([
      prismaAny.scrollComment.update({
        where: { id: commentId },
        data: {
          status: 'deleted',
          deletedAt: new Date(),
          content: ''
        }
      }),
      prismaAny.scrollVideo.update({
        where: { id: existing.scrollId },
        data: { commentsCount: { decrement: 1 } },
        select: { commentsCount: true }
      })
    ]);

    const metrics = { comments: Math.max(0, Number(updatedScroll?.commentsCount || 0)) };
    emitScrollEvent(req, 'scroll:comment_deleted', {
      scrollId: existing.scrollId,
      commentId: existing.id,
      parentId: existing.parentId || null,
      metrics
    });
    emitScrollEvent(req, 'scroll:engagement_update', {
      scrollId: existing.scrollId,
      type: 'comment',
      metrics
    });

    return res.json({ success: true });
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      return res.status(503).json({
        success: false,
        error: 'Scroll comment tables are not ready. Run the latest backend migration.',
        code: 'SCROLL_SCHEMA_MISSING'
      });
    }
    console.error('deleteScrollComment error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to delete scroll comment.' });
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
