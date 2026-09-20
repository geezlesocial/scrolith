import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';
import { createEngagementNotification } from '../services/engagementNotifications.service';
import { setSafeObjectValue } from '../utils/security/safeObjectKey';

const normalizeId = (value: unknown) => String(value || '').trim();
const parseLimit = (value: unknown, fallback = 20, max = 100) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(numeric)));
};

const userSelect = {
  id: true,
  name: true,
  username: true,
  avatar: true,
  role: true
} as const;

const getBusinessConfig = async () => {
  try {
    if (!prisma || typeof (prisma as any).communityConfig === 'undefined') {
      return {
        businessPagesEnabled: true,
        businessPageFollowEnabled: true
      };
    }
    const config = await prisma.communityConfig.findFirst({ orderBy: { updatedAt: 'desc' } });
    if (!config) {
      return {
        businessPagesEnabled: true,
        businessPageFollowEnabled: true
      };
    }
    return {
      businessPagesEnabled: config.businessPagesEnabled !== false,
      businessPageFollowEnabled: config.businessPageFollowEnabled !== false
    };
  } catch {
    return {
      businessPagesEnabled: true,
      businessPageFollowEnabled: true
    };
  }
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

const emitFollowUpdated = (payload: {
  actorUserId: string;
  targetUserId: string;
  isFollowing: boolean;
}) => {
  const legacyPayload = {
    actorUserId: payload.actorUserId,
    targetUserId: payload.targetUserId,
    isFollowing: payload.isFollowing,
    targetType: 'user',
    targetId: payload.targetUserId,
    followerId: payload.actorUserId,
    action: payload.isFollowing ? 'follow' : 'unfollow'
  };

  try { realtime.emitToUser(payload.actorUserId, 'community:follow_updated', legacyPayload); } catch (e) {}
  try { realtime.emitToUser(payload.targetUserId, 'community:follow_updated', legacyPayload); } catch (e) {}
};

const emitProfileCountsUpdated = async (userIds: string[]) => {
  const uniqueUserIds = Array.from(new Set(userIds.map(normalizeId).filter(Boolean)));
  if (!uniqueUserIds.length) return;

  await Promise.all(
    uniqueUserIds.map(async (userId) => {
      try {
        const [followersCount, followingCount] = await Promise.all([
          prisma.userFollow.count({ where: { followeeId: userId } }),
          prisma.userFollow.count({ where: { followerId: userId } })
        ]);

        realtime.emitToUser(userId, 'community:profile_counts_updated', {
          userId,
          followersCount,
          followingCount
        });
      } catch (e) {}
    })
  );
};

const emitBusinessPageUpdated = async (pageId: string) => {
  const normalizedPageId = normalizeId(pageId);
  if (!normalizedPageId) return;
  try {
    const page = await prisma.communityBusinessPage.findUnique({
      where: { id: normalizedPageId },
      include: { _count: { select: { followers: true, posts: true } } }
    });
    if (!page) return;

    const payload = {
      page: {
        id: page.id,
        ownerId: page.ownerId,
        name: page.name,
        slug: page.slug,
        handle: page.handle,
        status: page.status,
        followersCount: Number(page?._count?.followers || 0),
        postsCount: Number(page?._count?.posts || 0),
        updatedAt: page.updatedAt.toISOString()
      }
    };

    try { realtime.emitToRoom('community:global', 'community:business_page_updated', payload); } catch {}
    try { realtime.emitToUser(page.ownerId, 'community:business_page_updated', payload); } catch {}
  } catch {}
};

const canManageBusinessPage = async (pageId: string, userId: string, role?: string) => {
  const normalizedPageId = normalizeId(pageId);
  const normalizedUserId = normalizeId(userId);
  if (!normalizedPageId || !normalizedUserId) return { allowed: false as const, page: null as any };

  const page = await prisma.communityBusinessPage.findUnique({
    where: { id: normalizedPageId },
    select: { id: true, ownerId: true, status: true, name: true, slug: true, handle: true }
  });
  if (!page) return { allowed: false as const, page: null as any };

  const normalizedRole = String(role || '').toLowerCase();
  const isAdmin = normalizedRole.includes('admin');
  const allowed = isAdmin || page.ownerId === normalizedUserId;
  return { allowed, page };
};

export const followTarget = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const body = req.body || {};
    const inferredType =
      body?.targetType ||
      (body?.targetUserId ? 'user' : body?.targetPageId ? 'page' : '');
    const targetType = String(inferredType || '').trim().toLowerCase();
    const targetId = normalizeId(body?.targetId || body?.targetUserId || body?.targetPageId);
    if (!targetType || !targetId) {
      return res.status(400).json({ success: false, error: 'Missing target' });
    }

    if (targetType === 'user') {
      if (targetId === userId) return res.status(400).json({ success: false, error: 'Cannot follow yourself' });
      if (await hasBlockRelation(userId, targetId)) {
        return res.status(403).json({ success: false, error: 'Follow is not allowed for this user' });
      }
      const existing = await prisma.userFollow.findFirst({ where: { followerId: userId, followeeId: targetId } });
      if (existing) {
        emitFollowUpdated({ actorUserId: userId, targetUserId: targetId, isFollowing: true });
        return res.json({ success: true, data: { id: existing.id, isFollowing: true } });
      }
      const follow = await prisma.userFollow.create({ data: { followerId: userId, followeeId: targetId } });
      try {
        const actor = await prisma.user.findUnique({
          where: { id: userId },
          select: { id: true, name: true, username: true }
        });
        const actorName = actor?.name || actor?.username || 'Someone';
        const actorUsername = actor?.username || userId;
        await createEngagementNotification({
          recipientId: targetId,
          actorId: userId,
          type: 'followed_you',
          title: 'New follower',
          message: `${actorName} started following you.`,
          actionUrl: `/u/${actorUsername}`,
          metadata: {
            actorId: userId,
            actorUsername,
            followerId: userId,
            followingId: targetId
          }
        });
      } catch (notifyError) {
        console.warn('[community.follow] followed_you notification failed', notifyError);
      }
      emitFollowUpdated({ actorUserId: userId, targetUserId: targetId, isFollowing: true });
      await emitProfileCountsUpdated([userId, targetId]);
      return res.json({ success: true, data: { id: follow.id, isFollowing: true } });
    }

    if (targetType === 'page') {
      const config = await getBusinessConfig();
      if (!config.businessPagesEnabled || !config.businessPageFollowEnabled) {
        return res.status(403).json({ success: false, error: 'Business page follows are currently disabled' });
      }

      const page = await prisma.communityBusinessPage.findUnique({ where: { id: targetId } });
      if (!page) return res.status(404).json({ success: false, error: 'Page not found' });
      const status = String(page.status || 'active').toLowerCase();
      if (status !== 'active') {
        return res.status(403).json({ success: false, error: 'This page is not available for follows' });
      }
      const existing = await prisma.communityBusinessPageFollower.findFirst({ where: { pageId: targetId, userId } });
      if (existing) {
        try {
          realtime.emitToUser(userId, 'community:follow_updated', {
            targetType: 'page',
            targetId,
            followerId: userId,
            action: 'follow'
          });
        } catch {}
        return res.json({ success: true, data: { id: existing.id } });
      }
      const follow = await prisma.communityBusinessPageFollower.create({ data: { pageId: targetId, userId } });
      try {
        realtime.emitToUser(page.ownerId, 'community:follow_updated', {
          targetType: 'page',
          targetId,
          followerId: userId,
          action: 'follow'
        });
      } catch {}
      try {
        realtime.emitToUser(userId, 'community:follow_updated', {
          targetType: 'page',
          targetId,
          followerId: userId,
          action: 'follow'
        });
      } catch {}
      await emitBusinessPageUpdated(targetId);
      return res.json({ success: true, data: { id: follow.id } });
    }

    return res.status(400).json({ success: false, error: 'Invalid targetType' });
  } catch (error: any) {
    console.error('Follow error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to follow' });
  }
};

