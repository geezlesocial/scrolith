import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';
import { addFileUsage, removeUsage } from '../utils/fileUsage';
import { resolveDirectMediaUrl, resolveFileBaseUrl } from '../utils/mediaUrl';

const DISK_ID_PREFIX = 'disk:';
const DEFAULT_VIDEO_THUMBNAIL_FILENAME = '__video_fallback_thumbnail.svg';
const normalizeSlashes = (value: string) => value.replace(/\\/g, '/');
const getBaseFileUrl = (req?: Request) => resolveFileBaseUrl(req);

const buildUploadsUrl = (relativePath: string, baseUrl?: string) => {
  const normalized = normalizeSlashes(relativePath).replace(/^\/+/, '');
  const base = baseUrl || getBaseFileUrl();
  return `${base}/uploads/${normalized}`;
};

const buildFileContentUrl = (fileId: string, baseUrl: string) =>
  `${baseUrl}/api/files/content/${encodeURIComponent(fileId)}`;

const resolveStoredFileUrl = (
  file: { id?: string; url?: string | null; storageKey?: string | null; storageProvider?: string | null },
  baseUrl: string
) => {
  const storageProvider = String(file.storageProvider || '').trim().toLowerCase();
  const directUrl = resolveDirectMediaUrl(file.url, baseUrl);
  if (storageProvider === 'azure_blob') {
    if (file.id) return buildFileContentUrl(file.id, baseUrl);
    return directUrl || file.url || null;
  }
  if (file.storageKey) {
    return buildUploadsUrl(file.storageKey, baseUrl);
  }
  return directUrl || file.url || null;
};

const getStoryExpiryHours = async () => {
  const cfg = await prisma.communityConfig.findFirst();
  return cfg?.storyExpiryHours ?? 24;
};

const resolveStoryMedia = async (fileId?: string | null, req?: Request) => {
  if (!fileId) return null;
  const baseUrl = getBaseFileUrl(req);
  if (fileId.startsWith(DISK_ID_PREFIX)) {
    const relativePath = normalizeSlashes(fileId.slice(DISK_ID_PREFIX.length)).replace(/^\/+/, '');
    if (!relativePath) return null;
    return {
      id: fileId,
      url: buildUploadsUrl(relativePath, baseUrl),
      mimeType: null,
      name: relativePath.split('/').pop() || 'Story media',
      storageKey: relativePath,
      thumbnailUrl: null,
      width: null,
      height: null,
      duration: null
    };
  }
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file) return null;
  const isVideo = String(file.mimeType || '').startsWith('video/');
  const fallbackVideoThumbnail = buildUploadsUrl(DEFAULT_VIDEO_THUMBNAIL_FILENAME, baseUrl);
  return {
    id: file.id,
    url: resolveStoredFileUrl(file, baseUrl),
    mimeType: file.mimeType,
    name: file.originalName,
    storageKey: file.storageKey,
    thumbnailUrl:
      resolveDirectMediaUrl(file.thumbnailUrl, baseUrl) ||
      file.thumbnailUrl ||
      (isVideo ? fallbackVideoThumbnail : null),
    width: file.width ?? null,
    height: file.height ?? null,
    duration: file.duration ?? null
  };
};

const looksLikeDirectMediaUrl = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('/uploads/') ||
    normalized.startsWith('uploads/') ||
    normalized.includes('.png') ||
    normalized.includes('.jpg') ||
    normalized.includes('.jpeg') ||
    normalized.includes('.webp') ||
    normalized.includes('.gif') ||
    normalized.includes('.mp4') ||
    normalized.includes('.webm') ||
    normalized.includes('.mov') ||
    normalized.includes('.pdf')
  );
};

