import type { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';
import { createEngagementNotification } from '../services/engagementNotifications.service';
import { recordFeedIntentSignal } from '../services/opportunityGraph.service';

const ok = (res: Response, message: string, data?: any) => res.json({ success: true, message, data: data ?? {} });
const fail = (res: Response, status: number, message: string, error?: any) =>
  res.status(status).json({ success: false, message, error: error ?? message });

const normalizeId = (value: unknown) => String(value || '').trim();

const isPrivilegedRole = (role?: string) => {
  const normalized = String(role || '').trim().toLowerCase();
  return normalized.includes('admin') || normalized.includes('moderator');
};

const hasBlockRelation = async (a: string, b: string) => {
  const first = normalizeId(a);
  const second = normalizeId(b);
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

const getActivePostOrFail = async (postId: string) => {
  const normalized = normalizeId(postId);
  if (!normalized) return null;
  const post = await prisma.communityPost.findUnique({
    where: { id: normalized },
    select: {
      id: true,
      authorId: true,
      businessPageId: true,
      status: true,
      visibility: true,
      tags: true,
      topic: true,
      viewsCount: true,
      likesCount: true,
      sharesCount: true,
      repostsCount: true
    }
  });
  if (!post || String(post.status || '').toLowerCase() === 'deleted') return null;
  return post;
};

const resolveAuthorTarget = (post: { authorId: string; businessPageId?: string | null }) => {
  const businessPageId = normalizeId(post.businessPageId);
  if (businessPageId) return { targetType: 'page' as const, targetId: businessPageId, authorUserId: post.authorId };
  return { targetType: 'user' as const, targetId: post.authorId, authorUserId: post.authorId };
};

const buildPostIntentMeta = (post: Awaited<ReturnType<typeof getActivePostOrFail>>) => ({
  topics: Array.from(
    new Set(
      [post?.topic, ...(Array.isArray(post?.tags) ? post.tags : [])]
        .map((entry) => normalizeId(entry))
        .filter(Boolean)
    )
  ),
  authorId: normalizeId(post?.authorId),
  businessPageId: normalizeId(post?.businessPageId),
  visibility: normalizeId(post?.visibility)
});

const DEFAULT_SAVED_COLLECTION_NAME = 'Saved Posts';

type SavedPostCollectionSummary = {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  postCount: number;
  isSelected: boolean;
  createdAt: string;
  updatedAt: string;
};

const mapCollectionSummary = (
  collection: {
    id: string;
    name: string;
    description: string | null;
    isDefault: boolean;
    createdAt: Date;
    updatedAt: Date;
    _count?: { items?: number };
  },
  selectedIds: Set<string>
): SavedPostCollectionSummary => ({
  id: collection.id,
  name: collection.name,
  description: collection.description,
  isDefault: Boolean(collection.isDefault),
  postCount: Number(collection._count?.items || 0),
  isSelected: selectedIds.has(collection.id),
  createdAt: collection.createdAt.toISOString(),
  updatedAt: collection.updatedAt.toISOString()
});

const resolveSavedCollection = async ({
  userId,
  collectionId,
  collectionName,
  collectionDescription
}: {
  userId: string;
  collectionId?: string | null;
  collectionName?: string | null;
  collectionDescription?: string | null;
}) => {
  const normalizedId = normalizeId(collectionId);
  const normalizedName = normalizeId(collectionName);
  const normalizedDescription = normalizeId(collectionDescription);

  if (normalizedId) {
    const collection = await prisma.postCollection.findFirst({
      where: { id: normalizedId, userId }
    });
    if (!collection) {
      const error = new Error('Collection not found') as Error & { statusCode?: number };
      error.statusCode = 404;
      throw error;
    }
    return collection;
  }

  if (normalizedName) {
    const existing = await prisma.postCollection.findFirst({
      where: { userId, name: normalizedName }
    });
    if (existing) return existing;
    return prisma.postCollection.create({
      data: {
        userId,
        name: normalizedName,
        description: normalizedDescription || null,
        isDefault: false
      }
    });
  }

  const existingDefault = await prisma.postCollection.findFirst({
    where: { userId, isDefault: true }
  });
  if (existingDefault) return existingDefault;

  return prisma.postCollection.create({
    data: {
      userId,
      name: DEFAULT_SAVED_COLLECTION_NAME,
      description: 'Posts you save from the feed.',
      isDefault: true
    }
  });
};

const listUserCollections = async (userId: string, postId?: string | null) => {
  const collections = await prisma.postCollection.findMany({
    where: { userId },
    orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }, { createdAt: 'desc' }],
    include: { _count: { select: { items: true } } }
  });

  const selectedIds = new Set<string>();
  const normalizedPostId = normalizeId(postId);
  if (normalizedPostId && collections.length) {
    const itemRows = await prisma.postCollectionItem.findMany({
      where: {
        postId: normalizedPostId,
        collectionId: { in: collections.map((collection) => collection.id) }
      },
      select: { collectionId: true }
    });
    itemRows.forEach((row) => selectedIds.add(row.collectionId));
  }

  return collections.map((collection) => mapCollectionSummary(collection as any, selectedIds));
};

