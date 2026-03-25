import express, { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { normalizeUploadsPath, resolveDirectMediaUrl, resolveFileBaseUrl } from '../utils/mediaUrl';

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

type SearchBucketKey = 'people' | 'pages' | 'jobs' | 'gigs';

type SearchEntry = {
  id: string;
  type: SearchBucketKey;
  title?: string;
  name?: string;
  username?: string;
  subtitle?: string;
  description?: string;
  url: string;
  avatarUrl?: string | null;
  image?: string | null;
  meta?: Record<string, unknown>;
};

type SearchFileRecord = {
  id: string;
  url: string | null;
  storageKey: string | null;
  storageProvider: string | null;
};

const resolveFileUrl = (file: SearchFileRecord, req?: Request) => {
  if (!file) return null;
  const storageProvider = String(file.storageProvider || '').trim().toLowerCase();
  if (storageProvider === 'azure_blob') {
    return `${resolveFileBaseUrl(req)}/api/files/content/${encodeURIComponent(file.id)}`;
  }
  const direct = resolveDirectMediaUrl(file.url, resolveFileBaseUrl(req));
  if (direct) return direct;
  if (file.storageKey) return normalizeUploadsPath(file.storageKey);
  return null;
};

const fallbackAvatar = (label: string, kind: string) =>
  `https://ui-avatars.com/api/?name=${encodeURIComponent(String(label || kind))}`;

const containsFilter = (q: string) => ({ contains: q, mode: 'insensitive' as const });

const searchPosts = async (q: string, limit: number) => {
  const contains = containsFilter(q);
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

  return rows.map((post) => {
    const snippet = String(post.content || '').replace(/\s+/g, ' ').trim().slice(0, 180);
    return {
      id: post.id,
      type: 'posts',
      title: post.title || snippet || 'Post',
      subtitle: snippet,
      description: snippet,
      url: `/post/${post.id}`,
      createdAt: post.createdAt
    };
  });
};

const searchPeople = async (q: string, limit: number, req?: Request): Promise<SearchEntry[]> => {
  const contains = containsFilter(q);
  const rows = await prisma.user.findMany({
    where: {
      isActive: true,
      OR: [{ name: contains }, { username: contains }]
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: { id: true, name: true, username: true, avatar: true }
  });

  return rows.map((user) => {
    const displayName = user.name || user.username || 'User';
    const avatar =
      resolveDirectMediaUrl(user.avatar, resolveFileBaseUrl(req)) ||
      fallbackAvatar(displayName, 'User');
    return {
      id: user.id,
      type: 'people',
      title: displayName,
      name: displayName,
      username: user.username || undefined,
      subtitle: user.username ? `@${user.username}` : undefined,
      description: user.username ? `@${user.username}` : undefined,
      url: user.username ? `/u/${encodeURIComponent(user.username)}` : `/profile/${user.id}`,
      avatarUrl: avatar,
      image: avatar
    };
  });
};

const resolvePageAvatar = (
  page: { logoFileId?: string | null; name: string },
  logoMap: Map<string, string>,
  req?: Request
) => {
  const raw = String(page.logoFileId || '').trim();
  if (!raw) return fallbackAvatar(page.name, 'Page');
  const direct = resolveDirectMediaUrl(raw, resolveFileBaseUrl(req));
  if (direct) return direct;
  const mapped = logoMap.get(raw);
  if (mapped) return mapped;
  return `${resolveFileBaseUrl(req)}/api/files/content/${encodeURIComponent(raw)}`;
};

const searchPages = async (q: string, limit: number, req?: Request): Promise<SearchEntry[]> => {
  const contains = containsFilter(q);
  const rows = await prisma.communityBusinessPage.findMany({
    where: {
      status: 'active',
      OR: [{ name: contains }, { slug: contains }, { handle: contains }]
    },
    orderBy: { updatedAt: 'desc' },
    take: limit,
    select: { id: true, name: true, slug: true, handle: true, tagline: true, logoFileId: true }
  });

  const logoIds = Array.from(
    new Set(
      rows
        .map((page) => String(page.logoFileId || '').trim())
        .filter((id) => id && !resolveDirectMediaUrl(id, resolveFileBaseUrl(req)))
    )
  );

  let logoMap = new Map<string, string>();
  if (logoIds.length) {
    const files = await prisma.file.findMany({
      where: { id: { in: logoIds } },
      select: { id: true, url: true, storageKey: true, storageProvider: true }
    });
    logoMap = new Map<string, string>();
    files.forEach((file) => {
      const resolved = resolveFileUrl(file as SearchFileRecord, req);
      if (resolved) logoMap.set(file.id, resolved);
    });
  }

  return rows.map((page) => {
    const handle = page.handle || undefined;
    const avatar = resolvePageAvatar({ logoFileId: page.logoFileId, name: page.name }, logoMap, req);
    const slugOrHandle = page.slug || page.handle || page.id;
    return {
      id: page.id,
      type: 'pages',
      title: page.name,
      name: page.name,
      username: handle,
      subtitle: page.tagline || (handle ? `@${handle}` : undefined),
      description: page.tagline || (handle ? `@${handle}` : undefined),
      url: `/company/${encodeURIComponent(slugOrHandle)}`,
      avatarUrl: avatar,
      image: avatar
    };
  });
};

const searchJobs = async (q: string, limit: number): Promise<SearchEntry[]> => {
  const contains = containsFilter(q);
  const rows = await prisma.job.findMany({
    where: {
      isActive: true,
      isVisible: true,
      OR: [{ title: contains }, { description: contains }]
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, title: true, budget: true, categoryId: true }
  });

  return rows.map((job) => ({
    id: job.id,
    type: 'jobs',
    title: job.title,
    name: job.title,
    subtitle: job.budget ? `Budget: ${job.budget}` : 'Open job',
    description: job.budget ? `Budget: ${job.budget}` : 'Open job',
    url: `/jobs/${job.id}`,
    meta: { categoryId: job.categoryId || null }
  }));
};

const searchGigs = async (q: string, limit: number, req?: Request): Promise<SearchEntry[]> => {
  const contains = containsFilter(q);
  const rows = await prisma.gig.findMany({
    where: {
      isActive: true,
      OR: [{ title: contains }, { description: contains }]
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: { id: true, slug: true, title: true, price: true, image: true, categoryId: true }
  });

  return rows.map((gig) => ({
    id: gig.id,
    type: 'gigs',
    title: gig.title,
    name: gig.title,
    subtitle: Number.isFinite(Number(gig.price)) ? `From $${Number(gig.price).toFixed(0)}` : 'View gig',
    description: Number.isFinite(Number(gig.price)) ? `From $${Number(gig.price).toFixed(0)}` : 'View gig',
    url: `/gigs/${encodeURIComponent(gig.slug || gig.id)}`,
    image: resolveDirectMediaUrl(gig.image, resolveFileBaseUrl(req)) || null,
    meta: {
      price: Number.isFinite(Number(gig.price)) ? Number(gig.price) : null,
      categoryId: gig.categoryId || null
    }
  }));
};

const interleaveSearchGroups = (
  groups: Record<SearchBucketKey, SearchEntry[]>,
  limit: number
): SearchEntry[] => {
  const queues = [
    [...(groups.people || [])],
    [...(groups.pages || [])],
    [...(groups.jobs || [])],
    [...(groups.gigs || [])]
  ];

  const output: SearchEntry[] = [];
  while (output.length < limit && queues.some((q) => q.length)) {
    for (const queue of queues) {
      if (!queue.length || output.length >= limit) continue;
      const next = queue.shift();
      if (next) output.push(next);
    }
  }
  return output;
};

const resolveUnifiedSearch = async (req: Request, q: string, perType: number, limit: number) => {
  const [people, pages, jobs, gigs] = await Promise.all([
    searchPeople(q, perType, req),
    searchPages(q, perType, req),
    searchJobs(q, perType),
    searchGigs(q, perType, req)
  ]);

  const groups: Record<SearchBucketKey, SearchEntry[]> = { people, pages, jobs, gigs };
  const results = interleaveSearchGroups(groups, limit);
  return {
    query: q,
    groups,
    results,
    totals: {
      people: people.length,
      pages: pages.length,
      jobs: jobs.length,
      gigs: gigs.length,
      total: results.length
    }
  };
};

router.get('/unified', async (req: Request, res: Response) => {
  try {
    const q = normalizeQuery(req.query.q).replace(/\s+/g, ' ').trim();
    const perType = clampInt(req.query.perType, 4, 1, 12);
    const limit = clampInt(req.query.limit, 20, 1, 50);

    if (q.length < 2) {
      return res.json({
        success: true,
        data: {
          query: q,
          groups: { people: [], pages: [], jobs: [], gigs: [] },
          results: [],
          totals: { people: 0, pages: 0, jobs: 0, gigs: 0, total: 0 }
        }
      });
    }

    const data = await resolveUnifiedSearch(req, q, perType, limit);
    return res.json({ success: true, data });
  } catch (error: any) {
    console.error('[search] unified error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to search' });
  }
});

// Enterprise-safe search endpoint.
// GET /api/search?q=...&type=posts|people|pages|jobs|gigs|all&limit=10
router.get('/', async (req: Request, res: Response) => {
  try {
    const q = normalizeQuery(req.query.q).replace(/\s+/g, ' ').trim();
    const type = normalizeQuery(req.query.type || 'posts').toLowerCase();
    const limit = clampInt(req.query.limit, 10, 1, 25);
    const perType = clampInt(req.query.perType, Math.max(2, Math.floor(limit / 2)), 1, 12);

    if (q.length < 2) {
      return res.json({ success: true, data: [] });
    }

    if (type === 'posts' || type === 'post') {
      const data = await searchPosts(q, limit);
      return res.json({ success: true, data });
    }

    if (type === 'people' || type === 'users' || type === 'user') {
      const data = await searchPeople(q, limit, req);
      return res.json({ success: true, data });
    }

    if (type === 'pages' || type === 'page') {
      const data = await searchPages(q, limit, req);
      return res.json({ success: true, data });
    }

    if (type === 'jobs' || type === 'job') {
      const data = await searchJobs(q, limit);
      return res.json({ success: true, data });
    }

    if (type === 'gigs' || type === 'gig') {
      const data = await searchGigs(q, limit, req);
      return res.json({ success: true, data });
    }

    if (type === 'all' || type === 'unified') {
      const unified = await resolveUnifiedSearch(req, q, perType, limit);
      return res.json({ success: true, data: unified.results });
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
            url: `/post/${post.id}`,
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