export const followFromBusinessPage = async (req: Request, res: Response) => {
  try {
    const requesterId = req.user?.id;
    if (!requesterId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const pageId = normalizeId(req.params.id);
    const { allowed, page } = await canManageBusinessPage(pageId, requesterId, req.user?.role);
    if (!page) return res.status(404).json({ success: false, error: 'Page not found' });
    if (!allowed) return res.status(403).json({ success: false, error: 'Forbidden' });

    const pageStatus = String(page.status || 'active').toLowerCase();
    if (pageStatus !== 'active') {
      return res.status(403).json({ success: false, error: 'Only active pages can follow targets' });
    }

    const actorUserId = page.ownerId;
    const targetType = String(req.body?.targetType || '').trim().toLowerCase();
    const targetId = normalizeId(req.body?.targetId || req.body?.targetUserId || req.body?.targetPageId);
    if (!targetType || !targetId) {
      return res.status(400).json({ success: false, error: 'Missing target' });
    }

    if (targetType === 'user') {
      if (targetId === actorUserId) {
        return res.status(400).json({ success: false, error: 'Page cannot follow its own owner account' });
      }
      if (await hasBlockRelation(actorUserId, targetId)) {
        return res.status(403).json({ success: false, error: 'Follow is not allowed for this user' });
      }

      const existing = await prisma.userFollow.findUnique({
        where: {
          followerId_followeeId: {
            followerId: actorUserId,
            followeeId: targetId
          }
        }
      });
      if (existing) {
        return res.json({
          success: true,
          data: { id: existing.id, isFollowing: true, actorPageId: pageId, targetType: 'user' }
        });
      }

      const follow = await prisma.userFollow.create({
        data: { followerId: actorUserId, followeeId: targetId }
      });

      emitFollowUpdated({ actorUserId, targetUserId: targetId, isFollowing: true });
      await emitProfileCountsUpdated([actorUserId, targetId]);
      try {
        realtime.emitToUser(targetId, 'community:follow_updated', {
          targetType: 'user',
          targetId,
          followerId: actorUserId,
          actorPageId: pageId,
          actorPageSlug: page.slug,
          actorPageHandle: page.handle,
          actorPageName: page.name,
          action: 'follow'
        });
      } catch {}

      return res.json({
        success: true,
        data: { id: follow.id, isFollowing: true, actorPageId: pageId, targetType: 'user' }
      });
    }

    if (targetType === 'page') {
      const config = await getBusinessConfig();
      if (!config.businessPagesEnabled || !config.businessPageFollowEnabled) {
        return res.status(403).json({ success: false, error: 'Business page follows are currently disabled' });
      }
      if (targetId === pageId) {
        return res.status(400).json({ success: false, error: 'Page cannot follow itself' });
      }

      const targetPage = await prisma.communityBusinessPage.findUnique({
        where: { id: targetId },
        select: { id: true, ownerId: true, status: true, slug: true, handle: true, name: true }
      });
      if (!targetPage) return res.status(404).json({ success: false, error: 'Target page not found' });
      const targetStatus = String(targetPage.status || 'active').toLowerCase();
      if (targetStatus !== 'active') {
        return res.status(403).json({ success: false, error: 'Target page is not available for follows' });
      }

      const existing = await prisma.communityBusinessPageFollower.findFirst({
        where: { pageId: targetId, userId: actorUserId }
      });
      if (existing) {
        return res.json({
          success: true,
          data: { id: existing.id, isFollowing: true, actorPageId: pageId, targetType: 'page' }
        });
      }

      const follow = await prisma.communityBusinessPageFollower.create({
        data: { pageId: targetId, userId: actorUserId }
      });
      try {
        realtime.emitToUser(targetPage.ownerId, 'community:follow_updated', {
          targetType: 'page',
          targetId,
          followerId: actorUserId,
          actorPageId: pageId,
          actorPageSlug: page.slug,
          actorPageHandle: page.handle,
          actorPageName: page.name,
          action: 'follow'
        });
      } catch {}
      await emitBusinessPageUpdated(targetId);

      return res.json({
        success: true,
        data: { id: follow.id, isFollowing: true, actorPageId: pageId, targetType: 'page' }
      });
    }

    return res.status(400).json({ success: false, error: 'Invalid targetType' });
  } catch (error: any) {
    console.error('Follow from business page error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to follow from page' });
  }
};

