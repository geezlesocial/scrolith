/**
 * Enterprise operational metrics — counters and latency samples only.
 * Never stores prompts or private user content.
 */
import { enterpriseCache } from './scrolitha.enterpriseCache';
import { trackAnalytics, type AnalyticsEventName } from './scrolitha.analytics';

type LatencyBucket = number[];

const LATENCY_KEY = 'ops:latency:samples';
const COUNTER_KEY = 'ops:counters:v1';
const MAX_SAMPLES = 500;

type OpsCounters = {
  requests: number;
  successes: number;
  failures: number;
  cancellations: number;
  retries: number;
  duplicatesSuppressed: number;
  cacheHits: number;
  cacheMisses: number;
  providerPrimary: number;
  providerFallback: number;
  actionCardsUsed: number;
  recommendationsServed: number;
  proactiveShown: number;
  searchRequests: number;
  osBootstraps: number;
  osAsks: number;
  aiReplies: number;
  timeouts: number;
};

const emptyCounters = (): OpsCounters => ({
  requests: 0,
  successes: 0,
  failures: 0,
  cancellations: 0,
  retries: 0,
  duplicatesSuppressed: 0,
  cacheHits: 0,
  cacheMisses: 0,
  providerPrimary: 0,
  providerFallback: 0,
  actionCardsUsed: 0,
  recommendationsServed: 0,
  proactiveShown: 0,
  searchRequests: 0,
  osBootstraps: 0,
  osAsks: 0,
  aiReplies: 0,
  timeouts: 0
});

const readCounters = (): OpsCounters =>
  enterpriseCache.get<OpsCounters>('analytics', COUNTER_KEY) || emptyCounters();

const writeCounters = (c: OpsCounters) => {
  enterpriseCache.set('analytics', COUNTER_KEY, c, 24 * 60 * 60_000);
};

const readLatencies = (): LatencyBucket =>
  enterpriseCache.get<LatencyBucket>('analytics', LATENCY_KEY) || [];

const writeLatencies = (samples: LatencyBucket) => {
  enterpriseCache.set('analytics', LATENCY_KEY, samples.slice(-MAX_SAMPLES), 24 * 60 * 60_000);
};

const percentile = (sorted: number[], p: number) => {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
};

export const recordOpsCounter = (field: keyof OpsCounters, delta = 1) => {
  const c = readCounters();
  c[field] = Math.max(0, (c[field] || 0) + delta);
  writeCounters(c);
};

export const recordLatencyMs = (latencyMs: number) => {
  if (!Number.isFinite(latencyMs) || latencyMs < 0) return;
  const samples = readLatencies();
  samples.push(Math.round(latencyMs));
  writeLatencies(samples);
};

export const recordRequestOutcome = (input: {
  ok: boolean;
  latencyMs?: number;
  cancelled?: boolean;
  cacheHit?: boolean;
  usedFallback?: boolean;
  retried?: boolean;
  timedOut?: boolean;
}) => {
  recordOpsCounter('requests');
  if (input.ok) recordOpsCounter('successes');
  else recordOpsCounter('failures');
  if (input.cancelled) recordOpsCounter('cancellations');
  if (input.cacheHit) recordOpsCounter('cacheHits');
  else if (input.cacheHit === false) recordOpsCounter('cacheMisses');
  if (input.usedFallback) recordOpsCounter('providerFallback');
  else if (input.ok) recordOpsCounter('providerPrimary');
  if (input.retried) recordOpsCounter('retries');
  if (input.timedOut) recordOpsCounter('timeouts');
  if (typeof input.latencyMs === 'number') recordLatencyMs(input.latencyMs);
};

export const recordDuplicateSuppressed = () => {
  recordOpsCounter('duplicatesSuppressed');
  trackAnalytics('event_ingested');
};

export const recordActionCardUse = () => {
  recordOpsCounter('actionCardsUsed');
  trackAnalytics('recommendation_request' as AnalyticsEventName);
};

export const recordRecommendationServed = (count = 1) => {
  recordOpsCounter('recommendationsServed', count);
};

export const recordProactiveShown = (count = 1) => {
  recordOpsCounter('proactiveShown', count);
};

export const recordSearchRequest = () => recordOpsCounter('searchRequests');
export const recordOsBootstrap = () => recordOpsCounter('osBootstraps');
export const recordOsAsk = () => recordOpsCounter('osAsks');
export const recordAiReply = () => recordOpsCounter('aiReplies');

export const getOpsMetricsSnapshot = () => {
  const counters = readCounters();
  const samples = [...readLatencies()].sort((a, b) => a - b);
  const cacheTotal = counters.cacheHits + counters.cacheMisses;
  return {
    generatedAt: new Date().toISOString(),
    counters,
    latencyMs: {
      sampleSize: samples.length,
      p50: percentile(samples, 50),
      p95: percentile(samples, 95),
      p99: percentile(samples, 99),
      max: samples.length ? samples[samples.length - 1] : null,
      min: samples.length ? samples[0] : null
    },
    rates: {
      cacheHitRate: cacheTotal ? Number((counters.cacheHits / cacheTotal).toFixed(4)) : null,
      successRate:
        counters.requests > 0 ? Number((counters.successes / counters.requests).toFixed(4)) : null,
      fallbackRate:
        counters.requests > 0
          ? Number((counters.providerFallback / counters.requests).toFixed(4))
          : null,
      cancellationRate:
        counters.requests > 0
          ? Number((counters.cancellations / counters.requests).toFixed(4))
          : null
    },
    privacy: 'Operational metrics only — no prompts, message bodies, or private PII.'
  };
};
