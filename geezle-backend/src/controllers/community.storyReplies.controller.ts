import type { Request, Response } from 'express';
import prisma from '../utils/prismaClient';

const normalizeVisibility = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['public', 'followers', 'following', 'mutuals', 'network', 'friends', 'private', 'custom'].includes(normalized)) {
    return normalized;
  }
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
    followingIds: new Set<string>(following.map((row) => String(row.followeeId))),
    followerIds: new Set<string>(followers.map((row) => String(row.followerId)))
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

const buildReplyTree = (rows: any[], viewerUserId?: string | null, storyAuthorId?: string | null) => {
  const byParent = new Map<string, any[]>();
  rows.forEach((row) => {
    const key = String(row?.parentId || '');
    const bucket = byParent.get(key) || [];
    bucket.push(row);
    byParent.set(key, bucket);
  });

  const buildNode = (row: any): any => ({
    id: row.id,
    storyId: row.storyId,
    parentId: row.parentId || null,
    content: row.content,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt || ''),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt || ''),
    viewerCanDelete:
      String(viewerUserId || '') === String(row.authorId || '') ||
      String(viewerUserId || '') === String(storyAuthorId || ''),
    author: {
      id: row.authorId,
      name: row.author?.name || row.author?.username || 'Scrolith member',
      username: row.author?.username || null,
      avatarUrl: row.author?.avatar || null
    },
    replies: (byParent.get(String(row.id)) || [])
      .slice()
      .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
      .map(buildNode)
  });

  return (byParent.get('') || [])
    .slice()
    .sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime())
    .map(buildNode);
};

const countReplyBranch = (replyId: string, rows: any[]) => {
  const childMap = new Map<string, string[]>();
  rows.forEach((row) => {
    const key = String(row?.parentId || '');
    const next = childMap.get(key) || [];
    next.push(String(row.id));
    childMap.set(key, next);
  });
  const walk = (id: string): number => {
    const children = childMap.get(id) || [];
    return 1 + children.reduce((sum, childId) => sum + walk(childId), 0);
  };
  return walk(replyId);
};

export const getStoryRepliesController = async (req: Request, res: Response) => {
  try {
    const viewerUserId = String(req.user?.id || '').trim() || null;
    const storyId = String(req.params.id || '').trim();
    if (!storyId) return res.status(400).json({ success: false, error: 'Story ID is required' });

    const story = await prisma.communityStory.findUnique({
      where: { id: storyId },
      select: { id: true, authorId: true, visibility: true, expiresAt: true, commentsCount: true }
    });
    if (!story || (story.expiresAt && story.expiresAt <= new Date())) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }
    const relations = await getFollowRelations(viewerUserId);
    if (!canViewStory(story, viewerUserId, relations)) {
      return res.status(403).json({ success: false, error: 'Not authorized to view this story' });
    }

    const rows = await prisma.communityStoryReply.findMany({
      where: { storyId },
      orderBy: [{ createdAt: 'asc' }],
      include: {
        author: {
          select: { id: true, name: true, username: true, avatar: true }
        }
      }
    });

    return res.json({
      success: true,
      data: {
        storyId,
        totalReplies: rows.length,
        commentsCount: Number(story.commentsCount || rows.length || 0),
        replies: buildReplyTree(rows, viewerUserId, story.authorId)
      }
    });
  } catch (error: any) {
    console.error('Get story replies error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load story replies' });
  }
};

export const createStoryReplyController = async (req: Request, res: Response) => {
  try {
    const userId = String(req.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const storyId = String(req.params.id || '').trim();
    const content = String(req.body?.content || '').trim();
    const parentId = String(req.body?.parentId || '').trim() || null;
    if (!storyId || !content) {
      return res.status(400).json({ success: false, error: 'Story ID and content are required' });
    }

    const story = await prisma.communityStory.findUnique({
      where: { id: storyId },
      select: { id: true, authorId: true, visibility: true, expiresAt: true, commentsCount: true }
    });
    if (!story || (story.expiresAt && story.expiresAt <= new Date())) {
      return res.status(404).json({ success: false, error: 'Story not found' });
    }
    const relations = await getFollowRelations(userId);
    if (!canViewStory(story, userId, relations)) {
      return res.status(403).json({ success: false, error: 'Not authorized to reply to this story' });
    }

    if (parentId) {
      const parent = await prisma.communityStoryReply.findUnique({
        where: { id: parentId },
        select: { id: true, storyId: true }
      });
      if (!parent || String(parent.storyId) !== storyId) {
        return res.status(400).json({ success: false, error: 'Reply target not found for this story' });
      }
    }

    const created = await prisma.$transaction(async (prismaTx) => {
      const reply = await prismaTx.communityStoryReply.create({
        data: {
          storyId,
          authorId: userId,
          parentId,
          content
        },
        include: {
          author: {
            select: { id: true, name: true, username: true, avatar: true }
          }
        }
      });
      const updatedStory = await prismaTx.communityStory.update({
        where: { id: storyId },
        data: { commentsCount: { increment: 1 } },
        select: { commentsCount: true }
      });
      return { reply, commentsCount: Number(updatedStory.commentsCount || 0) };
    });

    return res.json({
      success: true,
      data: {
        storyId,
        commentsCount: created.commentsCount,
        reply: buildReplyTree([created.reply], userId, story.authorId)[0] || null
      }
    });
  } catch (error: any) {
    console.error('Create story reply error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to create story reply' });
  }
};

export const deleteStoryReplyController = async (req: Request, res: Response) => {
  try {
    const userId = String(req.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const replyId = String(req.params.replyId || '').trim();
    if (!replyId) return res.status(400).json({ success: false, error: 'Reply ID is required' });

    const reply = await prisma.communityStoryReply.findUnique({
      where: { id: replyId },
      include: {
        story: {
          select: { id: true, authorId: true }
        }
      }
    });
    if (!reply?.id) return res.status(404).json({ success: false, error: 'Reply not found' });

    const role = String(req.user?.role || '').toLowerCase();
    const canDelete =
      reply.authorId === userId ||
      reply.story?.authorId === userId ||
      role.includes('admin') ||
      role.includes('moderator');
    if (!canDelete) return res.status(403).json({ success: false, error: 'Forbidden' });

    const storyRows = await prisma.communityStoryReply.findMany({
      where: { storyId: reply.storyId },
      select: { id: true, parentId: true }
    });
    const removedCount = countReplyBranch(replyId, storyRows);

    const updated = await prisma.$transaction(async (prismaTx) => {
      await prismaTx.communityStoryReply.delete({ where: { id: replyId } });
      const story = await prismaTx.communityStory.update({
        where: { id: reply.storyId },
        data: { commentsCount: { decrement: removedCount } },
        select: { commentsCount: true }
      });
      return story;
    });

    return res.json({
      success: true,
      data: {
        storyId: reply.storyId,
        replyId,
        removedCount,
        commentsCount: Math.max(0, Number(updated.commentsCount || 0))
      }
    });
  } catch (error: any) {
    console.error('Delete story reply error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to delete story reply' });
  }
};
