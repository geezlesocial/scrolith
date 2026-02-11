import { Request, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { getGcoinSettingsSafe } from '../utils/gcoinSettings';
import jwt from 'jsonwebtoken';

const prisma = new PrismaClient();

import realtime from '../utils/realtime';
import { syncFileUsages, removeUsage } from '../utils/fileUsage';
import {
  buildSnippet,
  canUserViewPostForNotification,
  createEngagementNotification,
  extractMentionUsernames,
  filterRecipientsForNotification,
  resolveMentionedUserIds
} from '../services/engagementNotifications.service';

// Safe helper to retrieve the `io` instance from `req.app` without broad `as any` casts
const getAppIo = (req: Request) => {
  const app = req.app as unknown as {
    get?: (k: string) => unknown;
    locals?: Record<string, unknown>;
  } | undefined;
  if (app && typeof app.get === 'function') {
    try {
      // Prefer community namespace when available
      const community = app.get('communityIo') as { emit?: (...args: unknown[]) => void } | undefined;
      if (community) return community;
      const io = app.get('io') as { emit?: (...args: unknown[]) => void } | undefined;
      if (io) return io;
      if (app.locals?.communityIo) return app.locals.communityIo as { emit?: (...args: unknown[]) => void };
      if (app.locals?.io) return app.locals.io as { emit?: (...args: unknown[]) => void };
    } catch (e) {
      console.error('Failed to read io from app context:', e);
    }
  }
  // Fallback to global namespace if set
  if ((global as any).appCommunityIo) return (global as any).appCommunityIo;
  if ((global as any).appIo) return (global as any).appIo;
  return undefined;
};

const NOTIFICATION_BATCH_SIZE = 250;

const resolveAttachments = async (fileIds: string[]) => {
  const ids = Array.from(new Set((fileIds || []).filter(Boolean)));
  if (!ids.length) return [];
  const files = (await prisma.file.findMany({ where: { id: { in: ids } } })) as Array<{
    id: string;
    url: string;
    originalName: string;
    mimeType: string;
    thumbnailUrl?: string | null;
    width?: number | null;
    height?: number | null;
    duration?: number | null;
    size: number;
  }>;
  const map = new Map<string, (typeof files)[number]>(files.map((f) => [f.id, f]));
  return ids
    .map((id) => {
      const file = map.get(id);
      if (!file) return null;
      const mimeType = file.mimeType || '';
      const type = mimeType.startsWith('image/')
        ? 'image'
        : mimeType.startsWith('video/')
          ? 'video'
          : 'document';
      return {
        id: file.id,
        url: file.url,
        name: file.originalName,
        mimeType: file.mimeType,
        thumbnailUrl: file.thumbnailUrl || undefined,
        width: file.width ?? undefined,
        height: file.height ?? undefined,
        duration: file.duration ?? undefined,
        type,
        size: Number(file.size || 0)
      };
    })
    .filter(Boolean);
};

type HttpError = Error & { statusCode?: number };

const httpError = (statusCode: number, message: string): HttpError => {
  const err = new Error(message) as HttpError;
  err.statusCode = statusCode;
  return err;
};

const extractAttachmentFileIds = (...inputs: unknown[]) => {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const input of inputs) {
    if (!Array.isArray(input)) continue;
    for (const entry of input) {
      const value = String((entry as any)?.id || (entry as any)?.fileId || entry || '').trim();
      if (!value || seen.has(value)) continue;
      seen.add(value);
      ids.push(value);
    }
  }
  return ids;
};

const looksLikeDirectMediaUrl = (value: string) => {
  if (!value) return false;
  const normalized = value.toLowerCase().trim();
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

const resolveValidatedAttachmentIds = async (
  rawInputs: unknown[],
  actor: { userId: string; role?: string | null }
) => {
  const ids = extractAttachmentFileIds(...rawInputs);
  if (!ids.length) return [];

  const directUrl = ids.find((value) => looksLikeDirectMediaUrl(value));
  if (directUrl) {
    throw httpError(400, 'Attachments must reference Uploaded Files by file ID, not raw URL');
  }

  const files = await prisma.file.findMany({
    where: { id: { in: ids } },
    select: { id: true, ownerId: true }
  });
  const byId = new Map<string, { id: string; ownerId: string | null }>(
    files.map((file) => [file.id, file])
  );

  const missingIds = ids.filter((id) => !byId.has(id));
  if (missingIds.length) {
    throw httpError(400, 'One or more attachmentFileIds were not found in Uploaded Files');
  }

  const role = String(actor.role || '').toLowerCase();
  const isPrivileged = role === 'admin' || role === 'moderator';
  if (!isPrivileged) {
    const notOwned = ids.filter((id) => {
      const file = byId.get(id);
      return !file || !file.ownerId || file.ownerId !== actor.userId;
    });
    if (notOwned.length) {
      throw httpError(403, 'You can only attach files from your Uploaded Files library');
    }
  }

  return ids;
};

const buildReactionSummary = (reactions: Array<{ postId: string; type: string; _count: { _all: number } }>) => {
  const map = new Map<string, Record<string, number>>();
  reactions.forEach((r) => {
    const entry = map.get(r.postId) || {};
    entry[r.type] = r._count?._all || 0;
    map.set(r.postId, entry);
  });
  return map;
};

const buildCommentCounts = (counts: Array<{ postId: string; _count: { _all: number } }>) => {
  const map = new Map<string, number>();
  counts.forEach((c) => map.set(c.postId, c._count?._all || 0));
  return map;
};

const emitPostMetricsUpdated = async (
  io: { emit?: (...args: unknown[]) => void } | undefined,
  postId: string,
  metric: string
) => {
  const payload: any = { postId, metric };
  try {
    const post = await prisma.communityPost.findUnique({
      where: { id: postId },
      select: {
        likesCount: true,
        commentsCount: true,
        sharesCount: true,
        repostsCount: true,
        viewsCount: true
      }
    });
    if (post) {
      payload.interactions = {
        likes: Number(post.likesCount || 0),
        comments: Number(post.commentsCount || 0),
        shares: Number(post.sharesCount || 0),
        reposts: Number(post.repostsCount || 0),
        views: Number(post.viewsCount || 0)
      };
    }
  } catch (error) {
    console.warn('[community.emitPostMetricsUpdated] failed to resolve counts', error);
  }

  try {
    io?.emit('community:post_metrics_updated', payload);
  } catch (error) {
    console.error('Socket emit error (post_metrics_updated):', error);
  }
  try {
    realtime.emitToPost(postId, 'community:post_metrics_updated', payload);
  } catch (error) {}
};

const normalizeTag = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^[#]+/, '')
    .replace(/[^a-z0-9_]/g, '');

const extractHashtags = (value: unknown) => {
  const content = String(value || '');
  const matches = content.match(/(^|[^#\w])#([a-zA-Z0-9_]{2,40})/g) || [];
  const tags = matches
    .map((entry) => {
      const m = /#([a-zA-Z0-9_]{2,40})/.exec(entry);
      return normalizeTag(m?.[1] || '');
    })
    .filter(Boolean);
  return Array.from(new Set(tags));
};

const collectPostTags = (post: { tags?: string[] | null; content?: string | null }) => {
  const fromArray = Array.isArray(post.tags) ? post.tags.map((tag) => normalizeTag(tag)).filter(Boolean) : [];
  const fromContent = extractHashtags(post.content || '');
  return Array.from(new Set([...fromArray, ...fromContent]));
};

const MAX_PINNED_HIGHLIGHTED_POSTS = 3;

const isPrivilegedUser = (user?: { role?: string }) =>
  user?.role === 'ADMIN' || user?.role === 'MODERATOR';

const normalizeCommentPolicy = (value: unknown) => {
  if (value === undefined || value === null) return undefined;
  const policy = String(value).toLowerCase().trim();
  const allowed = new Set(['everyone', 'followers', 'following', 'mutuals', 'none']);
  if (!allowed.has(policy)) return null;
  return policy;
};

const hasUserBlockRelation = async (a: string | undefined, b: string | undefined) => {
  const first = String(a || '').trim();
  const second = String(b || '').trim();
  if (!first || !second || first === second) return false;
  const row = await prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: first, blockedId: second },
        { blockerId: second, blockedId: first }
      ]
    },
    select: { id: true }
  });
  return Boolean(row);
};

const getBlockedAuthorIdsForViewer = async (viewerId: string | undefined) => {
  const normalizedViewerId = String(viewerId || '').trim();
  if (!normalizedViewerId) return [] as string[];
  const blocks = await prisma.userBlock.findMany({
    where: {
      OR: [{ blockerId: normalizedViewerId }, { blockedId: normalizedViewerId }]
    },
    select: { blockerId: true, blockedId: true }
  });
  const excluded = new Set<string>();
  blocks.forEach((row) => {
    if (row.blockerId === normalizedViewerId && row.blockedId) excluded.add(row.blockedId);
    if (row.blockedId === normalizedViewerId && row.blockerId) excluded.add(row.blockerId);
  });
  return Array.from(excluded);
};

const filterMentionTargetsForActor = async (actorId: string, candidateUserIds: string[]) => {
  const actor = String(actorId || '').trim();
  const uniqueCandidates = Array.from(new Set((candidateUserIds || []).map((id) => String(id || '').trim()).filter(Boolean)));
  if (!actor || !uniqueCandidates.length) return [];
  const blocks = await prisma.userBlock.findMany({
    where: {
      OR: [
        { blockerId: actor, blockedId: { in: uniqueCandidates } },
        { blockedId: actor, blockerId: { in: uniqueCandidates } }
      ]
    },
    select: { blockerId: true, blockedId: true }
  });
  const blockedSet = new Set<string>();
  blocks.forEach((row) => {
    if (row.blockerId === actor && row.blockedId) blockedSet.add(row.blockedId);
    if (row.blockedId === actor && row.blockerId) blockedSet.add(row.blockerId);
  });
  return uniqueCandidates.filter((id) => !blockedSet.has(id));
};

const canUserCommentOnPost = async (
  post: { authorId: string; commentPolicy?: string | null },
  userId: string | undefined,
  userRole?: string
) => {
  if (!userId) return false;
  if (post.authorId === userId) return true;
  if (userRole === 'ADMIN' || userRole === 'MODERATOR') return true;
  if (await hasUserBlockRelation(post.authorId, userId)) return false;

  const policy = (post.commentPolicy || 'everyone').toLowerCase();
  if (policy === 'everyone') return true;
  if (policy === 'none') return false;

  const [isFollower, isFollowing] = await Promise.all([
    prisma.userFollow.findUnique({
      where: {
        followerId_followeeId: { followerId: userId, followeeId: post.authorId }
      }
    }),
    prisma.userFollow.findUnique({
      where: {
        followerId_followeeId: { followerId: post.authorId, followeeId: userId }
      }
    })
  ]);

  if (policy === 'followers') return !!isFollower;
  if (policy === 'following') return !!isFollowing;
  if (policy === 'mutuals') return !!isFollower && !!isFollowing;
  return true;
};

const parseCookieHeader = (cookieHeader?: string) => {
  const jar: Record<string, string> = {};
  if (!cookieHeader) return jar;
  cookieHeader.split(';').forEach((part) => {
    const [rawKey, ...rest] = part.trim().split('=');
    if (!rawKey) return;
    const key = rawKey.trim();
    if (!key) return;
    const value = rest.join('=').trim();
    try {
      jar[key] = decodeURIComponent(value);
    } catch {
      jar[key] = value;
    }
  });
  return jar;
};

const resolveOptionalUserFromRequest = async (req: Request): Promise<{ id: string; role?: string } | null> => {
  if (req.user?.id) {
    return { id: req.user.id, role: req.user.role };
  }

  let authHeader = req.headers.authorization as string | undefined;
  if (!authHeader) {
    const cookies = parseCookieHeader(req.headers.cookie as string | undefined);
    const cookieToken = cookies['Scrolith_token'] || cookies['token'];
    if (cookieToken) authHeader = `Bearer ${cookieToken}`;
  }

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.split(' ')[1];
  if (!token) return null;

  try {
    const secret = process.env.JWT_SECRET || 'dev_jwt_secret';
    const decoded = jwt.verify(token, secret) as { id?: string };
    const userId = String(decoded?.id || '').trim();
    if (!userId) return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isActive: true }
    });
    if (!user || user.isActive === false) return null;
    return { id: user.id, role: user.role };
  } catch {
    return null;
  }
};