export const savePost = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized');
    const postId = normalizeId(req.params.id);
    const collectionId = normalizeId(req.body?.collectionId);
    const collectionName = normalizeId(req.body?.collectionName);
    const collectionDescription = normalizeId(req.body?.collectionDescription);
    const post = await getActivePostOrFail(postId);
    if (!post) return fail(res, 404, 'Post not found');
    if (await hasBlockRelation(userId, post.authorId)) return fail(res, 403, 'Action is not allowed for this post');

    const collection = await resolveSavedCollection({
      userId,
      collectionId: collectionId || null,
      collectionName: collectionName || null,
      collectionDescription: collectionDescription || null
    });

    const favorite = await prisma.favorite.upsert({
      where: {
        userId_entityType_entityId: { userId, entityType: 'POST', entityId: post.id }
      },
      update: {},
      create: { userId, entityType: 'POST', entityId: post.id }
    });

    await prisma.postCollectionItem.upsert({
      where: {
        collectionId_postId: { collectionId: collection.id, postId: post.id }
      },
      update: {},
      create: { collectionId: collection.id, postId: post.id }
    });

    await recordFeedIntentSignal({
      userId,
      entityType: 'POST',
      entityId: post.id,
      signal: 'SAVE',
      surface: 'post_options',
      meta: buildPostIntentMeta(post)
    }).catch(() => null);

    const savedCollections = await listUserCollections(userId, post.id).catch(() => []);
    return ok(res, 'Post saved', {
      saved: true,
      favoriteId: favorite.id,
      collectionId: collection.id,
      collectionName: collection.name,
      savedCollections
    });
  } catch (error: any) {
    console.error('[posts.savePost] error:', error);
    const status = Number(error?.statusCode || error?.status || 500);
    return fail(res, status, 'Failed to save post', error?.message);
  }
};

export const unsavePost = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized');
    const postId = normalizeId(req.params.id);
    if (!postId) return fail(res, 400, 'Missing post id');

    const userCollections = await prisma.postCollection.findMany({
      where: { userId },
      select: { id: true }
    });
    const collectionIds = userCollections.map((collection) => collection.id);

    await prisma.favorite
      .delete({
        where: {
          userId_entityType_entityId: { userId, entityType: 'POST', entityId: postId }
        }
      })
      .catch(() => null);

    if (collectionIds.length) {
      await prisma.postCollectionItem.deleteMany({
        where: {
          postId,
          collectionId: { in: collectionIds }
        }
      }).catch(() => null);
    }

    return ok(res, 'Post removed from saved', { saved: false });
  } catch (error: any) {
    console.error('[posts.unsavePost] error:', error);
    return fail(res, 500, 'Failed to unsave post', error?.message);
  }
};

export const hidePost = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized');
    const postId = normalizeId(req.params.id);
    const post = await getActivePostOrFail(postId);
    if (!post) return fail(res, 404, 'Post not found');

    await prisma.communityPostHidden.upsert({
      where: { postId_userId: { postId: post.id, userId } },
      update: {},
      create: { postId: post.id, userId }
    });

    try {
      realtime.emitToUser(userId, 'community:post_hidden', { postId: post.id });
    } catch {}

    return ok(res, 'Post hidden', { hidden: true });
  } catch (error: any) {
    console.error('[posts.hidePost] error:', error);
    return fail(res, 500, 'Failed to hide post', error?.message);
  }
};

