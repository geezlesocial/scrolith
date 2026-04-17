import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';

const normalizeText = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim();

export const getRecommendations = async (req: Request, res: Response) => {
  try {
    const userId = normalizeText(req.params?.userId || req.query?.userId);
    const items: any[] = [];

    if (userId) {
      const follows = await prisma.userFollow.findMany({
        where: { followerId: userId },
        select: { followeeId: true },
        take: 100
      });
      const followedIds = Array.from(new Set(follows.map((row) => row.followeeId).filter(Boolean)));
      if (followedIds.length) {
        const posts = await prisma.communityPost.findMany({
          where: { authorId: { in: followedIds }, status: { not: 'deleted' }, visibility: 'public' },
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: { id: true, title: true, content: true, createdAt: true }
        });
        posts.forEach((post) => {
          const snippet = normalizeText(post.content).slice(0, 140);
          items.push({
            id: `post:${post.id}`,
            type: 'post',
            title: normalizeText(post.title) || snippet || 'Post from your network',
            snippet,
            url: `/post/${post.id}`,
            relevance: 0.95
          });
        });
      }
    }

    const [jobs, gigs, pages] = await Promise.all([
      prisma.job.findMany({
        where: { isActive: true, isVisible: true },
        orderBy: [{ isRecommended: 'desc' }, { createdAt: 'desc' }],
        take: 6,
        select: { id: true, title: true, budget: true }
      }),
      prisma.gig.findMany({
        where: { isActive: true },
        orderBy: [{ isRecommended: 'desc' }, { createdAt: 'desc' }],
        take: 6,
        select: { id: true, slug: true, title: true, price: true }
      }),
      prisma.communityBusinessPage.findMany({
        where: { status: 'active' },
        orderBy: { updatedAt: 'desc' },
        take: 4,
        select: { id: true, name: true, slug: true, handle: true, tagline: true }
      })
    ]);

    jobs.forEach((job, index) => {
      items.push({
        id: `job:${job.id}`,
        type: 'job',
        title: job.title,
        snippet: job.budget ? `Budget: ${job.budget}` : 'Open job',
        url: `/jobs/${job.id}`,
        relevance: 0.82 - index * 0.01
      });
    });

    gigs.forEach((gig, index) => {
      items.push({
        id: `gig:${gig.id}`,
        type: 'gig',
        title: gig.title,
        snippet: Number.isFinite(Number(gig.price)) ? `From $${Number(gig.price).toFixed(0)}` : 'View gig',
        url: `/gigs/${encodeURIComponent(gig.slug || gig.id)}`,
        relevance: 0.8 - index * 0.01
      });
    });

    pages.forEach((page, index) => {
      const slug = page.slug || page.handle || page.id;
      items.push({
        id: `page:${page.id}`,
        type: 'page',
        title: page.name,
        snippet: page.tagline || (page.handle ? `@${page.handle}` : 'Scrolith page'),
        url: `/company/${encodeURIComponent(slug)}`,
        relevance: 0.74 - index * 0.01
      });
    });

    const data = Array.from(new Map(items.map((item) => [item.id, item])).values()).slice(0, 20);
    return res.json({ success: true, data });
  } catch (error: any) {
    console.error('[searchController] recommendations error:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to load recommendations'
    });
  }
};