export const unfollowFromBusinessPage = async (req: Request, res: Response) => {
  try {
    const requesterId = req.user?.id;
    if (!requesterId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const pageId = normalizeId(req.params.id);
    const { allowed, page } = await canManageBusinessPage(pageId, requesterId, req.user?.role);
    if (!page) return res.status(404).json({ success: false, error: 'Page not found' });
    if (!allowed) return res.status(403).json({ success: false, error: 'Forbidden' });

    const actorUserId = page.ownerId;
    const targetType = String(req.body?.targetType || '').trim().toLowerCase();
    const targetId = normalizeId(req.body?.targetId || req.body?.targetUserId || req.body?.targetPageId);
    if (!targetType || !targetId) {
      return res.status(400).json({ success: false, error: 'Missing target' });
    }

    if (targetType === 'user') {
      const follow = await prisma.userFollow.findUnique({
        where: {
          followerId_followeeId: {
            followerId: actorUserId,
            followeeId: targetId
          }
        }
      });
      if (follow) {
        await prisma.userFollow.delete({ where: { id: follow.id } });
        emitFollowUpdated({ actorUserId, targetUserId: targetId, isFollowing: false });
        await emitProfileCountsUpdated([actorUserId, targetId]);
      }
      return res.json({ success: true, data: { isFollowing: false, actorPageId: pageId, targetType: 'user' } });
    }

    if (targetType === 'page') {
      const follow = await prisma.communityBusinessPageFollower.findFirst({
        where: { pageId: targetId, userId: actorUserId }
      });
      if (follow) {
        await prisma.communityBusinessPageFollower.delete({ where: { id: follow.id } });
        await emitBusinessPageUpdated(targetId);
        const targetPage = await prisma.communityBusinessPage.findUnique({
          where: { id: targetId },
          select: { ownerId: true }
        });
        if (targetPage?.ownerId) {
          try {
            realtime.emitToUser(targetPage.ownerId, 'community:follow_updated', {
              targetType: 'page',
              targetId,
              followerId: actorUserId,
              actorPageId: pageId,
              action: 'unfollow'
            });
          } catch {}
        }
      }
      return res.json({ success: true, data: { isFollowing: false, actorPageId: pageId, targetType: 'page' } });
    }

    return res.status(400).json({ success: false, error: 'Invalid targetType' });
  } catch (error: any) {
    console.error('Unfollow from business page error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to unfollow from page' });
  }
};

