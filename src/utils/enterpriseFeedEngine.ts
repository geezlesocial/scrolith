/**
 * Phase 21.0 — Enterprise Feed Engine (client pure helpers).
 *
 * Additive, presentation/control-plane only. Does not replace backend
 * feedOrchestrator ranking or recommendation engines. No React, no network.
 */
import {
  interleaveForDiversity,
  resolveFeedTerminalState,
  type FeedSourceType
} from './continuousFeed';

export const ENTERPRISE_FEED_ENGINE_VERSION = '21.0.2';

export type FeedNetworkClass = 'offline' | 'slow' | 'constrained' | 'balanced' | 'fast';

export type PrefetchPolicy = {
  /** How many items before the end of the loaded list to start network prefetch. */
  remainingItemThreshold: number;
  /** IntersectionObserver rootMargin bottom in px for earlier load-more. */
  observerRootMarginPx: number;
  /** Max concurrent load-more requests (always 1 for safety). */
  maxInFlight: 1;
  /** Prefer silent skeleton over "Loading more..." chrome. */
  silentPrefetch: boolean;
  /** Progressive reveal step size. */
  progressiveRevealStep: number;
  /** Initial progressive window. */
  progressiveInitialWindow: number;
  /** Soft memory cap on retained feed items in client state. */
  maxRetainedItems: number;
};

export type AdaptivePageSizeInput = {
  basePageSize: number;
  networkClass: FeedNetworkClass;
  dataSaver?: boolean;
  viewportHeight?: number;
  isMobile?: boolean;
};

export type EndOfFeedSuggestionKind =
  | 'communities'
  | 'people'
  | 'jobs'
  | 'marketplace'
  | 'blogs'
  | 'courses'
  | 'pages';

export type EndOfFeedSuggestion = {
  kind: EndOfFeedSuggestionKind;
  title: string;
  description: string;
  href: string;
};

/** Classify network for adaptive feed behavior (no PII). */
export const classifyFeedNetwork = (input?: {
  effectiveType?: string | null;
  downlink?: number | null;
  saveData?: boolean | null;
  onLine?: boolean | null;
}): FeedNetworkClass => {
  if (input?.onLine === false) return 'offline';
  if (input?.saveData) return 'constrained';
  const effective = String(input?.effectiveType || '')
    .trim()
    .toLowerCase();
  if (effective === 'slow-2g' || effective === '2g') return 'slow';
  if (effective === '3g') return 'constrained';
  const downlink = Number(input?.downlink || 0);
  if (Number.isFinite(downlink) && downlink > 0) {
    if (downlink < 1.0) return 'slow';
    if (downlink < 2.5) return 'constrained';
    if (downlink >= 8) return 'fast';
  }
  if (effective === '4g') return 'fast';
  return 'balanced';
};

/**
 * Adaptive page size: larger on fast networks for fewer round-trips,
 * smaller on slow/data-saver for lower TTFB + memory.
 */
export const resolveAdaptivePageSize = (input: AdaptivePageSizeInput): number => {
  const base = Math.max(4, Math.min(40, Math.trunc(Number(input.basePageSize) || 12)));
  if (input.dataSaver) return Math.max(4, Math.min(base, 8));
  switch (input.networkClass) {
    case 'offline':
      return Math.max(4, Math.min(base, 6));
    case 'slow':
      return Math.max(4, Math.min(base, 8));
    case 'constrained':
      return Math.max(6, Math.min(base, 10));
    case 'fast':
      return Math.min(24, Math.max(base, input.isMobile ? 12 : 16));
    case 'balanced':
    default: {
      // Tall viewports can absorb a slightly larger page without extra requests.
      const vh = Number(input.viewportHeight || 0);
      if (vh >= 900 && !input.isMobile) return Math.min(20, base + 2);
      return base;
    }
  }
};

