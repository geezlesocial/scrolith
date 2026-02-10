import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';
import { addFileUsage, removeUsage } from '../utils/fileUsage';

const DISK_ID_PREFIX = 'disk:';
const normalizeSlashes = (value: string) => value.replace(/\\/g, '/');
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
      storageKey: relativePath
    };
  }
  const file = await prisma.file.findUnique({ where: { id: fileId } });
  if (!file) return null;
  return {
    id: file.id,
    url: file.storageKey ? buildUploadsUrl(file.storageKey, baseUrl) : file.url,
    mimeType: file.mimeType,
    name: file.originalName,
    storageKey: file.storageKey
  };
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
    authorAvatar: story.author?.avatar || null,
    authorUsername: story.author?.username || null,
    type: story.type,
    content: story.content,
    visibility: story.visibility,
    media: await resolveStoryMedia(story.mediaFileId, req),
    mediaFileId: story.mediaFileId,
    textBackground: story.textBackground,
    textColor: story.textColor,
    textFont: story.textFont,
    textAlign: story.textAlign,
    likesCount,
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
      mediaFileId,
      visibility = 'public',
      textBackground,
      textColor,
      textFont,
      textAlign
    } = req.body || {};

    if (type === 'text' && !content) {
      return res.status(400).json({ success: false, error: 'Content required for text story' });
    }
    if ((type === 'image' || type === 'video') && !mediaFileId) {
      return res.status(400).json({ success: false, error: 'Media file required for media story' });
    }

    const hours = await getStoryExpiryHours();
    const expiresAt = new Date(Date.now() + Number(hours) * 60 * 60 * 1000);

    const normalizedAlign = ['left', 'center', 'right'].includes(`${textAlign || ''}`.toLowerCase())
      ? `${textAlign}`.toLowerCase()
      : 'center';
    const normalizedVisibility = normalizeVisibility(visibility);
    const normalizedType = ['text', 'image', 'video'].includes(`${type}`.toLowerCase())
      ? `${type}`.toLowerCase()
      : 'text';
    const story = await prisma.communityStory.create({
      data: {
        authorId: userId,
        type: normalizedType,
        content: content || null,
        mediaFileId: mediaFileId || null,
        visibility: normalizedVisibility,
        expiresAt,
        textBackground: typeof textBackground === 'string' && textBackground.trim() ? textBackground.trim() : null,
        textColor: typeof textColor === 'string' && textColor.trim() ? textColor.trim() : null,
        textFont: typeof textFont === 'string' && textFont.trim() ? textFont.trim() : null,
        textAlign: normalizedType === 'text' ? normalizedAlign : null
      },
      include: { author: { select: { id: true, name: true, avatar: true, username: true } } }
    });

    if (mediaFileId) {
      try { await addFileUsage({ fileId: mediaFileId, usageType: 'community_story', usageId: story.id, label: 'Community Story Media' }); } catch (e) {}
    }

    const payload = {
      id: story.id,
      authorId: story.authorId,
      authorName: story.author?.name || 'Anonymous',
      authorAvatar: story.author?.avatar || null,
      authorUsername: story.author?.username || null,
      type: story.type,
      content: story.content,
      visibility: story.visibility,
      media: await resolveStoryMedia(story.mediaFileId, req),
      mediaFileId: story.mediaFileId,
      textBackground: story.textBackground,
      textColor: story.textColor,
      textFont: story.textFont,
      textAlign: story.textAlign,
      likesCount: 0,
      viewerLiked: false,
      createdAt: story.createdAt.toISOString(),
      expiresAt: story.expiresAt.toISOString()
    };

    const io = (req.app as any).get('communityIo') || (req.app as any).get('io');
    try { io?.emit('community:story_created', { story: payload }); } catch (e) {}
    try { realtime.emitToUser(story.authorId, 'community:story_created', { story: payload }); } catch (e) {}

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('Create story error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to create story' });
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
      visibility,
      textBackground,
      textColor,
      textFont,
      textAlign,
      mediaFileId
    } = req.body || {};

    const updateData: any = {};
    if (typeof visibility === 'string') updateData.visibility = normalizeVisibility(visibility);
    if (typeof content === 'string') updateData.content = content.trim() || null;

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
      if (!updateData.content && typeof content !== 'undefined') {
        return res.status(400).json({ success: false, error: 'Content required for text story' });
      }
    }

    if ((story.type === 'image' || story.type === 'video') && typeof mediaFileId === 'string') {
      updateData.mediaFileId = mediaFileId;
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
    return res.status(500).json({ success: false, error: error.message || 'Failed to update story' });
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