const validateStoryMediaFileId = async (
  mediaFileId: unknown,
  actor: { userId: string; role?: string | null },
  required = false
) => {
  const normalized = String(mediaFileId || '').trim();
  if (!normalized) {
    if (required) throw new Error('mediaFileId is required');
    return null;
  }
  if (looksLikeDirectMediaUrl(normalized)) {
    throw new Error('Stories must reference Uploaded Files by mediaFileId, not raw URL');
  }

  const file = await prisma.file.findUnique({
    where: { id: normalized },
    select: { id: true, ownerId: true, mimeType: true }
  });
  if (!file) throw new Error('Story media file was not found in Uploaded Files');

  const role = String(actor.role || '').toLowerCase();
  const isPrivileged = role.includes('admin');
  if (!isPrivileged && file.ownerId !== actor.userId) {
    throw new Error('You can only use story media from your Uploaded Files library');
  }

  return file;
};

const STORY_VISIBILITIES = new Set([
  'public',
  'followers',
  'following',
  'mutuals',
  'network',
  'friends',
  'private',
  'custom'
]);

const STORY_ENGAGEMENT_TYPES = new Set(['comment', 'repost', 'dash', 'send']);

const getStoryEngagementField = (type: string) => {
  if (type === 'comment') return 'commentsCount';
  if (type === 'repost') return 'repostsCount';
  if (type === 'dash') return 'dashesCount';
  if (type === 'send') return 'sendsCount';
  return null;
};

const normalizeVisibility = (value?: string) => {
  const normalized = (value || '').toString().trim().toLowerCase();
  if (STORY_VISIBILITIES.has(normalized)) return normalized;
  return 'public';
};

const getFollowRelations = async (
  viewerId?: string | null
): Promise<{ followingIds: Set<string>; followerIds: Set<string> }> => {
  if (!viewerId) {
    return { followingIds: new Set<string>(), followerIds: new Set<string>() };
  }
  const [following, followers] = await Promise.all([
    prisma.userFollow.findMany({ where: { followerId: viewerId }, select: { followeeId: true } }),
    prisma.userFollow.findMany({ where: { followeeId: viewerId }, select: { followerId: true } })
  ]);
  return {
    followingIds: new Set((following as any[]).map((row) => String(row.followeeId))),
    followerIds: new Set((followers as any[]).map((row) => String(row.followerId)))
  };
};

const canViewStory = (
  story: { authorId: string; visibility?: string | null },
  viewerId?: string | null,
  relations?: { followingIds: Set<string>; followerIds: Set<string> }
) => {
  const visibility = normalizeVisibility(story.visibility || undefined);
  if (story.authorId && viewerId && String(story.authorId) === String(viewerId)) return true;
  if (!viewerId) return visibility === 'public';
  if (visibility === 'public') return true;
  if (visibility === 'private' || visibility === 'custom') return false;

  const followingIds = relations?.followingIds || new Set<string>();
  const followerIds = relations?.followerIds || new Set<string>();
  const isFollowing = followingIds.has(story.authorId);
  const isFollowedBy = followerIds.has(story.authorId);
  const isMutual = isFollowing && isFollowedBy;

  switch (visibility) {
    case 'followers':
      return isFollowing;
    case 'following':
      return isFollowedBy;
    case 'mutuals':
    case 'friends':
      return isMutual;
    case 'network':
      return isFollowing || isFollowedBy;
    default:
      return false;
  }
};

const buildStoryPayload = async (
  story: any,
  req: Request,
  viewerId?: string | null,
  likesCountOverride?: number
) => {
  const likesCount = typeof likesCountOverride === 'number'
    ? likesCountOverride
    : (story?._count?.likes ?? story?.likesCount ?? 0);
  const viewerLiked = Array.isArray(story?.likes) ? story.likes.length > 0 : Boolean(story?.viewerLiked);
  return {
    id: story.id,
    authorId: story.authorId,
    authorName: story.author?.name || 'Anonymous',
    authorAvatar: resolveDirectMediaUrl(story.author?.avatar, getBaseFileUrl(req)) || story.author?.avatar || null,
    authorUsername: story.author?.username || null,
    type: story.type,
    content: story.content,
    caption: story.content,
    visibility: story.visibility,
    media: await resolveStoryMedia(story.mediaFileId, req),
    mediaFileId: story.mediaFileId,
    textBackground: story.textBackground,
    textColor: story.textColor,
    textFont: story.textFont,
    textAlign: story.textAlign,
    likesCount,
    commentsCount: Number(story.commentsCount || 0),
    repostsCount: Number(story.repostsCount || 0),
    dashesCount: Number(story.dashesCount || 0),
    sendsCount: Number(story.sendsCount || 0),
    interactions: {
      likes: likesCount,
      comments: Number(story.commentsCount || 0),
      reposts: Number(story.repostsCount || 0),
      dashes: Number(story.dashesCount || 0),
      sends: Number(story.sendsCount || 0)
    },
    viewerLiked,
    createdAt: story.createdAt.toISOString(),
    expiresAt: story.expiresAt.toISOString()
  };
};