/** Prefetch / progressive render policy from network class. */
export const resolvePrefetchPolicy = (
  networkClass: FeedNetworkClass,
  options?: { dataSaver?: boolean; isMobile?: boolean }
): PrefetchPolicy => {
  const dataSaver = Boolean(options?.dataSaver);
  const mobile = Boolean(options?.isMobile);
  if (dataSaver || networkClass === 'slow' || networkClass === 'offline') {
    return {
      remainingItemThreshold: 2,
      observerRootMarginPx: mobile ? 320 : 400,
      maxInFlight: 1,
      silentPrefetch: true,
      progressiveRevealStep: 3,
      progressiveInitialWindow: 5,
      maxRetainedItems: 80
    };
  }
  if (networkClass === 'constrained') {
    return {
      remainingItemThreshold: 3,
      observerRootMarginPx: mobile ? 480 : 560,
      maxInFlight: 1,
      silentPrefetch: true,
      progressiveRevealStep: 4,
      progressiveInitialWindow: 6,
      maxRetainedItems: 100
    };
  }
  if (networkClass === 'fast') {
    return {
      remainingItemThreshold: mobile ? 5 : 6,
      observerRootMarginPx: mobile ? 720 : 900,
      maxInFlight: 1,
      silentPrefetch: true,
      progressiveRevealStep: mobile ? 5 : 6,
      progressiveInitialWindow: mobile ? 8 : 10,
      maxRetainedItems: 140
    };
  }
  return {
    remainingItemThreshold: mobile ? 4 : 5,
    observerRootMarginPx: mobile ? 560 : 720,
    maxInFlight: 1,
    silentPrefetch: true,
    progressiveRevealStep: mobile ? 4 : 5,
    progressiveInitialWindow: mobile ? 7 : 8,
    maxRetainedItems: 120
  };
};

/**
 * Whether to start background prefetch for the next cursor page.
 * Predictive: fires while the user is still reading earlier items.
 */
export const shouldPrefetchNextPage = (params: {
  loadedCount: number;
  renderedCount: number;
  remainingItemThreshold: number;
  hasCursor: boolean;
  isTerminal: boolean;
  loadMoreInFlight: boolean;
  initialLoading: boolean;
  rateLimited?: boolean;
}): boolean => {
  if (params.isTerminal || !params.hasCursor) return false;
  if (params.loadMoreInFlight || params.initialLoading) return false;
  if (params.rateLimited) return false;
  const loaded = Math.max(0, Number(params.loadedCount || 0));
  const rendered = Math.max(0, Number(params.renderedCount || 0));
  if (loaded <= 0) return false;
  const remainingLoaded = Math.max(0, loaded - rendered);
  // Prefetch only when the progressive window is near the end of loaded items.
  // Avoid warm-up chain-loading the entire feed on first paint.
  const threshold = Math.max(1, Number(params.remainingItemThreshold || 3));
  return remainingLoaded <= threshold;
};

/** Cap retained feed items to protect memory on long sessions (keeps newest tail). */
export const trimFeedForMemory = <T>(items: T[], maxRetained: number): T[] => {
  const list = Array.isArray(items) ? items : [];
  const cap = Math.max(20, Math.trunc(Number(maxRetained) || 120));
  if (list.length <= cap) return list;
  return list.slice(list.length - cap);
};

/**
 * Client-side diversity pass for heterogeneous batches (posts + recos + ads).
 * Does not invent items — only reorders within the batch.
 */
export const mixFeedBatchForDiversity = <T>(
  items: T[],
  options?: {
    getType?: (item: T) => string;
    getAuthor?: (item: T) => string;
    maxConsecutiveSameType?: number;
    maxConsecutiveSameAuthor?: number;
  }
): T[] =>
  interleaveForDiversity(items, {
    getType:
      options?.getType ||
      ((item: T) =>
        String(
          (item as any)?.type ||
            (item as any)?.sourceType ||
            (item as any)?.itemType ||
            (item as any)?.kind ||
            'post'
        )),
    getAuthor:
      options?.getAuthor ||
      ((item: T) =>
        String(
          (item as any)?.authorId ||
            (item as any)?.authorUserId ||
            (item as any)?.author?.id ||
            (item as any)?.userId ||
            (item as any)?.account?.id ||
            ''
        )),
    maxConsecutiveSameType: options?.maxConsecutiveSameType ?? 2,
    maxConsecutiveSameAuthor: options?.maxConsecutiveSameAuthor ?? 2
  });