const resolveBusinessAvatarUrl = (logoFileId?: string | null, displayName?: string | null) => {
  const raw = String(logoFileId || '').trim();
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('/')) {
    return raw;
  }
  if (raw.startsWith('disk:')) {
    return `/uploads/${raw.slice('disk:'.length).replace(/^\/+/, '')}`;
  }
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName || 'Business')}`;
};

const buildPostAuthorPayload = (author: {
  id: string;
  name: string | null;
  username?: string | null;
  avatar: string | null;
  isVerified?: boolean | null;
  freelancerPlanActive?: boolean | null;
  employerPlanActive?: boolean | null;
}, businessPage?: {
  id: string;
  name: string;
  handle: string;
  slug: string;
  logoFileId: string | null;
} | null) => {
  if (businessPage) {
    return {
      id: businessPage.id,
      username: businessPage.handle || businessPage.slug || '',
      displayName: businessPage.name || 'Business page',
      avatarUrl: resolveBusinessAvatarUrl(businessPage.logoFileId, businessPage.name),
      type: 'business' as const,
      businessSlug: businessPage.slug || null,
      isVerified: false,
      isPro: false
    };
  }

  const displayName = author.name || 'Community member';
  return {
    id: author.id,
    username: author.username || null,
    displayName,
    avatarUrl: author.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}`,
    type: 'user' as const,
    businessSlug: null,
    isVerified: Boolean(author.isVerified),
    isPro: Boolean(author.freelancerPlanActive || author.employerPlanActive)
  };
};

const resolvePostAuthorIdentity = (
  post: { authorId: string; businessPageId?: string | null },
  author: { id: string; type: 'user' | 'business' }
) => {
  const isBusinessAuthor = author.type === 'business' && Boolean(post.businessPageId);
  return {
    authorId: isBusinessAuthor ? author.id : post.authorId,
    authorUserId: post.authorId
  };
};

const resolveFollowLookupForPosts = async (
  posts: Array<{ authorId: string; businessPageId?: string | null }>,
  viewerId?: string
) => {
  const followingUserIds = new Set<string>();
  const followingPageIds = new Set<string>();

  if (!viewerId || !posts.length) {
    return { followingUserIds, followingPageIds };
  }

  const userAuthorIds = Array.from(
    new Set(posts.filter((post) => !post.businessPageId).map((post) => post.authorId).filter(Boolean))
  );
  const businessPageIds = Array.from(
    new Set(posts.map((post) => String(post.businessPageId || '').trim()).filter(Boolean))
  );

  const [userFollows, pageFollows] = await Promise.all([
    userAuthorIds.length
      ? prisma.userFollow.findMany({
          where: { followerId: viewerId, followeeId: { in: userAuthorIds } },
          select: { followeeId: true }
        })
      : Promise.resolve([]),
    businessPageIds.length
      ? prisma.communityBusinessPageFollower.findMany({
          where: { userId: viewerId, pageId: { in: businessPageIds } },
          select: { pageId: true }
        })
      : Promise.resolve([])
  ]);

  userFollows.forEach((entry) => followingUserIds.add(entry.followeeId));
  pageFollows.forEach((entry) => followingPageIds.add(entry.pageId));

  return { followingUserIds, followingPageIds };
};

