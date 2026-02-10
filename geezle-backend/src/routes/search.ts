import express, { Request, Response } from 'express';
import prisma from '../utils/prismaClient';

const router = express.Router();

// Health check (no auth)
router.get('/health', (_req, res) => {
  res.json({ success: true, service: 'search' });
});

const normalizeId = (value: unknown) => String(value || '').trim();

const resolveRecommendations = async (req: Request, res: Response) => {
  try {
    const userId = normalizeId(req.params.userId || req.query.userId);

    const [activeJobs, activeGigs] = await Promise.all([
      prisma.job.findMany({
        where: { isActive: true, status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, title: true, budget: true }
      }),
      prisma.gig.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
        take: 8,
        select: { id: true, title: true, price: true }
      })
    ]);

    const items: Array<{
      id: string;
      type: 'post' | 'job' | 'gig';
      title: string;
      snippet?: string;
      url: string;
      relevance: number;
    }> = [];

    if (userId) {
      const following = await prisma.userFollow.findMany({
        where: { followerId: userId },
        select: { followeeId: true },
        take: 200
      });
      const followingIds = Array.from(new Set(following.map((row) => row.followeeId)));
      if (followingIds.length) {
        const posts = await prisma.communityPost.findMany({
          where: { authorId: { in: followingIds }, status: { not: 'deleted' } },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { id: true, title: true, content: true }
        });

        posts.forEach((post) => {
          const snippet = String(post.content || '').replace(/\s+/g, ' ').trim().slice(0, 120);
          items.push({
            id: `post:${post.id}`,
            type: 'post',
            title: post.title || snippet || 'New post from your network',
            snippet,
            url: `/community/posts/${post.id}`,
            relevance: 0.95
          });
        });
      }
    }

    activeJobs.forEach((job, idx) => {
      items.push({
        id: `job:${job.id}`,
        type: 'job',
        title: job.title,
        snippet: job.budget ? `Budget: ${job.budget}` : undefined,
        url: `/jobs/${job.id}`,
        relevance: 0.8 - idx * 0.01
      });
    });

    activeGigs.forEach((gig, idx) => {
      items.push({
        id: `gig:${gig.id}`,
        type: 'gig',
        title: gig.title,
        snippet: Number.isFinite(Number(gig.price)) ? `From $${Number(gig.price).toFixed(0)}` : undefined,
        url: `/gigs/${gig.id}`,
        relevance: 0.78 - idx * 0.01
      });
    });

    const deduped = Array.from(
      new Map(items.map((item) => [item.id, item])).values()
    ).slice(0, 20);

    return res.json(deduped);
  } catch (error: any) {
    console.error('[search] recommendations error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load recommendations' });
  }
};

router.get('/recommendations', resolveRecommendations);
router.get('/recommendations/:userId', resolveRecommendations);

export default router;
