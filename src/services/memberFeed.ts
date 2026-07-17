/**
 * Frontend consumer for GET /api/discovery/v2/member-feed.
 * Phase 3 adapter: normalizes orchestrated items for existing UI components.
 * Does not replace Phase 1 continuous-feed loaders — callers try this first, then fall back.
 *
 * Note: `api` is imported lazily in fetch helpers so pure partition/normalize
 * utilities can be unit-tested without Vite env polyfills.
 */

export type MemberFeedSurface = 'member_home' | 'community';

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
  | 'TRENDING'
  | string;

export type UnifiedFeedItem = {
  type: UnifiedFeedItemType;
  id: string;
  sourceId?: string;
  feedKey?: string;
  createdAt?: string;
  score?: number;
  rankingScore?: number;
  author?: any;
  media?: any;
  visibility?: string;
  why?: string | null;
  payload?: any;
};

export type MemberFeedPage = {
  items: UnifiedFeedItem[];
  /** Post payloads suitable for existing normalizePost() helpers. */
  posts: any[];
  jobs: any[];
  gigs: any[];
  marketplace: any[];
  people: any[];
  pages: any[];
  communities: any[];
  ads: any[];
  stories: any[];
  scrollVideos: any[];
  events: any[];
  nextCursor: string | null;
  hasMore: boolean;
  mode?: string;
  surface?: string;
  source: 'orchestrated';
};

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

const clean = (value: unknown) => String(value || '').trim();

const normalizeType = (value: unknown): string =>
  clean(value)
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

/**
 * Map a unified orchestrated item into a post-like payload for existing feed cards.
 * Prefer server payload; fall back to thin card fields.
 */
export const toPostLikePayload = (item: UnifiedFeedItem): any | null => {
  const type = normalizeType(item?.type);
  if (type !== 'POST' && type !== 'COMMUNITY_POST') return null;
  const payload = item?.payload && typeof item.payload === 'object' ? { ...item.payload } : {};
  const id = clean(payload.id || item.id || item.sourceId);
  if (!id) return null;
  return {
    ...payload,
    id,
    title: payload.title ?? item.author?.displayName ?? '',
    content: payload.content ?? payload.description ?? '',
    author: payload.author || item.author || null,
    attachments: payload.attachments || (item.media ? (Array.isArray(item.media) ? item.media : [item.media]) : []),
    ranking:
      payload.ranking ||
      (item.score != null || item.rankingScore != null || item.why
        ? {
            score: Number(item.score ?? item.rankingScore ?? 0),
            primaryReason: Array.isArray(item.why)
              ? item.why[0] || null
              : item.why || null,
            // Preserve multi-reason arrays when orchestrator provides them (presentation-only).
            reasons: Array.isArray(item.why)
              ? item.why
              : item.why
                ? [item.why]
                : Array.isArray(payload?.ranking?.reasons)
                  ? payload.ranking.reasons
                  : []
          }
        : undefined),
    createdAt: payload.createdAt || item.createdAt || new Date().toISOString(),
    feedKey: item.feedKey || `POST:${id}`,
    feedItemType: type
  };
};

export const partitionUnifiedFeedItems = (items: UnifiedFeedItem[]) => {
  const posts: any[] = [];
  const jobs: any[] = [];
  const gigs: any[] = [];
  const marketplace: any[] = [];
  const people: any[] = [];
  const pages: any[] = [];
  const communities: any[] = [];
  const ads: any[] = [];
  const stories: any[] = [];
  const scrollVideos: any[] = [];
  const events: any[] = [];

  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!item || typeof item !== 'object') return;
    const type = normalizeType(item.type);
    const payload = item.payload && typeof item.payload === 'object' ? item.payload : item;
    switch (type) {
      case 'POST':
      case 'COMMUNITY_POST': {
        const post = toPostLikePayload(item);
        if (post) posts.push(post);
        break;
      }
      case 'JOB':
        jobs.push({ ...payload, id: payload.id || item.id, feedKey: item.feedKey });
        break;
      case 'GIG':
        gigs.push({ ...payload, id: payload.id || item.id, feedKey: item.feedKey });
        break;
      case 'MARKETPLACE_LISTING':
      case 'MARKETPLACE':
        marketplace.push({ ...payload, id: payload.id || item.id, feedKey: item.feedKey });
        break;
      case 'PERSON_RECOMMENDATION':
      case 'PERSON':
        people.push({ ...payload, id: payload.id || item.id, feedKey: item.feedKey });
        break;
      case 'PAGE_RECOMMENDATION':
      case 'PAGE':
        pages.push({ ...payload, id: payload.id || item.id, feedKey: item.feedKey });
        break;
      case 'COMMUNITY_RECOMMENDATION':
      case 'COMMUNITY':
        communities.push({ ...payload, id: payload.id || item.id, feedKey: item.feedKey });
        break;
      case 'AD':
        ads.push({
          ...payload,
          id: payload.id || item.id,
          sponsored: true,
          feedKey: item.feedKey,
          mediaUrl: payload.mediaUrl || item.media?.url || null
        });
        break;
      case 'STORY':
        stories.push({ ...payload, id: payload.id || item.id, feedKey: item.feedKey });
        break;
      case 'SCROLL_VIDEO':
        scrollVideos.push({ ...payload, id: payload.id || item.id, feedKey: item.feedKey });
        break;
      case 'EVENT':
        events.push({ ...payload, id: payload.id || item.id, feedKey: item.feedKey });
        break;
      default:
        // Unknown types: if they look like posts, try post mapping once.
        if (payload?.content || payload?.attachments) {
          const post = toPostLikePayload({ ...item, type: 'POST' });
          if (post) posts.push(post);
        }
        break;
    }
  });

  return { posts, jobs, gigs, marketplace, people, pages, communities, ads, stories, scrollVideos, events };
};