// Get all threads
export const getThreads = async (req: Request, res: Response) => {
  try {
    const { category, limit = 50, offset = 0 } = req.query;

    const where: any = {
      status: { not: 'LOCKED' } // Don't show locked threads by default unless admin
    };

    if (category) {
      const categoryRecord = await prisma.category.findFirst({
        where: { slug: category as string }
      });
      if (categoryRecord) {
        where.categoryId = categoryRecord.id;
      }
    }

    const threads = await prisma.forumThread.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true
          }
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        _count: {
          select: {
            comments: true,
            likes: true
          }
        }
      },
      orderBy: [
        { isPinned: 'desc' },
        { createdAt: 'desc' }
      ],
      take: Number(limit),
      skip: Number(offset)
    });

    // Transform to match frontend types
    const transformed = threads.map(thread => ({
      id: thread.id,
      categoryId: thread.categoryId || '',
      categoryName: thread.category?.name || 'General',
      userId: thread.userId,
      userName: thread.user.name || 'Anonymous',
      userAvatar: thread.user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(thread.user.name || 'User')}`,
      title: thread.title,
      content: thread.content,
      status: thread.status.toLowerCase(),
      views: thread.views,
      repliesCount: thread._count.comments,
      upvotes: thread._count.likes,
      isPinned: thread.isPinned,
      isLocked: thread.isLocked,
      createdAt: thread.createdAt.toISOString(),
      tags: thread.tags,
      interactions: {
        likes: thread._count.likes,
        comments: thread._count.comments,
        reposts: 0,
        shares: 0
      },
      userState: {
        liked: false, // Will be set if user is authenticated
        reposted: false
      }
    }));

    return res.json(transformed);
  } catch (error: any) {
    console.error('Get threads error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Get thread by ID
export const getThreadById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const thread = await prisma.forumThread.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true
          }
        },
        category: {
          select: {
            id: true,
            name: true,
            slug: true
          }
        },
        _count: {
          select: {
            comments: true,
            likes: true
          }
        }
      }
    });
    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    // Check if user liked this thread
    let isLiked = false;
    if (req.user?.id) {
      const like = await prisma.forumLike.findFirst({
        where: {
          userId: req.user.id,
          threadId: id,
          commentId: null
        }
      });
      isLiked = !!like;
    }

    // Transform to match frontend types
    const transformed = {
      id: thread.id,
      categoryId: thread.categoryId || '',
      categoryName: thread.category?.name || 'General',
      userId: thread.userId,
      userName: thread.user.name || 'Anonymous',
      userAvatar: thread.user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(thread.user.name || 'User')}`,
      title: thread.title,
      content: thread.content,
      status: thread.status.toLowerCase(),
      views: thread.views,
      repliesCount: thread._count.comments,
      upvotes: thread._count.likes,
      isPinned: thread.isPinned,
      isLocked: thread.isLocked,
      createdAt: thread.createdAt.toISOString(),
      tags: thread.tags,
      interactions: {
        likes: thread._count.likes,
        comments: thread._count.comments,
        reposts: 0,
        shares: 0
      },
      userState: {
        liked: isLiked,
        reposted: false
      }
    };

    return res.json(transformed);
  } catch (error: any) {
    console.error('Get thread by ID error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Create thread
export const createThread = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { title, content, categoryId, tags } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const thread = await prisma.forumThread.create({
      data: {
        userId,
        title,
        content,
        categoryId: categoryId || null,
        tags: tags || [],
        status: 'OPEN'
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true
          }
        },
        category: {
          select: {
            id: true,
            name: true
          }
        }
      }
    });

    const io = getAppIo(req);

    const payload = {
      id: thread.id,
      categoryId: thread.categoryId || '',
      categoryName: thread.category?.name || 'General',
      userId: thread.userId,
      userName: thread.user.name || 'Anonymous',
      userAvatar: thread.user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(thread.user.name || 'User')}`,
      title: thread.title,
      content: thread.content,
      status: thread.status.toLowerCase(),
      views: 0,
      repliesCount: 0,
      upvotes: 0,
      isPinned: false,
      isLocked: false,
      createdAt: thread.createdAt.toISOString(),
      tags: thread.tags,
      interactions: {
        likes: 0,
        comments: 0,
        reposts: 0,
        shares: 0
      },
      userState: {
        liked: false,
        reposted: false
      }
    };

    try {
      io?.emit('community:thread_created', { thread: payload });
    } catch (e) {
      console.error('Socket emit error (thread_created):', e);
    }
    try { realtime.emitToUser(payload.userId, 'community:thread_created', { thread: payload }); } catch(e) {}

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('Create thread error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Get comments for a thread
export const getComments = async (req: Request, res: Response) => {
  try {
    const { threadId } = req.query;

    if (!threadId) {
      return res.status(400).json({ error: 'threadId is required' });
    }

    const comments = await prisma.forumComment.findMany({
      where: { threadId: threadId as string },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true
          }
        },
        _count: {
          select: {
            replies: true,
            commentLikes: true
          }
        }
      },
      orderBy: { createdAt: 'asc' }
    });

    // Check which comments user liked
    const userId = req.user?.id;
    const likedCommentIds = userId ? await prisma.forumLike.findMany({
      where: {
        userId,
        commentId: { in: comments.map(c => c.id) }
      },
      select: { commentId: true }
    }).then(likes => new Set(likes.map(l => l.commentId).filter(Boolean))) : new Set();

    // Transform and build reply tree
    const commentMap = new Map();
    const rootComments: any[] = [];

    comments.forEach(comment => {
      const transformed = {
        id: comment.id,
        thread_id: comment.threadId,
        threadId: comment.threadId,
        parent_id: comment.parentId,
        parentId: comment.parentId,
        user_id: comment.userId,
        userId: comment.userId,
        user_name: comment.user.name || 'Anonymous',
        userName: comment.user.name || 'Anonymous',
        user_avatar: comment.user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.user.name || 'User')}`,
        userAvatar: comment.user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.user.name || 'User')}`,
        user_role: comment.user.role,
        userRole: comment.user.role,
        content: comment.content,
        created_at: comment.createdAt.toISOString(),
        createdAt: comment.createdAt.toISOString(),
        likes: comment._count.commentLikes,
        is_liked: likedCommentIds.has(comment.id),
        isLiked: likedCommentIds.has(comment.id),
        replies: []
      };

      commentMap.set(comment.id, transformed);

      if (!comment.parentId) {
        rootComments.push(transformed);
      } else {
        const parent = commentMap.get(comment.parentId);
        if (parent) {
          parent.replies.push(transformed);
        }
      }
    });

    return res.json(rootComments);
  } catch (error: any) {
    console.error('Get comments error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Post comment
export const postComment = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { threadId, content, parentId } = req.body;

    if (!threadId || !content) {
      return res.status(400).json({ error: 'threadId and content are required' });
    }

    // Verify thread exists
    const thread = await prisma.forumThread.findUnique({
      where: { id: threadId }
    });

    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    if (thread.isLocked) {
      return res.status(403).json({ error: 'Thread is locked' });
    }

    const comment = await prisma.forumComment.create({
      data: {
        threadId,
        userId,
        content,
        parentId: parentId || null
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true
          }
        }
      }
    });

    const io = getAppIo(req);

    const payload = {
      id: comment.id,
      thread_id: comment.threadId,
      threadId: comment.threadId,
      parent_id: comment.parentId,
      parentId: comment.parentId,
      user_id: comment.userId,
      userId: comment.userId,
      user_name: comment.user.name || 'Anonymous',
      userName: comment.user.name || 'Anonymous',
      user_avatar: comment.user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.user.name || 'User')}`,
      userAvatar: comment.user.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(comment.user.name || 'User')}`,
      user_role: comment.user.role,
      userRole: comment.user.role,
      content: comment.content,
      created_at: comment.createdAt.toISOString(),
      createdAt: comment.createdAt.toISOString(),
      likes: 0,
      is_liked: false,
      isLiked: false,
      replies: []
    };

    try {
      io?.emit('community:comment_created', { comment: payload });
    } catch (e) {
      console.error('Socket emit error (comment_created):', e);
    }
    try { realtime.emitToUser(payload.userId, 'community:comment_created', { comment: payload }); } catch(e) {}
    try { realtime.emitToPost(payload.threadId, 'community:comment_created', { comment: payload }); } catch(e) {}

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('Post comment error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Toggle like
export const toggleLike = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id, type } = req.body;

    if (type === 'thread') {
      // Find existing like
      const existing = await prisma.forumLike.findFirst({
        where: {
          userId,
          threadId: id,
          commentId: null
        }
      });

      if (existing) {
        await prisma.forumLike.delete({ where: { id: existing.id } });
        const io = getAppIo(req);
        try { io?.emit('community:like_toggled', { id, type: 'thread', userId, liked: false }); } catch (e) { console.error('Socket emit error (like_toggled):', e); }
        try { realtime.emitToUser(userId, 'community:like_toggled', { id, type: 'thread', userId, liked: false }); } catch (e) {}
        return res.json({ success: true, data: { liked: false } });
      } else {
        await prisma.forumLike.create({ data: { userId, threadId: id } });
        const io = getAppIo(req);
        try { io?.emit('community:like_toggled', { id, type: 'thread', userId, liked: true }); } catch (e) { console.error('Socket emit error (like_toggled):', e); }
        try { realtime.emitToUser(userId, 'community:like_toggled', { id, type: 'thread', userId, liked: true }); } catch (e) {}
        return res.json({ success: true, data: { liked: true } });
      }
    } else if (type === 'comment') {
      // Find existing like
      const existing = await prisma.forumLike.findFirst({
        where: {
          userId,
          commentId: id,
          threadId: null
        }
      });

      if (existing) {
        await prisma.forumLike.delete({ where: { id: existing.id } });
        const io = getAppIo(req);
        try { io?.emit('community:like_toggled', { id, type: 'comment', userId, liked: false }); } catch (e) { console.error('Socket emit error (like_toggled):', e); }
        try { realtime.emitToUser(userId, 'community:like_toggled', { id, type: 'comment', userId, liked: false }); } catch (e) {}
        return res.json({ success: true, data: { liked: false } });
      } else {
        await prisma.forumLike.create({ data: { userId, commentId: id } });
        const io = (req.app as any).get('io');
        try { io?.emit('community:like_toggled', { id, type: 'comment', userId, liked: true }); } catch (e) { console.error('Socket emit error (like_toggled):', e); }
        try { realtime.emitToUser(userId, 'community:like_toggled', { id, type: 'comment', userId, liked: true }); } catch (e) {}
        return res.json({ success: true, data: { liked: true } });
      }
    }

    return res.status(400).json({ error: 'Invalid type' });
  } catch (error: any) {
    console.error('Toggle like error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Toggle thread pin (admin/moderator only)
export const toggleThreadPin = async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'MODERATOR') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { id } = req.params;
    const { isPinned } = req.body;

    const thread = await prisma.forumThread.update({
      where: { id },
      data: { isPinned: isPinned !== undefined ? isPinned : true }
    });

    try {
      const io = getAppIo(req);
      io?.emit('community:thread_pinned', { id, isPinned: thread.isPinned });
    } catch (e) {
      console.error('Socket emit error (thread_pinned):', e);
    }

    return res.json({ success: true, data: { isPinned: thread.isPinned } });
  } catch (error: any) {
    console.error('Toggle thread pin error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Toggle thread lock (admin/moderator only)
export const toggleThreadLock = async (req: Request, res: Response) => {
  try {
    if (req.user?.role !== 'ADMIN' && req.user?.role !== 'MODERATOR') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { id } = req.params;
    const { isLocked } = req.body;

    const thread = await prisma.forumThread.update({
      where: { id },
      data: { 
        isLocked: isLocked !== undefined ? isLocked : true,
        status: isLocked !== undefined && isLocked ? 'LOCKED' : 'OPEN'
      }
    });

    try {
      const io = getAppIo(req);
      io?.emit('community:thread_locked', { id, isLocked: thread.isLocked, status: thread.status });
    } catch (e) {
      console.error('Socket emit error (thread_locked):', e);
    }

    return res.json({ success: true, data: { isLocked: thread.isLocked } });
  } catch (error: any) {
    console.error('Toggle thread lock error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Delete thread (admin/moderator or owner)
export const deleteThread = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    const thread = await prisma.forumThread.findUnique({
      where: { id }
    });

    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    // Check permissions
    if (thread.userId !== userId && req.user?.role !== 'ADMIN' && req.user?.role !== 'MODERATOR') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await prisma.forumThread.delete({ where: { id } });

    try {
      const io = getAppIo(req);
      io?.emit('community:thread_deleted', { id });
    } catch (e) {
      console.error('Socket emit error (thread_deleted):', e);
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error('Delete thread error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Delete comment (admin/moderator or owner)
export const deleteComment = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    const comment = await prisma.forumComment.findUnique({
      where: { id }
    });

    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' });
    }

    // Check permissions
    if (comment.userId !== userId && req.user?.role !== 'ADMIN' && req.user?.role !== 'MODERATOR') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await prisma.forumComment.delete({ where: { id } });

    try {
      const io = getAppIo(req);
      io?.emit('community:comment_deleted', { id });
    } catch (e) {
      console.error('Socket emit error (comment_deleted):', e);
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error('Delete comment error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// ------- Post metric endpoints & earning engine -------
// Default earning rule fallbacks
const DEFAULT_RULES = {
  viewsUnit: 10000,
  likesUnit: 100,
  repostsUnit: 50,
  sharesUnit: 200,
  coinPerViewsUnit: 1,
  coinPerLikesUnit: 1,
  coinPerRepostsUnit: 1,
  coinPerSharesUnit: 1,
  adminFeePercent: 0.10
};

const dayKey = (d = new Date()) => d.toISOString().slice(0,10);

const buildEventKey = (postId: string, eventType: string, actorId?: string, sessionHash?: string) => {
  const actorPart = actorId || (sessionHash ? `s:${sessionHash}` : 'anon');
  return `${postId}:${eventType}:${actorPart}:${dayKey()}`;
};

const getAdminRevenueUserId = async () => {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  return admin ? admin.id : null;
};

const tryCreateEarningEvent = async (data: { postId:string, actorId?:string, eventType:string, eventKey:string }) => {
  try {
    const ev = await prisma.gcoinEarningEvent.create({ data: {
      postId: data.postId,
      actorId: data.actorId || null,
      eventType: data.eventType,
      eventKey: data.eventKey,
      value: 0,
      credited: false
    }});
    // Actor velocity check (per-minute) to catch bots/spammy activity
    try {
      if (data.actorId) {
        const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
        const recentCount = await prisma.gcoinEarningEvent.count({ where: { actorId: data.actorId, createdAt: { gt: oneMinuteAgo } } });
        // thresholds (tunable)
        const thresholds: any = { view: 200, like: 30, share: 50, repost: 40 };
        const limit = thresholds[data.eventType] ?? 100;
        if (recentCount > limit) {
          // rate limited actor — increment fraud score on wallet for later admin review
          try {
            await prisma.gcoinWallet.updateMany({ where: { userId: data.actorId }, data: { fraudScore: { increment: 1 } } as any });
          } catch(e) {
            console.error('Wallet fraud increment error:', e);
          }
          // notify actor about temporary rate limit
          try {
            await prisma.notification.create({ data: {
              userId: data.actorId,
              actorId: null,
              type: 'gcoin_rate_limited',
              title: 'Action rate limited',
              body: `Your recent activity was temporarily rate limited for anti-fraud checks.`,
              meta: { postId: data.postId, eventType: data.eventType, recentCount }
            }});
          } catch(e) {
            // don't block
          }
          console.warn('Actor velocity detected', data.actorId, recentCount);
          return { created: false, error: new Error('rate_limited') };
        }
      }
    } catch (err) {
      console.error('Fraud check error:', err);
    }

    return { created: true, event: ev };
  } catch (err: any) {
    // Unique constraint => duplicate event (idempotent)
    return { created: false, error: err };
  }
};

const processThresholds = async (postId: string, io: any) => {
  // Fetch post counts
  const post = await prisma.communityPost.findUnique({ where: { id: postId } });
  if (!post) return;

  // Read admin-configurable rules from GcoinSettings or fallback
  const s = await getGcoinSettingsSafe();
  const ss: any = s;
  const rules = ss ? {
    viewsUnit: ss.viewsUnit ?? DEFAULT_RULES.viewsUnit,
    likesUnit: ss.likesUnit ?? DEFAULT_RULES.likesUnit,
    repostsUnit: ss.repostsUnit ?? DEFAULT_RULES.repostsUnit,
    sharesUnit: ss.sharesUnit ?? DEFAULT_RULES.sharesUnit,
    coinPerViewsUnit: ss.coinPerViewsUnit ?? DEFAULT_RULES.coinPerViewsUnit,
    coinPerLikesUnit: ss.coinPerLikesUnit ?? DEFAULT_RULES.coinPerLikesUnit,
    coinPerRepostsUnit: ss.coinPerRepostsUnit ?? DEFAULT_RULES.coinPerRepostsUnit,
    coinPerSharesUnit: ss.coinPerSharesUnit ?? DEFAULT_RULES.coinPerSharesUnit,
    adminFeePercent: ss.adminFeePercent ?? DEFAULT_RULES.adminFeePercent
  } : DEFAULT_RULES;

  // For each metric compute awardable coins
  const checks: Array<{type:string, count:number, unit:number, coinPerUnit:number}> = [
    { type: 'view', count: post.viewsCount, unit: rules.viewsUnit, coinPerUnit: rules.coinPerViewsUnit },
    { type: 'like', count: post.likesCount, unit: rules.likesUnit, coinPerUnit: rules.coinPerLikesUnit },
    { type: 'repost', count: post.repostsCount, unit: rules.repostsUnit, coinPerUnit: rules.coinPerRepostsUnit },
    { type: 'share', count: post.sharesCount, unit: rules.sharesUnit, coinPerUnit: rules.coinPerSharesUnit }
  ];

  for (const chk of checks) {
    if (!chk.unit || chk.unit <= 0) continue;
    const alreadyAwarded = await prisma.gcoinEarningEvent.count({ where: { postId, eventType: `${chk.type}_award`, credited: true } });
    const awardableUnits = Math.floor(chk.count / chk.unit) - alreadyAwarded;
    if (awardableUnits > 0) {
      const totalCoins = awardableUnits * chk.coinPerUnit;
      const adminShare = Number((totalCoins * rules.adminFeePercent).toFixed(8));
      const creatorShare = Number((totalCoins - adminShare).toFixed(8));

      // determine post author
      const author = await prisma.user.findUnique({ where: { id: post.authorId } });
      if (!author) continue;

      // determine admin revenue user
      const adminUserId = await getAdminRevenueUserId();

      // FRAUD CHECK: spike detection for the post (events burst)
      let postSuspicious = false;
      try {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const recentPostEvents = await prisma.gcoinEarningEvent.count({ where: { postId, createdAt: { gt: tenMinutesAgo } } });
        // if more than X events in last 10 minutes, mark suspicious
        if (recentPostEvents > 500) postSuspicious = true;
      } catch (err) {
        console.error('Post spike check error:', err);
      }

      if (postSuspicious) {
        // Create pending award events (not credited) and notify admins for manual review
        await prisma.$transaction(async (tx) => {
          await tx.gcoinEarningEvent.create({ data: { postId, actorId: null, eventType: `${chk.type}_award_pending`, eventKey: `${postId}:${chk.type}:pending:${Date.now()}`, value: totalCoins, credited: false } });
          await tx.notification.create({ data: {
            userId: (await tx.user.findFirst({ where: { role: 'ADMIN' } }))?.id || '',
            actorId: null,
            type: 'gcoin_pending_award',
            title: 'Pending Gcoin award for review',
            body: `Post ${postId} has ${awardableUnits} ${chk.type} unit(s) pending award totaling ${totalCoins} Gcoin due to suspicious activity.`,
            meta: { postId, metric: chk.type, awardableUnits, totalCoins }
          }});
        });
        try { io?.emit('community:gcoin_award_pending', { postId, metric: chk.type, awardableUnits, totalCoins }); } catch(e){}
        try { realtime.emitToPost(postId, 'community:gcoin_award_pending', { postId, metric: chk.type, awardableUnits, totalCoins }); } catch(e){}
        continue;
      }

      await prisma.$transaction(async (tx) => {
        // credit creator wallet
        const authorWallet = await tx.gcoinWallet.findUnique({ where: { userId: author.id } });
        if (!authorWallet) {
          await tx.gcoinWallet.create({ data: { userId: author.id, recipientId: `GC-${Date.now().toString().slice(-8)}` } });
        }
        if (creatorShare > 0) {
          await tx.gcoinWallet.update({ where: { userId: author.id }, data: { balance: { increment: creatorShare }, lifetimeEarned: { increment: creatorShare } } });
          await tx.gcoinTransaction.create({ data: { userId: author.id, amount: creatorShare, type: 'reward', source: 'earning_engine', reason: `${chk.type}_threshold_award`, status: 'completed' } });
        }

        // credit admin revenue wallet if present
        if (adminUserId && adminShare > 0) {
          const adminWallet = await tx.gcoinWallet.findUnique({ where: { userId: adminUserId } });
          if (!adminWallet) {
            await tx.gcoinWallet.create({ data: { userId: adminUserId, recipientId: `GC-${Date.now().toString().slice(-6)}` } });
          }
          await tx.gcoinWallet.update({ where: { userId: adminUserId }, data: { balance: { increment: adminShare } } });
          await tx.gcoinTransaction.create({ data: { userId: adminUserId, amount: adminShare, type: 'admin_fee', source: 'earning_engine', reason: `${chk.type}_threshold_fee`, status: 'completed' } });
        }

        // create a credited earning event record for this award
        await tx.gcoinEarningEvent.create({ data: { postId, actorId: null, eventType: `${chk.type}_award`, eventKey: `${postId}:${chk.type}:award:${Date.now()}`, value: totalCoins, credited: true } });

        // Mirror the gcoin movements into the generic ledger for accounting and reporting
        await tx.transaction.create({ data: {
          userId: post.authorId,
          amount: creatorShare,
          type: 'DEPOSIT',
          status: 'COMPLETED',
          description: `${chk.type} threshold reward for post ${postId}`,
          metadata: { community: true, subtype: 'GCOIN_EARN', postId, metric: chk.type, units: awardableUnits }
        } });
        if (adminUserId && adminShare > 0) {
          await tx.transaction.create({ data: {
            userId: adminUserId,
            amount: adminShare,
            type: 'FEE',
            status: 'COMPLETED',
            description: `Admin fee for ${chk.type} reward on post ${postId}`,
            metadata: { community: true, subtype: 'GCOIN_FEE', postId, metric: chk.type }
          } });
        }
      });

      try {
        io?.emit('community:gcoin_earned', { postId, authorId: post.authorId, metric: chk.type, totalCoins, creatorShare, adminShare });
      } catch(e) { console.error('Socket emit error (gcoin_earned):', e); }
      try { realtime.emitToPost(postId, 'community:gcoin_earned', { postId, authorId: post.authorId, metric: chk.type, totalCoins, creatorShare, adminShare }); } catch(e) {}
    }
  }
};

export const postView = async (req: Request, res: Response) => {
  try {
    const postId = req.params.id;
    const actorId = req.user?.id;
    const io = getAppIo(req);
    const sessionHash = req.body?.sessionHash || req.header('X-Session-Hash') || undefined;
    const eventKey = buildEventKey(postId, 'view', actorId, sessionHash);

    const created = await tryCreateEarningEvent({ postId, actorId, eventType: 'view', eventKey });
    if (!created.created) return res.json({ success: true, duplicate: true });

    // increment view count
    await prisma.communityPost.update({ where: { id: postId }, data: { viewsCount: { increment: 1 } as any } as any });

    await emitPostMetricsUpdated(io, postId, 'view');

    // process thresholds asynchronously but don't block response
    processThresholds(postId, io).catch(e => console.error('Threshold processing error:', e));

    return res.json({ success: true });
  } catch (error: any) {
    console.error('postView error:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const postShare = async (req: Request, res: Response) => {
  try {
    const postId = req.params.id;
    const actorId = req.user?.id;
    const io = getAppIo(req);
    const platform = req.body?.platform || 'external';
    const sessionHash = req.body?.sessionHash || req.header('X-Session-Hash') || undefined;
    const eventKey = buildEventKey(postId, 'share', actorId, sessionHash) + `:${platform}`;

    const created = await tryCreateEarningEvent({ postId, actorId, eventType: 'share', eventKey });
    if (!created.created) return res.json({ success: true, duplicate: true });

    await prisma.communityPost.update({ where: { id: postId }, data: { sharesCount: { increment: 1 } as any } as any });

    await emitPostMetricsUpdated(io, postId, 'share');

    processThresholds(postId, io).catch(e => console.error('Threshold processing error:', e));

    return res.json({ success: true });
  } catch (error: any) {
    console.error('postShare error:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const postRepost = async (req: Request, res: Response) => {
  try {
    const postId = req.params.id;
    const actorId = req.user?.id;
    const io = getAppIo(req);
    const sessionHash = req.body?.sessionHash || req.header('X-Session-Hash') || undefined;
    const originalPost = await prisma.communityPost.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true, title: true, content: true, status: true }
    });
    if (!originalPost || originalPost.status === 'deleted') {
      return res.status(404).json({ error: 'Post not found' });
    }
    if (actorId && await hasUserBlockRelation(actorId, originalPost.authorId)) {
      return res.status(403).json({ error: 'Interaction is not allowed for this post' });
    }
    const eventKey = buildEventKey(postId, 'repost', actorId, sessionHash);

    const created = await tryCreateEarningEvent({ postId, actorId, eventType: 'repost', eventKey });
    if (!created.created) return res.json({ success: true, duplicate: true });

    await prisma.communityPost.update({ where: { id: postId }, data: { repostsCount: { increment: 1 } as any } as any });

    await emitPostMetricsUpdated(io, postId, 'repost');

    let wrapperPost: any = null;
    if (actorId && req.body?.createWrapper !== false) {
      try {
        const wrapperAttachmentIds = await resolveValidatedAttachmentIds(
          [req.body?.attachmentFileIds, req.body?.attachments],
          { userId: actorId, role: req.user?.role }
        );
        wrapperPost = await prisma.communityPost.create({
          data: {
            authorId: actorId,
            content: String(req.body?.content || '').trim() || '',
            title: req.body?.title || null,
            attachments: wrapperAttachmentIds,
            visibility: req.body?.visibility || 'public',
            originalPostId: postId,
            status: 'active'
          }
        });
        try { await syncFileUsages('community_post', wrapperPost.id, wrapperAttachmentIds, 'Community Post Media'); } catch (e) {}
        const wrapperPayload = {
          ...wrapperPost,
          attachmentFileIds: wrapperAttachmentIds,
          attachments: await resolveAttachments(wrapperAttachmentIds)
        };
        try { io?.emit('community:post_created', { post: wrapperPayload }); } catch (e) {}
        try { realtime.emitToPost(wrapperPost.id, 'community:post_created', { post: wrapperPayload }); } catch (e) {}
        wrapperPost = wrapperPayload;
      } catch (e) {
        console.warn('Failed to create repost wrapper', e);
      }
    }

    processThresholds(postId, io).catch(e => console.error('Threshold processing error:', e));

    if (actorId && originalPost.authorId !== actorId) {
      try {
        const actor = await prisma.user.findUnique({
          where: { id: actorId },
          select: { id: true, name: true, username: true }
        });
        const actorName = actor?.name || actor?.username || 'Someone';
        await createEngagementNotification({
          recipientId: originalPost.authorId,
          actorId,
          type: 'repost',
          title: 'Reposted',
          message: `${actorName} reposted your post.`,
          actionUrl: `/community/posts/${postId}`,
          metadata: {
            postId,
            actorId,
            postAuthorId: originalPost.authorId
          },
          dedupeWindowMinutes: 60,
          dedupeMetaKeys: ['postId', 'actorId']
        });
      } catch (notifyError) {
        console.warn('[community.postRepost] notification failed', notifyError);
      }
    }

    return res.json({ success: true, data: { repostPost: wrapperPost } });
  } catch (error: any) {
    console.error('postRepost error:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const postLike = async (req: Request, res: Response) => {
  try {
    const postId = req.params.id;
    const actorId = req.user?.id;
    const io = getAppIo(req);
    if (!actorId) return res.status(401).json({ error: 'Unauthorized' });
    const post = await prisma.communityPost.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true, status: true }
    });
    if (!post || post.status === 'deleted') return res.status(404).json({ error: 'Post not found' });
    if (await hasUserBlockRelation(actorId, post.authorId)) {
      return res.status(403).json({ error: 'Interaction is not allowed for this post' });
    }

    const eventKey = buildEventKey(postId, 'like', actorId);
    // Prevent double-like via unique eventKey
    const created = await tryCreateEarningEvent({ postId, actorId, eventType: 'like', eventKey });
    if (!created.created) return res.json({ success: true, duplicate: true });

    await prisma.communityPost.update({ where: { id: postId }, data: { likesCount: { increment: 1 } as any } as any });

    await emitPostMetricsUpdated(io, postId, 'like');

    processThresholds(postId, io).catch(e => console.error('Threshold processing error:', e));

    return res.json({ success: true });
  } catch (error: any) {
    console.error('postLike error:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const postUnlike = async (req: Request, res: Response) => {
  try {
    const postId = req.params.id;
    const actorId = req.user?.id;
    const io = getAppIo(req);
    if (!actorId) return res.status(401).json({ error: 'Unauthorized' });

    // Remove the actor-specific like event if exists
    const keyPrefix = `${postId}:like:${actorId}:${dayKey()}`;
    const ev = await prisma.gcoinEarningEvent.findFirst({ where: { eventKey: { startsWith: keyPrefix } } });
    if (ev) {
      await prisma.gcoinEarningEvent.delete({ where: { id: ev.id } });
      await prisma.communityPost.update({ where: { id: postId }, data: { likesCount: { decrement: 1 } as any } as any });
    }

    await emitPostMetricsUpdated(io, postId, 'unlike');

    return res.json({ success: true });
  } catch (error: any) {
    console.error('postUnlike error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// ========== CommunityPost CRUD Endpoints ==========

// Get all community posts (feed)
export const getPosts = async (req: Request, res: Response) => {
  try {
    const {
      limit = 50,
      offset = 0,
      status = 'active',
      businessPageId: businessPageIdRaw,
      businessPageSlug: businessPageSlugRaw
    } = req.query as any;
    const viewer = await resolveOptionalUserFromRequest(req);
    const userId = viewer?.id;
    const blockedAuthorIds = await getBlockedAuthorIdsForViewer(userId);

    const where: any = {
      status: status as string
    };

    const businessPageId = String(businessPageIdRaw || '').trim();
    const businessPageSlug = String(businessPageSlugRaw || '').trim().toLowerCase();
    if (businessPageId) {
      where.businessPageId = businessPageId;
    } else if (businessPageSlug) {
      const page = await prisma.communityBusinessPage.findFirst({
        where: { slug: businessPageSlug },
        select: { id: true, status: true }
      });
      if (!page || String(page.status || '').toLowerCase() !== 'active') {
        return res.json({ success: true, data: [] });
      }
      where.businessPageId = page.id;
    }

    if (blockedAuthorIds.length) {
      where.authorId = { notIn: blockedAuthorIds };
    }

    const posts = await prisma.communityPost.findMany({
      where,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
            username: true,
            isVerified: true,
            freelancerPlanActive: true,
            employerPlanActive: true
          }
        },
        businessPage: {
          select: {
            id: true,
            name: true,
            handle: true,
            slug: true,
            logoFileId: true
          }
        },
        originalPost: {
          select: {
            id: true,
            author: {
              select: {
                name: true,
                username: true
              }
            }
          }
        }
      },
      orderBy: [
        { isPinned: 'desc' },
        { createdAt: 'desc' }
      ],
      take: Number(limit),
      skip: Number(offset)
    });

    const postIds = posts.map((p) => p.id);
    const [reactionRows, commentRows, userReactions] = await Promise.all([
      prisma.communityPostReaction.groupBy({
        by: ['postId', 'type'],
        where: { postId: { in: postIds } },
        _count: { _all: true }
      }),
      prisma.communityPostComment.groupBy({
        by: ['postId'],
        where: { postId: { in: postIds }, status: 'active' },
        _count: { _all: true }
      }),
      userId
        ? prisma.communityPostReaction.findMany({ where: { postId: { in: postIds }, userId } })
        : Promise.resolve([])
    ]);

    const reactionMap = buildReactionSummary(reactionRows);
    const commentMap = buildCommentCounts(commentRows);
    const userReactionMap = new Map(userReactions.map((r) => [r.postId, r.type]));
    const { followingUserIds, followingPageIds } = await resolveFollowLookupForPosts(posts, userId);

    // Check which posts user liked (if authenticated)
    let likedPostIds = new Set<string>();
    if (userId) {
      const likes = await prisma.gcoinEarningEvent.findMany({
        where: {
          actorId: userId,
          eventType: 'like',
          postId: { in: posts.map(p => p.id) }
        },
        select: { postId: true }
      });
      likedPostIds = new Set(likes.map(l => l.postId));
    }

    const transformed = await Promise.all(posts.map(async (post) => {
      const author = buildPostAuthorPayload(post.author as any, post.businessPage as any);
      const authorIdentity = resolvePostAuthorIdentity(
        { authorId: post.authorId, businessPageId: post.businessPageId },
        author
      );
      const isFollowingAuthor = author.type === 'business'
        ? followingPageIds.has(String(post.businessPageId || ''))
        : followingUserIds.has(post.authorId);

      return {
        id: post.id,
        authorId: authorIdentity.authorId,
        authorUserId: authorIdentity.authorUserId,
        authorName: author.displayName,
        authorUsername: author.username,
        authorAvatar: author.avatarUrl,
        author: {
          id: author.id,
          username: author.username,
          displayName: author.displayName,
          avatarUrl: author.avatarUrl,
          type: author.type,
          businessSlug: author.businessSlug,
          isVerified: author.isVerified,
          isPro: author.isPro
        },
        viewer: {
          isFollowingAuthor
        },
        title: post.title,
        content: post.content,
        attachmentFileIds: post.attachments || [],
        attachments: await resolveAttachments(post.attachments || []),
        tags: post.tags || [],
        mentions: post.mentions || [],
        topic: post.topic || null,
        location: post.location || null,
        visibility: post.visibility || 'public',
        commentPolicy: post.commentPolicy || 'everyone',
        businessPage: post.businessPage ? {
          id: post.businessPage.id,
          name: post.businessPage.name,
          handle: post.businessPage.handle,
          slug: post.businessPage.slug,
          logoFileId: post.businessPage.logoFileId || null
        } : null,
        viewsCount: post.viewsCount,
        likesCount: post.likesCount,
        sharesCount: post.sharesCount,
        repostsCount: post.repostsCount,
        status: post.status,
        isPinned: post.isPinned,
        isHighlighted: post.isHighlighted,
        originalPostId: post.originalPostId || null,
        originalPost: post.originalPost
          ? {
              id: post.originalPost.id,
              authorName: post.originalPost.author?.name || post.originalPost.author?.username || 'Unknown'
            }
          : null,
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
        interactions: {
          views: post.viewsCount,
          likes: post.likesCount,
          shares: post.sharesCount,
          reposts: post.repostsCount,
          comments: commentMap.get(post.id) || 0,
          reactions: reactionMap.get(post.id) || {}
        },
        userState: {
          liked: likedPostIds.has(post.id),
          reposted: false,
          reaction: userReactionMap.get(post.id) || null
        }
      };
    }));

    return res.json({ success: true, data: transformed });
  } catch (error: any) {
    console.error('Get posts error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Get community feed with cursor pagination + visibility scope
export const getFeed = async (req: Request, res: Response) => {
  try {
    const { limit = 20, cursor, scope = 'public', topic, region } = req.query as any;
    const viewer = await resolveOptionalUserFromRequest(req);
    const userId = viewer?.id;
    const blockedAuthorIds = await getBlockedAuthorIdsForViewer(userId);
    const baseWhere: any = { status: 'active' };
    if (blockedAuthorIds.length) {
      baseWhere.authorId = { notIn: blockedAuthorIds };
    }
    if (scope === 'following') {
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
      const [followingUsers, followingPages] = await Promise.all([
        prisma.userFollow.findMany({ where: { followerId: userId } }),
        prisma.communityBusinessPageFollower.findMany({ where: { userId } })
      ]);
      const followeeIds = followingUsers
        .map((f) => f.followeeId)
        .filter((followeeId) => !blockedAuthorIds.includes(followeeId));
      const pageIds = followingPages.map((f) => f.pageId);
      baseWhere.OR = [
        { authorId: userId },
        ...(followeeIds.length ? [{ authorId: { in: followeeIds }, visibility: { in: ['public', 'friends', 'network'] } }] : []),
        ...(pageIds.length ? [{ businessPageId: { in: pageIds }, visibility: { in: ['public', 'friends', 'network'] } }] : [])
      ];
    } else if (scope === 'discover') {
      baseWhere.visibility = 'public';
      const filters: any[] = [];
      if (topic) {
        filters.push({
          OR: [
            { topic: { equals: String(topic), mode: 'insensitive' } },
            { tags: { has: String(topic) } }
          ]
        });
      }
      if (region) {
        filters.push({ location: { contains: String(region), mode: 'insensitive' } });
      }
      if (filters.length) baseWhere.AND = filters;
    } else {
      const visibility = scope === 'friends'
        ? ['public', 'friends']
        : scope === 'network'
          ? ['public', 'network']
          : ['public'];

      baseWhere.OR = [
        { visibility: { in: visibility } },
        ...(userId ? [{ authorId: userId }] : [])
      ];
    }

    if (cursor) {
      baseWhere.createdAt = { lt: new Date(cursor) };
    }

    const posts = await prisma.communityPost.findMany({
      where: baseWhere,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
            username: true,
            isVerified: true,
            freelancerPlanActive: true,
            employerPlanActive: true
          }
        },
        businessPage: {
          select: {
            id: true,
            name: true,
            handle: true,
            slug: true,
            logoFileId: true
          }
        },
        originalPost: {
          select: {
            id: true,
            author: {
              select: {
                name: true,
                username: true
              }
            }
          }
        }
      },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      take: Number(limit)
    });

    const postIds = posts.map((p) => p.id);
    const [reactionRows, commentRows, userReactions] = await Promise.all([
      prisma.communityPostReaction.groupBy({
        by: ['postId', 'type'],
        where: { postId: { in: postIds } },
        _count: { _all: true }
      }),
      prisma.communityPostComment.groupBy({
        by: ['postId'],
        where: { postId: { in: postIds }, status: 'active' },
        _count: { _all: true }
      }),
      userId
        ? prisma.communityPostReaction.findMany({ where: { postId: { in: postIds }, userId } })
        : Promise.resolve([])
    ]);

    const reactionMap = buildReactionSummary(reactionRows);
    const commentMap = buildCommentCounts(commentRows);
    const userReactionMap = new Map(userReactions.map((r) => [r.postId, r.type]));
    const { followingUserIds, followingPageIds } = await resolveFollowLookupForPosts(posts, userId);

    const transformed = await Promise.all(posts.map(async (post) => {
      const author = buildPostAuthorPayload(post.author as any, post.businessPage as any);
      const authorIdentity = resolvePostAuthorIdentity(
        { authorId: post.authorId, businessPageId: post.businessPageId },
        author
      );
      const isFollowingAuthor = author.type === 'business'
        ? followingPageIds.has(String(post.businessPageId || ''))
        : followingUserIds.has(post.authorId);

      return {
        id: post.id,
        authorId: authorIdentity.authorId,
        authorUserId: authorIdentity.authorUserId,
        authorName: author.displayName,
        authorUsername: author.username,
        authorAvatar: author.avatarUrl,
        author: {
          id: author.id,
          username: author.username,
          displayName: author.displayName,
          avatarUrl: author.avatarUrl,
          type: author.type,
          businessSlug: author.businessSlug,
          isVerified: author.isVerified,
          isPro: author.isPro
        },
        viewer: {
          isFollowingAuthor
        },
        title: post.title,
        content: post.content,
        attachmentFileIds: post.attachments || [],
        attachments: await resolveAttachments(post.attachments || []),
        tags: post.tags || [],
        mentions: post.mentions || [],
        topic: post.topic || null,
        location: post.location || null,
        visibility: post.visibility || 'public',
        commentPolicy: post.commentPolicy || 'everyone',
        businessPage: post.businessPage ? {
          id: post.businessPage.id,
          name: post.businessPage.name,
          handle: post.businessPage.handle,
          slug: post.businessPage.slug,
          logoFileId: post.businessPage.logoFileId || null
        } : null,
        viewsCount: post.viewsCount,
        likesCount: post.likesCount,
        sharesCount: post.sharesCount,
        repostsCount: post.repostsCount,
        status: post.status,
        isPinned: post.isPinned,
        isHighlighted: post.isHighlighted,
        originalPostId: post.originalPostId || null,
        originalPost: post.originalPost
          ? {
              id: post.originalPost.id,
              authorName: post.originalPost.author?.name || post.originalPost.author?.username || 'Unknown'
            }
          : null,
        createdAt: post.createdAt.toISOString(),
        updatedAt: post.updatedAt.toISOString(),
        interactions: {
          views: post.viewsCount,
          likes: post.likesCount,
          shares: post.sharesCount,
          reposts: post.repostsCount,
          comments: commentMap.get(post.id) || 0,
          reactions: reactionMap.get(post.id) || {}
        },
        userState: {
          liked: false,
          reposted: false,
          reaction: userReactionMap.get(post.id) || null
        }
      };
    }));

    const nextCursor = posts.length ? posts[posts.length - 1].createdAt.toISOString() : null;
    return res.json({ success: true, data: { items: transformed, nextCursor } });
  } catch (error: any) {
    console.error('Get feed error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load feed' });
  }
};

// Get single post by ID
export const getPostById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const viewer = await resolveOptionalUserFromRequest(req);
    const userId = viewer?.id;

    const post = await prisma.communityPost.findUnique({
      where: { id },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
            username: true,
            isVerified: true,
            freelancerPlanActive: true,
            employerPlanActive: true,
            gcoinWallet: {
              select: {
                recipientId: true
              }
            }
          }
        },
        businessPage: {
          select: {
            id: true,
            name: true,
            handle: true,
            slug: true,
            logoFileId: true
          }
        },
        originalPost: {
          select: {
            id: true,
            author: {
              select: {
                name: true,
                username: true
              }
            }
          }
        },
        _count: {
          select: {
            earningEvents: true
          }
        }
      }
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    if (userId && await hasUserBlockRelation(userId, post.authorId)) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check if user liked this post
    let isLiked = false;
    if (userId) {
      const like = await prisma.gcoinEarningEvent.findFirst({
        where: {
          actorId: userId,
          eventType: 'like',
          postId: id
        }
      });
      isLiked = !!like;
    }

    const [reactionRows, commentRows, userReaction] = await Promise.all([
      prisma.communityPostReaction.groupBy({
        by: ['postId', 'type'],
        where: { postId: id },
        _count: { _all: true }
      }),
      prisma.communityPostComment.groupBy({
        by: ['postId'],
        where: { postId: id, status: 'active' },
        _count: { _all: true }
      }),
      userId ? prisma.communityPostReaction.findFirst({ where: { postId: id, userId } }) : Promise.resolve(null)
    ]);
    const reactionMap = buildReactionSummary(reactionRows as any);
    const commentMap = buildCommentCounts(commentRows as any);
    const author = buildPostAuthorPayload(post.author as any, post.businessPage as any);

    let isFollowingAuthor = false;
    if (userId) {
      if (author.type === 'business' && post.businessPageId) {
        const pageFollow = await prisma.communityBusinessPageFollower.findFirst({
          where: { userId, pageId: post.businessPageId },
          select: { id: true }
        });
        isFollowingAuthor = Boolean(pageFollow);
      } else if (post.authorId !== userId) {
        const follow = await prisma.userFollow.findUnique({
          where: {
            followerId_followeeId: {
              followerId: userId,
              followeeId: post.authorId
            }
          },
          select: { id: true }
        });
        isFollowingAuthor = Boolean(follow);
      }
    }

    const transformed = {
      id: post.id,
      authorId: resolvePostAuthorIdentity(
        { authorId: post.authorId, businessPageId: post.businessPageId },
        author
      ).authorId,
      authorUserId: post.authorId,
      authorName: author.displayName,
      authorUsername: author.username,
      authorAvatar: author.avatarUrl,
      authorRecipientId: post.author.gcoinWallet?.recipientId || null,
      author: {
        id: author.id,
        username: author.username,
        displayName: author.displayName,
        avatarUrl: author.avatarUrl,
        type: author.type,
        businessSlug: author.businessSlug,
        isVerified: author.isVerified,
        isPro: author.isPro
      },
      viewer: {
        isFollowingAuthor
      },
      title: post.title,
      content: post.content,
      attachmentFileIds: post.attachments || [],
      attachments: await resolveAttachments(post.attachments || []),
      tags: post.tags || [],
      mentions: post.mentions || [],
      topic: post.topic || null,
      location: post.location || null,
      visibility: post.visibility || 'public',
      commentPolicy: post.commentPolicy || 'everyone',
      businessPage: post.businessPage ? {
        id: post.businessPage.id,
        name: post.businessPage.name,
        handle: post.businessPage.handle,
        slug: post.businessPage.slug,
        logoFileId: post.businessPage.logoFileId || null
      } : null,
      viewsCount: post.viewsCount,
      likesCount: post.likesCount,
      sharesCount: post.sharesCount,
      repostsCount: post.repostsCount,
      status: post.status,
      isPinned: post.isPinned,
      isHighlighted: post.isHighlighted,
      originalPostId: post.originalPostId || null,
      originalPost: post.originalPost
        ? {
            id: post.originalPost.id,
            authorName: post.originalPost.author?.name || post.originalPost.author?.username || 'Unknown'
          }
        : null,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
      interactions: {
        views: post.viewsCount,
        likes: post.likesCount,
        shares: post.sharesCount,
        reposts: post.repostsCount,
        comments: commentMap.get(post.id) || 0,
        reactions: reactionMap.get(post.id) || {}
      },
      userState: {
        liked: isLiked,
        reposted: false,
        reaction: userReaction?.type || null
      }
    };

    return res.json({ success: true, data: transformed });
  } catch (error: any) {
    console.error('Get post by ID error:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const getCommunityTags = async (req: Request, res: Response) => {
  try {
    const q = normalizeTag(req.query?.q);
    const limitRaw = Number(req.query?.limit || 25);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.trunc(limitRaw))) : 25;

    const posts = await prisma.communityPost.findMany({
      where: { status: 'active' },
      select: { tags: true, content: true },
      take: 1000
    });

    const counts = new Map<string, number>();
    posts.forEach((post) => {
      collectPostTags(post).forEach((tag) => {
        if (q && !tag.includes(q)) return;
        counts.set(tag, (counts.get(tag) || 0) + 1);
      });
    });

    const data = Array.from(counts.entries())
      .map(([slug, count]) => ({ slug, name: slug, count }))
      .sort((a, b) => b.count - a.count || a.slug.localeCompare(b.slug))
      .slice(0, limit);

    return res.json({ success: true, data });
  } catch (error: any) {
    console.error('Get community tags error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load tags' });
  }
};

export const getCommunityTrendingTags = async (req: Request, res: Response) => {
  try {
    const limitRaw = Number(req.query?.limit || 12);
    const daysRaw = Number(req.query?.days || 7);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(50, Math.trunc(limitRaw))) : 12;
    const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(30, Math.trunc(daysRaw))) : 7;
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const posts = await prisma.communityPost.findMany({
      where: { status: 'active', createdAt: { gte: since } },
      select: {
        tags: true,
        content: true,
        viewsCount: true,
        likesCount: true,
        sharesCount: true,
        repostsCount: true
      },
      take: 1500
    });

    const stats = new Map<string, { postsCount: number; viewsCount: number; engagementCount: number }>();
    posts.forEach((post) => {
      const postTags = collectPostTags(post);
      const views = Number(post.viewsCount || 0);
      const engagement = Number(post.likesCount || 0) + Number(post.sharesCount || 0) + Number(post.repostsCount || 0);
      postTags.forEach((tag) => {
        const current = stats.get(tag) || { postsCount: 0, viewsCount: 0, engagementCount: 0 };
        current.postsCount += 1;
        current.viewsCount += views;
        current.engagementCount += engagement;
        stats.set(tag, current);
      });
    });

    const data = Array.from(stats.entries())
      .map(([slug, value]) => {
        const score = value.viewsCount * 0.2 + value.engagementCount * 1.0 + value.postsCount * 0.5;
        return {
          slug,
          name: slug,
          postsCount: value.postsCount,
          viewsCount: value.viewsCount,
          engagementCount: value.engagementCount,
          score: Number(score.toFixed(2))
        };
      })
      .sort((a, b) => b.score - a.score || b.engagementCount - a.engagementCount)
      .slice(0, limit);

    return res.json({ success: true, data });
  } catch (error: any) {
    console.error('Get community trending tags error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load trending tags' });
  }
};

export const getCommunityPostsByTag = async (req: Request, res: Response) => {
  try {
    const slug = normalizeTag(req.params?.slug);
    if (!slug) return res.status(400).json({ success: false, error: 'Invalid tag slug' });

    const limitRaw = Number(req.query?.limit || 20);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, Math.trunc(limitRaw))) : 20;

    const posts = await prisma.communityPost.findMany({
      where: {
        status: 'active',
        OR: [
          { tags: { has: slug } },
          { tags: { has: slug.toLowerCase() } },
          { tags: { has: slug.toUpperCase() } }
        ]
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
            username: true,
            isVerified: true,
            freelancerPlanActive: true,
            employerPlanActive: true
          }
        },
        businessPage: {
          select: {
            id: true,
            name: true,
            handle: true,
            slug: true,
            logoFileId: true
          }
        }
      },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      take: limit
    });

    const filtered = posts.filter((post) => collectPostTags(post).includes(slug));
    const data = await Promise.all(
      filtered.map(async (post) => {
        const author = buildPostAuthorPayload(post.author as any, post.businessPage as any);
        const authorIdentity = resolvePostAuthorIdentity(
          { authorId: post.authorId, businessPageId: post.businessPageId },
          author
        );
        return {
          id: post.id,
          authorId: authorIdentity.authorId,
          authorUserId: authorIdentity.authorUserId,
          authorName: author.displayName,
          authorUsername: author.username,
          authorAvatar: author.avatarUrl,
          author: {
            id: author.id,
            username: author.username,
            displayName: author.displayName,
            avatarUrl: author.avatarUrl,
            type: author.type,
            businessSlug: author.businessSlug,
            isVerified: author.isVerified,
            isPro: author.isPro
          },
          viewer: {
            isFollowingAuthor: false
          },
          title: post.title,
          content: post.content,
          attachmentFileIds: post.attachments || [],
          attachments: await resolveAttachments(post.attachments || []),
          tags: post.tags || [],
          mentions: post.mentions || [],
          topic: post.topic || null,
          location: post.location || null,
          visibility: post.visibility || 'public',
          commentPolicy: post.commentPolicy || 'everyone',
          viewsCount: post.viewsCount,
          likesCount: post.likesCount,
          sharesCount: post.sharesCount,
          repostsCount: post.repostsCount,
          status: post.status,
          isPinned: post.isPinned,
          isHighlighted: post.isHighlighted,
          createdAt: post.createdAt.toISOString(),
          updatedAt: post.updatedAt.toISOString()
        };
      })
    );

    return res.json({ success: true, data: { tag: slug, items: data } });
  } catch (error: any) {
    console.error('Get community posts by tag error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load posts for tag' });
  }
};

// Create community post
export const createPost = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const {
      title,
      content,
      attachments,
      attachmentFileIds,
      status = 'active',
      tags,
      mentions,
      visibility,
      businessPageId,
      originalPostId,
      topic,
      location,
      commentPolicy
    } = req.body;

    const normalizedPolicy = normalizeCommentPolicy(commentPolicy);
    if (commentPolicy !== undefined && !normalizedPolicy) {
      return res.status(400).json({ error: 'Invalid comment policy' });
    }

    if (!content || content.trim().length === 0) {
      return res.status(400).json({ error: 'Content is required' });
    }

    const explicitMentionUserIds = Array.isArray(mentions)
      ? mentions.map((value: any) => String(value || '').trim()).filter(Boolean)
      : [];
    const explicitMentionUsers = explicitMentionUserIds.length
      ? await prisma.user.findMany({
          where: { id: { in: explicitMentionUserIds } },
          select: { id: true }
        })
      : [];
    const mentionedUsersByUsername = await resolveMentionedUserIds(extractMentionUsernames(String(content || '')));
    const rawMentionUserIds = Array.from(
      new Set([...explicitMentionUsers.map((user) => user.id), ...mentionedUsersByUsername.map((user) => user.id)])
    ).filter((mentionedUserId) => mentionedUserId !== userId);
    const normalizedMentionUserIds = await filterMentionTargetsForActor(userId, rawMentionUserIds);

    let resolvedBusinessPageId: string | null = businessPageId || null;
    if (resolvedBusinessPageId) {
      const page = await prisma.communityBusinessPage.findUnique({ where: { id: resolvedBusinessPageId } });
      if (!page) return res.status(404).json({ error: 'Business page not found' });
      if (String(page.status || 'active').toLowerCase() !== 'active') {
        return res.status(403).json({ error: 'Only active business pages can publish posts' });
      }
      const isOwner = page.ownerId === userId;
      if (!isOwner && req.user?.role !== 'ADMIN') {
        return res.status(403).json({ error: 'Not authorized to post for this page' });
      }
    }

    const normalizedAttachmentIds = await resolveValidatedAttachmentIds(
      [attachmentFileIds, attachments],
      { userId, role: req.user?.role }
    );

    const post = await prisma.communityPost.create({
      data: {
        authorId: userId,
        title: title || null,
        content: content.trim(),
        attachments: normalizedAttachmentIds,
        tags: Array.isArray(tags) ? tags : [],
        mentions: normalizedMentionUserIds,
        topic: topic || null,
        location: location || null,
        visibility: visibility || 'public',
        commentPolicy: normalizedPolicy || 'everyone',
        businessPageId: resolvedBusinessPageId,
        originalPostId: originalPostId || null,
        status: status
      },
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
            username: true,
            isVerified: true,
            freelancerPlanActive: true,
            employerPlanActive: true,
            gcoinWallet: {
              select: {
                recipientId: true
              }
            }
          }
        },
        businessPage: {
          select: {
            id: true,
            name: true,
            handle: true,
            slug: true,
            logoFileId: true
          }
        }
      }
    });

    try {
      await syncFileUsages('community_post', post.id, post.attachments || [], 'Community Post Media');
    } catch (e) {}

    const io = getAppIo(req);
    const author = buildPostAuthorPayload(post.author as any, post.businessPage as any);
    const authorIdentity = resolvePostAuthorIdentity(
      { authorId: post.authorId, businessPageId: post.businessPageId },
      author
    );

    const payload = {
      id: post.id,
      authorId: authorIdentity.authorId,
      authorUserId: authorIdentity.authorUserId,
      authorName: author.displayName,
      authorUsername: author.username,
      authorAvatar: author.avatarUrl,
      authorRecipientId: post.author.gcoinWallet?.recipientId || null,
      author: {
        id: author.id,
        username: author.username,
        displayName: author.displayName,
        avatarUrl: author.avatarUrl,
        type: author.type,
        businessSlug: author.businessSlug,
        isVerified: author.isVerified,
        isPro: author.isPro
      },
      viewer: {
        isFollowingAuthor: false
      },
      title: post.title,
      content: post.content,
      attachmentFileIds: post.attachments || [],
      attachments: await resolveAttachments(post.attachments || []),
      tags: post.tags || [],
      mentions: post.mentions || [],
      topic: post.topic || null,
      location: post.location || null,
      visibility: post.visibility || 'public',
      commentPolicy: post.commentPolicy || 'everyone',
      businessPage: post.businessPage ? {
        id: post.businessPage.id,
        name: post.businessPage.name,
        handle: post.businessPage.handle,
        slug: post.businessPage.slug,
        logoFileId: post.businessPage.logoFileId || null
      } : null,
      viewsCount: 0,
      likesCount: 0,
      sharesCount: 0,
      repostsCount: 0,
      status: post.status,
      isPinned: post.isPinned,
      isHighlighted: post.isHighlighted,
      originalPostId: post.originalPostId || null,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
      interactions: {
        views: 0,
        likes: 0,
        shares: 0,
        reposts: 0
      },
      userState: {
        liked: false,
        reposted: false
      }
    };

    try {
      io?.emit('community:post_created', { post: payload });
    } catch (e) {
      console.error('Socket emit error (post_created):', e);
    }
    try { realtime.emitToPost(post.id, 'community:post_created', { post: payload }); } catch (e) {}

    try {
      const actorName = author.displayName || 'Someone';
      const postSnippet = buildSnippet(post.title || post.content || '', 100);

      if (normalizedMentionUserIds.length) {
        const mentionedRecipientIds = await filterRecipientsForNotification('mention_post', normalizedMentionUserIds);
        for (const mentionedUserId of mentionedRecipientIds) {
          const canView = await canUserViewPostForNotification(
            {
              authorId: post.authorId,
              visibility: post.visibility,
              mentions: post.mentions
            },
            mentionedUserId
          );
          if (!canView) continue;

          await createEngagementNotification({
            recipientId: mentionedUserId,
            actorId: userId,
            type: 'mention_post',
            title: 'You were mentioned',
            message: `${actorName} mentioned you in a post.`,
            actionUrl: `/community/posts/${post.id}?mention=${encodeURIComponent(mentionedUserId)}`,
            metadata: {
              postId: post.id,
              commentId: null,
              actorId: userId,
              mentionedUserId,
              snippet: postSnippet
            },
            skipRecipientChecks: true
          });
        }
      }

      if ((post.status || 'active') === 'active') {
        const followers = await prisma.userFollow.findMany({
          where: { followeeId: userId },
          select: { followerId: true }
        });
        const followerIds = followers
          .map((follow) => follow.followerId)
          .filter((followerId) => followerId && followerId !== userId);
        const recipientIds = await filterRecipientsForNotification('followed_new_post', followerIds);
        const message = postSnippet ? `${actorName} posted: "${postSnippet}"` : `${actorName} posted a new update.`;

        for (let i = 0; i < recipientIds.length; i += NOTIFICATION_BATCH_SIZE) {
          const batch = recipientIds.slice(i, i + NOTIFICATION_BATCH_SIZE);
          await Promise.all(
            batch.map((recipientId) =>
              createEngagementNotification({
                recipientId,
                actorId: userId,
                type: 'followed_new_post',
                title: 'New post',
                message,
                actionUrl: `/community/posts/${post.id}`,
                metadata: {
                  postId: post.id,
                  authorId: userId,
                  snippet: postSnippet
                },
                dedupeWindowMinutes: 30,
                dedupeMetaKeys: ['authorId'],
                skipRecipientChecks: true
              })
            )
          );
        }
      }
    } catch (notifyError) {
      console.warn('[community.createPost] notification fanout failed', notifyError);
    }

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('Create post error:', error);
    const status = Number(error?.statusCode || 500);
    return res.status(status).json({ error: error?.message || 'Failed to create post' });
  }
};

// Update community post
export const updatePost = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const {
      title,
      content,
      attachments,
      attachmentFileIds,
      status,
      tags,
      mentions,
      visibility,
      topic,
      location,
      commentPolicy,
      isPinned,
      isHighlighted
    } = req.body;

    const post = await prisma.communityPost.findUnique({
      where: { id }
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check permissions: owner or admin/moderator
    if (post.authorId !== userId && req.user?.role !== 'ADMIN' && req.user?.role !== 'MODERATOR') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content.trim();
    const attachmentsProvided = attachments !== undefined || attachmentFileIds !== undefined;
    if (attachmentsProvided) {
      updateData.attachments = await resolveValidatedAttachmentIds(
        [attachmentFileIds, attachments],
        { userId, role: req.user?.role }
      );
    }
    if (tags !== undefined) updateData.tags = Array.isArray(tags) ? tags : [];
    if (mentions !== undefined) updateData.mentions = Array.isArray(mentions) ? mentions : [];
    if (visibility !== undefined) updateData.visibility = visibility;
    if (topic !== undefined) updateData.topic = topic;
    if (location !== undefined) updateData.location = location;
    if (commentPolicy !== undefined) {
      const normalizedPolicy = normalizeCommentPolicy(commentPolicy);
      if (!normalizedPolicy) {
        return res.status(400).json({ error: 'Invalid comment policy' });
      }
      updateData.commentPolicy = normalizedPolicy;
    }
    if (isPinned !== undefined) {
      const pinValue = Boolean(isPinned);
      if (pinValue && !post.isPinned) {
        const pinnedCount = await prisma.communityPost.count({
          where: {
            authorId: post.authorId,
            status: 'active',
            isPinned: true,
            NOT: { id }
          }
        });
        if (pinnedCount >= MAX_PINNED_HIGHLIGHTED_POSTS) {
          return res.status(400).json({ error: 'You can pin a maximum of 3 posts' });
        }
      }
      updateData.isPinned = pinValue;
    }
    if (isHighlighted !== undefined) {
      const highlightValue = Boolean(isHighlighted);
      if (highlightValue && !post.isHighlighted) {
        const highlightedCount = await prisma.communityPost.count({
          where: {
            authorId: post.authorId,
            status: 'active',
            isHighlighted: true,
            NOT: { id }
          }
        });
        if (highlightedCount >= MAX_PINNED_HIGHLIGHTED_POSTS) {
          return res.status(400).json({ error: 'You can highlight a maximum of 3 posts' });
        }
      }
      updateData.isHighlighted = highlightValue;
    }
    if (status !== undefined && (req.user?.role === 'ADMIN' || req.user?.role === 'MODERATOR')) {
      updateData.status = status;
    }

    const updated = await prisma.communityPost.update({
      where: { id },
      data: updateData,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            avatar: true,
            role: true,
            username: true,
            isVerified: true,
            freelancerPlanActive: true,
            employerPlanActive: true,
            gcoinWallet: {
              select: {
                recipientId: true
              }
            }
          }
        },
        businessPage: {
          select: {
            id: true,
            name: true,
            handle: true,
            slug: true,
            logoFileId: true
          }
        }
      }
    });

    if (attachmentsProvided) {
      try { await syncFileUsages('community_post', updated.id, updated.attachments || [], 'Community Post Media'); } catch (e) {}
    }

    const io = getAppIo(req);
    const author = buildPostAuthorPayload(updated.author as any, updated.businessPage as any);
    const authorIdentity = resolvePostAuthorIdentity(
      { authorId: updated.authorId, businessPageId: updated.businessPageId },
      author
    );

    const payload = {
      id: updated.id,
      authorId: authorIdentity.authorId,
      authorUserId: authorIdentity.authorUserId,
      authorName: author.displayName,
      authorUsername: author.username,
      authorAvatar: author.avatarUrl,
      authorRecipientId: updated.author.gcoinWallet?.recipientId || null,
      author: {
        id: author.id,
        username: author.username,
        displayName: author.displayName,
        avatarUrl: author.avatarUrl,
        type: author.type,
        businessSlug: author.businessSlug,
        isVerified: author.isVerified,
        isPro: author.isPro
      },
      viewer: {
        isFollowingAuthor: false
      },
      title: updated.title,
      content: updated.content,
      attachmentFileIds: updated.attachments || [],
      attachments: await resolveAttachments(updated.attachments || []),
      tags: updated.tags || [],
      mentions: updated.mentions || [],
      topic: updated.topic || null,
      location: updated.location || null,
      visibility: updated.visibility || 'public',
      commentPolicy: updated.commentPolicy || 'everyone',
      businessPage: updated.businessPage ? {
        id: updated.businessPage.id,
        name: updated.businessPage.name,
        handle: updated.businessPage.handle,
        slug: updated.businessPage.slug,
        logoFileId: updated.businessPage.logoFileId || null
      } : null,
      viewsCount: updated.viewsCount,
      likesCount: updated.likesCount,
      sharesCount: updated.sharesCount,
      repostsCount: updated.repostsCount,
      status: updated.status,
      isPinned: updated.isPinned,
      isHighlighted: updated.isHighlighted,
      originalPostId: updated.originalPostId || null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      interactions: {
        views: updated.viewsCount,
        likes: updated.likesCount,
        shares: updated.sharesCount,
        reposts: updated.repostsCount
      },
      userState: {
        liked: false,
        reposted: false
      }
    };

    if (updateData.content !== undefined || updateData.mentions !== undefined) {
      try {
        const mentionedUsersByUsername = await resolveMentionedUserIds(
          extractMentionUsernames(String(updated.content || ''))
        );
        const explicitMentionIds = Array.isArray(updated.mentions)
          ? updated.mentions.map((entry) => String(entry || '').trim()).filter(Boolean)
          : [];
        const rawMentionUserIds = Array.from(
          new Set([
            ...explicitMentionIds,
            ...mentionedUsersByUsername.map((entry) => String(entry.id || '').trim())
          ])
        ).filter((id) => id && id !== userId);
        const normalizedMentionUserIds = await filterMentionTargetsForActor(userId, rawMentionUserIds);

        const mentionRecipients = await filterRecipientsForNotification('mention_post', normalizedMentionUserIds);
        const snippet = buildSnippet(updated.title || updated.content || '', 100);
        for (const recipientId of mentionRecipients) {
          const canView = await canUserViewPostForNotification(
            {
              authorId: updated.authorId,
              visibility: updated.visibility,
              mentions: updated.mentions || []
            },
            recipientId
          );
          if (!canView) continue;
          await createEngagementNotification({
            recipientId,
            actorId: userId,
            type: 'mention_post',
            title: 'You were mentioned',
            message: `${author.displayName || 'Someone'} mentioned you in a post.`,
            actionUrl: `/community/posts/${updated.id}?mention=${encodeURIComponent(recipientId)}`,
            metadata: {
              postId: updated.id,
              commentId: null,
              actorId: userId,
              mentionedUserId: recipientId,
              snippet
            },
            dedupeWindowMinutes: 10,
            dedupeMetaKeys: ['postId', 'mentionedUserId']
          });
        }
      } catch (notifyError) {
        console.warn('[community.updatePost] mention notification failed', notifyError);
      }
    }

    try {
      io?.emit('community:post_updated', { post: payload });
    } catch (e) {
      console.error('Socket emit error (post_updated):', e);
    }
    try { realtime.emitToPost(updated.id, 'community:post_updated', { post: payload }); } catch (e) {}

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('Update post error:', error);
    const status = Number(error?.statusCode || 500);
    return res.status(status).json({ error: error?.message || 'Failed to update post' });
  }
};

// Delete community post
export const deletePost = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;

    const post = await prisma.communityPost.findUnique({
      where: { id }
    });

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    // Check permissions: owner or admin/moderator
    if (post.authorId !== userId && req.user?.role !== 'ADMIN' && req.user?.role !== 'MODERATOR') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Soft delete: set status to 'deleted' instead of actually deleting
    await prisma.communityPost.update({
      where: { id },
      data: { status: 'deleted', isPinned: false, isHighlighted: false }
    });
    try { await removeUsage('community_post', id); } catch (e) {}

    const io = getAppIo(req);

    try {
      io?.emit('community:post_deleted', { postId: id });
    } catch (e) {
      console.error('Socket emit error (post_deleted):', e);
    }
    try { realtime.emitToPost(id, 'community:post_deleted', { postId: id }); } catch (e) {}

    return res.json({ success: true });
  } catch (error: any) {
    console.error('Delete post error:', error);
    return res.status(500).json({ error: error.message });
  }
};

// Create a reaction on a community post
export const createPostReaction = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const postId = req.params.id;
    const type = (req.body?.type || '').toString().trim();
    if (!postId || !type) return res.status(400).json({ success: false, error: 'Missing reaction type' });
    try {
      const cfg = await prisma.appSetting.findUnique({ where: { scope: 'community_reactions' } });
      const reactions = (cfg?.data as any)?.reactions || [];
      if (Array.isArray(reactions) && reactions.length) {
        const enabled = reactions.find((r: any) => r.id === type && r.enabled !== false);
        if (!enabled) return res.status(400).json({ success: false, error: 'Reaction type not allowed' });
      }
    } catch (e) {}

    const post = await prisma.communityPost.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true, title: true, content: true, status: true }
    });
    if (!post || post.status === 'deleted') {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    if (await hasUserBlockRelation(userId, post.authorId)) {
      return res.status(403).json({ success: false, error: 'Interaction is not allowed for this post' });
    }

    let isSameReaction = false;
    await prisma.$transaction(async (tx) => {
      const existingRows = await tx.communityPostReaction.findMany({
        where: { postId, userId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, type: true }
      });

      const [primary, ...duplicates] = existingRows;
      if (duplicates.length) {
        await tx.communityPostReaction.deleteMany({
          where: { id: { in: duplicates.map((row) => row.id) } }
        });
      }

      isSameReaction = primary?.type === type;
      if (!primary) {
        await tx.communityPostReaction.create({ data: { postId, userId, type } });
      } else if (!isSameReaction) {
        await tx.communityPostReaction.update({
          where: { id: primary.id },
          data: { type }
        });
      }
    });

    const reactionRows = await prisma.communityPostReaction.groupBy({
      by: ['postId', 'type'],
      where: { postId },
      _count: { _all: true }
    });

    const reactions = buildReactionSummary(reactionRows as any).get(postId) || {};

    const io = getAppIo(req);
    try { io?.emit('community:post_reaction_updated', { postId, reactions }); } catch (e) {}
    try { realtime.emitToPost(postId, 'community:post_reaction_updated', { postId, reactions }); } catch (e) {}

    if (!isSameReaction && post.authorId !== userId) {
      try {
        const actor = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, username: true }
        });
        const actorName = actor?.name || actor?.username || 'Someone';
        await createEngagementNotification({
          recipientId: post.authorId,
          actorId: userId,
          type: 'reaction_on_post',
          title: 'New reaction',
          message: `${actorName} reacted ${type} to your post.`,
          actionUrl: `/community/posts/${postId}`,
          metadata: {
            postId,
            actorId: userId,
            postAuthorId: post.authorId,
            reactionType: type
          },
          dedupeWindowMinutes: 20,
          dedupeMetaKeys: ['postId', 'actorId']
        });
      } catch (notifyError) {
        console.warn('[community.createPostReaction] notification failed', notifyError);
      }
    }

    return res.json({ success: true, data: { postId, reactions } });
  } catch (error: any) {
    console.error('Create post reaction error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to react' });
  }
};

export const deletePostReaction = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const postId = req.params.id;
    await prisma.communityPostReaction.deleteMany({ where: { postId, userId } });
    const reactionRows = await prisma.communityPostReaction.groupBy({
      by: ['postId', 'type'],
      where: { postId },
      _count: { _all: true }
    });
    const reactions = buildReactionSummary(reactionRows as any).get(postId) || {};
    const io = getAppIo(req);
    try { io?.emit('community:post_reaction_updated', { postId, reactions }); } catch (e) {}
    try { realtime.emitToPost(postId, 'community:post_reaction_updated', { postId, reactions }); } catch (e) {}
    return res.json({ success: true, data: { postId, reactions } });
  } catch (error: any) {
    console.error('Delete post reaction error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to remove reaction' });
  }
};

export const createPostComment = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const postId = req.params.id;
    const { content, parentId, attachments, attachmentFileIds } = req.body || {};
    const normalizedAttachmentIds = await resolveValidatedAttachmentIds(
      [attachmentFileIds, attachments],
      { userId, role: req.user?.role }
    );
    const normalizedContent = String(content || '').trim();
    if (!postId || (!normalizedContent && !normalizedAttachmentIds.length)) {
      return res.status(400).json({ success: false, error: 'Content or attachmentFileIds required' });
    }

    const post = await prisma.communityPost.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true, commentPolicy: true, status: true, visibility: true, mentions: true }
    });
    if (!post || post.status === 'deleted') {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    const canComment = await canUserCommentOnPost(post, userId, req.user?.role);
    if (!canComment) {
      return res.status(403).json({ success: false, error: 'Comments are restricted for this post' });
    }

    if (parentId) {
      const parent = await prisma.communityPostComment.findUnique({
        where: { id: parentId },
        select: { id: true, postId: true, status: true }
      });
      if (!parent || parent.postId !== postId) {
        return res.status(400).json({ success: false, error: 'Invalid parent comment' });
      }
      if (parent.status === 'deleted') {
        return res.status(400).json({ success: false, error: 'Cannot reply to a deleted comment' });
      }
    }

    const commentContent = normalizedContent;
    const mentionedUsersByUsername = await resolveMentionedUserIds(extractMentionUsernames(commentContent));
    const rawMentionedUserIds: string[] = Array.from(
      new Set(
        mentionedUsersByUsername
          .map((user) => String(user.id || '').trim())
          .filter((mentionedUserId) => mentionedUserId && mentionedUserId !== userId)
      )
    );
    const mentionedUserIds = await filterMentionTargetsForActor(userId, rawMentionedUserIds);

    const comment = await prisma.communityPostComment.create({
      data: {
        postId,
        authorId: userId,
        parentId: parentId || null,
        content: commentContent,
        attachments: normalizedAttachmentIds
      },
      include: {
        author: { select: { id: true, name: true, avatar: true } }
      }
    });

    if (comment.attachments?.length) {
      try { await syncFileUsages('community_post_comment', comment.id, comment.attachments || [], 'Community Post Comment Media'); } catch (e) {}
    }

    const payload = {
      id: comment.id,
      postId: comment.postId,
      parentId: comment.parentId,
      userId: comment.authorId,
      userName: comment.author?.name || 'Anonymous',
      userAvatar: comment.author?.avatar || null,
      content: comment.content,
      attachmentFileIds: comment.attachments || [],
      attachments: await resolveAttachments(comment.attachments || []),
      status: comment.status,
      deletedAt: comment.deletedAt ? comment.deletedAt.toISOString() : null,
      likesCount: 0,
      likedByMe: false,
      canEdit: true,
      canDelete: true,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString()
    };

    const io = getAppIo(req);
    try { io?.emit('community:post_comment_created', { comment: payload, postId }); } catch (e) {}
    try { realtime.emitToPost(postId, 'community:post_comment_created', { comment: payload, postId }); } catch (e) {}

    try {
      const actor = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, username: true }
      });
      const actorName = actor?.name || actor?.username || 'Someone';
      const snippet = buildSnippet(comment.content || '', 100);
      const actionUrl = `/community/posts/${postId}?comment=${comment.id}`;

      if (post.authorId && post.authorId !== userId) {
        await createEngagementNotification({
          recipientId: post.authorId,
          actorId: userId,
          type: 'comment_on_post',
          title: 'New comment',
          message: `${actorName} commented on your post.`,
          actionUrl,
          metadata: {
            postId,
            commentId: comment.id,
            actorId: userId,
            postAuthorId: post.authorId,
            snippet
          }
        });
      }

      if (mentionedUserIds.length) {
        const mentionRecipients = await filterRecipientsForNotification('mention_comment', mentionedUserIds);
        for (const mentionedUserId of mentionRecipients) {
          const canView = await canUserViewPostForNotification(
            {
              authorId: post.authorId,
              visibility: post.visibility,
              mentions: post.mentions
            },
            mentionedUserId
          );
          if (!canView) continue;

          await createEngagementNotification({
            recipientId: mentionedUserId,
            actorId: userId,
            type: 'mention_comment',
            title: 'You were mentioned',
            message: `${actorName} mentioned you in a comment.`,
            actionUrl: `${actionUrl}&mention=${encodeURIComponent(mentionedUserId)}`,
            metadata: {
              postId,
              commentId: comment.id,
              actorId: userId,
              mentionedUserId,
              snippet
            },
            skipRecipientChecks: true
          });
        }
      }
    } catch (notifyError) {
      console.warn('[community.createPostComment] notification fanout failed', notifyError);
    }

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('Create post comment error:', error);
    const status = Number(error?.statusCode || 500);
    return res.status(status).json({ success: false, error: error?.message || 'Failed to comment' });
  }
};

export const getPostComments = async (req: Request, res: Response) => {
  try {
    const viewer = await resolveOptionalUserFromRequest(req);
    const userId = viewer?.id;
    const postId = req.params.id;
    const { limit = 20, cursor } = req.query as any;

    const post = await prisma.communityPost.findUnique({
      where: { id: postId },
      select: { id: true, status: true, authorId: true }
    });
    if (!post || post.status === 'deleted') {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }
    if (userId && await hasUserBlockRelation(userId, post.authorId)) {
      return res.status(404).json({ success: false, error: 'Post not found' });
    }

    const query: any = {
      where: { postId, parentId: null },
      orderBy: { createdAt: 'asc' },
      take: Number(limit),
      include: {
        author: { select: { id: true, name: true, avatar: true } },
        replies: {
          where: { postId },
          orderBy: { createdAt: 'asc' },
          include: { author: { select: { id: true, name: true, avatar: true } } }
        }
      }
    };

    if (cursor) {
      query.cursor = { id: String(cursor) };
      query.skip = 1;
    }

    const comments = await prisma.communityPostComment.findMany(query);
    const allComments = comments.flatMap((c) => [c, ...(c.replies || [])]);
    const commentIds = allComments.map((c) => c.id);

    const [likeCounts, likedByMe] = await Promise.all([
      commentIds.length
        ? prisma.communityPostCommentLike.groupBy({
            by: ['commentId'],
            where: { commentId: { in: commentIds } },
            _count: { _all: true }
          })
        : Promise.resolve([]),
      userId && commentIds.length
        ? prisma.communityPostCommentLike.findMany({
            where: { commentId: { in: commentIds }, userId },
            select: { commentId: true }
          })
        : Promise.resolve([])
    ]);

    const likeCountMap = new Map(likeCounts.map((c) => [c.commentId, c._count?._all || 0]));
    const likedSet = new Set(likedByMe.map((c) => c.commentId));

    const buildPayload = async (comment: any) => {
      const isDeleted = comment.status === 'deleted';
      return {
        id: comment.id,
        postId: comment.postId,
        parentId: comment.parentId,
        userId: comment.authorId,
        userName: comment.author?.name || 'Anonymous',
        userAvatar: comment.author?.avatar || null,
        content: isDeleted ? '' : comment.content,
        attachmentFileIds: isDeleted ? [] : (comment.attachments || []),
        attachments: isDeleted ? [] : await resolveAttachments(comment.attachments || []),
        status: comment.status,
        deletedAt: comment.deletedAt ? comment.deletedAt.toISOString() : null,
        createdAt: comment.createdAt.toISOString(),
        updatedAt: comment.updatedAt.toISOString(),
        likesCount: likeCountMap.get(comment.id) || 0,
        likedByMe: likedSet.has(comment.id),
        canEdit: !!userId && (comment.authorId === userId || isPrivilegedUser(req.user)),
        canDelete: !!userId && (comment.authorId === userId || isPrivilegedUser(req.user))
      };
    };

    const items = await Promise.all(
      comments.map(async (comment) => {
        if (userId && await hasUserBlockRelation(userId, comment.authorId)) return null;
        const replies = await Promise.all((comment.replies || []).map(async (reply) => {
          if (userId && await hasUserBlockRelation(userId, reply.authorId)) return null;
          return buildPayload(reply);
        }));
        return {
          ...(await buildPayload(comment)),
          replies: replies.filter(Boolean)
        };
      })
    );

    const filteredItems = items.filter(Boolean);
    const nextCursor = filteredItems.length ? (filteredItems[filteredItems.length - 1] as any).id : null;
    return res.json({ success: true, data: { items: filteredItems, nextCursor } });
  } catch (error: any) {
    console.error('Get post comments error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load comments' });
  }
};

export const updatePostComment = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { id } = req.params;
    const { content, attachments, attachmentFileIds } = req.body || {};

    const comment = await prisma.communityPostComment.findUnique({
      where: { id },
      include: { author: { select: { id: true, name: true, avatar: true } } }
    });
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });
    if (comment.status === 'deleted') {
      return res.status(400).json({ success: false, error: 'Cannot edit a deleted comment' });
    }
    if (comment.authorId !== userId && !isPrivilegedUser(req.user)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const updateData: any = {};
    if (content !== undefined) {
      const trimmed = String(content).trim();
      if (!trimmed) return res.status(400).json({ success: false, error: 'Content required' });
      updateData.content = trimmed;
    }
    const attachmentsProvided = attachments !== undefined || attachmentFileIds !== undefined;
    if (attachmentsProvided) {
      updateData.attachments = await resolveValidatedAttachmentIds(
        [attachmentFileIds, attachments],
        { userId, role: req.user?.role }
      );
    }
    if (!Object.keys(updateData).length) {
      return res.status(400).json({ success: false, error: 'Nothing to update' });
    }

    const updated = await prisma.communityPostComment.update({
      where: { id },
      data: updateData,
      include: { author: { select: { id: true, name: true, avatar: true } } }
    });

    if (attachmentsProvided) {
      try { await syncFileUsages('community_post_comment', updated.id, updated.attachments || [], 'Community Post Comment Media'); } catch (e) {}
    }

    const likesCount = await prisma.communityPostCommentLike.count({ where: { commentId: updated.id } });
    const likedByMe = !!(await prisma.communityPostCommentLike.findUnique({
      where: { commentId_userId: { commentId: updated.id, userId } }
    }));

    const payload = {
      id: updated.id,
      postId: updated.postId,
      parentId: updated.parentId,
      userId: updated.authorId,
      userName: updated.author?.name || 'Anonymous',
      userAvatar: updated.author?.avatar || null,
      content: updated.content,
      attachmentFileIds: updated.attachments || [],
      attachments: await resolveAttachments(updated.attachments || []),
      status: updated.status,
      deletedAt: updated.deletedAt ? updated.deletedAt.toISOString() : null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      likesCount,
      likedByMe,
      canEdit: true,
      canDelete: true
    };

    if (updateData.content !== undefined) {
      try {
        const post = await prisma.communityPost.findUnique({
          where: { id: updated.postId },
          select: { id: true, authorId: true, visibility: true, mentions: true, status: true }
        });
        if (post && post.status !== 'deleted') {
          const mentionedUsersByUsername = await resolveMentionedUserIds(
            extractMentionUsernames(String(updated.content || ''))
          );
          const rawMentionUserIds = Array.from(
            new Set(mentionedUsersByUsername.map((entry) => String(entry.id || '').trim()))
          ).filter((id) => id && id !== userId) as string[];
          const mentionedUserIds = await filterMentionTargetsForActor(userId, rawMentionUserIds);

          const mentionRecipients = await filterRecipientsForNotification('mention_comment', mentionedUserIds);
          const snippet = buildSnippet(updated.content || '', 100);
          for (const recipientId of mentionRecipients) {
            const canView = await canUserViewPostForNotification(
              {
                authorId: post.authorId,
                visibility: post.visibility,
                mentions: Array.isArray(post.mentions) ? post.mentions.map((id) => String(id)) : []
              },
              recipientId
            );
            if (!canView) continue;
            await createEngagementNotification({
              recipientId,
              actorId: userId,
              type: 'mention_comment',
              title: 'You were mentioned',
              message: `${updated.author?.name || 'Someone'} mentioned you in a comment.`,
              actionUrl: `/community/posts/${updated.postId}?comment=${updated.id}&mention=${encodeURIComponent(recipientId)}`,
              metadata: {
                postId: updated.postId,
                commentId: updated.id,
                actorId: userId,
                mentionedUserId: recipientId,
                snippet
              },
              dedupeWindowMinutes: 10,
              dedupeMetaKeys: ['postId', 'commentId', 'mentionedUserId']
            });
          }
        }
      } catch (notifyError) {
        console.warn('[community.updatePostComment] mention notification failed', notifyError);
      }
    }

    const io = getAppIo(req);
    try { io?.emit('community:post_comment_updated', { comment: payload, postId: updated.postId }); } catch (e) {}
    try { realtime.emitToPost(updated.postId, 'community:post_comment_updated', { comment: payload, postId: updated.postId }); } catch (e) {}

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('Update post comment error:', error);
    const status = Number(error?.statusCode || 500);
    return res.status(status).json({ success: false, error: error?.message || 'Failed to update comment' });
  }
};

export const deletePostComment = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { id } = req.params;

    const comment = await prisma.communityPostComment.findUnique({
      where: { id },
      select: { id: true, postId: true, parentId: true, authorId: true, status: true }
    });
    if (!comment) return res.status(404).json({ success: false, error: 'Comment not found' });
    if (comment.authorId !== userId && !isPrivilegedUser(req.user)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    if (comment.status === 'deleted') {
      return res.json({ success: true });
    }

    await prisma.communityPostComment.update({
      where: { id },
      data: { status: 'deleted', deletedAt: new Date(), content: '', attachments: [] }
    });
    try { await removeUsage('community_post_comment', id); } catch (e) {}

    const io = getAppIo(req);
    try { io?.emit('community:post_comment_deleted', { commentId: id, postId: comment.postId, parentId: comment.parentId }); } catch (e) {}
    try { realtime.emitToPost(comment.postId, 'community:post_comment_deleted', { commentId: id, postId: comment.postId, parentId: comment.parentId }); } catch (e) {}
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Delete post comment error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to delete comment' });
  }
};

export const togglePostCommentLike = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const { id } = req.params;

    const comment = await prisma.communityPostComment.findUnique({
      where: { id },
      select: { id: true, postId: true, status: true, authorId: true, post: { select: { authorId: true } } }
    });
    if (!comment || comment.status === 'deleted') {
      return res.status(404).json({ success: false, error: 'Comment not found' });
    }
    const relatedAuthorIds = [comment.authorId, comment.post?.authorId].filter(Boolean) as string[];
    for (const relatedAuthorId of relatedAuthorIds) {
      if (await hasUserBlockRelation(userId, relatedAuthorId)) {
        return res.status(403).json({ success: false, error: 'Interaction is not allowed for this comment' });
      }
    }

    let liked = false;
    await prisma.$transaction(async (tx) => {
      const existingRows = await tx.communityPostCommentLike.findMany({
        where: { commentId: id, userId },
        orderBy: { createdAt: 'asc' },
        select: { id: true }
      });

      const [primary, ...duplicates] = existingRows;
      if (duplicates.length) {
        await tx.communityPostCommentLike.deleteMany({
          where: { id: { in: duplicates.map((row) => row.id) } }
        });
      }

      if (primary) {
        await tx.communityPostCommentLike.delete({
          where: { id: primary.id }
        });
      } else {
        await tx.communityPostCommentLike.create({
          data: { commentId: id, userId }
        });
        liked = true;
      }
    });

    const likesCount = await prisma.communityPostCommentLike.count({ where: { commentId: id } });

    const io = getAppIo(req);
    const payload = { commentId: id, postId: comment.postId, liked, likesCount, userId };
    try { io?.emit('community:post_comment_like_toggled', payload); } catch (e) {}
    try { realtime.emitToPost(comment.postId, 'community:post_comment_like_toggled', payload); } catch (e) {}

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('Toggle post comment like error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to like comment' });
  }
};
