import express, { Request, Response } from 'express';
import prisma from '../utils/prismaClient';

const router = express.Router();

// Health check (no auth)
router.get('/health', (_req, res) => {
  res.json({ success: true, service: 'search' });
});

const normalizeId = (value: unknown) => String(value || '').trim();
const normalizeQuery = (value: unknown) => String(value || '').trim();

const clampInt = (value: unknown, fallback: number, min: number, max: number) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
};

// Enterprise-safe search endpoint for the mobile shell.
// GET /api/search?q=...&type=posts|people|pages|jobs|gigs&limit=10
router.get('/', async (req: Request, res: Response) => {
  try {
    const q = normalizeQuery(req.query.q).replace(/\s+/g, ' ').trim();
    const type = normalizeQuery(req.query.type || 'posts').toLowerCase();
    const limit = clampInt(req.query.limit, 10, 1, 25);

    if (q.length < 2) {
      return res.json({ success: true, data: [] });
    }

    const contains = { contains: q, mode: 'insensitive' as const };

    if (type === 'posts' || type === 'post') {
      const rows = await prisma.communityPost.findMany({
        where: {
          status: { not: 'deleted' },
          visibility: 'public',
          OR: [{ title: contains }, { content: contains }]
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, title: true, content: true, createdAt: true }
      });

      const data = rows.map((post) => {
        const snippet = String(post.content || '').replace(/\s+/g, ' ').trim().slice(0, 180);
        return {
          id: post.id,
          title: post.title || snippet || 'Post',
          subtitle: snippet,
          url: `/community/posts/${post.id}`,
          createdAt: post.createdAt
        };
      });
      return res.json({ success: true, data });
    }

    if (type === 'people' || type === 'users' || type === 'user') {
      const rows = await prisma.user.findMany({
        where: {
          isActive: true,
          OR: [{ name: contains }, { username: contains }]
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: { id: true, name: true, username: true, avatar: true }
      });

      const data = rows.map((user) => ({
        id: user.id,
        name: user.name || user.username || 'User',
        username: user.username || undefined,
        subtitle: user.username ? `@${user.username}` : undefined,
        url: `/profile/${user.id}`,
        avatarUrl: user.avatar || null
      }));
      return res.json({ success: true, data });
    }

    if (type === 'pages' || type === 'page') {
      const rows = await prisma.communityBusinessPage.findMany({
        where: {
          status: 'active',
          OR: [{ name: contains }, { slug: contains }, { handle: contains }]
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: { id: true, name: true, slug: true, handle: true, tagline: true }
      });

      const data = rows.map((page) => ({
        id: page.id,
        name: page.name,
        subtitle: page.tagline || (page.handle ? `@${page.handle}` : undefined),
        url: `/company/${page.slug}`
      }));
      return res.json({ success: true, data });
    }

    if (type === 'jobs' || type === 'job') {
      const rows = await prisma.job.findMany({
        where: {
          isActive: true,
          isVisible: true,
          OR: [{ title: contains }, { description: contains }]
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, title: true, budget: true }
      });

      const data = rows.map((job) => ({
        id: job.id,
        title: job.title,
        subtitle: job.budget ? `Budget: ${job.budget}` : undefined,
        url: `/jobs/${job.id}`
      }));
      return res.json({ success: true, data });
    }

    if (type === 'gigs' || type === 'gig') {
      const rows = await prisma.gig.findMany({
        where: {
          isActive: true,
          OR: [{ title: contains }, { description: contains }]
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: { id: true, title: true, price: true }
      });

      const data = rows.map((gig) => ({
        id: gig.id,
        title: gig.title,
        subtitle: Number.isFinite(Number(gig.price)) ? `From $${Number(gig.price).toFixed(0)}` : undefined,
        url: `/gigs/${gig.id}`
      }));
      return res.json({ success: true, data });
    }

    return res.json({ success: true, data: [] });
  } catch (error: any) {
    console.error('[search] query error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to search' });
  }
});

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