const resolveStoryLikeCounts = async (storyIds: string[]) => {
  if (!storyIds.length) return new Map<string, number>();
  const rows = await prisma.communityStoryLike.groupBy({
    by: ['storyId'],
    where: { storyId: { in: storyIds } },
    _count: { _all: true }
  });
  return new Map<string, number>(rows.map((row) => [row.storyId, row._count._all]));
};

const isMissingTableError = (error: any, tableName?: string) => {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toUpperCase();
  const metaTable = String(error?.meta?.table || '').toLowerCase();
  const requested = String(tableName || '').toLowerCase();

  if (code === 'P2021') {
    if (!requested) return true;
    return metaTable.includes(requested) || message.includes(requested);
  }

  if (!message.includes('does not exist')) return false;
  if (!requested) return true;
  return message.includes(requested);
};

const inMemoryStoryLikes = new Map<string, Set<string>>();

const getInMemoryLikeSet = (storyId: string) => {
  const key = String(storyId);
  let set = inMemoryStoryLikes.get(key);
  if (!set) {
    set = new Set<string>();
    inMemoryStoryLikes.set(key, set);
  }
  return set;
};

const getInMemoryLikesCount = (storyId: string) => getInMemoryLikeSet(storyId).size;

const isInMemoryStoryLiked = (storyId: string, userId?: string | null) => {
  if (!userId) return false;
  return getInMemoryLikeSet(storyId).has(String(userId));
};

const toggleInMemoryStoryLike = (storyId: string, userId: string) => {
  const set = getInMemoryLikeSet(storyId);
  const normalizedUserId = String(userId);
  let liked = false;
  if (set.has(normalizedUserId)) {
    set.delete(normalizedUserId);
    liked = false;
  } else {
    set.add(normalizedUserId);
    liked = true;
  }
  return { liked, likesCount: set.size };
};

export const getStoriesFeed = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const now = new Date();
    const relations = await getFollowRelations(userId);
    const candidateAuthors = userId
      ? Array.from(new Set([userId, ...relations.followingIds, ...relations.followerIds]))
      : [];

    const whereClause: any = {
      expiresAt: { gt: now },
      ...(userId
        ? {
            OR: [
              { visibility: 'public' },
              { authorId: userId },
              ...(candidateAuthors.length ? [{ authorId: { in: candidateAuthors } }] : [])
            ]
          }
        : { visibility: 'public' })
    };
    const baseInclude = {
      author: { select: { id: true, name: true, avatar: true, username: true } }
    };

    let stories: any[] = [];
    let usingInMemoryLikes = false;
    try {
      stories = await prisma.communityStory.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        include: {
          ...baseInclude,
          ...(userId ? { likes: { where: { userId }, select: { id: true } } } : {})
        }
      });
    } catch (error: any) {
      if (!isMissingTableError(error, 'communitystorylike')) throw error;
      usingInMemoryLikes = true;
      stories = await prisma.communityStory.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        include: baseInclude
      });
    }

    const visibleStories = stories.filter((story) => canViewStory(story, userId, relations));
    let likeCountMap = new Map<string, number>();
    try {
      likeCountMap = await resolveStoryLikeCounts(visibleStories.map((story) => story.id));
    } catch (error: any) {
      if (!isMissingTableError(error, 'communitystorylike')) throw error;
      usingInMemoryLikes = true;
      likeCountMap = new Map<string, number>(
        visibleStories.map((story) => [story.id, getInMemoryLikesCount(story.id)])
      );
    }
    let data = await Promise.all(
      visibleStories.map((story) => buildStoryPayload(story, req, userId, likeCountMap.get(story.id) ?? 0))
    );

    if (usingInMemoryLikes && userId) {
      data = data.map((story) => ({
        ...story,
        viewerLiked: isInMemoryStoryLiked(story.id, userId),
        likesCount: likeCountMap.get(story.id) ?? story.likesCount ?? 0
      }));
    }

    return res.json({ success: true, data });
  } catch (error: any) {
    console.error('Get stories feed error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load stories' });
  }
};

