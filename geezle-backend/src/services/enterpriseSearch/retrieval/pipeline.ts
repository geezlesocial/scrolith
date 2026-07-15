/**
 * Complete Enterprise Search retrieval → rank boundary pipeline (Phase 9.3 + 9.4).
 */
import { randomUUID } from 'crypto';
import { SEARCH_CACHE_QUERY_TTL_MS, SEARCH_MODEL_VERSION } from '../contracts/constants';
import type {
  SearchDomain,
  SearchFilters,
  SearchQueryResponse,
  SearchSurface
} from '../contracts/types';
import { SearchContractError } from '../contracts/types';
import { decodeSearchCursor, encodeSearchCursor } from '../cursor/cursor';
import { rankViaDiscoveryOrFallback } from '../ranking/discoveryHandoff';
import { retrieveCandidates } from './retrieve';
import { candidateKey } from './dedupe';
import { DISCOVERY_MODEL_VERSION } from '../../discoveryEngine/discoveryEngine.service';
import { logSearchLifecycle, recordSearchMetric, startSearchTimer } from '../observability/observability';
import {
  buildSearchCacheKey,
  coalesceSearchRequest,
  getSearchCache,
  setSearchCache
} from '../cache/cache';

export type PipelineInput = {
  q: string;
  domains: SearchDomain[];
  limit: number;
  cursor?: string | null;
  filters?: SearchFilters;
  surface: SearchSurface;
  viewerId?: string | null;
  requestId?: string;
  searchTraceId?: string;
  discoveryRankEnabled: boolean;
  includeExplanations?: boolean;
  includeDebug?: boolean;
  parseWarnings?: Array<{ code: string; message: string }>;
  unsupportedDomains?: SearchDomain[];
  /** Skip response cache (soft refresh) */
  bypassCache?: boolean;
  signal?: AbortSignal;
};

export const runSearchRetrievalPipeline = async (input: PipelineInput): Promise<SearchQueryResponse> => {
  const end = startSearchTimer('pipeline');
  const requestId = input.requestId || randomUUID();
  const searchTraceId = input.searchTraceId || `str_${randomUUID().slice(0, 12)}`;
  const normalizedQuery = String(input.q || '').replace(/\s+/g, ' ').trim();
  const domains = input.domains;
  const limit = input.limit;

  logSearchLifecycle({
    requestId,
    phase: 'pipeline_start',
    surface: input.surface,
    extra: { searchTraceId, domains: domains.length }
  });

  if (input.signal?.aborted) {
    throw new SearchContractError('VALIDATION_ERROR', 'Request cancelled', 400);
  }

  const cursorDecoded = decodeSearchCursor(input.cursor, {
    viewerId: input.viewerId || null,
    normalizedQuery,
    domains,
    filters: input.filters,
    rankingModelVersion: input.discoveryRankEnabled ? DISCOVERY_MODEL_VERSION : 'lexical-v1'
  });
  if (cursorDecoded.ok === false) {
    throw new SearchContractError(cursorDecoded.code, cursorDecoded.error, 400);
  }
  const cursor = cursorDecoded.state;
  const seen = new Set(cursor.s.map((s) => s.toLowerCase()));

  const responseCacheKey = buildSearchCacheKey({
    viewerId: input.viewerId,
    op: 'query_response',
    query: normalizedQuery,
    domains: domains.map(String),
    cursor: input.cursor || '',
    extra: JSON.stringify({ limit, filters: input.filters || {}, surface: input.surface, rank: input.discoveryRankEnabled }),
    ns: 'query'
  });

  if (!input.bypassCache) {
    const cached = getSearchCache<SearchQueryResponse>(responseCacheKey);
    if (cached && Array.isArray(cached.items)) {
      recordSearchMetric('pipeline_cache_hit', 1);
      end();
      return {
        ...cached,
        requestId: cached.requestId || requestId,
        searchTraceId: cached.searchTraceId || searchTraceId,
        generatedAt: new Date().toISOString()
      };
    }
  }

  const run = async (): Promise<SearchQueryResponse> => {
    const retrieved = await retrieveCandidates({
      query: normalizedQuery,
      domains,
      filters: input.filters,
      viewerId: input.viewerId,
      perDomain: Math.max(4, Math.ceil(48 / Math.max(1, domains.length)))
    });

    const nq = retrieved.normalized?.normalized || normalizedQuery;

    const fresh = retrieved.candidates.filter(
      (c) => !seen.has(candidateKey(c.entityType, c.entityId).toLowerCase())
    );

    const ranked = await rankViaDiscoveryOrFallback({
      viewerId: input.viewerId,
      query: nq,
      surface: input.surface,
      domains,
      candidates: fresh,
      limit,
      exclusions: Array.from(seen),
      requestId,
      searchTraceId,
      discoveryRankEnabled: input.discoveryRankEnabled,
      includeExplanations: input.includeExplanations,
      signal: input.signal
    });

    const page = ranked.items.slice(0, limit);
    const nextOffset = cursor.o + page.length;
    const nextSeen = [...cursor.s, ...page.map((i) => i.id)].slice(-200);
    const nextCursor =
      page.length >= limit
        ? encodeSearchCursor({
            viewerId: input.viewerId,
            offset: nextOffset,
            seen: nextSeen,
            normalizedQuery: nq,
            domains,
            filters: input.filters,
            rankingModelVersion: ranked.rankingModelVersion
          })
        : null;

    const groups: SearchQueryResponse['groups'] = {};
    for (const item of page) {
      const list = groups[item.entityType] || [];
      list.push(item);
      groups[item.entityType] = list;
    }

    const warnings = [...(input.parseWarnings || []), ...retrieved.warnings, ...ranked.warnings];

    return {
      query: input.q,
      normalizedQuery: nq,
      items: page,
      groups,
      totals: {
        returned: page.length,
        totalEstimated: null
      },
      nextCursor,
      requestId: ranked.discoveryRequestId || requestId,
      searchModelVersion: SEARCH_MODEL_VERSION,
      rankingModelVersion: ranked.rankingModelVersion,
      generatedAt: new Date().toISOString(),
      fallbackUsed: ranked.fallbackUsed,
      rankingAuthority: ranked.rankingAuthority,
      surface: input.surface,
      unsupportedDomains: input.unsupportedDomains?.length ? input.unsupportedDomains : undefined,
      warnings: warnings.length ? warnings : undefined,
      searchTraceId: ranked.searchTraceId || searchTraceId,
      rankingAuthorityValidated: ranked.rankingAuthorityValidated,
      diagnostics: input.includeDebug
        ? {
            retrieval: retrieved.diagnostics,
            handoff: ranked.diagnostics,
            candidateCount: retrieved.candidates.length,
            freshCount: fresh.length
          }
        : undefined
    };
  };

  const response = await coalesceSearchRequest(responseCacheKey, run);

  if (!input.bypassCache && response.items) {
    setSearchCache(responseCacheKey, response, SEARCH_CACHE_QUERY_TTL_MS, {
      ns: 'query',
      viewerId: input.viewerId
    });
  }

  recordSearchMetric('pipeline_complete', 1);
  end();
  logSearchLifecycle({
    requestId: response.requestId,
    phase: 'pipeline_end',
    surface: input.surface,
    extra: {
      searchTraceId: response.searchTraceId,
      returned: response.items.length,
      fallbackUsed: response.fallbackUsed
    }
  });
  return response;
};
