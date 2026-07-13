/**
 * Enterprise feed orchestration for member-home and /community.
 * Reuses opportunityGraph ranking, discovery recipes, ads, marketplace.
 * Opaque cursor pagination — no offset. Additive to existing /community/feed.
 */
import prisma from '../utils/prismaClient';
import {
  getViewerFeedContext,
  normalizeFeedSurfaceMode,
  scoreCommunityPostForMode,
  type FeedSurfaceMode
} from './opportunityGraph.service';
import { getActiveFeedRecipe } from './discovery.service';
import { selectAdsForPlacement } from './adService';
import { listMarketplaceListings } from './marketplace.service';

export type OrchestratedSurface = 'member_home' | 'community';

export type UnifiedFeedItemType =
  | 'POST'
  | 'COMMUNITY_POST'
  | 'JOB'
  | 'GIG'
  | 'MARKETPLACE_LISTING'
  | 'AD'
  | 'STORY'
  | 'SCROLL_VIDEO'
  | 'PERSON_RECOMMENDATION'
  | 'PAGE_RECOMMENDATION'
  | 'COMMUNITY_RECOMMENDATION'
  | 'EVENT'
  | 'FEATURED'
  | 'TRENDING';

/** @deprecated Use UnifiedFeedItemType */
export type FeedItemType = UnifiedFeedItemType;

export type OrchestratedFeedItem = {
  type: UnifiedFeedItemType;
  id: string;
  sourceId: string;
  feedKey: string;
  createdAt: string;
  score: number;
  /** @deprecated prefer score */
  rankingScore: number;
  author: {
    id?: string | null;
    type?: string | null;
    displayName?: string | null;
    username?: string | null;
    avatarUrl?: string | null;
    businessSlug?: string | null;
  } | null;
  media: any;
  visibility: string;
  /** Client-safe short reason only (never private signals). */
  why?: string | null;
  payload: any;
};

export type MemberFeedResult = {
  items: OrchestratedFeedItem[];
  nextCursor: string | null;
  hasMore: boolean;
  mode: string;
  surface: OrchestratedSurface;
  diagnostics?: {
    sourceCounts: Record<string, number>;
    filteredCounts: Record<string, number>;
    deduplicatedCount: number;
    pageSize: number;
    seenKeys: number;
  };
};

type CursorState = {
  v: 1;
  /** Rolling feedKeys already delivered (cross-page dedupe). */
  k: string[];
  /** ISO watermark for time-bounded source queries. */
  w: string | null;
};

type Candidate = OrchestratedFeedItem & { _source: string; _authorKey: string };

const clean = (value: unknown) => String(value || '').replace(/\s+/g, ' ').trim();
const clampInt = (value: unknown, fallback: number, min: number, max: number) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
};

export const buildFeedKey = (type: UnifiedFeedItemType, sourceId: string) =>
  `${type}:${clean(sourceId)}`;

export const encodeMemberFeedCursor = (state: CursorState): string =>
  Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');