export const markInterested = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized');
    const postId = normalizeId(req.params.id);
    const post = await getActivePostOrFail(postId);
    if (!post) return fail(res, 404, 'Post not found');

    const row = await prisma.communityPostFeedback.upsert({
      where: { postId_userId: { postId: post.id, userId } },
      update: { signal: 'INTERESTED' },
      create: { postId: post.id, userId, signal: 'INTERESTED' }
    });

    await recordFeedIntentSignal({
      userId,
      entityType: 'POST',
      entityId: post.id,
      signal: 'INTERESTED',
      surface: normalizeId(req.body?.surface) || 'post_options',
      weight: 1.25,
      meta: buildPostIntentMeta(post)
    }).catch(() => null);

    return ok(res, 'Sounds good! Expect more Posts like this coming your way.', { signal: row.signal });
  } catch (error: any) {
    console.error('[posts.markInterested] error:', error);
    return fail(res, 500, 'Failed to record feedback', error?.message);
  }
};

export const markNotInterested = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized');
    const postId = normalizeId(req.params.id);
    const post = await getActivePostOrFail(postId);
    if (!post) return fail(res, 404, 'Post not found');

    const row = await prisma.communityPostFeedback.upsert({
      where: { postId_userId: { postId: post.id, userId } },
      update: { signal: 'NOT_INTERESTED' },
      create: { postId: post.id, userId, signal: 'NOT_INTERESTED' }
    });

    // Common expectation: not interested also hides it.
    await prisma.communityPostHidden.upsert({
      where: { postId_userId: { postId: post.id, userId } },
      update: {},
      create: { postId: post.id, userId }
    });

    await recordFeedIntentSignal({
      userId,
      entityType: 'POST',
      entityId: post.id,
      signal: 'NOT_INTERESTED',
      surface: normalizeId(req.body?.surface) || 'post_options',
      weight: 1.5,
      meta: buildPostIntentMeta(post)
    }).catch(() => null);

    return ok(res, "Sounds good! We'll show you fewer posts like this for now.", { signal: row.signal, hidden: true });
  } catch (error: any) {
    console.error('[posts.markNotInterested] error:', error);
    return fail(res, 500, 'Failed to record feedback', error?.message);
  }
};

export const reportPost = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized');
    const postId = normalizeId(req.params.id);
    const post = await getActivePostOrFail(postId);
    if (!post) return fail(res, 404, 'Post not found');

    const reason = String(req.body?.reason || '').trim() || null;
    const details = String(req.body?.details || '').trim() || null;

    const report = await prisma.communityPostReport.upsert({
      where: { postId_reporterId: { postId: post.id, reporterId: userId } },
      update: { reason, details, status: 'pending' },
      create: { postId: post.id, reporterId: userId, reason, details, status: 'pending' }
    });

    const payload = {
      reportId: report.id,
      postId: post.id,
      reporterId: userId,
      status: 'pending'
    };
    try { realtime.emitToRoom('community:admin', 'community:post_report_submitted', payload); } catch {}
    try { realtime.emitToRoom('community:global', 'community:post_report_submitted', payload); } catch {}

    return ok(res, 'Report submitted', { reportId: report.id, status: report.status });
  } catch (error: any) {
    console.error('[posts.reportPost] error:', error);
    return fail(res, 500, 'Failed to submit report', error?.message);
  }
};