export type FetchMemberFeedParams = {
  surface: MemberFeedSurface;
  mode?: string;
  limit?: number;
  cursor?: string | null;
  topic?: string;
  region?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  /**
   * Phase 19.1: when true, 401/403 rethrow so callers can keep session handling.
   * Soft transport failures still return null for legacy fallback.
   */
  hardFailAuth?: boolean;
};

/**
 * Fetch one page from the enterprise orchestrator.
 * Throws on network/HTTP failure so callers can fall back to Phase 1.
 */
export async function fetchMemberFeedPage(params: FetchMemberFeedParams): Promise<MemberFeedPage> {
  const limit = Math.max(4, Math.min(40, Number(params.limit || 12) || 12));
  const { default: api } = await import('./api');
  const response = await api.get('/discovery/v2/member-feed', {
    params: {
      surface: params.surface,
      mode: params.mode || 'for_you',
      limit,
      ...(params.cursor ? { cursor: params.cursor } : {}),
      ...(params.topic ? { topic: params.topic } : {}),
      ...(params.region ? { region: params.region } : {})
    },
    signal: params.signal as any,
    timeout: Math.max(5000, Math.min(30000, Number(params.timeoutMs || 18000) || 18000))
  });

  const data = extractData<any>(response) || {};
  const items = Array.isArray(data.items) ? (data.items as UnifiedFeedItem[]) : [];
  // Preserve additive intelligence envelope onto post-like payloads during partition.
  const partitioned = partitionUnifiedFeedItems(
    items.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const payload =
        item.payload && typeof item.payload === 'object'
          ? {
              ...item.payload,
              intelligence: (item as any).intelligence || item.payload.intelligence,
              ranking:
                item.payload.ranking ||
                ((item as any).intelligence
                  ? {
                      score: item.score ?? item.rankingScore,
                      primaryReason: (item as any).intelligence?.primaryReason ?? item.why ?? null,
                      reasons: (item as any).intelligence?.reasons || [],
                      reasonCodes: (item as any).intelligence?.reasonCodes || [],
                      mode: (item as any).intelligence?.rankMode || data.mode
                    }
                  : undefined)
            }
          : item.payload;
      return { ...item, payload };
    })
  );
  const nextCursor = clean(data.nextCursor || data.next_cursor || '') || null;
  const hasMore =
    typeof data.hasMore === 'boolean'
      ? data.hasMore
      : typeof data.has_more === 'boolean'
        ? data.has_more
        : Boolean(nextCursor);

  return {
    items,
    ...partitioned,
    nextCursor: hasMore ? nextCursor : null,
    hasMore: Boolean(hasMore && nextCursor),
    mode: data.mode,
    surface: data.surface || params.surface,
    source: 'orchestrated'
  };
}

/**
 * Returns null when orchestrator is unavailable (404/501/network) so callers fall back.
 * Re-throws unexpected errors only if preferThrow is true (default false → null on all failures).
 */
export async function tryFetchMemberFeedPage(
  params: FetchMemberFeedParams
): Promise<MemberFeedPage | null> {
  try {
    return await fetchMemberFeedPage(params);
  } catch (error: any) {
    const status = Number(error?.response?.status || 0);
    // Phase 19.1: auth failures must not look like ordinary soft fallbacks when requested.
    if (params.hardFailAuth && (status === 401 || status === 403)) {
      throw error;
    }
    // Soft-fail for missing endpoint or server errors so Phase 1 continuous feed remains primary safety net.
    if (!status || status === 404 || status === 405 || status === 501 || status >= 500 || status === 0) {
      return null;
    }
    // Auth/validation on desktop: still fall back rather than blank the feed.
    console.warn('[MemberFeedService] orchestrated feed failed; Phase 1 fallback will be used', {
      status,
      message: error?.message
    });
    return null;
  }
}

export const MemberFeedService = {
  fetchPage: fetchMemberFeedPage,
  tryFetchPage: tryFetchMemberFeedPage,
  partitionUnifiedFeedItems,
  toPostLikePayload
};

export default MemberFeedService;