export const decodeMemberFeedCursor = (raw?: string | null): CursorState => {
  const value = clean(raw);
  if (!value) return { v: 1, k: [], w: null };
  try {
    const json = Buffer.from(value, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    const keys = Array.isArray(parsed?.k)
      ? parsed.k.map((entry: unknown) => clean(entry)).filter(Boolean).slice(-120)
      : [];
    const watermark = parsed?.w ? clean(parsed.w) : null;
    return { v: 1, k: keys, w: watermark || null };
  } catch {
    // Accept legacy ISO createdAt cursors from /community/feed.
    if (!Number.isNaN(Date.parse(value))) {
      return { v: 1, k: [], w: new Date(value).toISOString() };
    }
    return { v: 1, k: [], w: null };
  }
};

const toIso = (value: unknown) => {
  try {
    const d = value ? new Date(value as any) : new Date();
    return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  } catch {
    return new Date().toISOString();
  }
};

/** Diagnostics only outside production, or when FEED_ORCHESTRATOR_DIAGNOSTICS=true. */
export const shouldIncludeFeedDiagnostics = (env: NodeJS.ProcessEnv = process.env) => {
  if (String(env.FEED_ORCHESTRATOR_DIAGNOSTICS || '').toLowerCase() === 'true') return true;
  return String(env.NODE_ENV || '').toLowerCase() !== 'production';
};

const mapAuthor = (userLike: any, pageLike?: any) => {
  if (pageLike?.id) {
    return {
      id: pageLike.id,
      type: 'business',
      displayName: pageLike.name || pageLike.handle || 'Page',
      username: pageLike.handle || pageLike.slug || null,
      avatarUrl: pageLike.logoUrl || pageLike.logo || null,
      businessSlug: pageLike.slug || pageLike.handle || null
    };
  }
  if (!userLike?.id) return null;
  return {
    id: userLike.id,
    type: 'user',
    displayName: userLike.name || userLike.username || 'Member',
    username: userLike.username || null,
    avatarUrl: userLike.avatar || userLike.avatarUrl || null,
    businessSlug: null
  };
};

const authorKeyOf = (author: OrchestratedFeedItem['author']) =>
  clean(author?.id || author?.username || '');

/**
 * Diversity-aware page assembly: caps consecutive same type/author and ad density.
 * Pure function — unit tested.
 */
export const diversifyFeedCandidates = (
  items: Candidate[],
  pageSize: number,
  options?: { maxConsecutiveType?: number; maxConsecutiveAuthor?: number; maxAdsPerPage?: number; minItemsBetweenAds?: number }
): Candidate[] => {
  if (!items.length) return [];
  const maxType = Math.max(1, options?.maxConsecutiveType ?? 2);
  const maxAuthor = Math.max(1, options?.maxConsecutiveAuthor ?? 2);
  const maxAds = Math.max(0, options?.maxAdsPerPage ?? 1);
  const minBetweenAds = Math.max(1, options?.minItemsBetweenAds ?? 7);

  const byType = new Map<string, Candidate[]>();
  const order: string[] = [];
  const sorted = [...items].sort((a, b) => b.score - a.score);
  sorted.forEach((item) => {
    if (!byType.has(item.type)) {
      byType.set(item.type, []);
      order.push(item.type);
    }
    byType.get(item.type)!.push(item);
  });

  const result: Candidate[] = [];
  let guard = 0;
  while (result.length < pageSize && guard < pageSize * 12) {
    guard += 1;
    let progressed = false;
    for (const type of order) {
      const bucket = byType.get(type) || [];
      if (!bucket.length) continue;

      let sameTypeRun = 0;
      for (let i = result.length - 1; i >= 0; i -= 1) {
        if (result[i].type === type) sameTypeRun += 1;
        else break;
      }
      const head = bucket[0];
      let sameAuthorRun = 0;
      const aKey = head._authorKey;
      if (aKey) {
        for (let i = result.length - 1; i >= 0; i -= 1) {
          if (result[i]._authorKey === aKey) sameAuthorRun += 1;
          else break;
        }
      }

      if (type === 'AD') {
        if (result.length === 0) continue;
        const adCount = result.filter((entry) => entry.type === 'AD').length;
        if (adCount >= maxAds) continue;
        if (result[result.length - 1]?.type === 'AD') continue;
        const lastAdIndex = [...result].map((e, i) => (e.type === 'AD' ? i : -1)).filter((i) => i >= 0).pop();
        if (lastAdIndex != null && result.length - 1 - lastAdIndex < minBetweenAds) continue;
      }

      const hasAlternative = order.some((other) => other !== type && (byType.get(other) || []).length > 0);
      if (sameTypeRun >= maxType && hasAlternative) continue;
      if (aKey && sameAuthorRun >= maxAuthor && hasAlternative) {
        // Try next type first; fall through if nothing else works.
        const otherHead = order
          .filter((other) => other !== type)
          .map((other) => (byType.get(other) || [])[0])
          .filter(Boolean)
          .find((c) => c && c._authorKey !== aKey);
        if (otherHead) continue;
      }

      result.push(bucket.shift()!);
      progressed = true;
      if (result.length >= pageSize) break;
    }
    if (!progressed) {
      // Fallback: highest score that does not violate hard consecutive-type/ad rules when possible.
      let best: Candidate | null = null;
      let bestType = '';
      for (const type of order) {
        const head = (byType.get(type) || [])[0];
        if (!head) continue;
        let sameTypeRun = 0;
        for (let i = result.length - 1; i >= 0; i -= 1) {
          if (result[i].type === type) sameTypeRun += 1;
          else break;
        }
        const hasAlt = order.some((other) => other !== type && (byType.get(other) || []).length > 0);
        if (sameTypeRun >= maxType && hasAlt) continue;
        if (type === 'AD') {
          const adCount = result.filter((entry) => entry.type === 'AD').length;
          if (result.length === 0 || adCount >= maxAds || result[result.length - 1]?.type === 'AD') continue;
        }
        if (!best || head.score > best.score) {
          best = head;
          bestType = type;
        }
      }
      if (!best) {
        // Absolute last resort — take highest remaining score.
        for (const type of order) {
          const head = (byType.get(type) || [])[0];
          if (!head) continue;
          if (!best || head.score > best.score) {
            best = head;
            bestType = type;
          }
        }
      }
      if (!best) break;
      byType.get(bestType)!.shift();
      result.push(best);
    }
  }
  return result;
};

export const dedupeCandidatesByFeedKey = (items: Candidate[]): { unique: Candidate[]; deduplicatedCount: number } => {
  const seen = new Set<string>();
  const unique: Candidate[] = [];
  let deduplicatedCount = 0;
  for (const item of items) {
    if (!item.feedKey || seen.has(item.feedKey)) {
      deduplicatedCount += 1;
      continue;
    }
    seen.add(item.feedKey);
    unique.push(item);
  }
  return { unique, deduplicatedCount };
};

async function collectPosts(input: {
  viewerId?: string | null;
  mode: FeedSurfaceMode;
  topic?: string;
  region?: string;
  watermark: string | null;
  take: number;
  seen: Set<string>;
}): Promise<Candidate[]> {
  try {
    const recipe = await getActiveFeedRecipe(input.mode);
    const context = await getViewerFeedContext(input.viewerId);
    const blocked = input.viewerId
      ? await prisma.userBlock
          .findMany({
            where: {
              OR: [{ blockerId: input.viewerId }, { blockedId: input.viewerId }]
            },
            select: { blockerId: true, blockedId: true }
          })
          .then((rows) =>
            rows.flatMap((row) => (row.blockerId === input.viewerId ? [row.blockedId] : [row.blockerId]))
          )
          .catch(() => [] as string[])
      : [];

    const where: any = { status: 'active', visibility: 'public' };
    if (blocked.length) where.authorId = { notIn: blocked };
    if (input.viewerId) {
      where.hiddenBy = { none: { userId: input.viewerId } };
    }
    if (input.mode === 'following' && input.viewerId) {
      const [followingUsers, followingPages] = await Promise.all([
        prisma.userFollow.findMany({ where: { followerId: input.viewerId }, select: { followeeId: true } }),
        prisma.communityBusinessPageFollower.findMany({
          where: { userId: input.viewerId },
          select: { pageId: true }
        })
      ]);
      const followeeIds = followingUsers.map((row) => row.followeeId);
      const pageIds = followingPages.map((row) => row.pageId);
      where.OR = [
        { authorId: input.viewerId },
        ...(followeeIds.length
          ? [{ authorId: { in: followeeIds }, visibility: { in: ['public', 'friends', 'network'] } }]
          : []),
        ...(pageIds.length
          ? [{ businessPageId: { in: pageIds }, visibility: { in: ['public', 'friends', 'network'] } }]
          : [])
      ];
      delete where.visibility;
    }
    if (input.topic) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [{ topic: { equals: input.topic, mode: 'insensitive' } }, { tags: { has: input.topic } }]
        }
      ];
    }
    if (input.region) {
      where.AND = [...(where.AND || []), { location: { contains: input.region, mode: 'insensitive' } }];
    }
    if (input.watermark) {
      where.createdAt = { lte: new Date(input.watermark) };
    }

    const posts = await prisma.communityPost.findMany({
      where,
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      take: input.take,
      select: {
        id: true,
        authorId: true,
        businessPageId: true,
        title: true,
        content: true,
        attachments: true,
        tags: true,
        mentions: true,
        topic: true,
        location: true,
        visibility: true,
        graphicWarning: true,
        commentPolicy: true,
        repostsEnabled: true,
        viewsCount: true,
        likesCount: true,
        sharesCount: true,
        repostsCount: true,
        isPinned: true,
        isHighlighted: true,
        isAIEnhanced: true,
        aiInsightEnabled: true,
        aiInsightGenerated: true,
        aiInsightText: true,
        aiScore: true,
        offerTags: true,
        createdAt: true,
        updatedAt: true,
        author: {
          select: { id: true, name: true, username: true, avatar: true, role: true, isVerified: true }
        },
        businessPage: {
          select: { id: true, name: true, slug: true, handle: true, tagline: true }
        }
      }
    });

    return posts
      .map((post) => {
        const type: UnifiedFeedItemType = post.businessPageId ? 'COMMUNITY_POST' : 'POST';
        const key = buildFeedKey(type, post.id);
        if (input.seen.has(key)) return null;
        const ranking = scoreCommunityPostForMode({
          post,
          mode: input.mode,
          context,
          requestedTopic: input.topic,
          requestedRegion: input.region,
          recipe
        });
        const author = mapAuthor(post.author, post.businessPage);
        const attachments = Array.isArray(post.attachments) ? post.attachments : [];
        const score = Number(ranking.score || 0);
        return {
          type,
          id: post.id,
          sourceId: post.id,
          feedKey: key,
          createdAt: toIso(post.createdAt),
          score,
          rankingScore: score,
          author,
          media: attachments.map((entry: any) =>
            typeof entry === 'string'
              ? { fileId: entry }
              : { fileId: entry?.id || entry?.fileId || entry, url: entry?.url }
          ),
          visibility: String(post.visibility || 'public'),
          why: ranking.reasons?.[0] || null,
          payload: {
            ...post,
            author: {
              id: author?.id,
              type: author?.type,
              displayName: author?.displayName,
              username: author?.username,
              avatarUrl: author?.avatarUrl,
              businessSlug: author?.businessSlug,
              isVerified: Boolean((post.author as any)?.isVerified)
            },
            interactions: {
              views: post.viewsCount,
              likes: post.likesCount,
              shares: post.sharesCount,
              reposts: post.repostsCount,
              comments: 0
            },
            ranking: {
              mode: input.mode,
              score,
              primaryReason: ranking.reasons?.[0] || null,
              reasons: (ranking.reasons || []).slice(0, 3)
            },
            createdAt: toIso(post.createdAt),
            updatedAt: toIso(post.updatedAt)
          },
          _source: 'posts',
          _authorKey: authorKeyOf(author)
        } as Candidate;
      })
      .filter(Boolean) as Candidate[];
  } catch (error) {
    console.warn('[feed-orchestrator] collectPosts failed', (error as any)?.message || error);
    return [];
  }
}

