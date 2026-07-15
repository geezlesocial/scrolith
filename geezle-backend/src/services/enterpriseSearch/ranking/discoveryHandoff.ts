/**
 * Discovery Engine handoff boundary — does NOT modify Discovery ranking logic.
 * Phase 9.4: resilient orchestration, retry, partial recovery, trace IDs.
 * Calls public discoveryEngine.service only.
 */
import { randomUUID } from 'crypto';
import {
  runDiscoveryRecommendationPipeline,
  resolveDiscoveryRolloutFlags,
  DISCOVERY_MODEL_VERSION,
  type DiscoveryEntityType,
  type DiscoverySurface,
  type RankedRecommendation
} from '../../discoveryEngine/discoveryEngine.service';
import type { SearchCandidate, SearchDomain, SearchResult, SearchSurface } from '../contracts/types';
import { mapDiscoveryItemToSearchResult, candidateKey } from '../dto/mappers';
import { lexicalRankCandidates } from './lexicalFallback';
import {
  SEARCH_DISCOVERY_HARD_TIMEOUT_MS,
  SEARCH_DISCOVERY_RETRY_COUNT,
  SEARCH_DISCOVERY_RETRY_DELAY_MS,
  SEARCH_DISCOVERY_SOFT_TIMEOUT_MS
} from '../contracts/constants';
import { logSearchLifecycle, recordSearchMetric, startSearchTimer } from '../observability/observability';

export type DiscoveryHandoffResult = {
  items: SearchResult[];
  fallbackUsed: boolean;
  rankingAuthority: 'discovery' | 'lexical_fallback';
  rankingModelVersion: string;
  discoveryRequestId?: string;
  searchTraceId: string;
  rankingAuthorityValidated: boolean;
  warnings: Array<{ code: string; message: string }>;
  diagnostics?: {
    attempts: number;
    discoveryLatencyMs: number;
    softTimeoutHit?: boolean;
    partialRecovered?: boolean;
  };
};

const mapSearchSurfaceToDiscovery = (surface?: SearchSurface): DiscoverySurface => {
  if (surface === 'search_suggest') return 'search_suggest';
  return 'global';
};

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

const withTimeout = async <T>(promise: Promise<T>, ms: number, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(label)), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const validateRankingAuthority = (items: SearchResult[], authority: 'discovery' | 'lexical_fallback') => {
  if (!items.length) return true;
  return items.every((i) => !i.ranking?.authority || i.ranking.authority === authority || i.ranking.authority === 'editorial_overlay');
};

const enrichFromCandidates = (
  ranked: RankedRecommendation[],
  candidates: SearchCandidate[],
  opts: { includeExplanations?: boolean; modelVersion: string }
): SearchResult[] => {
  const byKey = new Map(candidates.map((c) => [candidateKey(c.entityType, c.entityId), c]));
  return ranked.map((r) => {
    const mapped = mapDiscoveryItemToSearchResult(r, {
      includeExplanations: opts.includeExplanations !== false,
      authority: 'discovery'
    });
    // Never expose Discovery score components / internal features
    delete (mapped as any).scoreComponents;
    delete (mapped as any).baseFeatures;
    const c = byKey.get(candidateKey(r.entityType, r.entityId));
    if (c) {
      mapped.title = mapped.title || c.title;
      mapped.subtitle = mapped.subtitle || c.subtitle;
      mapped.description = mapped.description || c.description;
      mapped.url = c.url || mapped.url;
      mapped.media = {
        avatarUrl: c.avatarUrl || null,
        imageUrl: c.imageUrl || null
      };
      if (c.attributes) mapped.attributes = { ...(mapped.attributes || {}), ...c.attributes };
    }
    mapped.ranking = { authority: 'discovery', modelVersion: opts.modelVersion };
    // Propagate explanation from Discovery only
    if (mapped.explanation) mapped.explanation.from = 'discovery';
    return mapped;
  });
};

/**
 * Partial recovery: if Discovery returns fewer than requested, append lexical
 * for remaining candidate slots without reordering Discovery winners.
 */