export const listBusinessPageFollowing = async (req: Request, res: Response) => {
  try {
    const requesterId = req.user?.id;
    if (!requesterId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const pageId = normalizeId(req.params.id);
    const { allowed, page } = await canManageBusinessPage(pageId, requesterId, req.user?.role);
    if (!page) return res.status(404).json({ success: false, error: 'Page not found' });
    if (!allowed) return res.status(403).json({ success: false, error: 'Forbidden' });

    const actorUserId = page.ownerId;
    const [followingUsers, followingPages] = await Promise.all([
      prisma.userFollow.findMany({
        where: { followerId: actorUserId },
        include: { followee: { select: userSelect } },
        orderBy: { createdAt: 'desc' },
        take: 200
      }),
      prisma.communityBusinessPageFollower.findMany({
        where: {
          userId: actorUserId,
          page: { status: { not: 'deleted' } }
        },
        include: {
          page: {
            select: {
              id: true,
              name: true,
              handle: true,
              slug: true,
              logoFileId: true,
              ownerId: true,
              status: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        take: 200
      })
    ]);

    return res.json({
      success: true,
      data: {
        actorPageId: pageId,
        actorPageName: page.name,
        users: followingUsers.map((entry) => ({
          targetType: 'user',
          id: entry.followee.id,
          name: entry.followee.name,
          username: entry.followee.username,
          avatar: entry.followee.avatar,
          role: entry.followee.role,
          followId: entry.id,
          followedAt: entry.createdAt.toISOString()
        })),
        pages: followingPages
          .filter((entry) => entry.page.id !== pageId)
          .map((entry) => ({
            targetType: 'page',
            id: entry.page.id,
            name: entry.page.name,
            handle: entry.page.handle,
            slug: entry.page.slug,
            logoFileId: entry.page.logoFileId || null,
            ownerId: entry.page.ownerId,
            status: entry.page.status,
            followId: entry.id,
            followedAt: entry.createdAt.toISOString()
          }))
      }
    });
  } catch (error: any) {
    console.error('List business page following error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load page following' });
  }
};

export const unfollowTarget = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const followId = String(req.params.id || '').trim();
    if (!followId) return res.status(400).json({ success: false, error: 'Missing follow target' });

    // Phase 20.10: accept follow-record id OR entity id (user/page) for the current actor.
    let userFollow = await prisma.userFollow.findUnique({ where: { id: followId } });
    if (!userFollow) {
      userFollow = await prisma.userFollow.findUnique({
        where: {
          followerId_followeeId: {
            followerId: userId,
            followeeId: followId
          }
        }
      });
    }
    if (userFollow) {
      if (userFollow.followerId !== userId) return res.status(403).json({ success: false, error: 'Forbidden' });
      await prisma.userFollow.delete({ where: { id: userFollow.id } });
      emitFollowUpdated({ actorUserId: userId, targetUserId: userFollow.followeeId, isFollowing: false });
      await emitProfileCountsUpdated([userId, userFollow.followeeId]);
      return res.json({ success: true });
    }

    let pageFollow = await prisma.communityBusinessPageFollower.findUnique({ where: { id: followId } });
    if (!pageFollow) {
      pageFollow = await prisma.communityBusinessPageFollower.findUnique({
        where: {
          pageId_userId: {
            pageId: followId,
            userId
          }
        }
      });
    }
    if (pageFollow) {
      if (pageFollow.userId !== userId) return res.status(403).json({ success: false, error: 'Forbidden' });
      await prisma.communityBusinessPageFollower.delete({ where: { id: pageFollow.id } });
      const targetPage = await prisma.communityBusinessPage.findUnique({
        where: { id: pageFollow.pageId },
        select: { ownerId: true }
      });
      try {
        realtime.emitToUser(userId, 'community:follow_updated', {
          targetType: 'page',
          targetId: pageFollow.pageId,
          followerId: userId,
          action: 'unfollow'
        });
      } catch {}
      if (targetPage?.ownerId) {
        try {
          realtime.emitToUser(targetPage.ownerId, 'community:follow_updated', {
            targetType: 'page',
            targetId: pageFollow.pageId,
            followerId: userId,
            action: 'unfollow'
          });
        } catch {}
      }
      await emitBusinessPageUpdated(pageFollow.pageId);
      return res.json({ success: true });
    }

    return res.status(404).json({ success: false, error: 'Follow not found' });
  } catch (error: any) {
    console.error('Unfollow error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to unfollow' });
  }
};