async function collectJobsGigs(
  take: number,
  seen: Set<string>,
  mode: FeedSurfaceMode
): Promise<Candidate[]> {
  try {
    const [jobs, gigs] = await Promise.all([
      prisma.job
        .findMany({
          where: {
            isActive: true,
            isVisible: true,
            status: 'ACTIVE',
            adminStatus: 'APPROVED'
          } as any,
          orderBy: [{ isRecommended: 'desc' }, { createdAt: 'desc' }] as any,
          take,
          select: {
            id: true,
            title: true,
            description: true,
            budget: true,
            tags: true,
            isFeatured: true,
            isRecommended: true,
            proposalsCount: true,
            createdAt: true,
            client: { select: { id: true, name: true, username: true, avatar: true } }
          } as any
        })
        .catch(() => []),
      prisma.gig
        .findMany({
          where: {
            isActive: true,
            status: 'ACTIVE',
            adminStatus: 'APPROVED'
          } as any,
          orderBy: [{ isRecommended: 'desc' }, { isFeatured: 'desc' }, { createdAt: 'desc' }] as any,
          take,
          select: {
            id: true,
            slug: true,
            title: true,
            description: true,
            price: true,
            tags: true,
            rating: true,
            reviewCount: true,
            isFeatured: true,
            isRecommended: true,
            createdAt: true,
            user: { select: { id: true, name: true, username: true, avatar: true } }
          } as any
        })
        .catch(() =>
          // Fallback if adminStatus/status enums differ in some envs
          prisma.gig
            .findMany({
              where: { isActive: true } as any,
              orderBy: [{ createdAt: 'desc' }],
              take,
              select: {
                id: true,
                slug: true,
                title: true,
                description: true,
                price: true,
                tags: true,
                rating: true,
                reviewCount: true,
                isFeatured: true,
                isRecommended: true,
                createdAt: true,
                user: { select: { id: true, name: true, username: true, avatar: true } }
              } as any
            })
            .catch(() => [])
        )
    ]);

    const jobItems = (jobs as any[])
      .map((job) => {
        const key = buildFeedKey('JOB', job.id);
        if (seen.has(key)) return null;
        const score =
          40 +
          (job.isRecommended ? 18 : 0) +
          (job.isFeatured ? 12 : 0) +
          (mode === 'hire' ? 20 : 0) +
          Math.min(12, Number(job.proposalsCount || 0));
        const author = mapAuthor(job.client);
        return {
          type: 'JOB' as const,
          id: job.id,
          sourceId: job.id,
          feedKey: key,
          createdAt: toIso(job.createdAt),
          score,
          rankingScore: score,
          author,
          media: null,
          visibility: 'public',
          why: job.isRecommended ? 'Recommended opportunity' : 'Active job',
          payload: job,
          _source: 'jobs',
          _authorKey: authorKeyOf(author)
        } as Candidate;
      })
      .filter(Boolean) as Candidate[];

    const gigItems = (gigs as any[])
      .map((gig) => {
        const key = buildFeedKey('GIG', gig.id);
        if (seen.has(key)) return null;
        const score =
          40 +
          (gig.isRecommended ? 18 : 0) +
          (gig.isFeatured ? 12 : 0) +
          (mode === 'sell' ? 20 : 0) +
          Math.min(15, Number(gig.rating || 0) * 2);
        const author = mapAuthor(gig.user);
        return {
          type: 'GIG' as const,
          id: gig.id,
          sourceId: gig.id,
          feedKey: key,
          createdAt: toIso(gig.createdAt),
          score,
          rankingScore: score,
          author,
          media: null,
          visibility: 'public',
          why: gig.isRecommended ? 'Recommended service' : 'Active gig',
          payload: gig,
          _source: 'gigs',
          _authorKey: authorKeyOf(author)
        } as Candidate;
      })
      .filter(Boolean) as Candidate[];

    return [...jobItems, ...gigItems];
  } catch (error) {
    console.warn('[feed-orchestrator] collectJobsGigs failed', (error as any)?.message || error);
    return [];
  }
}

