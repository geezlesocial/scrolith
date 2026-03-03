import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { createEngagementNotification } from '../services/engagementNotifications.service';

const ensureAuthId = (req: Request) => req.user?.id as string | undefined;
const parseLimit = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

export const followUser = async (req: Request, res: Response) => {
  try {
    const authId = ensureAuthId(req);
    if (!authId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { userId } = req.params;
    if (!userId) return res.status(400).json({ success: false, error: 'Missing userId' });
    if (userId === authId) return res.status(400).json({ success: false, error: 'Cannot follow yourself' });

    const existing = await prisma.userFollow.findFirst({ where: { followerId: authId, followeeId: userId } });
    if (existing) return res.json({ success: true, data: { following: true } });

    await prisma.userFollow.create({ data: { followerId: authId, followeeId: userId } });

    // Follow notification (persist + realtime)
    try {
      const actor = await prisma.user.findUnique({
        where: { id: authId },
        select: { id: true, name: true, username: true }
      });
      const actorName = actor?.name || actor?.username || 'Someone';
      const actorUsername = actor?.username || authId;
      await createEngagementNotification({
        recipientId: userId,
        actorId: authId,
        type: 'followed_you',
        title: 'New follower',
        message: `${actorName} started following you.`,
        actionUrl: `/u/${actorUsername}`,
        metadata: {
          actorId: authId,
          actorUsername,
          followerId: authId,
          followingId: userId
        }
      });
    } catch (e) {
      console.warn('[social.followUser] followed_you notification failed', e);
    }

    return res.json({ success: true, data: { following: true } });
  } catch (error: any) {
    console.error('Follow user error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to follow user' });
  }
};

export const unfollowUser = async (req: Request, res: Response) => {
  try {
    const authId = ensureAuthId(req);
    if (!authId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { userId } = req.params;
    if (!userId) return res.status(400).json({ success: false, error: 'Missing userId' });
    if (userId === authId) return res.status(400).json({ success: false, error: 'Cannot unfollow yourself' });

    await prisma.userFollow.deleteMany({ where: { followerId: authId, followeeId: userId } });
    return res.json({ success: true, data: { following: false } });
  } catch (error: any) {
    console.error('Unfollow user error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to unfollow user' });
  }
};

export const listFollowers = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ success: false, error: 'Missing userId' });

    const limit = parseLimit(req.query?.limit, 50, 10, 100);
    const cursorId = String(req.query?.cursor || '').trim();
    const followers = await prisma.userFollow.findMany({
      where: { followeeId: userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {})
    });
    const hasMore = followers.length > limit;
    const pageRows = hasMore ? followers.slice(0, limit) : followers;
    const userIds = pageRows.map((f) => f.followerId);
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, avatar: true, username: true }
        })
      : [];
    const byId = new Map(users.map((entry) => [entry.id, entry]));
    const ordered = pageRows
      .map((row) => byId.get(row.followerId))
      .filter(Boolean);

    return res.json({
      success: true,
      data: ordered,
      pagination: {
        limit,
        hasMore,
        nextCursor: hasMore ? String(pageRows[pageRows.length - 1]?.id || '') : null
      }
    });
  } catch (error: any) {
    console.error('List followers error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to list followers' });
  }
};

export const listFollowing = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ success: false, error: 'Missing userId' });

    const limit = parseLimit(req.query?.limit, 50, 10, 100);
    const cursorId = String(req.query?.cursor || '').trim();
    const following = await prisma.userFollow.findMany({
      where: { followerId: userId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {})
    });
    const hasMore = following.length > limit;
    const pageRows = hasMore ? following.slice(0, limit) : following;
    const userIds = pageRows.map((f) => f.followeeId);
    const users = userIds.length
      ? await prisma.user.findMany({
          where: { id: { in: userIds } },
          select: { id: true, name: true, avatar: true, username: true }
        })
      : [];
    const byId = new Map(users.map((entry) => [entry.id, entry]));
    const ordered = pageRows
      .map((row) => byId.get(row.followeeId))
      .filter(Boolean);

    return res.json({
      success: true,
      data: ordered,
      pagination: {
        limit,
        hasMore,
        nextCursor: hasMore ? String(pageRows[pageRows.length - 1]?.id || '') : null
      }
    });
  } catch (error: any) {
    console.error('List following error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to list following' });
  }
};