export const followAuthor = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized');
    const postId = normalizeId(req.params.id);
    const post = await getActivePostOrFail(postId);
    if (!post) return fail(res, 404, 'Post not found');

    const target = resolveAuthorTarget(post);
    if (target.targetType === 'user') {
      if (target.targetId === userId) return fail(res, 400, 'Cannot follow yourself');
      if (await hasBlockRelation(userId, target.targetId)) return fail(res, 403, 'Follow is not allowed for this user');

      const existing = await prisma.userFollow.findFirst({ where: { followerId: userId, followeeId: target.targetId } });
      if (!existing) {
        await prisma.userFollow.create({ data: { followerId: userId, followeeId: target.targetId } });
        try {
          const actor = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, username: true } });
          const actorName = actor?.name || actor?.username || 'Someone';
          const actorUsername = actor?.username || userId;
          await createEngagementNotification({
            recipientId: target.targetId,
            actorId: userId,
            type: 'followed_you',
            title: 'New follower',
            message: `${actorName} started following you.`,
            actionUrl: `/u/${encodeURIComponent(actorUsername)}`,
            metadata: { actorId: userId, actorUsername, followerId: userId, followingId: target.targetId }
          });
        } catch (notifyError) {
          console.warn('[posts.followAuthor] followed_you notification failed', notifyError);
        }
      }

      const payload = {
        actorUserId: userId,
        targetUserId: target.targetId,
        isFollowing: true,
        targetType: 'user',
        targetId: target.targetId,
        followerId: userId,
        action: 'follow'
      };
      try { realtime.emitToUser(userId, 'community:follow_updated', payload); } catch {}
      try { realtime.emitToUser(target.targetId, 'community:follow_updated', payload); } catch {}
      await recordFeedIntentSignal({
        userId,
        entityType: 'USER',
        entityId: target.targetId,
        signal: 'FOLLOW_AUTHOR',
        surface: 'post_options',
        weight: 1.5,
        meta: buildPostIntentMeta(post)
      }).catch(() => null);
      return ok(res, 'Following author', { isFollowing: true, targetType: 'user', targetId: target.targetId });
    }

    const existing = await prisma.communityBusinessPageFollower.findFirst({ where: { userId, pageId: target.targetId } });
    if (!existing) {
      await prisma.communityBusinessPageFollower.create({ data: { userId, pageId: target.targetId } });
    }
    await recordFeedIntentSignal({
      userId,
      entityType: 'PAGE',
      entityId: target.targetId,
      signal: 'FOLLOW_AUTHOR',
      surface: 'post_options',
      weight: 1.5,
      meta: buildPostIntentMeta(post)
    }).catch(() => null);
    return ok(res, 'Following page', { isFollowing: true, targetType: 'page', targetId: target.targetId });
  } catch (error: any) {
    console.error('[posts.followAuthor] error:', error);
    return fail(res, 500, 'Failed to follow author', error?.message);
  }
};

export const unfollowAuthor = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized');
    const postId = normalizeId(req.params.id);
    const post = await getActivePostOrFail(postId);
    if (!post) return fail(res, 404, 'Post not found');

    const target = resolveAuthorTarget(post);
    if (target.targetType === 'user') {
      await prisma.userFollow
        .delete({
          where: {
            followerId_followeeId: { followerId: userId, followeeId: target.targetId }
          }
        })
        .catch(() => null);

      const payload = {
        actorUserId: userId,
        targetUserId: target.targetId,
        isFollowing: false,
        targetType: 'user',
        targetId: target.targetId,
        followerId: userId,
        action: 'unfollow'
      };
      try { realtime.emitToUser(userId, 'community:follow_updated', payload); } catch {}
      try { realtime.emitToUser(target.targetId, 'community:follow_updated', payload); } catch {}
      return ok(res, 'Unfollowed author', { isFollowing: false, targetType: 'user', targetId: target.targetId });
    }

    await prisma.communityBusinessPageFollower
      .deleteMany({ where: { userId, pageId: target.targetId } })
      .catch(() => null);
    return ok(res, 'Unfollowed page', { isFollowing: false, targetType: 'page', targetId: target.targetId });
  } catch (error: any) {
    console.error('[posts.unfollowAuthor] error:', error);
    return fail(res, 500, 'Failed to unfollow author', error?.message);
  }
};

export const toggleNotifications = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized');
    const postId = normalizeId(req.params.id);
    const post = await getActivePostOrFail(postId);
    if (!post) return fail(res, 404, 'Post not found');

    const target = resolveAuthorTarget(post);
    const isFollowing =
      target.targetType === 'user'
        ? Boolean(
            await prisma.userFollow.findUnique({
              where: { followerId_followeeId: { followerId: userId, followeeId: target.targetId } },
              select: { id: true }
            })
          )
        : Boolean(
            await prisma.communityBusinessPageFollower.findFirst({
              where: { userId, pageId: target.targetId },
              select: { id: true }
            })
          );

    const existing = await prisma.communityNotificationSubscription.findUnique({
      where: {
        userId_targetType_targetId: { userId, targetType: target.targetType, targetId: target.targetId }
      },
      select: { id: true, enabled: true }
    });

    const currentEffective = existing ? existing.enabled !== false : isFollowing;
    const nextEnabled = !currentEffective;

    if (existing) {
      if (nextEnabled === isFollowing) {
        // No longer need an override; fall back to follow default.
        await prisma.communityNotificationSubscription.delete({ where: { id: existing.id } }).catch(() => null);
      } else {
        await prisma.communityNotificationSubscription.update({
          where: { id: existing.id },
          data: { enabled: nextEnabled }
        });
      }
    } else {
      await prisma.communityNotificationSubscription.create({
        data: { userId, targetType: target.targetType, targetId: target.targetId, enabled: nextEnabled }
      });
    }

    return ok(res, nextEnabled ? 'Notifications turned on' : 'Notifications turned off', {
      enabled: nextEnabled,
      targetType: target.targetType,
      targetId: target.targetId
    });
  } catch (error: any) {
    console.error('[posts.toggleNotifications] error:', error);
    return fail(res, 500, 'Failed to toggle notifications', error?.message);
  }
};