async function collectMarketplace(
  take: number,
  seen: Set<string>,
  viewerId?: string | null
): Promise<Candidate[]> {
  try {
    const result = await listMarketplaceListings({
      page: 1,
      pageSize: take,
      status: 'active',
      sort: 'recommended',
      viewerId: viewerId || null
    });
    const listings = Array.isArray((result as any)?.listings)
      ? (result as any).listings
      : Array.isArray((result as any)?.items)
        ? (result as any).items
        : Array.isArray(result)
          ? result
          : [];
    return listings
      .map((listing: any) => {
        const id = clean(listing?.id);
        if (!id) return null;
        const key = buildFeedKey('MARKETPLACE_LISTING', id);
        if (seen.has(key)) return null;
        const media =
          listing?.coverImage ||
          listing?.imageUrl ||
          listing?.images?.[0] ||
          listing?.media?.[0] ||
          null;
        const score =
          36 + (listing?.isFeatured ? 14 : 0) + Math.min(10, Number(listing?.viewCount || 0) * 0.05);
        const author = mapAuthor(listing?.seller || listing?.user);
        return {
          type: 'MARKETPLACE_LISTING' as const,
          id,
          sourceId: id,
          feedKey: key,
          createdAt: toIso(listing?.createdAt || listing?.updatedAt),
          score,
          rankingScore: score,
          author,
          media: media ? { url: typeof media === 'string' ? media : media?.url } : null,
          visibility: 'public',
          why: 'Marketplace discovery',
          payload: listing,
          _source: 'marketplace',
          _authorKey: authorKeyOf(author)
        } as Candidate;
      })
      .filter(Boolean) as Candidate[];
  } catch (error) {
    console.warn('[feed-orchestrator] collectMarketplace failed', (error as any)?.message || error);
    return [];
  }
}