const partialRecover = (
  discoveryItems: SearchResult[],
  candidates: SearchCandidate[],
  limit: number
): { items: SearchResult[]; recovered: boolean } => {
  if (discoveryItems.length >= limit) return { items: discoveryItems.slice(0, limit), recovered: false };
  const seen = new Set(discoveryItems.map((i) => candidateKey(i.entityType, i.entityId).toLowerCase()));
  const remaining = candidates.filter((c) => !seen.has(candidateKey(c.entityType, c.entityId).toLowerCase()));
  const fill = lexicalRankCandidates(remaining, limit - discoveryItems.length);
  if (!fill.length) return { items: discoveryItems, recovered: false };
  recordSearchMetric('rank_partial_recover', 1);
  return { items: [...discoveryItems, ...fill].slice(0, limit), recovered: true };
};

const lexicalResult = (
  candidates: SearchCandidate[],
  limit: number,
  searchTraceId: string,
  warnings: Array<{ code: string; message: string }>,
  extra?: Partial<DiscoveryHandoffResult>
): DiscoveryHandoffResult => {
  const items = lexicalRankCandidates(candidates, limit);
  return {
    items,
    fallbackUsed: true,
    rankingAuthority: 'lexical_fallback',
    rankingModelVersion: 'lexical-v1',
    searchTraceId,
    rankingAuthorityValidated: validateRankingAuthority(items, 'lexical_fallback'),
    warnings,
    ...extra
  };
};

/**
 * Rank candidates via Discovery. On disable/empty/error/timeout → lexical fallback.
 * Never re-implements Discovery scoring or eligibility.
 */