export const whyThisPost = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const viewerRole = req.user?.role;
    if (!userId) return fail(res, 401, 'Unauthorized');

    const postId = normalizeId(req.params.id);
    const post = await getActivePostOrFail(postId);
    if (!post) return fail(res, 404, 'Post not found');

    const target = resolveAuthorTarget(post);
    const reasons: Array<{ id: string; label: string }> = [];

    // Follow-based reason
    if (target.targetType === 'user') {
      const follow = await prisma.userFollow.findFirst({ where: { followerId: userId, followeeId: target.targetId }, select: { id: true } });
      if (follow) reasons.push({ id: 'follow', label: 'You follow this user.' });
    } else {
      const follow = await prisma.communityBusinessPageFollower.findFirst({ where: { userId, pageId: target.targetId }, select: { id: true } });
      if (follow) reasons.push({ id: 'follow_page', label: 'You follow this page.' });
    }

    const topicLabels = Array.from(new Set([post.topic, ...(Array.isArray(post.tags) ? post.tags : [])].map((entry) => normalizeId(entry)).filter(Boolean)));
    if (topicLabels.length) {
      const followedTopics = await prisma.topicFollow.findMany({
        where: { userId },
        select: { id: true, topic: { select: { label: true, slug: true } } },
        take: 100
      }).catch(() => []);

      const matchingFollowedTopics = followedTopics.filter((row: any) => {
        const label = normalizeId(row.topic?.label).toLowerCase();
        const slug = normalizeId(row.topic?.slug).toLowerCase();
        return topicLabels.some((entry) => {
          const normalized = entry.toLowerCase();
          return normalized === label || normalized === slug;
        });
      });

      if (matchingFollowedTopics.length) {
        const labels = matchingFollowedTopics.map((row: any) => row.topic?.label).filter(Boolean).slice(0, 2);
        reasons.push({
          id: 'followed_topics',
          label: labels.length
            ? `This post matches topics you follow: ${labels.join(', ')}.`
            : 'This post matches topics you follow.'
        });
      }

      const signalRows = await prisma.feedIntentSignal.findMany({
        where: {
          userId,
          signal: { in: ['INTERESTED', 'SAVE', 'FOLLOW_AUTHOR'] },
          createdAt: { gte: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45) }
        },
        orderBy: { createdAt: 'desc' },
        take: 80,
        select: { meta: true }
      }).catch(() => []);

      const interestedTopics = new Set<string>();
      signalRows.forEach((row: any) => {
        const topics = Array.isArray(row?.meta?.topics) ? row.meta.topics : [];
        topics.forEach((entry: unknown) => {
          const normalized = normalizeId(entry).toLowerCase();
          if (normalized) interestedTopics.add(normalized);
        });
      });

      if (topicLabels.some((entry) => interestedTopics.has(entry.toLowerCase()))) {
        reasons.push({ id: 'recent_interest', label: 'This post matches topics you recently saved or explored.' });
      }
    }

    // Trending heuristic
    const engagement = Number(post.likesCount || 0) + Number(post.sharesCount || 0) + Number(post.repostsCount || 0);
    if (Number(post.viewsCount || 0) >= 200 || engagement >= 25) {
      reasons.push({ id: 'trending', label: 'This post is trending in the community.' });
    }

    // Interest/topic heuristic (placeholder until reco model is formalized)
    if (post.topic || (Array.isArray(post.tags) && post.tags.length)) {
      reasons.push({ id: 'interests', label: 'This post matches topics you have interacted with recently.' });
    } else {
      reasons.push({ id: 'activity', label: 'This post was recommended based on your recent activity.' });
    }

    if (isPrivilegedRole(viewerRole)) {
      reasons.push({ id: 'moderation', label: 'You may be seeing this post due to elevated moderation privileges.' });
    }

    const primary = reasons[0]?.label || 'This post was recommended for you.';
    return ok(res, 'Why you are seeing this post', { primary, reasons });
  } catch (error: any) {
    console.error('[posts.whyThisPost] error:', error);
    return fail(res, 500, 'Failed to explain this post', error?.message);
  }
};

