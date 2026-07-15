/**
 * Enterprise Search query hook — Phase 9 client with legacy fallback when backend ES is OFF.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  EnterpriseSearchService,
  formatSearchExplanation,
  type SearchDomain,
  type SearchQueryResponse,
  type SearchResult
} from '../services/enterpriseSearch';
import { searchGlobalWithMarketplace } from '../services/globalSearch';
import type { SearchUxFilters, SearchUxTab } from './enterpriseSearch.ux';
import { TAB_TO_DOMAINS } from './enterpriseSearch.ux';

export type EnterpriseSearchViewState = {
  loading: boolean;
  error: string | null;
  items: SearchResult[];
  nextCursor: string | null;
  fallbackUsed: boolean;
  disabledBackend: boolean;
  usedLegacyFallback: boolean;
  requestId: string;
  searchTraceId?: string;
  rankingAuthority?: string;
};

const emptyState = (): EnterpriseSearchViewState => ({
  loading: false,
  error: null,
  items: [],
  nextCursor: null,
  fallbackUsed: false,
  disabledBackend: false,
  usedLegacyFallback: false,
  requestId: ''
});

const mapLegacyToResults = (payload: Awaited<ReturnType<typeof searchGlobalWithMarketplace>>): SearchResult[] => {
  const out: SearchResult[] = [];
  const push = (type: SearchDomain, rows: any[]) => {
    (rows || []).forEach((row, index) => {
      const id = String(row?.id || row?._id || `${type}-${index}`);
      out.push({
        id: `${type}:${id}`,
        entityType: type,
        entityId: id,
        title: String(row?.title || row?.name || row?.username || 'Result'),
        subtitle: row?.subtitle || row?.description || null,
        description: row?.description || row?.excerpt || null,
        url: String(row?.url || '/search'),
        media: {
          avatarUrl: row?.avatarUrl || null,
          imageUrl: row?.image || row?.avatarUrl || null
        },
        trackingToken: `legacy:${type}:${id}`,
        score: null,
        reason: 'Matches your search',
        reasonCodes: ['lexical_match'],
        explanation: {
          codes: ['lexical_match'],
          headline: 'Matches your search',
          from: 'search_fallback'
        },
        ranking: { authority: 'lexical_fallback' },
        attributes: row?.meta || {}
      });
    });
  };

  push('person', payload.groups?.people || []);
  push('page', payload.groups?.pages || []);
  push('job', payload.groups?.jobs || []);
  push('service', payload.groups?.gigs || []);
  push('marketplace_listing', payload.groups?.marketplace || []);
  push('post', payload.groups?.posts || []);
  return out;
};

const tabFilterItems = (items: SearchResult[], tab: SearchUxTab): SearchResult[] => {
  if (tab === 'all') return items;
  if (tab === 'company') return items.filter((i) => i.entityType === 'company' || i.entityType === 'page');
  return items.filter((i) => i.entityType === tab);
};

export function useEnterpriseSearchQuery(input: {
  query: string;
  tab: SearchUxTab;
  filters: SearchUxFilters;
  enabled: boolean;
}) {
  const [state, setState] = useState<EnterpriseSearchViewState>(emptyState());
  const abortRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);

  const run = useCallback(
    async (opts?: { cursor?: string | null; softRefresh?: boolean; append?: boolean }) => {
      const clean = String(input.query || '').trim();
      if (!input.enabled) return;
      if (!clean) {
        setState(emptyState());
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const seq = ++seqRef.current;

      setState((prev) => ({
        ...prev,
        loading: true,
        error: null,
        items: opts?.append ? prev.items : prev.items
      }));

      try {
        const domains = TAB_TO_DOMAINS[input.tab] || undefined;
        const req = {
          q: clean,
          domains: domains || undefined,
          limit: 24,
          cursor: opts?.cursor || null,
          sort: input.filters.sort || 'relevance',
          surface: 'search_results' as const,
          filters: {
            location: input.filters.location ? { label: input.filters.location } : undefined,
            verified: input.filters.verified,
            relationship: input.filters.relationship,
            availability: input.filters.availability as any,
            language: input.filters.language ? [input.filters.language] : undefined,
            price:
              input.filters.priceMin != null || input.filters.priceMax != null
                ? { min: input.filters.priceMin, max: input.filters.priceMax }
                : undefined,
            salary:
              input.filters.salaryMin != null || input.filters.salaryMax != null
                ? { min: input.filters.salaryMin, max: input.filters.salaryMax }
                : undefined,
            date: input.filters.datePreset ? { preset: input.filters.datePreset } : undefined
          }
        };

        let response: SearchQueryResponse | null = null;
        let usedLegacy = false;
        let disabledBackend = false;

        try {
          response = await EnterpriseSearchService.query(req, {
            signal: controller.signal,
            softRefresh: opts?.softRefresh,
            retries: 1,
            timeoutMs: 8000
          });
        } catch {
          response = null;
        }

        if (controller.signal.aborted || seq !== seqRef.current) return;

        if (!response || response.disabled || (response.items.length === 0 && response.disabled !== false && response.rankingAuthority === 'none')) {
          disabledBackend = Boolean(response?.disabled || response?.rankingAuthority === 'none');
          // Legacy fallback so UX works while backend ES master is OFF
          const legacy = await searchGlobalWithMarketplace(clean, { maxResults: 24 });
          if (controller.signal.aborted || seq !== seqRef.current) return;
          const mapped = tabFilterItems(mapLegacyToResults(legacy), input.tab);
          usedLegacy = true;
          setState((prev) => ({
            loading: false,
            error: null,
            items: opts?.append ? [...prev.items, ...mapped] : mapped,
            nextCursor: null,
            fallbackUsed: true,
            disabledBackend,
            usedLegacyFallback: true,
            requestId: response?.requestId || 'legacy',
            searchTraceId: response?.searchTraceId,
            rankingAuthority: 'lexical_fallback'
          }));
          return;
        }

        const items = tabFilterItems(response.items || [], input.tab);
        setState((prev) => ({
          loading: false,
          error: null,
          items: opts?.append ? [...prev.items, ...items] : items,
          nextCursor: response.nextCursor,
          fallbackUsed: Boolean(response.fallbackUsed),
          disabledBackend: false,
          usedLegacyFallback: usedLegacy,
          requestId: response.requestId,
          searchTraceId: response.searchTraceId,
          rankingAuthority: response.rankingAuthority
        }));
      } catch (err: any) {
        if (controller.signal.aborted || seq !== seqRef.current) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: err?.message || 'Search failed. Please try again.'
        }));
      }
    },
    [input.enabled, input.filters, input.query, input.tab]
  );

  useEffect(() => {
    run({ softRefresh: false });
    return () => abortRef.current?.abort();
  }, [run]);

  const loadMore = useCallback(() => {
    if (!state.nextCursor || state.loading) return;
    return run({ cursor: state.nextCursor, append: true });
  }, [run, state.loading, state.nextCursor]);

  const softRefresh = useCallback(() => run({ softRefresh: true }), [run]);

  return {
    ...state,
    reload: () => run({ softRefresh: true }),
    loadMore,
    softRefresh,
    explanationOf: formatSearchExplanation
  };
}
