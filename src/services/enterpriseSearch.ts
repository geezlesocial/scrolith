/**
 * Enterprise Search API client (Phase 9.2 foundation + 9.3 retrieval client).
 * Not mounted in production UI yet — shared web/mobile interface.
 * Feature flags: client may gate calls; backend defaults OFF.
 */
import api from './api';
import type {
  EnterpriseSearchHealth,
  SearchDomain,
  SearchFeedbackRequest,
  SearchQueryRequest,
  SearchQueryResponse,
  SearchResult,
  SearchSuggestResponse,
  V1SearchEntry,
  V1UnifiedPayload
} from './enterpriseSearch.types';

export * from './enterpriseSearch.types';

export const SUPPORTED_SEARCH_DOMAINS: SearchDomain[] = [
  'person',
  'company',
  'page',
  'post',
  'job',
  'freelancer',
  'service',
  'product',
  'marketplace_listing',
  'community',
  'group',
  'discussion'
];

export const RESERVED_SEARCH_DOMAINS: SearchDomain[] = ['event', 'course', 'project'];

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_RETRIES = 1;

export type EnterpriseSearchClientError = {
  code: string;
  message: string;
  status?: number;
  retryable: boolean;
};

const extractData = <T>(response: any): T => {
  const body = response?.data;
  if (body && typeof body === 'object' && 'data' in body && body.success !== false) {
    return body.data as T;
  }
  return body as T;
};

const normalizeError = (err: any): EnterpriseSearchClientError => {
  const status = Number(err?.response?.status || err?.status || 0) || undefined;
  const code =
    err?.response?.data?.code ||
    err?.code ||
    (status === 429 ? 'RATE_LIMITED' : status && status >= 500 ? 'ERR_INTERNAL' : 'REQUEST_FAILED');
  const message =
    err?.response?.data?.error ||
    err?.response?.data?.message ||
    err?.message ||
    'Enterprise Search request failed';
  const retryable =
    status === 429 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    code === 'ECONNABORTED' ||
    /timeout/i.test(String(message));
  return { code: String(code), message: String(message), status, retryable };
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(
  fn: () => Promise<T>,
  opts?: { retries?: number; timeoutMs?: number }
): Promise<T> {
  const retries = opts?.retries ?? DEFAULT_RETRIES;
  let lastErr: EnterpriseSearchClientError | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = normalizeError(e);
      if (!lastErr.retryable || attempt === retries) {
        const err = new Error(lastErr.message) as Error & { searchError: EnterpriseSearchClientError };
        err.searchError = lastErr;
        throw err;
      }
      await delay(150 * (attempt + 1));
    }
  }
  throw new Error(lastErr?.message || 'Search failed');
}

/** Client-side feature gate (default OFF). */
export const isEnterpriseSearchClientEnabled = (): boolean => {
  try {
    const raw = String((import.meta as any)?.env?.VITE_ENTERPRISE_SEARCH_ENABLED || '').toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'on';
  } catch {
    return false;
  }
};

export const buildSearchQueryParams = (req: SearchQueryRequest): Record<string, unknown> => {
  const params: Record<string, unknown> = {
    q: req.q
  };
  if (req.domains?.length) params.domains = req.domains.join(',');
  if (req.limit != null) params.limit = req.limit;
  if (req.cursor) params.cursor = req.cursor;
  if (req.sort) params.sort = req.sort;
  if (req.retrieval) params.retrieval = req.retrieval;
  if (req.surface) params.surface = req.surface;
  if (req.sessionId) params.sessionId = req.sessionId;
  if (req.requestId) params.requestId = req.requestId;
  if (req.includeExplanations != null) params.includeExplanations = req.includeExplanations;
  if (req.strictDomains != null) params.strictDomains = req.strictDomains;
  if (req.filters && Object.keys(req.filters).length) {
    params.filters = JSON.stringify(req.filters);
  }
  return params;
};