export const unfollowTargetByUserId = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const targetUserId = normalizeId(req.body?.targetUserId);
    if (!targetUserId) return res.status(400).json({ success: false, error: 'targetUserId is required' });
    if (targetUserId === userId) return res.status(400).json({ success: false, error: 'Cannot unfollow yourself' });

    const existing = await prisma.userFollow.findUnique({
      where: {
        followerId_followeeId: {
          followerId: userId,
          followeeId: targetUserId
        }
      }
    });

    if (existing) {
      await prisma.userFollow.delete({ where: { id: existing.id } });
      emitFollowUpdated({ actorUserId: userId, targetUserId, isFollowing: false });
      await emitProfileCountsUpdated([userId, targetUserId]);
    }

    return res.json({ success: true, data: { targetUserId, isFollowing: false } });
  } catch (error: any) {
    console.error('Unfollow by target user error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to unfollow' });
  }
};

export const listFollowers = async (req: Request, res: Response) => {
  try {
    const { targetType, targetId } = req.query as any;
    if (!targetType || !targetId) return res.status(400).json({ success: false, error: 'Missing target' });

    if (targetType === 'user') {
      const followers = await prisma.userFollow.findMany({ where: { followeeId: targetId }, include: { follower: true } });
      const data = followers.map((f) => ({
        id: f.follower.id,
        name: f.follower.name,
        username: f.follower.username,
        avatar: f.follower.avatar,
        role: f.follower.role,
        followId: f.id
      }));
      return res.json({ success: true, data });
    }

    if (targetType === 'page') {
      const followers = await prisma.communityBusinessPageFollower.findMany({ where: { pageId: targetId }, include: { user: true } });
      const data = followers.map((f) => ({
        id: f.user.id,
        name: f.user.name,
        username: f.user.username,
        avatar: f.user.avatar,
        role: f.user.role,
        followId: f.id
      }));
      return res.json({ success: true, data });
    }

    return res.status(400).json({ success: false, error: 'Invalid targetType' });
  } catch (error: any) {
    console.error('List followers error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load followers' });
  }
};