/** End-of-feed professional discovery suggestions (never dead-end on Loading…). */
export const buildCaughtUpSuggestions = (options?: {
  surface?: 'member_home' | 'community' | string;
  hasPeople?: boolean;
  hasCommunities?: boolean;
  hasJobs?: boolean;
  hasMarketplace?: boolean;
}): EndOfFeedSuggestion[] => {
  const surface = String(options?.surface || 'member_home').toLowerCase();
  const suggestions: EndOfFeedSuggestion[] = [];

  if (options?.hasPeople !== false) {
    suggestions.push({
      kind: 'people',
      title: 'Grow your network',
      description: 'Follow professionals aligned with your industry and skills.',
      href: surface === 'community' ? '/community?tab=discover' : '/home#mobile-member-home-people-suggestions'
    });
  }
  if (options?.hasCommunities !== false) {
    suggestions.push({
      kind: 'communities',
      title: 'Explore communities',
      description: 'Join spaces for knowledge, hiring, and collaboration.',
      href: '/community'
    });
  }
  if (options?.hasJobs !== false) {
    suggestions.push({
      kind: 'jobs',
      title: 'Browse opportunities',
      description: 'Discover roles and gigs matched to your professional profile.',
      href: '/jobs'
    });
  }
  if (options?.hasMarketplace !== false) {
    suggestions.push({
      kind: 'marketplace',
      title: 'Marketplace',
      description: 'Find services, listings, and business offerings.',
      href: '/marketplace'
    });
  }
  suggestions.push({
    kind: 'blogs',
    title: 'Knowledge & insights',
    description: 'Read professional articles and platform updates.',
    href: '/blog'
  });
  suggestions.push({
    kind: 'pages',
    title: 'Follow companies & pages',
    description: 'Stay close to employers, brands, and organizations.',
    href: surface === 'community' ? '/community' : '/home#mobile-member-home-page-suggestions'
  });

  return suggestions.slice(0, 6);
};

export const resolveTerminalWithCaughtUp = (params: {
  nextCursor: string | null | undefined;
  hasMoreFlag?: boolean | null;
  uniqueAddedCount: number;
  offsetFallbackEnabled?: boolean;
  secondarySourcesRemaining?: boolean;
}): { isTerminal: boolean; canContinue: boolean; showCaughtUp: boolean } => {
  const terminal = resolveFeedTerminalState(params);
  return {
    ...terminal,
    showCaughtUp: terminal.isTerminal
  };
};

/** Map common feed item shapes to a coarse source type for analytics. */
export const resolveFeedItemSourceType = (item: any): FeedSourceType => {
  const raw = String(
    item?.type || item?.sourceType || item?.itemType || item?.kind || item?.feedItemType || ''
  )
    .trim()
    .toLowerCase();
  if (!raw) {
    if (item?.jobId || item?.job_id) return 'job';
    if (item?.gigId || item?.listingId) return 'listing';
    return 'post';
  }
  if (raw.includes('job')) return 'job';
  if (raw.includes('gig') || raw.includes('market')) return 'listing';
  if (raw.includes('ad') || raw.includes('sponsor')) return 'ad';
  if (raw.includes('person') || raw.includes('user')) return 'person';
  if (raw.includes('page')) return 'page';
  if (raw.includes('community')) return 'recommendation';
  if (raw.includes('scroll') || raw.includes('video')) return 'scroll';
  if (raw.includes('event')) return 'event';
  if (raw.includes('story')) return 'story';
  return raw as FeedSourceType;
};

/** Observer rootMargin CSS string for predictive infinite scroll. */
export const buildObserverRootMargin = (bottomPx: number): string => {
  const px = Math.max(120, Math.min(1400, Math.trunc(Number(bottomPx) || 560)));
  return `${px}px 0px`;
};