export const createStory = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const {
      type = 'text',
      content,
      caption,
      mediaFileId,
      visibility = 'public',
      textBackground,
      textColor,
      textFont,
      textAlign
    } = req.body || {};

    const normalizedContent = String((caption ?? content ?? '')).trim();
    if (type === 'text' && !normalizedContent) {
      return res.status(400).json({ success: false, error: 'Content required for text story' });
    }
    const normalizedType = ['text', 'image', 'video'].includes(`${type}`.toLowerCase())
      ? `${type}`.toLowerCase()
      : 'text';
    const mediaFile = await validateStoryMediaFileId(
      mediaFileId,
      { userId, role: req.user?.role },
      normalizedType === 'image' || normalizedType === 'video'
    );

    if (normalizedType === 'image' && mediaFile && !String(mediaFile.mimeType || '').startsWith('image/')) {
      return res.status(400).json({ success: false, error: 'mediaFileId must point to an image file' });
    }
    if (normalizedType === 'video' && mediaFile && !String(mediaFile.mimeType || '').startsWith('video/')) {
      return res.status(400).json({ success: false, error: 'mediaFileId must point to a video file' });
    }

    const hours = await getStoryExpiryHours();
    const expiresAt = new Date(Date.now() + Number(hours) * 60 * 60 * 1000);

    const normalizedAlign = ['left', 'center', 'right'].includes(`${textAlign || ''}`.toLowerCase())
      ? `${textAlign}`.toLowerCase()
      : 'center';
    const normalizedVisibility = normalizeVisibility(visibility);
    const story = await prisma.communityStory.create({
      data: {
        authorId: userId,
        type: normalizedType,
        content: normalizedContent || null,
        mediaFileId: mediaFile?.id || null,
        visibility: normalizedVisibility,
        expiresAt,
        textBackground: typeof textBackground === 'string' && textBackground.trim() ? textBackground.trim() : null,
        textColor: typeof textColor === 'string' && textColor.trim() ? textColor.trim() : null,
        textFont: typeof textFont === 'string' && textFont.trim() ? textFont.trim() : null,
        textAlign: normalizedType === 'text' ? normalizedAlign : null
      },
      include: { author: { select: { id: true, name: true, avatar: true, username: true } } }
    });

    if (story.mediaFileId) {
      try { await addFileUsage({ fileId: story.mediaFileId, usageType: 'community_story', usageId: story.id, label: 'Community Story Media' }); } catch (e) {}
    }

    const payload = await buildStoryPayload({ ...story, likes: [] }, req, userId, 0);

    const io = (req.app as any).get('communityIo') || (req.app as any).get('io');
    try { io?.emit('community:story_created', { story: payload }); } catch (e) {}
    try { realtime.emitToUser(story.authorId, 'community:story_created', { story: payload }); } catch (e) {}

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('Create story error:', error);
    const message = String(error?.message || 'Failed to create story');
    const lower = message.toLowerCase();
    const status =
      lower.includes('only use story media') ? 403 :
      lower.includes('required') || lower.includes('must') || lower.includes('not found') || lower.includes('uploaded files')
        ? 400
        : 500;
    return res.status(status).json({ success: false, error: message });
  }
};