export const listFollowing = async (req: Request, res: Response) => {
  try {
    const userIdParam = (req.query.userId as string) || '';
    const userId = userIdParam === 'me' || !userIdParam ? req.user?.id : userIdParam;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const followingUsers = await prisma.userFollow.findMany({ where: { followerId: userId }, include: { followee: true } });
    const followingPages = await prisma.communityBusinessPageFollower.findMany({
      where: {
        userId,
        page: {
          status: { not: 'deleted' }
        }
      },
      include: { page: true }
    });

    const data = {
      users: followingUsers.map((f) => ({ id: f.followee.id, name: f.followee.name, avatar: f.followee.avatar, followId: f.id })),
      pages: followingPages.map((f) => ({ id: f.page.id, name: f.page.name, handle: f.page.handle, slug: f.page.slug, followId: f.id }))
    };

    return res.json({ success: true, data });
  } catch (error: any) {
    console.error('List following error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load following' });
  }
};

export const listMyFollowers = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const cursor = normalizeId(req.query.cursor);
    const limit = parseLimit(req.query.limit, 20, 100);

    const follows = await prisma.userFollow.findMany({
      where: {
        followeeId: userId,
        ...(cursor ? { id: { lt: cursor } } : {})
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { follower: { select: userSelect } }
    });

    const slice = follows.slice(0, limit);
    const ids = slice.map((entry) => entry.followerId);
    const blocks = ids.length
      ? await prisma.userBlock.findMany({
          where: { blockerId: userId, blockedId: { in: ids } },
          select: { blockedId: true }
        })
      : [];
    const blockedSet = new Set(blocks.map((entry) => entry.blockedId));

    return res.json({
      success: true,
      data: {
        items: slice.map((entry) => ({
          followId: entry.id,
          followedAt: entry.createdAt.toISOString(),
          user: entry.follower,
          isBlocked: blockedSet.has(entry.followerId)
        })),
        nextCursor: follows.length > limit ? follows[limit].id : null
      }
    });
  } catch (error: any) {
    console.error('List my followers error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load followers' });
  }
};

export const listMyFollowing = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const cursor = normalizeId(req.query.cursor);
    const limit = parseLimit(req.query.limit, 20, 100);

    const follows = await prisma.userFollow.findMany({
      where: {
        followerId: userId,
        ...(cursor ? { id: { lt: cursor } } : {})
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: { followee: { select: userSelect } }
    });

    const slice = follows.slice(0, limit);
    const ids = slice.map((entry) => entry.followeeId);
    const blocks = ids.length
      ? await prisma.userBlock.findMany({
          where: { blockerId: userId, blockedId: { in: ids } },
          select: { blockedId: true }
        })
      : [];
    const blockedSet = new Set(blocks.map((entry) => entry.blockedId));

    return res.json({
      success: true,
      data: {
        items: slice.map((entry) => ({
          followId: entry.id,
          followedAt: entry.createdAt.toISOString(),
          user: entry.followee,
          isBlocked: blockedSet.has(entry.followeeId)
        })),
        nextCursor: follows.length > limit ? follows[limit].id : null
      }
    });
  } catch (error: any) {
    console.error('List my following error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load following' });
  }
};