async function collectAds(
  surface: OrchestratedSurface,
  take: number,
  seen: Set<string>
): Promise<Candidate[]> {
  const placement = surface === 'community' ? 'community_feed' : 'homepage_feed';
  try {
    // Hard cap candidates so diversity can enforce existing density (≤1 per page).
    const ads = await selectAdsForPlacement(placement, Math.min(2, take));
    return (ads || [])
      .map((ad: any) => {
        const id = clean(ad?.id);
        if (!id) return null;
        const key = buildFeedKey('AD', id);
        if (seen.has(key)) return null;
        return {
          type: 'AD' as const,
          id,
          sourceId: id,
          feedKey: key,
          createdAt: toIso(ad?.createdAt),
          score: 28,
          rankingScore: 28,
          author: null,
          media: {
            url: ad?.mediaUrl || ad?.imageUrl || ad?.creativeUrl || null,
            thumbnailUrl: ad?.thumbnailUrl || null
          },
          visibility: 'public',
          why: 'Sponsored',
          payload: { ...ad, placement, sponsored: true },
          _source: 'ads',
          _authorKey: ''
        } as Candidate;
      })
      .filter(Boolean) as Candidate[];
  } catch (error) {
    console.warn('[feed-orchestrator] collectAds failed', (error as any)?.message || error);
    return [];
  }
}