export const deleteStory = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const storyId = req.params.id;
    const story = await prisma.communityStory.findUnique({ where: { id: storyId } });
    if (!story) return res.status(404).json({ success: false, error: 'Story not found' });

    const role = (req.user?.role || '').toString().toLowerCase();
    const isAdmin = role.includes('admin');
    if (story.authorId !== userId && !isAdmin) return res.status(403).json({ success: false, error: 'Forbidden' });

    await prisma.communityStory.delete({ where: { id: storyId } });
    try { await removeUsage('community_story', storyId); } catch (e) {}

    const io = (req.app as any).get('communityIo') || (req.app as any).get('io');
    try { io?.emit('community:story_deleted', { storyId }); } catch (e) {}
    try { realtime.emitToUser(story.authorId, 'community:story_deleted', { storyId }); } catch (e) {}

    return res.json({ success: true });
  } catch (error: any) {
    console.error('Delete story error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to delete story' });
  }
};

export const viewStory = async (req: Request, res: Response) => {
  try {
    const storyId = req.params.id;
    const userId = req.user?.id || null;

    if (userId) {
      await prisma.communityStoryView.upsert({
        where: { storyId_viewerId: { storyId, viewerId: userId } },
        create: { storyId, viewerId: userId },
        update: { createdAt: new Date() }
      }).catch(() => null);
    } else {
      await prisma.communityStoryView.create({ data: { storyId, viewerId: null } }).catch(() => null);
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error('View story error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to record view' });
  }
};