export const blockUser = async (req: Request, res: Response) => {
  try {
    const blockerId = req.user?.id;
    if (!blockerId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const blockedId = normalizeId(req.body?.userId);
    if (!blockedId) return res.status(400).json({ success: false, error: 'userId is required' });
    if (blockedId === blockerId) return res.status(400).json({ success: false, error: 'Cannot block yourself' });

    const target = await prisma.user.findUnique({ where: { id: blockedId }, select: { id: true } });
    if (!target) return res.status(404).json({ success: false, error: 'User not found' });

    await prisma.userBlock.upsert({
      where: {
        blockerId_blockedId: {
          blockerId,
          blockedId
        }
      },
      create: { blockerId, blockedId },
      update: {}
    });

    const removed = await prisma.userFollow.deleteMany({
      where: {
        OR: [
          { followerId: blockerId, followeeId: blockedId },
          { followerId: blockedId, followeeId: blockerId }
        ]
      }
    });

    if (removed.count > 0) {
      emitFollowUpdated({ actorUserId: blockerId, targetUserId: blockedId, isFollowing: false });
      emitFollowUpdated({ actorUserId: blockedId, targetUserId: blockerId, isFollowing: false });
      await emitProfileCountsUpdated([blockerId, blockedId]);
    }

    try {
      realtime.emitToUser(blockerId, 'community:user_block_updated', { blockerId, blockedId, blocked: true });
      realtime.emitToUser(blockedId, 'community:user_block_updated', { blockerId, blockedId, blocked: true });
    } catch {}

    return res.json({ success: true, data: { blockerId, blockedId, blocked: true } });
  } catch (error: any) {
    console.error('Block user error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to block user' });
  }
};

export const unblockUser = async (req: Request, res: Response) => {
  try {
    const blockerId = req.user?.id;
    if (!blockerId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const blockedId = normalizeId(req.params.userId);
    if (!blockedId) return res.status(400).json({ success: false, error: 'userId is required' });

    await prisma.userBlock.deleteMany({ where: { blockerId, blockedId } });

    try {
      realtime.emitToUser(blockerId, 'community:user_block_updated', { blockerId, blockedId, blocked: false });
      realtime.emitToUser(blockedId, 'community:user_block_updated', { blockerId, blockedId, blocked: false });
    } catch {}

    return res.json({ success: true, data: { blockerId, blockedId, blocked: false } });
  } catch (error: any) {
    console.error('Unblock user error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to unblock user' });
  }
};

export const listMyBlocks = async (req: Request, res: Response) => {
  try {
    const blockerId = req.user?.id;
    if (!blockerId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const cursor = normalizeId(req.query.cursor);
    const limit = parseLimit(req.query.limit, 20, 100);

    const rows = await prisma.userBlock.findMany({
      where: {
        blockerId,
        ...(cursor ? { id: { lt: cursor } } : {})
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: {
        blocked: { select: userSelect }
      }
    });

    const slice = rows.slice(0, limit);
    return res.json({
      success: true,
      data: {
        items: slice.map((entry) => ({
          id: entry.id,
          blockedAt: entry.createdAt.toISOString(),
          user: entry.blocked
        })),
        nextCursor: rows.length > limit ? rows[limit].id : null
      }
    });
  } catch (error: any) {
    console.error('List blocks error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load blocked users' });
  }
};

export const followStatusBulk = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const requestedIds: unknown[] = Array.isArray(req.body?.targetUserIds) ? (req.body.targetUserIds as unknown[]) : [];
    const targetUserIds = Array.from(
      new Set(
        requestedIds
          .map(normalizeId)
          .filter(Boolean)
          .filter((id) => id !== userId)
      )
    ).slice(0, 500);

    const data: Record<string, boolean> = {};
    targetUserIds.forEach((id) => {
      setSafeObjectValue(data, id, false);
    });

    if (!targetUserIds.length) {
      return res.json({ success: true, data });
    }

    const follows = await prisma.userFollow.findMany({
      where: {
        followerId: userId,
        followeeId: { in: targetUserIds }
      },
      select: { followeeId: true }
    });

    follows.forEach((follow) => {
      setSafeObjectValue(data, follow.followeeId, true);
    });

    return res.json({ success: true, data });
  } catch (error: any) {
    console.error('Follow status bulk error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load follow status' });
  }
};
