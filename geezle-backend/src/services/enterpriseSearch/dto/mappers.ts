/**
 * Response mappers: Discovery / candidates → SearchResult; v2 ↔ v1.
 */
import type { RankedRecommendation } from '../../discoveryEngine/discoveryEngine.types';
import type {
  RankingAuthority,
  SearchCandidate,
  SearchDomain,
  SearchExplanation,
  SearchReasonCode,
  SearchResult
} from '../contracts/types';
import { mintFallbackTrackingToken } from '../cursor/cursor';
import { aliasToDomain } from './validate';

const asReasonCodes = (codes: unknown): SearchReasonCode[] => {
  if (!Array.isArray(codes)) return [];
  return codes.map(String) as SearchReasonCode[];
};

export const candidateKey = (entityType: string, entityId: string) =>
  `${String(entityType).toLowerCase()}:${String(entityId)}`;

export const mapDiscoveryItemToSearchResult = (
  item: RankedRecommendation,
  opts?: { includeExplanations?: boolean; authority?: RankingAuthority }
): SearchResult => {
  const authority = opts?.authority || 'discovery';
  const codes = asReasonCodes(item.reasonCodes);
  const explanation: SearchExplanation | undefined =
    opts?.includeExplanations === false
      ? undefined
      : {
          codes,
          headline: item.explanation || 'Recommended for you',
          from: 'discovery',
          i18nKey: codes[0] ? `search.explain.${codes[0]}` : undefined
        };

  return {
    id: candidateKey(item.entityType, item.entityId),
    entityType: item.entityType as SearchDomain,
    entityId: item.entityId,
    title: item.label || item.entityId,
    subtitle: item.category || null,
    description: item.summary || null,
    url: item.hrefHint || defaultUrl(item.entityType, item.entityId),
    media: undefined,
    score: item.score,
    rank: item.rank,
    reason: item.explanation,
    reasonCodes: codes,
    explanation,
    trackingToken: item.trackingToken,
    source: item.source,
    visibility: { level: 'unknown' },
    permissions: { canView: true },
    ranking: {
      authority,
      modelVersion: undefined
    },
    attributes: {
      category: item.category,
      authorOrOwnerId: item.authorOrOwnerId
    }
  };
};

export const mapCandidateToSearchResult = (
  c: SearchCandidate,
  opts: { rank: number; authority: RankingAuthority; rankingModelVersion?: string }
): SearchResult => {
  const codes: SearchReasonCode[] = ['lexical_match', 'query_title_match'];
  const headline = 'Matches your search';
  return {
    id: candidateKey(c.entityType, c.entityId),
    entityType: c.entityType,
    entityId: c.entityId,
    title: c.title,
    subtitle: c.subtitle || null,
    description: c.description || null,
    url: c.url,
    media: {
      avatarUrl: c.avatarUrl || null,
      imageUrl: c.imageUrl || null
    },
    score: c.lexicalScore ?? Math.max(0, 1 - opts.rank * 0.01),
    rank: opts.rank,
    reason: headline,
    reasonCodes: codes,
    explanation: {
      codes,
      headline,
      from: 'search_fallback',
      i18nKey: 'search.explain.lexical_match'
    },
    trackingToken: mintFallbackTrackingToken(c.entityType, c.entityId),
    source: 'lexical',
    visibility: { level: 'public' },
    permissions: { canView: true },
    ranking: {
      authority: opts.authority,
      modelVersion: opts.rankingModelVersion
    },
    attributes: {
      category: c.category,
      ...(c.attributes || {})
    }
  };
};

const defaultUrl = (entityType: string, entityId: string) => {
  const id = encodeURIComponent(entityId);
  switch (entityType) {
    case 'person':
      return `/profile/${id}`;
    case 'page':
    case 'company':
      return `/company/${id}`;
    case 'post':
      return `/post/${id}`;
    case 'job':
      return `/jobs/${id}`;
    case 'service':
      return `/gigs/${id}`;
    case 'marketplace_listing':
    case 'product':
      return `/marketplace/listing/${id}`;
    default:
      return `/search?q=${id}`;
  }
};

/** Domain → v1 bucket key */
export const domainToV1Bucket = (domain: SearchDomain | string): string => {
  const d = String(domain).toLowerCase();
  if (d === 'person') return 'people';
  if (d === 'page' || d === 'company') return 'pages';
  if (d === 'post') return 'posts';
  if (d === 'job') return 'jobs';
  if (d === 'service' || d === 'freelancer') return 'gigs';
  if (d === 'marketplace_listing' || d === 'product') return 'marketplace';
  return d;
};

/** Map SearchResult → legacy v1 search entry */
export const mapSearchResultToV1Entry = (item: SearchResult) => {
  const type = domainToV1Bucket(item.entityType);
  return {
    id: item.entityId,
    type,
    title: item.title,
    name: item.title,
    username: item.attributes?.username as string | undefined,
    subtitle: item.subtitle || undefined,
    description: item.description || item.subtitle || undefined,
    url: item.url,
    avatarUrl: item.media?.avatarUrl ?? null,
    image: item.media?.imageUrl || item.media?.avatarUrl || null,
    meta: {
      ...(item.attributes || {}),
      score: item.score,
      entityType: item.entityType,
      trackingToken: item.trackingToken,
      reasonCodes: item.reasonCodes
    }
  };
};

/** Build v1 unified payload from v2 response items */
export const mapToV1Unified = (
  query: string,
  items: SearchResult[],
  limit = 20
): {
  query: string;
  groups: Record<string, ReturnType<typeof mapSearchResultToV1Entry>[]>;
  results: ReturnType<typeof mapSearchResultToV1Entry>[];
  totals: Record<string, number>;
} => {
  const groups: Record<string, ReturnType<typeof mapSearchResultToV1Entry>[]> = {
    people: [],
    pages: [],
    jobs: [],
    gigs: [],
    posts: [],
    marketplace: []
  };
  for (const item of items) {
    const bucket = domainToV1Bucket(item.entityType);
    const entry = mapSearchResultToV1Entry(item);
    if (groups[bucket]) groups[bucket].push(entry);
    else {
      // unknown buckets ignored for v1 shape
    }
  }
  const results = items.slice(0, limit).map(mapSearchResultToV1Entry);
  return {
    query,
    groups: {
      people: groups.people,
      pages: groups.pages,
      jobs: groups.jobs,
      gigs: groups.gigs,
      posts: groups.posts
      // marketplace additive only when present — keep core five for strict v1
    },
    results,
    totals: {
      people: groups.people.length,
      pages: groups.pages.length,
      jobs: groups.jobs.length,
      gigs: groups.gigs.length,
      posts: groups.posts.length,
      total: results.length
    }
  };
};

export const v1TypeToDomains = (type: string): SearchDomain[] => {
  const t = String(type || 'posts').toLowerCase();
  if (t === 'all' || t === 'unified') {
    return ['person', 'page', 'job', 'service', 'post'];
  }
  return [aliasToDomain(t) as SearchDomain];
};