export const updateStory = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const storyId = req.params.id;
    const story = await prisma.communityStory.findUnique({ where: { id: storyId } });
    if (!story) return res.status(404).json({ success: false, error: 'Story not found' });

    const role = (req.user?.role || '').toString().toLowerCase();
    const isAdmin = role.includes('admin');
    if (story.authorId !== userId && !isAdmin) return res.status(403).json({ success: false, error: 'Forbidden' });

    const {
      content,
      caption,
      visibility,
      textBackground,
      textColor,
      textFont,
      textAlign,
      mediaFileId
    } = req.body || {};

    const updateData: any = {};
    if (typeof visibility === 'string') updateData.visibility = normalizeVisibility(visibility);
    const normalizedContent = String((caption ?? content ?? '')).trim();
    if (typeof content === 'string' || typeof caption === 'string') {
      updateData.content = normalizedContent || null;
    }

    if (story.type === 'text') {
      if (typeof textBackground === 'string') updateData.textBackground = textBackground.trim() || null;
      if (typeof textColor === 'string') updateData.textColor = textColor.trim() || null;
      if (typeof textFont === 'string') updateData.textFont = textFont.trim() || null;
      if (typeof textAlign === 'string') {
        const normalizedAlign = ['left', 'center', 'right'].includes(textAlign.toLowerCase())
          ? textAlign.toLowerCase()
          : 'center';
        updateData.textAlign = normalizedAlign;
      }
      if (!updateData.content && (typeof content !== 'undefined' || typeof caption !== 'undefined')) {
        return res.status(400).json({ success: false, error: 'Content required for text story' });
      }
    }

    if ((story.type === 'image' || story.type === 'video') && typeof mediaFileId === 'string') {
      const mediaFile = await validateStoryMediaFileId(
        mediaFileId,
        { userId, role: req.user?.role },
        false
      );
      if (!mediaFile) {
        return res.status(400).json({ success: false, error: 'mediaFileId is invalid' });
      }
      if (story.type === 'image' && !String(mediaFile.mimeType || '').startsWith('image/')) {
        return res.status(400).json({ success: false, error: 'mediaFileId must point to an image file' });
      }
      if (story.type === 'video' && !String(mediaFile.mimeType || '').startsWith('video/')) {
        return res.status(400).json({ success: false, error: 'mediaFileId must point to a video file' });
      }
      updateData.mediaFileId = mediaFile.id;
    }

    if (Object.keys(updateData).length === 0) {
      let usingInMemoryLikes = false;
      let existing: any = null;
      try {
        existing = await prisma.communityStory.findUnique({
          where: { id: storyId },
          include: {
            author: { select: { id: true, name: true, avatar: true, username: true } },
            ...(userId ? { likes: { where: { userId }, select: { id: true } } } : {})
          }
        });
      } catch (error: any) {
        if (!isMissingTableError(error, 'communitystorylike')) throw error;
        usingInMemoryLikes = true;
        existing = await prisma.communityStory.findUnique({
          where: { id: storyId },
          include: {
            author: { select: { id: true, name: true, avatar: true, username: true } }
          }
        });
        if (existing && userId) {
          existing = {
            ...existing,
            likes: [],
            viewerLiked: isInMemoryStoryLiked(storyId, userId)
          };
        }
      }

      let likesCount = 0;
      try {
        likesCount = await prisma.communityStoryLike.count({ where: { storyId } });
      } catch (error: any) {
        if (!isMissingTableError(error, 'communitystorylike')) throw error;
        usingInMemoryLikes = true;
        likesCount = getInMemoryLikesCount(storyId);
      }

      const fallbackStory = {
        ...story,
        author: null,
        likes: [],
        viewerLiked: isInMemoryStoryLiked(storyId, userId)
      };
      let payload = existing
        ? await buildStoryPayload(existing, req, userId, likesCount)
        : await buildStoryPayload(fallbackStory, req, userId, likesCount);
      if (usingInMemoryLikes && userId) {
        payload = {
          ...payload,
          viewerLiked: isInMemoryStoryLiked(storyId, userId),
          likesCount
        };
      }
      return res.json({ success: true, data: payload });
    }

    const previousMedia = story.mediaFileId;
    let usingInMemoryLikes = false;
    let updated: any;
    try {
      updated = await prisma.communityStory.update({
        where: { id: storyId },
        data: updateData,
        include: {
          author: { select: { id: true, name: true, avatar: true, username: true } },
          ...(userId ? { likes: { where: { userId }, select: { id: true } } } : {})
        }
      });
    } catch (error: any) {
      if (!isMissingTableError(error, 'communitystorylike')) throw error;
      usingInMemoryLikes = true;
      updated = await prisma.communityStory.update({
        where: { id: storyId },
        data: updateData,
        include: {
          author: { select: { id: true, name: true, avatar: true, username: true } }
        }
      });
      updated = {
        ...updated,
        likes: [],
        viewerLiked: isInMemoryStoryLiked(storyId, userId)
      };
    }

    if (updateData.mediaFileId && updateData.mediaFileId !== previousMedia) {
      try { await removeUsage('community_story', storyId); } catch (e) {}
      try { await addFileUsage({ fileId: updateData.mediaFileId, usageType: 'community_story', usageId: storyId, label: 'Community Story Media' }); } catch (e) {}
    }

    let likesCount = 0;
    try {
      likesCount = await prisma.communityStoryLike.count({ where: { storyId } });
    } catch (error: any) {
      if (!isMissingTableError(error, 'communitystorylike')) throw error;
      usingInMemoryLikes = true;
      likesCount = getInMemoryLikesCount(storyId);
    }
    let payload = await buildStoryPayload(updated, req, userId, likesCount);
    if (usingInMemoryLikes && userId) {
      payload = {
        ...payload,
        viewerLiked: isInMemoryStoryLiked(storyId, userId),
        likesCount
      };
    }
    const io = (req.app as any).get('communityIo') || (req.app as any).get('io');
    try { io?.emit('community:story_updated', { story: payload }); } catch (e) {}
    try { realtime.emitToUser(updated.authorId, 'community:story_updated', { story: payload }); } catch (e) {}

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('Update story error:', error);
    const message = String(error?.message || 'Failed to update story');
    const lower = message.toLowerCase();
    const status =
      lower.includes('only use story media') ? 403 :
      lower.includes('required') || lower.includes('must') || lower.includes('not found') || lower.includes('uploaded files')
        ? 400
        : 500;
    return res.status(status).json({ success: false, error: message });
  }
};

