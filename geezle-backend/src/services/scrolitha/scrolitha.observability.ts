/**
 * Safe diagnostics for Scrolitha intelligence lifecycle.
 * Never stores private content, tokens, or full prompts.
 */
import { createHash } from 'crypto';
import { writeScrolithaAuditLog } from './scrolitha.audit';
import { incrementMinuteCounter, scrolithaCache } from './scrolitha.cache';

export type IntelligenceLifecycleEvent = {
  requestId: string;
  phase:
    | 'accepted'
    | 'context_built'
    | 'graph_built'
    | 'memory_loaded'
    | 'cache_hit'
    | 'llm_start'
    | 'llm_end'
    | 'validated'
    | 'completed'
    | 'failed';
  surface?: string;
  entityType?: string;
  entityId?: string;
  contextSources?: string[];
  classification?: string | null;
  latencyMs?: number | null;
  cacheHit?: boolean;
  retryCount?: number;
  provider?: string | null;
  failureReason?: string | null;
  tokenEstimate?: number | null;
};

const METRICS_PREFIX = 'scrolitha:intel:metrics:';

export const newIntelligenceRequestId = (parts: string[]) =>
  createHash('sha256')
    .update(parts.filter(Boolean).join('|') + '|' + Date.now())
    .digest('hex')
    .slice(0, 24);

export const estimateTokenCount = (value: string) => {
  const chars = String(value || '').length;
  // Rough estimate ~4 chars/token; safe observability only.
  return Math.max(0, Math.ceil(chars / 4));
};

export const recordIntelligenceMetric = (key: string, delta = 1) => {
  const full = `${METRICS_PREFIX}${key}`;
  const current = scrolithaCache.get<number>(full) || 0;
  scrolithaCache.set(full, current + delta, 10 * 60_000);
  return current + delta;
};

export const getIntelligenceMetricsSnapshot = () => {
  // Lightweight counters for recent windows (in-process).
  return {
    asks: scrolithaCache.get<number>(`${METRICS_PREFIX}asks`) || 0,
    cacheHits: scrolithaCache.get<number>(`${METRICS_PREFIX}cache_hits`) || 0,
    llmCalls: scrolithaCache.get<number>(`${METRICS_PREFIX}llm_calls`) || 0,
    failures: scrolithaCache.get<number>(`${METRICS_PREFIX}failures`) || 0,
    moderationAssists: scrolithaCache.get<number>(`${METRICS_PREFIX}moderation_assists`) || 0,
    minuteAsks: incrementMinuteCounter('scrolitha:intel:minute_asks_peek', 60_000) - 1
  };
};

export const logIntelligenceLifecycle = async (input: {
  actorId: string;
  event: IntelligenceLifecycleEvent;
}) => {
  const e = input.event;
  if (e.phase === 'accepted') recordIntelligenceMetric('asks');
  if (e.phase === 'cache_hit' || e.cacheHit) recordIntelligenceMetric('cache_hits');
  if (e.phase === 'llm_start') recordIntelligenceMetric('llm_calls');
  if (e.phase === 'failed') recordIntelligenceMetric('failures');

  // Persist only redacted lifecycle breadcrumbs.
  try {
    await writeScrolithaAuditLog({
      actor: {
        id: input.actorId,
        role: 'user',
        scope: 'user',
        isAdmin: false,
        ipAddress: null,
        userAgent: 'scrolitha-intelligence'
      },
      eventType: `SCROLITHA_INTEL_${String(e.phase).toUpperCase()}`,
      intent: e.surface || 'intelligence',
      requestPayload: {
        requestId: e.requestId,
        phase: e.phase,
        entityType: e.entityType || null,
        entityId: e.entityId || null
      },
      redactedPayload: {
        requestId: e.requestId,
        phase: e.phase,
        contextSources: (e.contextSources || []).slice(0, 12),
        classification: e.classification || null,
        latencyMs: e.latencyMs ?? null,
        cacheHit: Boolean(e.cacheHit),
        retryCount: e.retryCount ?? 0,
        provider: e.provider || null,
        failureReason: e.failureReason ? String(e.failureReason).slice(0, 180) : null,
        tokenEstimate: e.tokenEstimate ?? null
      },
      resultStatus: e.phase === 'failed' ? 'error' : 'ok',
      resultSummary: `Intelligence ${e.phase}${e.latencyMs != null ? ` ${e.latencyMs}ms` : ''}`
    });
  } catch {
    // never break AI path on observability failure
  }
};

export const toClientSafeDiagnostics = (event: Partial<IntelligenceLifecycleEvent>) => ({
  requestId: event.requestId || null,
  classification: event.classification || null,
  latencyMs: event.latencyMs ?? null,
  cacheHit: Boolean(event.cacheHit),
  retryCount: event.retryCount ?? 0,
  provider: event.provider || 'scrolitha',
  contextSources: (event.contextSources || []).slice(0, 12),
  failureReason: event.failureReason || null
});
