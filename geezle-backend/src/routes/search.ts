import express, { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { applySearchRankingRules } from '../services/discovery.service';
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

type SearchBucketKey = 'people' | 'pages' | 'jobs' | 'gigs' | 'posts';
type SearchEntityType = SearchBucketKey | 'posts';

type SearchEntry = {
  id: string;
  type: SearchEntityType;
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

type SearchSuggestionEntry = {
  text: string;
  type: 'keyword' | 'category' | 'history' | 'result';
  category?: string;
  url?: string;
  description?: string;
  score?: number;
};

const DEFAULT_SEARCH_PROMPTS = [
  'interview tips',
  'latest in ai',
  'balancing work and personal life',
  'remote work',
  "when's the best time to switch jobs",
  'logo design',
  'web development',
  'social media marketing',
  'project manager',
  'brand identity'
];

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

const isAnonymousRequest = (req: Request) =>
  !req.headers.authorization &&
  !req.headers.cookie &&
  !req.headers['x-user-id'];

const setPublicCache = (res: Response, seconds = 120) => {
  if (res.headersSent) return;
  const maxAge = Math.max(0, Math.trunc(seconds));
  res.setHeader(
    'Cache-Control',
    `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${Math.max(60, maxAge * 2)}`
  );
  res.setHeader('Vary', 'Accept-Encoding');
};

const containsFilter = (q: string) => ({ contains: q, mode: 'insensitive' as const });

const searchPosts = async (q: string, limit: number): Promise<SearchEntry[]> => {
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

const resolvePeopleAvatar = (
  user: { avatar?: string | null; profilePhotoFileId?: string | null; name?: string | null; username?: string | null },
  photoMap: Map<string, string>,
  req?: Request
) => {
  const displayName = user.name || user.username || 'User';
  const photoId = String(user.profilePhotoFileId || '').trim();
  if (photoId) {
    const mapped = photoMap.get(photoId);
    if (mapped) return mapped;
    // Durable public identity content URL — browsers can load without bearer tokens.
    return `${resolveFileBaseUrl(req)}/api/files/content/${encodeURIComponent(photoId)}`;
  }
  const direct = resolveDirectMediaUrl(user.avatar, resolveFileBaseUrl(req));
  if (direct) return direct;
  // Avatar string may already be a content path or file id.
  const rawAvatar = String(user.avatar || '').trim();
  if (rawAvatar && !rawAvatar.includes('://') && !rawAvatar.includes('/') && rawAvatar.length >= 8) {
    return `${resolveFileBaseUrl(req)}/api/files/content/${encodeURIComponent(rawAvatar)}`;
  }
  return fallbackAvatar(displayName, 'User');
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
    select: { id: true, name: true, username: true, avatar: true, profilePhotoFileId: true }
  });

  const photoIds = Array.from(
    new Set(
      rows
        .map((user) => String(user.profilePhotoFileId || '').trim())
        .filter((id) => Boolean(id))
    )
  );

  let photoMap = new Map<string, string>();
  if (photoIds.length) {
    const files = await prisma.file.findMany({
      where: { id: { in: photoIds } },
      select: { id: true, url: true, storageKey: true, storageProvider: true }
    });
    photoMap = new Map<string, string>();
    files.forEach((file) => {
      // Prefer durable content API for identity photos (works when storage URLs expire).
      photoMap.set(file.id, `${resolveFileBaseUrl(req)}/api/files/content/${encodeURIComponent(file.id)}`);
      const resolved = resolveFileUrl(file as SearchFileRecord, req);
      if (resolved && !photoMap.has(file.id)) photoMap.set(file.id, resolved);
    });
  }

  // Best-effort publicize / retarget dangling identity photos for search <img> tags.
  const healedPhotoIds = new Map<string, string>();
  await Promise.all(
    rows.map(async (user) => {
      try {
        const { ensurePublicIdentityPhoto } = await import('../utils/identityPhoto');
        const healed = await ensurePublicIdentityPhoto({
          userId: user.id,
          profilePhotoFileId: user.profilePhotoFileId,
          avatar: user.avatar,
          retargetUser: true
        });
        if (healed) {
          healedPhotoIds.set(user.id, healed);
          // Refresh photo map entry for content URL resolution.
          photoMap.set(healed, `${resolveFileBaseUrl(req)}/api/files/content/${encodeURIComponent(healed)}`);
        }
      } catch {
        // non-fatal
      }
    })
  );

  return rows.map((user) => {
    const displayName = user.name || user.username || 'User';
    const healedId = healedPhotoIds.get(user.id) || user.profilePhotoFileId || null;
    const avatar = resolvePeopleAvatar(
      { ...user, profilePhotoFileId: healedId },
      photoMap,
      req
    );
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
      image: avatar,
      meta: healedId
        ? { profilePhotoFileId: healedId, profile_photo_file_id: healedId }
        : undefined
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
    [...(groups.gigs || [])],
    [...(groups.posts || [])]
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

const normalizeSuggestionText = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim();

const dedupeSuggestions = (items: SearchSuggestionEntry[], limit: number) => {
  const map = new Map<string, SearchSuggestionEntry>();
  items.forEach((item) => {
    const text = normalizeSuggestionText(item.text);
    if (!text) return;
    const key = text.toLowerCase();
    if (!map.has(key)) map.set(key, { ...item, text });
  });
  return Array.from(map.values()).slice(0, limit);
};

const resolveSuggestedQueries = async (req: Request, q: string, limit: number): Promise<SearchSuggestionEntry[]> => {
  const clean = normalizeSuggestionText(q).toLowerCase();
  if (clean.length < 2) {
    return DEFAULT_SEARCH_PROMPTS.slice(0, limit).map((text) => ({
      text,
      type: 'keyword',
      category: 'Try searching for'
    }));
  }

  const [unified, posts] = await Promise.all([
    resolveUnifiedSearch(req, clean, 4, 16).catch(() => ({
      groups: { people: [], pages: [], jobs: [], gigs: [], posts: [] },
      results: []
    } as any)),
    searchPosts(clean, 4).catch(() => [])
  ]);

  const resultSuggestions: SearchSuggestionEntry[] = [
    ...((unified?.results || []) as SearchEntry[]),
    ...((posts || []) as SearchEntry[])
  ].map((item) => ({
    text: normalizeSuggestionText(item.title || item.name || item.username || item.description),
    type: 'result',
    category: String(item.type || 'result').replace(/s$/, ''),
    url: item.url,
    description: item.subtitle || item.description,
    score: Number(item.meta?.score || 0) || undefined
  }));

  const promptSuggestions = DEFAULT_SEARCH_PROMPTS
    .filter((text) => text.toLowerCase().includes(clean) || clean.includes(text.toLowerCase().split(' ')[0] || ''))
    .map((text) => ({
      text,
      type: 'keyword' as const,
      category: 'Scrolith prompt'
    }));

  return dedupeSuggestions(
    [
      ...resultSuggestions,
      ...promptSuggestions,
      { text: clean, type: 'keyword', category: 'Search Scrolith' }
    ],
    limit
  );
};

const resolveUnifiedSearch = async (req: Request, q: string, perType: number, limit: number) => {
  const [rawPeople, rawPages, rawJobs, rawGigs, rawPosts] = await Promise.all([
    searchPeople(q, perType, req),
    searchPages(q, perType, req),
    searchJobs(q, perType),
    searchGigs(q, perType, req),
    searchPosts(q, perType)
  ]);

  const [people, pages, jobs, gigs, posts] = await Promise.all([
    applySearchRankingRules(rawPeople, { scope: 'unified', query: q }) as Promise<SearchEntry[]>,
    applySearchRankingRules(rawPages, { scope: 'unified', query: q }) as Promise<SearchEntry[]>,
    applySearchRankingRules(rawJobs, { scope: 'unified', query: q }) as Promise<SearchEntry[]>,
    applySearchRankingRules(rawGigs, { scope: 'unified', query: q }) as Promise<SearchEntry[]>,
    applySearchRankingRules(rawPosts, { scope: 'unified', query: q }) as Promise<SearchEntry[]>
  ]);

  const groups: Record<SearchBucketKey, SearchEntry[]> = { people, pages, jobs, gigs, posts };
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
      posts: posts.length,
      total: results.length
    }
  };
};

router.get('/unified', async (req: Request, res: Response) => {
  try {
    const q = normalizeQuery(req.query.q).replace(/\s+/g, ' ').trim();
    const perType = clampInt(req.query.perType, 4, 1, 12);
    const limit = clampInt(req.query.limit, 20, 1, 50);
    if (isAnonymousRequest(req)) {
      setPublicCache(res, q.length >= 2 ? 90 : 300);
    }

    if (q.length < 2) {
      return res.json({
        success: true,
        data: {
          query: q,
          groups: { people: [], pages: [], jobs: [], gigs: [], posts: [] },
          results: [],
          totals: { people: 0, pages: 0, jobs: 0, gigs: 0, posts: 0, total: 0 }
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

router.get('/suggestions', async (req: Request, res: Response) => {
  try {
    const q = normalizeQuery(req.query.q).replace(/\s+/g, ' ').trim();
    const limit = clampInt(req.query.limit, 8, 1, 12);
    if (isAnonymousRequest(req)) {
      setPublicCache(res, q.length >= 2 ? 60 : 300);
    }
    const data = await resolveSuggestedQueries(req, q, limit);
    return res.json({ success: true, data });
  } catch (error: any) {
    console.error('[search] suggestions error:', error);
    return res.json({
      success: true,
      data: DEFAULT_SEARCH_PROMPTS.slice(0, 6).map((text) => ({
        text,
        type: 'keyword',
        category: 'Try searching for'
      }))
    });
  }
});

router.get('/trending', async (req: Request, res: Response) => {
  try {
    const limit = clampInt(req.query.limit, 6, 1, 20);
    if (isAnonymousRequest(req)) {
      setPublicCache(res, 180);
    }
    const [jobs, gigs, pages] = await Promise.all([
      prisma.job.findMany({
        where: { isActive: true, isVisible: true },
        orderBy: { createdAt: 'desc' },
        take: Math.max(2, Math.ceil(limit / 3)),
        select: { title: true }
      }).catch(() => []),
      prisma.gig.findMany({
        where: { isActive: true },
        orderBy: { createdAt: 'desc' },
        take: Math.max(2, Math.ceil(limit / 3)),
        select: { title: true }
      }).catch(() => []),
      prisma.communityBusinessPage.findMany({
        where: { status: 'active' },
        orderBy: { updatedAt: 'desc' },
        take: Math.max(2, Math.ceil(limit / 3)),
        select: { name: true }
      }).catch(() => [])
    ]);

    const labels = [
      ...jobs.map((item) => item.title),
      ...gigs.map((item) => item.title),
      ...pages.map((item) => item.name),
      ...DEFAULT_SEARCH_PROMPTS
    ]
      .map(normalizeSuggestionText)
      .filter(Boolean);

    const data = Array.from(new Set(labels.map((label) => label.toLowerCase())))
      .map((key) => labels.find((label) => label.toLowerCase() === key) || key)
      .slice(0, limit)
      .map((keyword, index) => ({
        id: `trend-${index + 1}`,
        keyword,
        count: Math.max(100, 980 - index * 65),
        trend: index < 3 ? 'up' : 'stable'
      }));

    return res.json({ success: true, data });
  } catch (error: any) {
    console.error('[search] trending error:', error);
    return res.json({ success: true, data: [] });
  }
});

router.get('/quick-tags', async (req: Request, res: Response) => {
  if (isAnonymousRequest(req)) {
    setPublicCache(res, 900);
  }
  const data = DEFAULT_SEARCH_PROMPTS.slice(0, 8).map((label, index) => ({
    id: `qt-${index + 1}`,
    label,
    url: `/search?q=${encodeURIComponent(label)}`,
    bgColor: ['#EEF2FF', '#FCE7F3', '#F3E8FF', '#ECFDF5', '#EFF6FF', '#FFF7ED', '#F0FDFA', '#FEF2F2'][index % 8]
  }));
  return res.json({ success: true, data });
});

router.get('/history', async (_req: Request, res: Response) => {
  return res.json({ success: true, data: [] });
});

router.post('/history', async (_req: Request, res: Response) => {
  return res.json({ success: true, data: null });
});

router.get('/semantic', async (req: Request, res: Response) => {
  try {
    const q = normalizeQuery(req.query.query || req.query.q).replace(/\s+/g, ' ').trim();
    if (isAnonymousRequest(req)) {
      setPublicCache(res, q.length >= 2 ? 90 : 300);
    }
    if (q.length < 2) return res.json({ success: true, data: [] });
    const unified = await resolveUnifiedSearch(req, q, 5, clampInt(req.query.limit, 20, 1, 50));
    const posts = await searchPosts(q, 8);
    return res.json({ success: true, data: [...unified.results, ...posts].slice(0, 25) });
  } catch (error: any) {
    console.error('[search] semantic error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to search' });
  }
});

router.get('/analytics', async (req: Request, res: Response) => {
  if (isAnonymousRequest(req)) {
    setPublicCache(res, 300);
  }
  const query = normalizeQuery(req.query.query || req.query.q);
  return res.json({
    success: true,
    data: {
      query,
      resultsCount: 0,
      avgPrice: 0,
      avgRating: 0,
      avgDeliveryTime: 0,
      topCategories: [],
      trend: 'stable'
    }
  });
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
      const data = await applySearchRankingRules(await searchPosts(q, limit), { scope: 'search', query: q });
      return res.json({ success: true, data });
    }

    if (type === 'people' || type === 'users' || type === 'user') {
      const data = await applySearchRankingRules(await searchPeople(q, limit, req), { scope: 'search', query: q });
      return res.json({ success: true, data });
    }

    if (type === 'pages' || type === 'page') {
      const data = await applySearchRankingRules(await searchPages(q, limit, req), { scope: 'search', query: q });
      return res.json({ success: true, data });
    }

    if (type === 'jobs' || type === 'job') {
      const data = await applySearchRankingRules(await searchJobs(q, limit), { scope: 'search', query: q });
      return res.json({ success: true, data });
    }

    if (type === 'gigs' || type === 'gig') {
      const data = await applySearchRankingRules(await searchGigs(q, limit, req), { scope: 'search', query: q });
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