export const getPostOptionsState = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized');

    const postId = normalizeId(req.params.id);
    const post = await getActivePostOrFail(postId);
    if (!post) return fail(res, 404, 'Post not found');

    const target = resolveAuthorTarget(post);

    const isFollowingAuthor =
      target.targetType === 'user'
        ? Boolean(
            await prisma.userFollow.findUnique({
              where: { followerId_followeeId: { followerId: userId, followeeId: target.targetId } },
              select: { id: true }
            })
          )
        : Boolean(
            await prisma.communityBusinessPageFollower.findFirst({
              where: { userId, pageId: target.targetId },
              select: { id: true }
            })
          );

    const favorite = await prisma.favorite
      .findUnique({
        where: { userId_entityType_entityId: { userId, entityType: 'POST', entityId: post.id } },
        select: { id: true }
      })
      .catch(() => null);
    const saved = Boolean(favorite?.id);

    const savedCollections = await listUserCollections(userId, post.id).catch(() => []);
    const savedCollectionCount = savedCollections.filter((collection) => collection.isSelected).length;

    const sub = await prisma.communityNotificationSubscription
      .findUnique({
        where: { userId_targetType_targetId: { userId, targetType: target.targetType, targetId: target.targetId } },
        select: { enabled: true }
      })
      .catch(() => null);
    const notificationsEnabled = sub ? sub.enabled !== false : isFollowingAuthor;

    const isOwner = post.authorId === userId;
    const isAdminOrMod = isPrivilegedRole(req.user?.role);

    return ok(res, 'Post options state', {
      isFollowingAuthor,
      saved,
      savedCollectionCount,
      savedCollections,
      notificationsEnabled,
      isOwner,
      isAdminOrMod,
      targetType: target.targetType,
      targetId: target.targetId
    });
  } catch (error: any) {
    console.error('[posts.getPostOptionsState] error:', error);
    return fail(res, 500, 'Failed to load post options state', error?.message);
  }
};

export const listPostCollections = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized');

    const postId = normalizeId(req.query?.postId);
    if (postId) {
      const post = await getActivePostOrFail(postId);
      if (!post) return fail(res, 404, 'Post not found');
    }

    const collections = await listUserCollections(userId, postId);

    return ok(res, 'Collections loaded', {
      collections,
      postId: postId || null,
      defaultCollectionName: DEFAULT_SAVED_COLLECTION_NAME
    });
  } catch (error: any) {
    console.error('[posts.listPostCollections] error:', error);
    return fail(res, 500, 'Failed to load collections', error?.message);
  }
};

export const createPostCollection = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized');

    const name = normalizeId(req.body?.name);
    const description = normalizeId(req.body?.description);
    const isDefault = Boolean(req.body?.isDefault);
    if (!name) return fail(res, 400, 'Collection name is required');

    const existing = await prisma.postCollection.findFirst({
      where: { userId, name }
    });
    if (existing) {
      const collections = await listUserCollections(userId, null).catch(() => []);
      return ok(res, 'Collection already exists', {
        collection: mapCollectionSummary({ ...existing, _count: { items: 0 } } as any, new Set()),
        collections
      });
    }

    const collection = await prisma.postCollection.create({
      data: {
        userId,
        name,
        description: description || null,
        isDefault
      }
    });

    const collections = await listUserCollections(userId, null).catch(() => []);
    return ok(res, 'Collection created', {
      collection: mapCollectionSummary({ ...collection, _count: { items: 0 } } as any, new Set()),
      collections
    });
  } catch (error: any) {
    console.error('[posts.createPostCollection] error:', error);
    return fail(res, 500, 'Failed to create collection', error?.message);
  }
};
