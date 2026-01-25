import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';

const ensureAuthId = (req: Request) => req.user?.id as string | undefined;

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

    // Optionally create an in-app notification
    try {
      await prisma.notification.create({
        data: {
          userId,
          actorId: authId,
          type: 'follow',
          title: 'New follower',
          body: 'You have a new follower.',
          isRead: false
        }
      });
    } catch (e) {
      // silent
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

    const followers = await prisma.userFollow.findMany({ where: { followeeId: userId }, orderBy: { createdAt: 'desc' } });
    const userIds = followers.map(f => f.followerId);
    const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, avatar: true } }) : [];

    return res.json({ success: true, data: users });
  } catch (error: any) {
    console.error('List followers error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to list followers' });
  }
};

export const listFollowing = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ success: false, error: 'Missing userId' });

    const following = await prisma.userFollow.findMany({ where: { followerId: userId }, orderBy: { createdAt: 'desc' } });
    const userIds = following.map(f => f.followeeId);
    const users = userIds.length ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, avatar: true } }) : [];

    return res.json({ success: true, data: users });
  } catch (error: any) {
    console.error('List following error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to list following' });
  }
};
