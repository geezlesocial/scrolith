/**
 * Enterprise feed orchestration for member-home and /community.
 * Reuses opportunityGraph ranking, discovery recipes, ads, marketplace.
 * Opaque cursor pagination — no offset. Additive to existing /community/feed.
 */
import prisma from '../utils/prismaClient';
import { ChannelVisibility } from '@prisma/client';
import {
  getViewerFeedContext,
  normalizeFeedSurfaceMode,
  scoreCommunityPostForMode,
  type FeedSurfaceMode
} from './opportunityGraph.service';
import { getActiveFeedRecipe } from './discovery.service';
import { selectAdsForPlacement } from './adService';
import { listMarketplaceListings } from './marketplace.service';
import {
  buildFileContentUrl,
  buildUploadsUrl,
  resolveDirectMediaUrl,
  resolveFileBaseUrl
} from '../utils/mediaUrl';
import { mapOrchestratedItemsWithIntelligence } from './intelligence/intelligence.contract';
import {
  absolutizePublicMediaUrl,
  isVideoFileStorageAvailable
} from './storage/videoStorageAvailability';

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
  /** Phase 19.1 additive intelligence envelope (optional). */
  intelligence?: Record<string, any> | null;
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

export type FeedDiversifyOptions = {
  maxConsecutiveType?: number;
  /** @deprecated Prefer maxPostsPerAuthor; still used as consecutive non-post author run cap. */
  maxConsecutiveAuthor?: number;
  maxAdsPerPage?: number;
  minItemsBetweenAds?: number;
  /** Max POST/COMMUNITY_POST items per author per page when alternatives exist (default 1). */
  maxPostsPerAuthor?: number;
  /** Min slots between posts from the same author when a second is allowed (default 4). */
  minAuthorPostGap?: number;
  maxPersonRecommendations?: number;
  maxPageRecommendations?: number;
  maxCommunityRecommendations?: number;
  maxMarketplaceListings?: number;
  maxScrollVideos?: number;
  /** Soft content mix (fractions of pageSize). */
  postShareMin?: number;
  postShareMax?: number;
  recommendationShareMax?: number;
  marketplaceShareMax?: number;
  opportunityShareMax?: number;
  nearDuplicateJaccardThreshold?: number;
};

const isPostLikeType = (type: string) => type === 'POST' || type === 'COMMUNITY_POST';

const isRecommendationType = (type: string) =>
  type === 'PERSON_RECOMMENDATION' ||
  type === 'PAGE_RECOMMENDATION' ||
  type === 'COMMUNITY_RECOMMENDATION';

const isOpportunityType = (type: string) =>
  type === 'JOB' || type === 'GIG' || type === 'EVENT' || type === 'SCROLL_VIDEO' || type === 'STORY';

const isContentAuthorType = (type: string) =>
  isPostLikeType(type) ||
  type === 'JOB' ||
  type === 'GIG' ||
  type === 'MARKETPLACE_LISTING' ||
  type === 'SCROLL_VIDEO' ||
  type === 'STORY' ||
  type === 'EVENT' ||
  type === 'FEATURED' ||
  type === 'TRENDING';

/** Extract primary text for near-duplicate detection (deterministic, no AI). */
export const extractCandidateText = (item: {
  type?: string;
  payload?: any;
  why?: string | null;
}): string => {
  const payload = item?.payload || {};
  const parts = [
    payload.content,
    payload.body,
    payload.text,
    payload.title,
    payload.description,
    payload.caption,
    payload.summary
  ]
    .map((value) => clean(value))
    .filter(Boolean);
  return parts[0] || '';
};

/** Basic normalize without template slot collapse (conservative path). */
export const normalizeFeedTextBasic = (raw: string): string => {
  let text = clean(raw).toLowerCase();
  if (!text) return '';
  text = text.replace(/https?:\/\/\S+/gi, ' ');
  text = text.replace(/\b[\w.+-]+@[\w.-]+\.\w+\b/gi, ' ');
  text = text.replace(/[^a-z0-9\s]/g, ' ');
  text = text.replace(/\d+/g, ' ');
  return text.replace(/\s+/g, ' ').trim();
};

/**
 * Detect high-confidence spam/template skeletons only.
 * Distinct professional posts that merely share common phrases must not match.
 */
