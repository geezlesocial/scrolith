/**
 * Enterprise Search application service — foundation orchestration.
 */
import { randomUUID } from 'crypto';
import { SEARCH_MODEL_VERSION } from './contracts/constants';
import {
  SearchContractError,
  type SearchQueryRequest,
  type SearchQueryResponse,
  type SearchSuggestResponse,
  type SearchFeedbackRequest,
  type SearchDomain
} from './contracts/types';
import { parseSearchQueryRequest, parseSuggestRequest } from './dto/validate';
import { runSearchRetrievalPipeline } from './retrieval/pipeline';
import { submitSearchFeedback } from './feedback/feedback';
import {
  resolveEnterpriseSearchRolloutFlags,
  getEnterpriseSearchRolloutSummary,
  isEnterpriseSearchEnabled
} from './rollout/rollout';
import {
  logSearchLifecycle,
  recordSearchMetric,
  startSearchTimer,
  getSearchMetricsSnapshot
} from './observability/observability';
import { emitSearchAnalytics } from './analytics/analytics';
import { compatibility } from './compatibility/v1';
import { DISCOVERY_MODEL_VERSION } from '../discoveryEngine/discoveryEngine.service';

export type EnterpriseSearchDeps = {
  // Reserved for future DI (prisma, cache, etc.)
};

const defaultDeps: EnterpriseSearchDeps = {};

export class EnterpriseSearchService {
  constructor(private readonly deps: EnterpriseSearchDeps = defaultDeps) {
    void this.deps;
  }

  getRollout() {
    return getEnterpriseSearchRolloutSummary();
  }

  getMetrics() {
    return getSearchMetricsSnapshot();
  }

  health() {
    const flags = resolveEnterpriseSearchRolloutFlags();
    return {
      success: true as const,
      service: 'search',
      version: SEARCH_MODEL_VERSION,
      rankingAuthority: 'discovery' as const,
      flags: {
        master: flags.master,
        discoveryRank: flags.discoveryRank,
        diagnostics: flags.diagnostics
      }
    };
  }

  /**
   * Canonical v2 query. When master OFF → disabled empty response (no production-visible search engine).
   */
  async query(raw: Record<string, unknown>, viewerId?: string | null): Promise<SearchQueryResponse> {
    const end = startSearchTimer('query');
    const flags = resolveEnterpriseSearchRolloutFlags();
    const requestId = String(raw.requestId || randomUUID());
    logSearchLifecycle({ requestId, phase: 'start', surface: String(raw.surface || 'search_results') });

    const parsed = parseSearchQueryRequest(raw, viewerId);
    const unsupported = ((parsed as any)._unsupported || []) as SearchDomain[];
    const parseWarnings = ((parsed as any)._warnings || []) as Array<{ code: string; message: string }>;
    const normalizedQuery = parsed.q;
    const surface = parsed.surface || 'search_results';
    const domains = parsed.domains || [];
    const limit = parsed.limit || 20;

    if (!flags.master) {
      end();
      recordSearchMetric('query_disabled', 1);
      return {
        query: parsed.q,
        normalizedQuery,
        items: [],
        totals: { returned: 0, totalEstimated: 0 },
        nextCursor: null,
        requestId,
        searchModelVersion: SEARCH_MODEL_VERSION,
        rankingModelVersion: DISCOVERY_MODEL_VERSION,
        generatedAt: new Date().toISOString(),
        fallbackUsed: false,
        rankingAuthority: 'none',
        surface,
        unsupportedDomains: unsupported.length ? unsupported : undefined,
        warnings: [{ code: 'ENTERPRISE_SEARCH_OFF', message: 'Enterprise Search master flag is off' }],
        disabled: true
      };
    }

    if (!normalizedQuery) {
      end();
      return {
        query: '',
        normalizedQuery: '',
        items: [],
        totals: { returned: 0 },
        nextCursor: null,
        requestId,
        searchModelVersion: SEARCH_MODEL_VERSION,
        rankingModelVersion: DISCOVERY_MODEL_VERSION,
        generatedAt: new Date().toISOString(),
        fallbackUsed: false,
        rankingAuthority: 'none',
        surface,
        warnings: parseWarnings
      };
    }

    const bypassCache =
      raw.bypassCache === true ||
      raw.softRefresh === true ||
      String(raw.cache || '').toLowerCase() === 'bypass';

    const response = await runSearchRetrievalPipeline({
      q: parsed.q,
      domains,
      limit,
      cursor: parsed.cursor,
      filters: parsed.filters,
      surface,
      viewerId,
      requestId,
      discoveryRankEnabled: flags.discoveryRank,
      includeExplanations: parsed.includeExplanations,
      includeDebug: Boolean(parsed.includeDebug || flags.diagnostics),
      parseWarnings,
      unsupportedDomains: unsupported,
      bypassCache
    });

    const latencyMs = end();
    emitSearchAnalytics({
      type: response.items.length ? 'query' : 'empty',
      requestId: response.requestId,
      viewerId,
      query: response.normalizedQuery || normalizedQuery,
      domainCount: domains.length,
      resultCount: response.items.length,
      fallbackUsed: response.fallbackUsed,
      latencyMs
    });
    logSearchLifecycle({
      requestId: response.requestId,
      phase: 'end',
      surface,
      extra: { returned: response.items.length, fallbackUsed: response.fallbackUsed }
    });
    return response;
  }

