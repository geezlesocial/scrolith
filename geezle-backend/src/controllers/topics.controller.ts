import type { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { ensureTopics, resolveTopicByParam } from '../services/opportunityGraph.service';

const ok = (res: Response, data: any) => res.json({ success: true, data });
const fail = (res: Response, status: number, error: string) => res.status(status).json({ success: false, error });

export const listTopics = async (req: Request, res: Response) => {
  try {
    const query = String(req.query.query || '').trim();
    const kind = String(req.query.kind || '').trim();
    const limit = Math.max(1, Math.min(50, Number(req.query.limit || 12) || 12));

    const topics = await prisma.topic.findMany({
      where: {
        status: 'active',
        ...(kind ? { kind } : {}),
        ...(query
          ? {
              OR: [
                { label: { contains: query, mode: 'insensitive' } },
                { slug: { contains: query.toLowerCase() } },
                { aliases: { some: { alias: { contains: query.toLowerCase() } } } }
              ]
            }
          : {})
      },
      orderBy: [{ followerCount: 'desc' }, { usageCount: 'desc' }, { label: 'asc' }],
      take: limit,
      select: {
        id: true,
        slug: true,
        label: true,
        kind: true,
        followerCount: true,
        usageCount: true
      }
    });

    return ok(res, { items: topics });
  } catch (error: any) {
    console.error('[topics.listTopics] error:', error);
    return fail(res, 500, error?.message || 'Failed to load topics');
  }
};

export const listMyTopicFollows = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized');

    const rows = await prisma.topicFollow.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        createdAt: true,
        topic: {
          select: {
            id: true,
            slug: true,
            label: true,
            kind: true,
            followerCount: true,
            usageCount: true
          }
        }
      }
    });

    return ok(
      res,
      rows.map((row) => ({
        id: row.id,
        createdAt: row.createdAt,
        ...row.topic
      }))
    );
  } catch (error: any) {
    console.error('[topics.listMyTopicFollows] error:', error);
    return fail(res, 500, error?.message || 'Failed to load topic follows');
  }
};

export const followTopic = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized');

    const topicParam = String(req.params.topicId || '').trim();
    const requestedLabel = String(req.body?.label || '').trim();
    let topic = await resolveTopicByParam(topicParam || requestedLabel);

    if (!topic && requestedLabel) {
      const created = await ensureTopics([requestedLabel], String(req.body?.kind || 'general').trim() || 'general');
      topic = created[0] || null;
    }

    if (!topic) return fail(res, 404, 'Topic not found');

    const existing = await prisma.topicFollow.findUnique({
      where: { userId_topicId: { userId, topicId: topic.id } },
      select: { id: true }
    });

    if (!existing) {
      await prisma.topicFollow.create({ data: { userId, topicId: topic.id } });
      await prisma.topic.update({
        where: { id: topic.id },
        data: { followerCount: { increment: 1 } }
      });
    }

    const refreshed = await prisma.topic.findUnique({
      where: { id: topic.id },
      select: { id: true, slug: true, label: true, kind: true, followerCount: true, usageCount: true }
    });

    return ok(res, { followed: true, topic: refreshed || topic });
  } catch (error: any) {
    console.error('[topics.followTopic] error:', error);
    return fail(res, 500, error?.message || 'Failed to follow topic');
  }
};

export const unfollowTopic = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized');

    const topic = await resolveTopicByParam(req.params.topicId);
    if (!topic) return fail(res, 404, 'Topic not found');

    const removed = await prisma.topicFollow.deleteMany({
      where: { userId, topicId: topic.id }
    });

    if (removed.count > 0) {
      await prisma.topic.update({
        where: { id: topic.id },
        data: { followerCount: { decrement: removed.count } }
      });
    }

    return ok(res, { followed: false, topicId: topic.id });
  } catch (error: any) {
    console.error('[topics.unfollowTopic] error:', error);
    return fail(res, 500, error?.message || 'Failed to unfollow topic');
  }
};