export const looksLikeFeedTemplateSkeleton = (normalizedBasic: string): boolean => {
  const text = clean(normalizedBasic).toLowerCase();
  if (!text) return false;
  const hasUpdateFrom = /\bupdate from\b/.test(text);
  const hasImprovingDelivery = /\bimproving delivery quality\b/.test(text);
  const hasWhileKeeping = /\bwhile keeping\b/.test(text);
  return hasUpdateFrom && hasImprovingDelivery && hasWhileKeeping;
};

/**
 * Normalize text for fingerprints: lowercase, strip URLs/punctuation/digits,
 * collapse whitespace. Template role/geo/skill collapse only for known skeletons.
 */
export const normalizeFeedTextForFingerprint = (raw: string): string => {
  let text = normalizeFeedTextBasic(raw);
  if (!text) return '';
  if (looksLikeFeedTemplateSkeleton(text)) {
    text = text.replace(/\bupdate from [a-z\s]{1,60}? improving\b/g, 'update from place improving');
    text = text.replace(/\bupdate from [a-z\s]{1,60}? with\b/g, 'update from place with');
    text = text.replace(/\bwith [a-z\s]{1,100}? while\b/g, 'with skills while');
    text = text.replace(/^[a-z\s]{1,80}? update from/, 'role update from');
    text = text.replace(/\s+/g, ' ').trim();
  }
  return text;
};

