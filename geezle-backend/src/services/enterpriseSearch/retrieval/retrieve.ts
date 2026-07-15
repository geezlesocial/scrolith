/**
 * Multi-domain parallel retrieval — Phase 9.3 engine.
 * Feeds Discovery handoff or lexical fallback. Does not rank for product final order.
 */
import {
  SEARCH_ADAPTER_TIMEOUT_MS,
  SEARCH_CANDIDATE_HARD_CAP,
  SEARCH_PER_DOMAIN_MAX,
  SEARCH_RETRIEVAL_WINDOW
} from '../contracts/constants';
import type { SearchCandidate, SearchDomain, SearchFilters } from '../contracts/types';
import { getAdapter, listRegisteredAdapters } from '../adapters';
import { recordSearchMetric, startSearchTimer } from '../observability/observability';
import { normalizeSearchQuery, type NormalizedQuery } from './normalize';
import { loadSearchViewerContext, applyPermissionFilters, type SearchViewerContext } from './permissions';
import { collapsePageCompanyDupes, dedupeCandidates } from './dedupe';
import { parallelMapBounded } from './timeout';
import { getSearchCache, setSearchCache, buildSearchCacheKey } from '../cache/cache';

export type RetrieveResult = {
  candidates: SearchCandidate[];
  warnings: Array<{ code: string; message: string }>;
  normalized: NormalizedQuery;
  viewer: SearchViewerContext;
  diagnostics?: {
    perDomain: Record<string, number>;
    adapterErrors: string[];
    durationMs: number;
  };
};

export const retrieveCandidates = async (input: {
  query: string;
  domains: SearchDomain[];
  filters?: SearchFilters;
  viewerId?: string | null;
  perDomain?: number;
  useCache?: boolean;
}): Promise<RetrieveResult> => {
  const end = startSearchTimer('retrieval');
  const warnings: Array<{ code: string; message: string }> = [];
  const normalized = normalizeSearchQuery(input.query);
  const domains = (input.domains?.length ? input.domains : listRegisteredAdapters()).slice(0, 16);
  const perDomain = Math.max(
    2,
    Math.min(
      SEARCH_PER_DOMAIN_MAX,
      input.perDomain || Math.ceil(SEARCH_RETRIEVAL_WINDOW / Math.max(1, domains.length))
    )
  );

  const cacheKey =
    input.useCache !== false
      ? buildSearchCacheKey({
          viewerId: input.viewerId,
          op: 'retrieve',
          query: normalized.lower,
          domains: domains.map(String),
          extra: JSON.stringify(input.filters || {})
        })
      : null;

  if (cacheKey) {
    const cached = getSearchCache<RetrieveResult>(cacheKey);
    if (cached && cached.candidates) {
      recordSearchMetric('retrieval_cache_hit', 1);
      end();
      return cached;
    }
  }

  const viewer = await loadSearchViewerContext(input.viewerId);
  const perDomainCounts: Record<string, number> = {};
  const adapterErrors: string[] = [];

  const chunks = await parallelMapBounded(
    domains,
    async (domain) => {
      const adapter = getAdapter(domain);
      if (!adapter) {
        warnings.push({ code: 'ADAPTER_MISSING', message: `No adapter for domain: ${domain}` });
        perDomainCounts[domain] = 0;
        return [] as SearchCandidate[];
      }
      const rows = await adapter.retrieve({
        query: normalized.normalized,
        normalized,
        limit: perDomain,
        filters: input.filters,
        viewerId: input.viewerId,
        viewer
      });
      perDomainCounts[domain] = rows.length;
      return rows;
    },
    {
      timeoutMs: SEARCH_ADAPTER_TIMEOUT_MS,
      label: (d) => String(d),
      onError: (domain, err) => {
        recordSearchMetric('adapter_error', 1);
        const msg = err instanceof Error ? err.message : 'failed';
        adapterErrors.push(`${domain}:${msg}`);
        warnings.push({ code: 'ADAPTER_ERROR', message: `${domain}: ${msg}` });
        perDomainCounts[String(domain)] = 0;
        return [] as SearchCandidate[];
      }
    }
  );

  let merged: SearchCandidate[] = [];
  for (const chunk of chunks) merged.push(...chunk);

  merged = collapsePageCompanyDupes(merged, domains);
  // product + marketplace_listing same id: keep both entity types for domain-specific UIs
  // but hard-cap after dedupe per key
  merged = dedupeCandidates(merged, SEARCH_CANDIDATE_HARD_CAP);
  merged = applyPermissionFilters(merged, viewer);

  // Stable pre-rank ordering: lexicalScore desc, then type, then id
  merged.sort((a, b) => {
    const sa = Number(a.lexicalScore) || 0;
    const sb = Number(b.lexicalScore) || 0;
    if (sb !== sa) return sb - sa;
    const t = String(a.entityType).localeCompare(String(b.entityType));
    if (t !== 0) return t;
    return String(a.entityId).localeCompare(String(b.entityId));
  });

  const durationMs = end();
  recordSearchMetric('candidates', merged.length);

  const result: RetrieveResult = {
    candidates: merged,
    warnings,
    normalized,
    viewer,
    diagnostics: {
      perDomain: perDomainCounts,
      adapterErrors,
      durationMs
    }
  };

  if (cacheKey && merged.length) {
    setSearchCache(cacheKey, result, 20_000);
  }

  return result;
};