async function collectPeoplePages(
  take: number,
  seen: Set<string>,
  viewerId?: string | null
): Promise<Candidate[]> {
  try {
    const [people, pages, clubs] = await Promise.all([
      prisma.user.findMany({
        where: {
          isActive: true,
          ...(viewerId ? { id: { not: viewerId } } : {})
        } as any,
        orderBy: [{ updatedAt: 'desc' }],
        take,
        select: {
          id: true,
          name: true,
          username: true,
          avatar: true,
          role: true,
          isVerified: true,
          updatedAt: true
        }
      }),
      prisma.communityBusinessPage.findMany({
        where: { status: 'active' } as any,
        orderBy: [{ updatedAt: 'desc' }],
        take,
        select: {
          id: true,
          name: true,
          handle: true,
          slug: true,
          tagline: true,
          category: true,
          updatedAt: true
        }
      }),
      prisma.communityClub
        .findMany({
          where: { status: 'active', visibility: 'public' } as any,
          orderBy: [{ memberCount: 'desc' }, { updatedAt: 'desc' }] as any,
          take: Math.max(3, Math.ceil(take / 2)),
          select: {
            id: true,
            name: true,
            slug: true,
            description: true,
            memberCount: true,
            updatedAt: true
          } as any
        })
        .catch(() => [])
    ]);

    const personItems = people
      .map((user) => {
        const key = buildFeedKey('PERSON_RECOMMENDATION', user.id);
        if (seen.has(key)) return null;
        const score = 30 + (user.isVerified ? 8 : 0);
        const author = mapAuthor(user);
        return {
          type: 'PERSON_RECOMMENDATION' as const,
          id: user.id,
          sourceId: user.id,
          feedKey: key,
          createdAt: toIso(user.updatedAt),
          score,
          rankingScore: score,
          author,
          media: { url: user.avatar },
          visibility: 'public',
          why: 'People to follow',
          payload: user,
          _source: 'people',
          _authorKey: authorKeyOf(author)
        } as Candidate;
      })
      .filter(Boolean) as Candidate[];

    const pageItems = pages
      .map((page) => {
        const key = buildFeedKey('PAGE_RECOMMENDATION', page.id);
        if (seen.has(key)) return null;
        const author = mapAuthor(null, page);
        return {
          type: 'PAGE_RECOMMENDATION' as const,
          id: page.id,
          sourceId: page.id,
          feedKey: key,
          createdAt: toIso(page.updatedAt),
          score: 30,
          rankingScore: 30,
          author,
          media: null,
          visibility: 'public',
          why: 'Pages to follow',
          payload: page,
          _source: 'pages',
          _authorKey: authorKeyOf(author)
        } as Candidate;
      })
      .filter(Boolean) as Candidate[];

    const clubItems = (clubs as any[])
      .map((club) => {
        const id = clean(club?.id);
        if (!id) return null;
        const key = buildFeedKey('COMMUNITY_RECOMMENDATION', id);
        if (seen.has(key)) return null;
        const score = 29 + Math.min(10, Number(club.memberCount || 0) * 0.05);
        return {
          type: 'COMMUNITY_RECOMMENDATION' as const,
          id,
          sourceId: id,
          feedKey: key,
          createdAt: toIso(club.updatedAt),
          score,
          rankingScore: score,
          author: null,
          media: null,
          visibility: 'public',
          why: 'Communities to join',
          payload: club,
          _source: 'clubs',
          _authorKey: ''
        } as Candidate;
      })
      .filter(Boolean) as Candidate[];

    return [...personItems, ...pageItems, ...clubItems];
  } catch (error) {
    console.warn('[feed-orchestrator] collectPeoplePages failed', (error as any)?.message || error);
    return [];
  }
}