/** Lightweight deterministic 32-bit hash (FNV-1a style) → hex fingerprint. */
export const buildNearDuplicateFingerprint = (raw: string): string => {
  const normalized = normalizeFeedTextForFingerprint(raw);
  if (!normalized) return '';
  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `f${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

export const tokenizeForNearDuplicate = (raw: string): string[] => {
  const normalized = normalizeFeedTextForFingerprint(raw);
  if (!normalized) return [];
  return normalized.split(' ').filter((token) => token.length > 2);
};

export const jaccardSimilarity = (a: string[], b: string[]): number => {
  if (!a.length || !b.length) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  setA.forEach((token) => {
    if (setB.has(token)) inter += 1;
  });
  const union = setA.size + setB.size - inter;
  return union > 0 ? inter / union : 0;
};

/**
 * Near-duplicate detector (no AI).
 * - Short posts: exact basic-normalized equality only (stricter).
 * - Long posts: template fingerprint equality or high Jaccard on normalized tokens.
 */
export const isNearDuplicateText = (
  left: string,
  right: string,
  jaccardThreshold = 0.72
): boolean => {
  const a = clean(left);
  const b = clean(right);
  if (!a || !b) return false;

  const basicA = normalizeFeedTextBasic(a);
  const basicB = normalizeFeedTextBasic(b);
  if (!basicA || !basicB) return false;

  const tokensBasicA = basicA.split(' ').filter((t) => t.length > 2);
  const tokensBasicB = basicB.split(' ').filter((t) => t.length > 2);
  const short =
    Math.min(basicA.length, basicB.length) < 80 ||
    Math.min(tokensBasicA.length, tokensBasicB.length) < 12;

  // Short posts require exact equality after basic normalize (no soft Jaccard).
  if (short) {
    return basicA === basicB;
  }

  const fpA = buildNearDuplicateFingerprint(a);
  const fpB = buildNearDuplicateFingerprint(b);
  if (fpA && fpB && fpA === fpB) return true;

  // Soft Jaccard only when both sides look like the same template family,
  // or when similarity is extremely high on long distinct text.
  const j = jaccardSimilarity(tokenizeForNearDuplicate(a), tokenizeForNearDuplicate(b));
  if (looksLikeFeedTemplateSkeleton(basicA) && looksLikeFeedTemplateSkeleton(basicB)) {
    return j >= Math.min(jaccardThreshold, 0.72);
  }
  // Distinct long professional posts: require near-identity (>= 0.92).
  return j >= Math.max(jaccardThreshold, 0.92);
};

/**
 * Cursor v1 watermark derivation.
 * Only post-like items advance `w`. Marketplace/jobs/gigs/recs must never pull
 * the watermark so far back that newer deferred posts become uncollectable.
 */
export const deriveMemberFeedWatermark = (
  selected: Array<{ type: string; createdAt?: string | null }>,
  previousW: string | null
): string | null => {
  const postDates = (selected || [])
    .filter((item) => isPostLikeType(String(item?.type || '')))
    .map((item) => Date.parse(String(item?.createdAt || '')))
    .filter((ms) => Number.isFinite(ms));
  if (!postDates.length) {
    // Preserve prior post watermark; do not invent one from non-post rows.
    return previousW || null;
  }
  return new Date(Math.min(...postDates)).toISOString();
};

/**
 * Soft eligibility under cursor v1.
 * - feedKey in `k` → excluded (already delivered)
 * - watermark `w` never excludes unseen post-like items (deferred author/near-dup safety)
 * Hard mode retained only for tests proving the previous failure mode.
 */
export const isEligibleUnderMemberFeedCursor = (
  item: { type: string; feedKey: string; createdAt?: string | null },
  cursor: { k?: string[]; w?: string | null },
  mode: 'soft' | 'hard' = 'soft'
): boolean => {
  const key = clean(item?.feedKey);
  if (!key) return false;
  const seen = new Set((cursor?.k || []).map((entry) => clean(entry)).filter(Boolean));
  if (seen.has(key)) return false;

  if (mode === 'hard' && cursor?.w && isPostLikeType(String(item.type || ''))) {
    const created = Date.parse(String(item.createdAt || ''));
    const water = Date.parse(String(cursor.w));
    if (Number.isFinite(created) && Number.isFinite(water) && created > water) {
      return false;
    }
  }
  return true;
};

const countTypes = (items: Candidate[], type: string) => items.filter((item) => item.type === type).length;

const countGroup = (items: Candidate[], predicate: (type: string) => boolean) =>
  items.filter((item) => predicate(item.type)).length;

const lastIndexWhere = (items: Candidate[], predicate: (item: Candidate) => boolean) => {
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (predicate(items[i])) return i;
  }
  return -1;
};

const consecutiveRun = (items: Candidate[], field: 'type' | '_authorKey', value: string) => {
  let run = 0;
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (String(items[i][field] || '') === value) run += 1;
    else break;
  }
  return run;
};

/**
 * Diversity-aware page assembly:
 * - author spacing for posts
 * - near-duplicate template suppression (keep highest score)
 * - recommendation / marketplace / scroll / ad hard caps
 * - soft content-type balance; remaining slots by score
 * Deferred items stay out of the page (eligible on later pages via cursor seen-keys).
 * Pure function — unit tested.
 */
export const diversifyFeedCandidates = (
  items: Candidate[],
  pageSize: number,
  options?: FeedDiversifyOptions
): Candidate[] => {
  if (!items.length || pageSize <= 0) return [];

  const maxTypeRun = Math.max(1, options?.maxConsecutiveType ?? 2);
  const maxConsecutiveAuthor = Math.max(1, options?.maxConsecutiveAuthor ?? 2);
  const maxAds = Math.max(0, options?.maxAdsPerPage ?? 1);
  const minBetweenAds = Math.max(1, options?.minItemsBetweenAds ?? 7);
  const maxPostsPerAuthor = Math.max(1, options?.maxPostsPerAuthor ?? 1);
  const minAuthorPostGap = Math.max(1, options?.minAuthorPostGap ?? 4);
  const maxPerson = Math.max(0, options?.maxPersonRecommendations ?? 2);
  const maxPageRec = Math.max(0, options?.maxPageRecommendations ?? 1);
  const maxCommunityRec = Math.max(0, options?.maxCommunityRecommendations ?? 1);
  const maxMarketplace = Math.max(0, options?.maxMarketplaceListings ?? 2);
  const maxScroll = Math.max(0, options?.maxScrollVideos ?? 2);
  const postShareMin = options?.postShareMin ?? 0.5;
  const postShareMax = options?.postShareMax ?? 0.65;
  const recommendationShareMax = options?.recommendationShareMax ?? 0.2;
  const marketplaceShareMax = options?.marketplaceShareMax ?? 0.15;
  const opportunityShareMax = options?.opportunityShareMax ?? 0.15;
  const jaccardThreshold = options?.nearDuplicateJaccardThreshold ?? 0.72;

  const hardCapFor = (type: string): number | null => {
    if (type === 'PERSON_RECOMMENDATION') return maxPerson;
    if (type === 'PAGE_RECOMMENDATION') return maxPageRec;
    if (type === 'COMMUNITY_RECOMMENDATION') return maxCommunityRec;
    if (type === 'MARKETPLACE_LISTING') return maxMarketplace;
    if (type === 'SCROLL_VIDEO') return maxScroll;
    if (type === 'AD') return maxAds;
    return null;
  };

  // Deterministic: score desc, then feedKey asc.
  const sorted = [...items].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.feedKey).localeCompare(String(b.feedKey));
  });

  const selectedKeys = new Set<string>();
  const result: Candidate[] = [];

  const textOf = (item: Candidate) => extractCandidateText(item);

  const contentAuthorIds = () => {
    const ids = new Set<string>();
    result.forEach((item) => {
      if (isContentAuthorType(item.type) && item._authorKey) ids.add(item._authorKey);
    });
    return ids;
  };

  const remaining = () => sorted.filter((item) => item.feedKey && !selectedKeys.has(item.feedKey));

  const passesNearDuplicateForPair = (item: Candidate, page: Candidate[]): boolean => {
    if (!isPostLikeType(item.type)) return true;
    const text = textOf(item);
    if (!text) return true;
    for (const existing of page) {
      if (!isPostLikeType(existing.type)) continue;
      const existingText = textOf(existing);
      if (existingText && isNearDuplicateText(text, existingText, jaccardThreshold)) return false;
    }
    return true;
  };

  const passesNearDuplicate = (item: Candidate): boolean => passesNearDuplicateForPair(item, result);

  const passesAuthorRules = (item: Candidate, relaxWhenNoAlt: boolean): boolean => {
    if (!isPostLikeType(item.type) || !item._authorKey) {
      // Non-post: keep light consecutive-author run cap when alternatives exist.
      if (!item._authorKey) return true;
      const run = consecutiveRun(result, '_authorKey', item._authorKey);
      if (run < maxConsecutiveAuthor) return true;
      const alt = remaining().some(
        (other) =>
          other.feedKey !== item.feedKey &&
          other._authorKey !== item._authorKey &&
          !selectedKeys.has(other.feedKey)
      );
      return !alt;
    }

    const authorPosts = result.filter(
      (entry) => isPostLikeType(entry.type) && entry._authorKey === item._authorKey
    );
    if (authorPosts.length < maxPostsPerAuthor) return true;

    const lastIdx = lastIndexWhere(
      result,
      (entry) => isPostLikeType(entry.type) && entry._authorKey === item._authorKey
    );
    const gapOk = lastIdx < 0 || result.length - lastIdx >= minAuthorPostGap;

    const hasAlt = remaining().some((other) => {
      if (selectedKeys.has(other.feedKey) || other.feedKey === item.feedKey) return false;
      if (isPostLikeType(other.type)) {
        if (other._authorKey === item._authorKey) return false;
        return passesNearDuplicateForPair(other, result);
      }
      return true;
    });

    // Defer excess posts from this author when alternatives exist.
    if (hasAlt) return false;
    if (!relaxWhenNoAlt) return false;
    return gapOk;
  };

  const passesHardCaps = (item: Candidate): boolean => {
    const cap = hardCapFor(item.type);
    if (cap != null && countTypes(result, item.type) >= cap) return false;

    if (item.type === 'AD') {
      if (result.length === 0) return false;
      if (result[result.length - 1]?.type === 'AD') return false;
      const lastAdIndex = lastIndexWhere(result, (entry) => entry.type === 'AD');
      if (lastAdIndex >= 0 && result.length - 1 - lastAdIndex < minBetweenAds) return false;
    }

    if (item.type === 'PERSON_RECOMMENDATION' && item._authorKey) {
      if (contentAuthorIds().has(item._authorKey)) return false;
    }

    const typeRun = consecutiveRun(result, 'type', item.type);
    if (typeRun >= maxTypeRun) {
      const hasOtherType = remaining().some(
        (other) => other.type !== item.type && !selectedKeys.has(other.feedKey)
      );
      if (hasOtherType) return false;
    }

    return true;
  };

  const softOverrepresented = (item: Candidate): boolean => {
    const n = result.length + 1; // after hypothetical add
    const size = Math.max(pageSize, n);
    const posts = countGroup(result, isPostLikeType) + (isPostLikeType(item.type) ? 1 : 0);
    const recs = countGroup(result, isRecommendationType) + (isRecommendationType(item.type) ? 1 : 0);
    const market =
      countTypes(result, 'MARKETPLACE_LISTING') + (item.type === 'MARKETPLACE_LISTING' ? 1 : 0);
    const opps = countGroup(result, isOpportunityType) + (isOpportunityType(item.type) ? 1 : 0);

    if (isPostLikeType(item.type) && posts / size > postShareMax + 0.001) return true;
    if (isRecommendationType(item.type) && recs / size > recommendationShareMax + 0.001) return true;
    if (item.type === 'MARKETPLACE_LISTING' && market / size > marketplaceShareMax + 0.001) return true;
    if (isOpportunityType(item.type) && opps / size > opportunityShareMax + 0.001) return true;
    return false;
  };

  const softUnderrepresentedExists = (excludeFeedKey: string): boolean => {
    const n = Math.max(result.length, 1);
    const size = pageSize;
    const posts = countGroup(result, isPostLikeType);
    const recs = countGroup(result, isRecommendationType);
    const market = countTypes(result, 'MARKETPLACE_LISTING');
    const opps = countGroup(result, isOpportunityType);

    const needPosts = posts / size < postShareMin;
    const needRecs = recs / size < Math.min(0.15, recommendationShareMax);
    const needMarket = market / size < 0.1;
    const needOpps = opps / size < 0.1;

    return remaining().some((other) => {
      if (other.feedKey === excludeFeedKey || selectedKeys.has(other.feedKey)) return false;
      if (needPosts && isPostLikeType(other.type)) return true;
      if (needRecs && isRecommendationType(other.type)) return true;
      if (needMarket && other.type === 'MARKETPLACE_LISTING') return true;
      if (needOpps && isOpportunityType(other.type)) return true;
      return false;
    });
  };

  const canSelect = (
    item: Candidate,
    mode: 'strict' | 'hard' | 'fallback'
  ): boolean => {
    if (!item.feedKey || selectedKeys.has(item.feedKey)) return false;
    if (!passesHardCaps(item)) return false;
    if (!passesNearDuplicate(item)) return false;
    if (!passesAuthorRules(item, mode === 'fallback')) return false;

    if (mode === 'strict') {
      if (softOverrepresented(item) && softUnderrepresentedExists(item.feedKey)) {
        return false;
      }
    }
    return true;
  };

  let guard = 0;
  while (result.length < pageSize && guard < pageSize * 20) {
    guard += 1;
    let picked: Candidate | null = null;

    for (const mode of ['strict', 'hard', 'fallback'] as const) {
      for (const item of sorted) {
        if (canSelect(item, mode)) {
          picked = item;
          break;
        }
      }
      if (picked) break;
    }

    if (!picked) break;
    selectedKeys.add(picked.feedKey);
    result.push(picked);
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

    // Soft watermark (cursor v1 field preserved):
    // - Primary query NEVER applies createdAt lte watermark, so deferred newer posts
    //   (author/near-dup deferred, not in cursor.k) remain collectable on later pages.
    // - Optional secondary query uses watermark only to pull additional older posts.
    const postSelect = {
      id: true,
      authorId: true,
      businessPageId: true,
      title: true,
      content: true,
      // Facebook-style text backgrounds — required for Member Home / orchestrator payload.
      presentation: true,
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
    } as const;

    const [primaryPosts, olderPosts] = await Promise.all([
      prisma.communityPost.findMany({
        where,
        orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
        take: input.take,
        select: postSelect
      }),
      input.watermark
        ? prisma.communityPost.findMany({
            where: {
              ...where,
              createdAt: { lte: new Date(input.watermark) }
            },
            orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
            take: input.take,
            select: postSelect
          })
        : Promise.resolve([])
    ]);

    const mergedById = new Map<string, (typeof primaryPosts)[number]>();
    // Prefer primary (newest) order; older window fills gaps without dropping newer rows.
    for (const post of primaryPosts) mergedById.set(post.id, post);
    for (const post of olderPosts) {
      if (!mergedById.has(post.id)) mergedById.set(post.id, post);
    }
    const posts = Array.from(mergedById.values());

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
        // Keep raw attachment ids here; hydratePostAttachmentDescriptors enriches mime/type/url.
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
            // Preserve raw ids for hydration; do not leave FE with string-only attachments.
            attachments,
            attachmentFileIds: attachments
              .map((entry: any) => (typeof entry === 'string' ? entry : entry?.id || entry?.fileId || ''))
              .filter(Boolean),
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
          updatedAt: true,
          profile: {
            select: {
              title: true,
              bio: true
            }
          }
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
          where: { status: 'active', visibility: ChannelVisibility.PUBLIC },
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
        const titleHint = String((user as any).profile?.title || (user as any).title || (user as any).headline || '').trim();
        const score = 30 + (user.isVerified ? 8 : 0) + (titleHint ? 2 : 0);
        const author = mapAuthor(user);
        // Phase 20.3 — clearer growth-oriented explanations (intelligence envelope reads `why`).
        const why = user.isVerified
          ? 'Verified professional to expand your network'
          : titleHint
            ? 'Relevant professional in your discovery graph'
            : 'People you may want to follow';
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
          why,
          reasons: [why, user.isVerified ? 'Verified account' : 'Active member'].filter(Boolean),
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
        const why = page.category
          ? `Business page in ${String(page.category).slice(0, 40)}`
          : 'Pages worth following for opportunities';
        return {
          type: 'PAGE_RECOMMENDATION' as const,
          id: page.id,
          sourceId: page.id,
          feedKey: key,
          createdAt: toIso(page.updatedAt),
          score: 30 + (page.category ? 3 : 0),
          rankingScore: 30 + (page.category ? 3 : 0),
          author,
          media: null,
          visibility: 'public',
          why,
          reasons: [why, 'Opportunity discovery'],
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

const inferAttachmentMediaType = (
  mimeType?: string | null,
  url?: string | null,
  name?: string | null
): 'image' | 'video' | 'document' => {
  const mime = String(mimeType || '').trim().toLowerCase();
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('image/')) return 'image';
  const hay = `${String(url || '')} ${String(name || '')}`.toLowerCase();
  if (/\.(mp4|webm|mov|m4v|ogg|avi|mkv)(?:$|[?#])/.test(hay)) return 'video';
  if (/\.(png|jpe?g|gif|webp|avif|svg)(?:$|[?#])/.test(hay)) return 'image';
  if (mime === 'application/pdf' || hay.endsWith('.pdf')) return 'document';
  // Browser MediaRecorder / camera uploads sometimes land as octet-stream.
  if (
    mime === 'application/octet-stream' &&
    (/video|reel|clip|camera|record|capture/i.test(hay) || /\.webm|\.mp4|\.mov/.test(hay))
  ) {
    return 'video';
  }
  return 'document';
};

const stripUploadsPrefix = (value?: string | null) => {
  const raw = String(value || '').trim().replace(/\\/g, '/');
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return stripUploadsPrefix(parsed.pathname);
  } catch {}
  const normalized = raw.replace(/^\/+/, '');
  const marker = 'uploads/';
  const index = normalized.toLowerCase().indexOf(marker);
  return (index >= 0 ? normalized.slice(index + marker.length) : normalized).replace(/^\/+/, '');
};

/**
 * Hydrate post attachment file ids into full media descriptors for member-home cards.
 * Without this, orchestrated feed ships raw ids and the FE falls back to "Document".
 */
async function hydratePostAttachmentDescriptors(
  items: OrchestratedFeedItem[]
): Promise<OrchestratedFeedItem[]> {
  const fileIds: string[] = [];
  for (const item of items) {
    const type = String(item?.type || '').toUpperCase();
    if (type !== 'POST' && type !== 'COMMUNITY_POST') continue;
    const payload = item.payload && typeof item.payload === 'object' ? (item.payload as any) : {};
    const sources = [
      ...(Array.isArray(payload.attachments) ? payload.attachments : []),
      ...(Array.isArray(payload.attachmentFileIds) ? payload.attachmentFileIds : []),
      ...(Array.isArray(item.media) ? item.media : item.media ? [item.media] : [])
    ];
    for (const entry of sources) {
      const id =
        typeof entry === 'string'
          ? clean(entry)
          : clean(entry?.fileId || entry?.file_id || entry?.id || '');
      if (id) fileIds.push(id);
    }
  }

  if (!fileIds.length) return items;
  const mediaMap = await resolveFileMediaMap(fileIds);

  return items.map((item) => {
    const type = String(item?.type || '').toUpperCase();
    if (type !== 'POST' && type !== 'COMMUNITY_POST') return item;
    const payload = item.payload && typeof item.payload === 'object' ? { ...(item.payload as any) } : {};
    const rawList = Array.isArray(payload.attachments)
      ? payload.attachments
      : Array.isArray(payload.attachmentFileIds)
        ? payload.attachmentFileIds
        : Array.isArray(item.media)
          ? item.media
          : [];

    const resolved = rawList
      .map((entry: any) => {
        const id =
          typeof entry === 'string'
            ? clean(entry)
            : clean(entry?.fileId || entry?.file_id || entry?.id || '');
        if (!id) return null;
        const file = mediaMap.get(id);
        const mimeType = file?.mimeType || entry?.mimeType || entry?.mime_type || null;
        const url = file?.url || entry?.url || null;
        const name =
          entry?.name ||
          entry?.originalName ||
          entry?.filename ||
          file?.originalName ||
          file?.filename ||
          null;
        const mediaType = inferAttachmentMediaType(mimeType, url, name);
        return {
          id,
          fileId: id,
          url,
          fallbackUrl: file?.fallbackUrl || null,
          storagePath: file?.storagePath || null,
          name,
          mimeType,
          type: mediaType,
          kind: mediaType,
          thumbnailUrl: file?.thumbnailUrl || entry?.thumbnailUrl || null,
          duration: file?.durationSeconds ?? entry?.duration ?? null,
          width: file?.width ?? entry?.width ?? null,
          height: file?.height ?? entry?.height ?? null
        };
      })
      .filter(Boolean);

    return {
      ...item,
      media: resolved.map((att: any) => ({
        fileId: att.fileId,
        url: att.url,
        fallbackUrl: att.fallbackUrl,
        mimeType: att.mimeType,
        type: att.type,
        thumbnailUrl: att.thumbnailUrl,
        duration: att.duration,
        width: att.width,
        height: att.height
      })),
      payload: {
        ...payload,
        attachmentFileIds: resolved.map((att: any) => att.fileId),
        attachments: resolved
      }
    };
  });
}

/**
 * Batch-resolve File ids into dual-path media descriptors.
 * Prefer content URL when File exists; always attach uploads fallback from storageKey.
 */
async function resolveFileMediaMap(fileIds: string[]) {
  const ids = Array.from(new Set((fileIds || []).map((value) => String(value || '').trim()).filter(Boolean)));
  const map = new Map<string, Record<string, any>>();
  if (!ids.length) return map;

  const baseUrl = resolveFileBaseUrl();
  const files = await prisma.file
    .findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        url: true,
        storageKey: true,
        storageProvider: true,
        mimeType: true,
        originalName: true,
        filename: true,
        thumbnailUrl: true,
        width: true,
        height: true,
        duration: true
      }
    })
    .catch(() => []);

  const unavailableVideoFileIds = new Set<string>();
  await Promise.all(
    files.map(async (file) => {
      const available = await isVideoFileStorageAvailable(file);
      if (!available) unavailableVideoFileIds.add(file.id);
    })
  );

  for (const file of files) {
    const unavailable = unavailableVideoFileIds.has(file.id);
    const contentUrl = buildFileContentUrl(file.id, baseUrl);
    const uploadsUrl = file.storageKey ? buildUploadsUrl(String(file.storageKey), baseUrl) : null;
    const directUrl = resolveDirectMediaUrl(file.url, baseUrl);
    const provider = String(file.storageProvider || '').toLowerCase();
    const managed = ['database_storage', 'firebase_storage', 'azure_blob', 'azure', 'blob'].includes(
      provider
    );
    // Azure-first: always prefer durable content URL. Never blank media URLs solely
    // because a GCS probe failed — that caused postcard/Scroll "Video unavailable".
    const preferred = managed
      ? contentUrl || directUrl || uploadsUrl
      : contentUrl || directUrl || uploadsUrl || null;
    const fallback =
      !preferred
        ? null
        : preferred === contentUrl
          ? uploadsUrl || directUrl || null
          : preferred === uploadsUrl
            ? contentUrl
            : contentUrl !== preferred
              ? contentUrl
              : null;
    map.set(file.id, {
      fileId: file.id,
      url: preferred,
      fallbackUrl: fallback && fallback !== preferred ? fallback : null,
      storagePath: file.storageKey || null,
      unavailable,
      unavailableReason: unavailable ? 'storage_missing' : null,
      mimeType: file.mimeType || null,
      originalName: file.originalName || null,
      filename: file.filename || null,
      thumbnailUrl:
        absolutizePublicMediaUrl(
          resolveDirectMediaUrl(file.thumbnailUrl, baseUrl) || file.thumbnailUrl || null,
          baseUrl
        ) || null,
      width: file.width ?? null,
      height: file.height ?? null,
      durationSeconds: file.duration ?? null
    });
  }

  // Orphaned ids are not playable media. Do not fabricate /api/files/content/:id,
  // because browser video elements treat that as a real stream and show a broken player.
  for (const id of ids) {
    if (map.has(id)) continue;
    map.set(id, {
      fileId: id,
      url: null,
      fallbackUrl: null,
      storagePath: null,
      unavailable: true,
      unavailableReason: 'file_record_missing'
    });
  }

  return map;
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

    const mediaIds = [
      ...(stories as any[]).map((row) => clean(row?.mediaFileId)),
      ...(scrolls as any[]).map((row) => clean(row?.fileId))
    ].filter(Boolean);
    const mediaMap = await resolveFileMediaMap(mediaIds);

    const storyItems = (stories as any[])
      .map((story) => {
        const key = buildFeedKey('STORY', story.id);
        if (seen.has(key)) return null;
        const author = mapAuthor(story.author);
        const mediaFileId = clean(story.mediaFileId);
        const resolved = mediaFileId ? mediaMap.get(mediaFileId) : null;
        return {
          type: 'STORY' as const,
          id: story.id,
          sourceId: story.id,
          feedKey: key,
          createdAt: toIso(story.createdAt),
          score: 34,
          rankingScore: 34,
          author,
          media: resolved
            ? { ...resolved, type: story.type }
            : { fileId: story.mediaFileId, type: story.type },
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
        const fileId = clean(scroll.fileId);
        const resolved = fileId ? mediaMap.get(fileId) : null;
        return {
          type: 'SCROLL_VIDEO' as const,
          id: scroll.id,
          sourceId: scroll.id,
          feedKey: key,
          createdAt: toIso(scroll.createdAt),
          score: 33,
          rankingScore: 33,
          author,
          media: resolved || { fileId: scroll.fileId },
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

const buildCommunityEventQuery = (take: number, now = new Date()) => ({
  // CommunityEvent has no status column; only return current and upcoming events.
  where: { endTime: { gte: now } },
  orderBy: [{ startTime: 'asc' }, { createdAt: 'desc' }],
  take: Math.min(Math.max(1, Math.trunc(take)), 6),
  select: {
    id: true,
    title: true,
    description: true,
    startTime: true,
    endTime: true,
    location: true,
    createdAt: true
  }
});

async function collectEvents(take: number, seen: Set<string>): Promise<Candidate[]> {
  try {
    // Prefer community events table when present.
    const events = await (prisma as any).communityEvent
      ?.findMany?.(buildCommunityEventQuery(take))
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
          createdAt: toIso(event.startTime || event.createdAt),
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
    minItemsBetweenAds: 7,
    maxPostsPerAuthor: 1,
    minAuthorPostGap: 4,
    maxPersonRecommendations: 2,
    maxPageRecommendations: 1,
    maxCommunityRecommendations: 1,
    maxMarketplaceListings: 2,
    maxScrollVideos: 2,
    postShareMin: 0.5,
    postShareMax: 0.65,
    recommendationShareMax: 0.2,
    marketplaceShareMax: 0.15,
    opportunityShareMax: 0.15
  });

  const nextSeen = [...cursorState.k, ...diversified.map((item) => item.feedKey)].slice(-120);
  // Post-like only: never let marketplace/job/gig set a watermark that drops newer deferred posts.
  const watermark = deriveMemberFeedWatermark(diversified, cursorState.w);

  // More content exists if pool exceeded page size after filters, or we filled a full page.
  const remainingAfterPage = unique.length - diversified.length;
  const hasMore = remainingAfterPage > 0 || diversified.length >= pageSize;
  const nextCursor =
    hasMore && diversified.length
      ? encodeMemberFeedCursor({ v: 1, k: nextSeen, w: watermark })
      : null;

  // Strip internal collector fields, hydrate post media, then attach intelligence envelope (no sort change).
  const stripped: OrchestratedFeedItem[] = diversified.map(({ _source, _authorKey, ...item }) => item);
  const hydrated = await hydratePostAttachmentDescriptors(stripped);
  const items: OrchestratedFeedItem[] = mapOrchestratedItemsWithIntelligence(hydrated, mode);

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
  shouldIncludeFeedDiagnostics,
  extractCandidateText,
  normalizeFeedTextForFingerprint,
  normalizeFeedTextBasic,
  looksLikeFeedTemplateSkeleton,
  buildNearDuplicateFingerprint,
  isNearDuplicateText,
  buildCommunityEventQuery,
  jaccardSimilarity,
  tokenizeForNearDuplicate,
  deriveMemberFeedWatermark,
  isEligibleUnderMemberFeedCursor
};