export const parseSearchQueryResponse = (raw: unknown): SearchQueryResponse => {
  const data = (raw || {}) as SearchQueryResponse;
  return {
    query: String(data.query || ''),
    normalizedQuery: String(data.normalizedQuery || data.query || ''),
    items: Array.isArray(data.items) ? data.items : [],
    groups: data.groups,
    totals: data.totals || { returned: 0 },
    nextCursor: data.nextCursor ?? null,
    requestId: String(data.requestId || ''),
    searchModelVersion: String(data.searchModelVersion || ''),
    rankingModelVersion: String(data.rankingModelVersion || ''),
    generatedAt: String(data.generatedAt || ''),
    fallbackUsed: Boolean(data.fallbackUsed),
    rankingAuthority: data.rankingAuthority || 'none',
    surface: data.surface || 'search_results',
    unsupportedDomains: data.unsupportedDomains,
    warnings: data.warnings,
    disabled: data.disabled,
    searchTraceId: data.searchTraceId,
    rankingAuthorityValidated: data.rankingAuthorityValidated
  };
};

export const mapSearchResultToV1Entry = (item: SearchResult): V1SearchEntry => {
  const typeMap: Record<string, string> = {
    person: 'people',
    page: 'pages',
    company: 'pages',
    post: 'posts',
    job: 'jobs',
    service: 'gigs',
    freelancer: 'gigs',
    marketplace_listing: 'marketplace',
    product: 'marketplace',
    community: 'pages',
    group: 'pages',
    discussion: 'posts'
  };
  return {
    id: item.entityId,
    type: typeMap[item.entityType] || item.entityType,
    title: item.title,
    name: item.title,
    username: (item.attributes?.username as string) || undefined,
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

export const mapQueryResponseToV1Unified = (response: SearchQueryResponse): V1UnifiedPayload => {
  const groups: Record<string, V1SearchEntry[]> = {
    people: [],
    pages: [],
    jobs: [],
    gigs: [],
    posts: []
  };
  for (const item of response.items) {
    const entry = mapSearchResultToV1Entry(item);
    if (groups[entry.type]) groups[entry.type].push(entry);
  }
  const results = response.items.map(mapSearchResultToV1Entry);
  return {
    query: response.normalizedQuery || response.query,
    groups,
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

export type QueryOptions = {
  timeoutMs?: number;
  retries?: number;
  /** AbortSignal for request cancellation */
  signal?: AbortSignal;
  /** Bypass server query cache (soft refresh) */
  softRefresh?: boolean;
};

const SEARCH_BC_CHANNEL = 'scrolith:enterprise-search';

/** Multi-tab soft refresh via BroadcastChannel (no UI mount required). */
export const publishSearchRefresh = (payload: {
  reason: string;
  viewerId?: string | null;
  at?: string;
}) => {
  try {
    if (typeof BroadcastChannel === 'undefined') return;
    const bc = new BroadcastChannel(SEARCH_BC_CHANNEL);
    bc.postMessage({ type: 'search:refresh_available', ...payload, at: payload.at || new Date().toISOString() });
    bc.close();
  } catch {
    // ignore
  }
};

export const subscribeSearchRefresh = (
  handler: (payload: { reason: string; viewerId?: string | null; at?: string }) => void
): (() => void) => {
  try {
    if (typeof BroadcastChannel === 'undefined') return () => undefined;
    const bc = new BroadcastChannel(SEARCH_BC_CHANNEL);
    const onMsg = (ev: MessageEvent) => {
      const data = ev.data;
      if (data?.type === 'search:refresh_available' || data?.type === 'search:results_invalidated') {
        handler({ reason: data.reason || 'refresh', viewerId: data.viewerId, at: data.at });
      }
    };
    bc.addEventListener('message', onMsg);
    return () => {
      bc.removeEventListener('message', onMsg);
      bc.close();
    };
  } catch {
    return () => undefined;
  }
};

/** Prefer Discovery explanation headline for UI when present */
export const formatSearchExplanation = (item: SearchResult): string => {
  if (item.explanation?.headline) return item.explanation.headline;
  if (item.reason) return item.reason;
  if (item.reasonCodes?.length) return String(item.reasonCodes[0]).replace(/_/g, ' ');
  return '';
};

export class EnterpriseSearchService {
  static async health(opts?: QueryOptions): Promise<EnterpriseSearchHealth> {
    return withRetry(async () => {
      const response = await api.get('/search/v2/health', {
        timeout: opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        signal: opts?.signal as any
      });
      return (response?.data || response) as EnterpriseSearchHealth;
    }, opts);
  }

  static async query(req: SearchQueryRequest, opts?: QueryOptions): Promise<SearchQueryResponse> {
    return withRetry(async () => {
      const params = {
        ...buildSearchQueryParams(req),
        ...(opts?.softRefresh ? { softRefresh: true, bypassCache: true } : {})
      };
      const response = await api.get('/search/v2/query', {
        params,
        timeout: opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
        signal: opts?.signal as any
      });
      return parseSearchQueryResponse(extractData(response));
    }, opts);
  }

  static async queryPost(req: SearchQueryRequest, opts?: QueryOptions): Promise<SearchQueryResponse> {
    return withRetry(async () => {
      const response = await api.post(
        '/search/v2/query',
        {
          ...req,
          filters: req.filters,
          ...(opts?.softRefresh ? { softRefresh: true, bypassCache: true } : {})
        },
        {
          timeout: opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
          signal: opts?.signal as any
        }
      );
      return parseSearchQueryResponse(extractData(response));
    }, opts);
  }

  /** Soft refresh: bypass server cache + notify other tabs */
  static async softRefresh(
    req: SearchQueryRequest,
    opts?: QueryOptions
  ): Promise<SearchQueryResponse> {
    const res = await this.query(req, { ...opts, softRefresh: true });
    publishSearchRefresh({ reason: 'soft_refresh', at: res.generatedAt });
    return res;
  }

  /** Cursor continuation helper */
  static async queryNext(
    previous: SearchQueryResponse,
    req: Omit<SearchQueryRequest, 'cursor' | 'q'> & { q?: string },
    opts?: QueryOptions
  ): Promise<SearchQueryResponse> {
    if (!previous.nextCursor) {
      return {
        ...previous,
        items: [],
        totals: { returned: 0 },
        nextCursor: null
      };
    }
    return this.query(
      {
        q: req.q ?? previous.query,
        domains: req.domains,
        limit: req.limit,
        filters: req.filters,
        sort: req.sort,
        surface: req.surface,
        cursor: previous.nextCursor
      },
      opts
    );
  }

  /** Parallel domain-scoped queries (client-side fan-out). Prefer single multi-domain query when possible. */
  static async queryDomainsParallel(
    q: string,
    domains: SearchDomain[],
    opts?: QueryOptions & { limitPerDomain?: number }
  ): Promise<Record<string, SearchQueryResponse>> {
    const limit = opts?.limitPerDomain ?? 8;
    const entries = await Promise.all(
      domains.map(async (domain) => {
        const res = await this.query({ q, domains: [domain], limit }, opts);
        return [domain, res] as const;
      })
    );
    return Object.fromEntries(entries);
  }

  static async suggest(q: string, limit = 8, opts?: QueryOptions): Promise<SearchSuggestResponse> {
    return withRetry(async () => {
      const response = await api.get('/search/v2/suggest', {
        params: { q, limit },
        timeout: opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS
      });
      const data = extractData<SearchSuggestResponse>(response);
      return {
        query: String(data?.query || q),
        suggestions: Array.isArray(data?.suggestions) ? data.suggestions : [],
        requestId: String(data?.requestId || ''),
        generatedAt: String(data?.generatedAt || ''),
        fallbackUsed: Boolean(data?.fallbackUsed),
        disabled: data?.disabled
      };
    }, opts);
  }

  static async feedback(
    payload: SearchFeedbackRequest,
    opts?: QueryOptions
  ): Promise<{ ok?: boolean; skipped?: boolean }> {
    return withRetry(async () => {
      const response = await api.post('/search/v2/feedback', payload, {
        timeout: opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS
      });
      return extractData(response);
    }, { retries: 0, ...opts });
  }

  static async queryAsV1Unified(req: SearchQueryRequest, opts?: QueryOptions): Promise<V1UnifiedPayload> {
    const res = await this.query(req, opts);
    return mapQueryResponseToV1Unified(res);
  }
}

export default EnterpriseSearchService;