async function collectStoriesScroll(take: number, seen: Set<string>): Promise<Candidate[]> {
  try {
    const now = new Date();
    const [stories, scrolls] = await Promise.all([
      prisma.communityStory
        .findMany({
          where: {
            expiresAt: { gt: now },
            visibility: 'public'
          },
          orderBy: [{ createdAt: 'desc' }],
          take: Math.min(take, 8),
          select: {
            id: true,
            authorId: true,
            type: true,
            content: true,
            mediaFileId: true,
            createdAt: true,
            expiresAt: true,
            author: { select: { id: true, name: true, username: true, avatar: true } }
          }
        })
        .catch(() => []),
      prisma.scrollVideo
        .findMany({
          where: { status: 'active', visibility: 'public' },
          orderBy: [{ createdAt: 'desc' }],
          take: Math.min(take, 8),
          select: {
            id: true,
            title: true,
            description: true,
            fileId: true,
            createdAt: true,
            authorId: true
          }
        })
        .catch(() => [])
    ]);

    const authorIds = Array.from(
      new Set((scrolls as any[]).map((row) => clean(row?.authorId)).filter(Boolean))
    );
    const authors = authorIds.length
      ? await prisma.user
          .findMany({
            where: { id: { in: authorIds } },
            select: { id: true, name: true, username: true, avatar: true }
          })
          .catch(() => [])
      : [];
    const authorMap = new Map(authors.map((row) => [row.id, row]));

    const storyItems = (stories as any[])
      .map((story) => {
        const key = buildFeedKey('STORY', story.id);
        if (seen.has(key)) return null;
        const author = mapAuthor(story.author);
        return {
          type: 'STORY' as const,
          id: story.id,
          sourceId: story.id,
          feedKey: key,
          createdAt: toIso(story.createdAt),
          score: 34,
          rankingScore: 34,
          author,
          media: { fileId: story.mediaFileId, type: story.type },
          visibility: 'public',
          why: 'Active story',
          payload: story,
          _source: 'stories',
          _authorKey: authorKeyOf(author)
        } as Candidate;
      })
      .filter(Boolean) as Candidate[];

    const scrollItems = (scrolls as any[])
      .map((scroll) => {
        const key = buildFeedKey('SCROLL_VIDEO', scroll.id);
        if (seen.has(key)) return null;
        const author = mapAuthor(authorMap.get(String(scroll.authorId || '')));
        return {
          type: 'SCROLL_VIDEO' as const,
          id: scroll.id,
          sourceId: scroll.id,
          feedKey: key,
          createdAt: toIso(scroll.createdAt),
          score: 33,
          rankingScore: 33,
          author,
          media: { fileId: scroll.fileId },
          visibility: 'public',
          why: 'Scroll video',
          payload: scroll,
          _source: 'scroll',
          _authorKey: authorKeyOf(author)
        } as Candidate;
      })
      .filter(Boolean) as Candidate[];

    return [...storyItems, ...scrollItems];
  } catch (error) {
    console.warn('[feed-orchestrator] collectStoriesScroll failed', (error as any)?.message || error);
    return [];
  }
}

async function collectEvents(take: number, seen: Set<string>): Promise<Candidate[]> {
  try {
    // Prefer community events table when present.
    const events = await (prisma as any).communityEvent
      ?.findMany?.({
        where: { status: { in: ['active', 'published', 'ACTIVE', 'PUBLISHED'] } },
        orderBy: [{ startAt: 'asc' }, { createdAt: 'desc' }],
        take: Math.min(take, 6),
        select: {
          id: true,
          title: true,
          description: true,
          startAt: true,
          endAt: true,
          location: true,
          createdAt: true
        }
      })
      .catch?.(() => []) ?? [];

    return (events as any[])
      .map((event) => {
        const id = clean(event?.id);
        if (!id) return null;
        const key = buildFeedKey('EVENT', id);
        if (seen.has(key)) return null;
        const score = 31;
        return {
          type: 'EVENT' as const,
          id,
          sourceId: id,
          feedKey: key,
          createdAt: toIso(event.startAt || event.createdAt),
          score,
          rankingScore: score,
          author: null,
          media: null,
          visibility: 'public',
          why: 'Upcoming event',
          payload: event,
          _source: 'events',
          _authorKey: ''
        } as Candidate;
      })
      .filter(Boolean) as Candidate[];
  } catch {
    return [];
  }
}