export const toggleStoryLike = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const storyId = req.params.id;
    const story = await prisma.communityStory.findUnique({ where: { id: storyId } });
    if (!story) return res.status(404).json({ success: false, error: 'Story not found' });

    let liked = false;
    let likesCount = 0;
    let fallback = false;
    try {
      const existing = await prisma.communityStoryLike.findUnique({
        where: { storyId_userId: { storyId, userId } }
      });
      if (existing) {
        await prisma.communityStoryLike.delete({ where: { id: existing.id } });
        liked = false;
      } else {
        await prisma.communityStoryLike.create({ data: { storyId, userId } });
        liked = true;
      }
      likesCount = await prisma.communityStoryLike.count({ where: { storyId } });
    } catch (error: any) {
      if (!isMissingTableError(error, 'communitystorylike')) throw error;
      fallback = true;
      const toggled = toggleInMemoryStoryLike(storyId, userId);
      liked = toggled.liked;
      likesCount = toggled.likesCount;
    }

    const payload = { storyId, liked, likesCount, userId, fallback };

    const io = (req.app as any).get('communityIo') || (req.app as any).get('io');
    try { io?.emit('community:story_liked', payload); } catch (e) {}
    try { realtime.emitToUser(story.authorId, 'community:story_liked', payload); } catch (e) {}

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('Like story error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to like story' });
  }
};

export const engageStory = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const storyId = String(req.params.id || '').trim();
    const type = String(req.body?.type || '').trim().toLowerCase();
    if (!storyId) return res.status(400).json({ success: false, error: 'Story ID is required' });
    if (!STORY_ENGAGEMENT_TYPES.has(type)) {
      return res.status(400).json({ success: false, error: 'Unsupported story engagement type' });
    }

    const prismaAny = prisma as any;
    const story = await prismaAny.communityStory.findUnique({
      where: { id: storyId },
      select: {
        id: true,
        authorId: true,
        visibility: true,
        expiresAt: true,
        commentsCount: true,
        repostsCount: true,
        dashesCount: true,
        sendsCount: true
      }
    });
    if (!story || (story.expiresAt && story.expiresAt <= new Date())) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }
    const relations = await getFollowRelations(userId);
    if (!canViewStory({ authorId: story.authorId, visibility: story.visibility }, userId, relations)) {
      return res.status(403).json({ success: false, error: 'Not authorized to engage this story' });
    }

    const field = getStoryEngagementField(type);
    if (!field) return res.status(400).json({ success: false, error: 'Unsupported story engagement type' });

    const updated = await prismaAny.communityStory.update({
      where: { id: storyId },
      data: { [field]: { increment: 1 } },
      select: {
        id: true,
        commentsCount: true,
        repostsCount: true,
        dashesCount: true,
        sendsCount: true
      }
    });

    const payload = {
      storyId,
      type,
      userId,
      interactions: {
        comments: Number(updated.commentsCount || 0),
        reposts: Number(updated.repostsCount || 0),
        dashes: Number(updated.dashesCount || 0),
        sends: Number(updated.sendsCount || 0)
      },
      story: {
        id: storyId,
        commentsCount: Number(updated.commentsCount || 0),
        repostsCount: Number(updated.repostsCount || 0),
        dashesCount: Number(updated.dashesCount || 0),
        sendsCount: Number(updated.sendsCount || 0),
        interactions: {
          comments: Number(updated.commentsCount || 0),
          reposts: Number(updated.repostsCount || 0),
          dashes: Number(updated.dashesCount || 0),
          sends: Number(updated.sendsCount || 0)
        }
      }
    };

    const io = (req.app as any).get('communityIo') || (req.app as any).get('io');
    try { io?.emit('community:story_engaged', payload); } catch (e) {}
    try { io?.emit('community:story_updated', payload); } catch (e) {}
    try { realtime.emitToUser(story.authorId, 'community:story_engaged', payload); } catch (e) {}
    try { realtime.emitToUser(story.authorId, 'community:story_updated', payload); } catch (e) {}

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('Engage story error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to engage story' });
  }
};