export const rankViaDiscoveryOrFallback = async (input: {
  viewerId?: string | null;
  query: string;
  surface?: SearchSurface;
  domains: SearchDomain[];
  candidates: SearchCandidate[];
  limit: number;
  exclusions?: string[];
  requestId?: string;
  searchTraceId?: string;
  discoveryRankEnabled: boolean;
  includeExplanations?: boolean;
  signal?: AbortSignal;
}): Promise<DiscoveryHandoffResult> => {
  const warnings: Array<{ code: string; message: string }> = [];
  const end = startSearchTimer('discovery_handoff');
  const searchTraceId = input.searchTraceId || `str_${randomUUID().slice(0, 12)}`;
  const t0 = Date.now();

  logSearchLifecycle({
    requestId: input.requestId || searchTraceId,
    phase: 'discovery_handoff_start',
    surface: input.surface,
    extra: { searchTraceId, candidateCount: input.candidates.length }
  });

  if (input.signal?.aborted) {
    end();
    recordSearchMetric('rank_cancelled', 1);
    return lexicalResult(input.candidates, input.limit, searchTraceId, [
      { code: 'CANCELLED', message: 'Request aborted before Discovery handoff' }
    ]);
  }

  if (!input.discoveryRankEnabled) {
    end();
    recordSearchMetric('rank_lexical_flag_off', 1);
    return lexicalResult(input.candidates, input.limit, searchTraceId, [
      { code: 'DISCOVERY_RANK_DISABLED', message: 'Discovery rank flag off; lexical fallback' }
    ]);
  }

  const discoveryFlags = resolveDiscoveryRolloutFlags();
  if (!discoveryFlags.master) {
    end();
    recordSearchMetric('rank_lexical_discovery_off', 1);
    return lexicalResult(input.candidates, input.limit, searchTraceId, [
      { code: 'DISCOVERY_MASTER_OFF', message: 'Discovery engine master off; lexical fallback' }
    ]);
  }

  if (!input.candidates.length) {
    end();
    return {
      items: [],
      fallbackUsed: false,
      rankingAuthority: 'discovery',
      rankingModelVersion: DISCOVERY_MODEL_VERSION,
      searchTraceId,
      rankingAuthorityValidated: true,
      warnings,
      diagnostics: { attempts: 0, discoveryLatencyMs: 0 }
    };
  }

  const exclusions = (input.exclusions || [])
    .map((key) => {
      const [entityType, ...rest] = key.split(':');
      const entityId = rest.join(':');
      if (!entityType || !entityId) return null;
      return { entityType: entityType as DiscoveryEntityType, entityId };
    })
    .filter(Boolean) as Array<{ entityType: DiscoveryEntityType; entityId: string }>;

  const maxAttempts = 1 + Math.max(0, SEARCH_DISCOVERY_RETRY_COUNT);
  let lastError = '';
  let softTimeoutHit = false;
  let attempts = 0;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attempts = attempt;
    if (input.signal?.aborted) {
      end();
      recordSearchMetric('rank_cancelled', 1);
      return lexicalResult(input.candidates, input.limit, searchTraceId, [
        { code: 'CANCELLED', message: 'Request aborted during Discovery handoff' }
      ], { diagnostics: { attempts, discoveryLatencyMs: Date.now() - t0 } });
    }

    try {
      const hardMs = SEARCH_DISCOVERY_HARD_TIMEOUT_MS;
      // Soft timeout is observational only — we still wait hard budget
      const softTimer = setTimeout(() => {
        softTimeoutHit = true;
        recordSearchMetric('discovery_soft_timeout', 1);
      }, SEARCH_DISCOVERY_SOFT_TIMEOUT_MS);

      const response = await withTimeout(
        runDiscoveryRecommendationPipeline({
          viewerId: input.viewerId || null,
          surface: mapSearchSurfaceToDiscovery(input.surface),
          entityTypes: input.domains as DiscoveryEntityType[],
          limit: input.limit,
          context: { query: input.query },
          exclusions,
          requestId: input.requestId || searchTraceId
        }),
        hardMs,
        'discovery_timeout'
      );
      clearTimeout(softTimer);

      const ranked: RankedRecommendation[] = response.items || [];
      if (!ranked.length) {
        end();
        recordSearchMetric('rank_lexical_empty_discovery', 1);
        return lexicalResult(input.candidates, input.limit, searchTraceId, [
          { code: 'DISCOVERY_EMPTY', message: 'Discovery returned no items; lexical fallback' }
        ], {
          discoveryRequestId: response.requestId,
          diagnostics: { attempts, discoveryLatencyMs: Date.now() - t0, softTimeoutHit }
        });
      }

      let items = enrichFromCandidates(ranked, input.candidates, {
        includeExplanations: input.includeExplanations,
        modelVersion: response.modelVersion || DISCOVERY_MODEL_VERSION
      });

      const recovered = partialRecover(items, input.candidates, input.limit);
      items = recovered.items;

      const authority: 'discovery' = 'discovery';
      const validated = validateRankingAuthority(
        items.filter((i) => i.ranking?.authority === 'discovery'),
        authority
      );

      end();
      recordSearchMetric('rank_discovery', 1);
      if (response.fallbackUsed) recordSearchMetric('discovery_internal_fallback', 1);

      logSearchLifecycle({
        requestId: input.requestId || searchTraceId,
        phase: 'discovery_handoff_ok',
        extra: { searchTraceId, items: items.length, attempts }
      });

      return {
        items,
        fallbackUsed: Boolean(response.fallbackUsed) || recovered.recovered,
        rankingAuthority: 'discovery',
        rankingModelVersion: response.modelVersion || DISCOVERY_MODEL_VERSION,
        discoveryRequestId: response.requestId,
        searchTraceId,
        rankingAuthorityValidated: validated,
        warnings: recovered.recovered
          ? [...warnings, { code: 'PARTIAL_RECOVER', message: 'Filled remaining slots with lexical' }]
          : warnings,
        diagnostics: {
          attempts,
          discoveryLatencyMs: Date.now() - t0,
          softTimeoutHit,
          partialRecovered: recovered.recovered
        }
      };
    } catch (err: any) {
      lastError = String(err?.message || 'discovery_error');
      const isTimeout = lastError === 'discovery_timeout';
      recordSearchMetric(isTimeout ? 'discovery_hard_timeout' : 'discovery_error', 1);
      if (attempt < maxAttempts) {
        recordSearchMetric('discovery_retry', 1);
        await delay(SEARCH_DISCOVERY_RETRY_DELAY_MS * attempt);
        continue;
      }
    }
  }

  end();
  recordSearchMetric('rank_lexical_error', 1);
  warnings.push({
    code: lastError === 'discovery_timeout' ? 'DISCOVERY_TIMEOUT' : 'DISCOVERY_ERROR',
    message: lastError || 'discovery_error'
  });
  return lexicalResult(input.candidates, input.limit, searchTraceId, warnings, {
    diagnostics: { attempts, discoveryLatencyMs: Date.now() - t0, softTimeoutHit }
  });
};