/**
 * Unified continuous feed for member-home and community surfaces.
 */
export const getOrchestratedMemberFeed = async (input: {
  viewerId?: string | null;
  surface?: OrchestratedSurface | string;
  mode?: string;
  limit?: number;
  cursor?: string | null;
  topic?: string;
  region?: string;
}): Promise<MemberFeedResult> => {
  const surface: OrchestratedSurface =
    clean(input.surface).toLowerCase() === 'community' ? 'community' : 'member_home';
  const mode = normalizeFeedSurfaceMode(input.mode, 'for_you');
  const pageSize = clampInt(input.limit, 12, 4, 40);
  const cursorState = decodeMemberFeedCursor(input.cursor);
  const seen = new Set(cursorState.k);
  const topic = clean(input.topic) || undefined;
  const region = clean(input.region) || undefined;

  const poolTake = Math.max(pageSize * 2, 16);

  // Partial-source failure tolerance: each collector swallows errors.
  const [posts, jobsGigs, marketplace, ads, peoplePages, storiesScroll, events] = await Promise.all([
    collectPosts({
      viewerId: input.viewerId,
      mode,
      topic,
      region,
      watermark: cursorState.w,
      take: Math.min(60, poolTake * 2),
      seen
    }),
    collectJobsGigs(Math.min(20, poolTake), seen, mode),
    collectMarketplace(Math.min(16, poolTake), seen, input.viewerId),
    collectAds(surface, 2, seen),
    collectPeoplePages(Math.min(10, Math.ceil(pageSize / 2)), seen, input.viewerId),
    collectStoriesScroll(Math.min(8, pageSize), seen),
    collectEvents(Math.min(6, pageSize), seen)
  ]);

  const sourceCounts = {
    posts: posts.length,
    jobsGigs: jobsGigs.length,
    marketplace: marketplace.length,
    ads: ads.length,
    peoplePages: peoplePages.length,
    storiesScroll: storiesScroll.length,
    events: events.length
  };

  const pooled = [
    ...posts,
    ...jobsGigs,
    ...marketplace,
    ...ads,
    ...peoplePages,
    ...storiesScroll,
    ...events
  ];
  const { unique, deduplicatedCount } = dedupeCandidatesByFeedKey(pooled);
  const diversified = diversifyFeedCandidates(unique, pageSize, {
    maxConsecutiveType: 2,
    maxConsecutiveAuthor: 2,
    maxAdsPerPage: 1,
    minItemsBetweenAds: 7
  });

  const nextSeen = [...cursorState.k, ...diversified.map((item) => item.feedKey)].slice(-120);
  const oldestReturned = diversified
    .map((item) => Date.parse(item.createdAt))
    .filter((ms) => Number.isFinite(ms));
  const watermark =
    oldestReturned.length > 0 ? new Date(Math.min(...oldestReturned)).toISOString() : cursorState.w;

  // More content exists if pool exceeded page size after filters, or we filled a full page.
  const remainingAfterPage = unique.length - diversified.length;
  const hasMore = remainingAfterPage > 0 || diversified.length >= pageSize;
  const nextCursor =
    hasMore && diversified.length
      ? encodeMemberFeedCursor({ v: 1, k: nextSeen, w: watermark })
      : null;

  const items: OrchestratedFeedItem[] = diversified.map(({ _source, _authorKey, ...item }) => item);

  const result: MemberFeedResult = {
    items,
    nextCursor,
    hasMore: Boolean(nextCursor),
    mode,
    surface
  };

  if (shouldIncludeFeedDiagnostics()) {
    result.diagnostics = {
      sourceCounts,
      filteredCounts: {
        pooled: pooled.length,
        unique: unique.length,
        returned: diversified.length,
        seenExcluded: seen.size
      },
      deduplicatedCount,
      pageSize,
      seenKeys: nextSeen.length
    };
  }

  return result;
};

/** Test hooks (pure helpers only). */
export const __feedOrchestratorTestUtils = {
  encodeMemberFeedCursor,
  decodeMemberFeedCursor,
  diversifyFeedCandidates,
  dedupeCandidatesByFeedKey,
  buildFeedKey,
  shouldIncludeFeedDiagnostics
};