  async suggest(raw: Record<string, unknown>, viewerId?: string | null): Promise<SearchSuggestResponse> {
    const flags = resolveEnterpriseSearchRolloutFlags();
    const requestId = randomUUID();
    const parsed = parseSuggestRequest(raw);

    if (!flags.master || !flags.suggest) {
      return {
        query: parsed.q,
        suggestions: [],
        requestId,
        generatedAt: new Date().toISOString(),
        fallbackUsed: false,
        disabled: true
      };
    }

    if (parsed.q.length < 2) {
      const prompts: SearchSuggestResponse['suggestions'] = [
        { kind: 'prompt', text: 'remote work' },
        { kind: 'prompt', text: 'web development' },
        { kind: 'prompt', text: 'logo design' }
      ];
      return {
        query: parsed.q,
        suggestions: prompts.slice(0, parsed.limit),
        requestId,
        generatedAt: new Date().toISOString(),
        fallbackUsed: true
      };
    }

    const result = await this.query(
      {
        q: parsed.q,
        limit: parsed.limit,
        surface: 'search_suggest',
        domains: raw.domains
      },
      viewerId
    );

    const suggestions = result.items.map((item) => ({
      kind: 'entity' as const,
      text: item.title,
      domain: item.entityType,
      entityId: item.entityId,
      url: item.url,
      subtitle: item.subtitle || undefined,
      score: item.score ?? undefined,
      trackingToken: item.trackingToken,
      reasonCodes: item.reasonCodes
    }));

    return {
      query: parsed.q,
      suggestions,
      requestId: result.requestId,
      generatedAt: new Date().toISOString(),
      fallbackUsed: result.fallbackUsed,
      disabled: result.disabled
    };
  }

  async feedback(input: SearchFeedbackRequest) {
    const flags = resolveEnterpriseSearchRolloutFlags();
    if (!flags.master) {
      return { ok: true, skipped: true, reason: 'enterprise_search_off' };
    }
    if (!input.viewerId) throw new SearchContractError('UNAUTHORIZED', 'Authentication required', 401);
    return submitSearchFeedback(input);
  }

  /** Explicit export for compatibility layer consumers */
  getCompatibility() {
    return compatibility;
  }

  isEnabled() {
    return isEnterpriseSearchEnabled();
  }
}

export const enterpriseSearchService = new EnterpriseSearchService();

export { parseSearchQueryRequest, compatibility, resolveEnterpriseSearchRolloutFlags };
