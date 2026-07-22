/**
 * Phase 33.0 — Metrics + correlation (no secrets / private content).
 */
export type AIMetricCounters = {
  requests: number;
  successes: number;
  failures: number;
  blocks: number;
  refusals: number;
  cacheHits: number;
  cacheMisses: number;
  fallbacks: number;
  structuredFailures: number;
  safetyBlocks: number;
  quotaRejections: number;
  consentRejections: number;
  totalLatencyMs: number;
  totalProviderLatencyMs: number;
  totalTokens: number;
  estimatedCostUsd: number;
};

const counters: AIMetricCounters = {
  requests: 0,
  successes: 0,
  failures: 0,
  blocks: 0,
  refusals: 0,
  cacheHits: 0,
  cacheMisses: 0,
  fallbacks: 0,
  structuredFailures: 0,
  safetyBlocks: 0,
  quotaRejections: 0,
  consentRejections: 0,
  totalLatencyMs: 0,
  totalProviderLatencyMs: 0,
  totalTokens: 0,
  estimatedCostUsd: 0
};

export function inc(metric: keyof AIMetricCounters, by = 1) {
  (counters as any)[metric] = Number((counters as any)[metric] || 0) + by;
}

export function getAIMetricsSnapshot() {
  const avgLatency =
    counters.successes + counters.failures > 0
      ? counters.totalLatencyMs / (counters.successes + counters.failures)
      : 0;
  return {
    ...counters,
    avgLatencyMs: Math.round(avgLatency),
    capturedAt: new Date().toISOString()
  };
}

export function logAIEvent(
  level: 'info' | 'warn' | 'error',
  event: string,
  meta: Record<string, unknown>
) {
  const safe = { ...meta };
  // Never log raw prompts
  delete safe.prompt;
  delete safe.input;
  delete safe.system;
  delete safe.messages;
  const line = `[scrolitha-ai] ${event} ${JSON.stringify(safe)}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}

export default { inc, getAIMetricsSnapshot, logAIEvent };
