/**
 * Enterprise Search metrics / logging hooks (Phase 9.4).
 * Note: cache stats loaded lazily to avoid circular import with cache.ts.
 */

type MetricBucket = {
  count: number;
  totalMs: number;
  maxMs: number;
};

const counters = new Map<string, number>();
const timers = new Map<string, MetricBucket>();

export const recordSearchMetric = (name: string, delta = 1) => {
  const key = String(name || 'unknown');
  counters.set(key, (counters.get(key) || 0) + delta);
};

export const recordSearchLatency = (name: string, ms: number) => {
  const key = String(name || 'unknown');
  const n = Math.max(0, Number(ms) || 0);
  const prev = timers.get(key) || { count: 0, totalMs: 0, maxMs: 0 };
  prev.count += 1;
  prev.totalMs += n;
  prev.maxMs = Math.max(prev.maxMs, n);
  timers.set(key, prev);
  recordSearchMetric(`${key}_count`, 1);
};

export const startSearchTimer = (name: string) => {
  const t0 = Date.now();
  return () => {
    const ms = Date.now() - t0;
    recordSearchLatency(name, ms);
    return ms;
  };
};

export const getSearchMetricsSnapshot = () => {
  const counts: Record<string, number> = {};
  counters.forEach((v, k) => {
    counts[k] = v;
  });
  const latency: Record<string, { count: number; avgMs: number; maxMs: number }> = {};
  timers.forEach((v, k) => {
    latency[k] = {
      count: v.count,
      avgMs: v.count ? Math.round(v.totalMs / v.count) : 0,
      maxMs: v.maxMs
    };
  });
  let cache: {
    hitRatio: number;
    missRatio: number;
    hits: number;
    misses: number;
    size: number;
    generation: number;
  } = { hitRatio: 0, missRatio: 0, hits: 0, misses: 0, size: 0, generation: 0 };
  try {
    // lazy require avoids circular dependency with cache.ts
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cache = require('../cache/cache').getSearchCacheStats();
  } catch {
    // ignore
  }
  const fallbackCount =
    (counts.rank_lexical_flag_off || 0) +
    (counts.rank_lexical_discovery_off || 0) +
    (counts.rank_lexical_empty_discovery || 0) +
    (counts.rank_lexical_error || 0);
  return {
    counts,
    latency,
    cache: {
      hitRatio: cache.hitRatio,
      missRatio: cache.missRatio,
      hits: cache.hits,
      misses: cache.misses,
      size: cache.size,
      generation: cache.generation
    },
    fallbackCount,
    discoveryTimeouts: (counts.discovery_hard_timeout || 0) + (counts.discovery_soft_timeout || 0),
    at: new Date().toISOString()
  };
};

export const resetSearchMetricsForTests = () => {
  counters.clear();
  timers.clear();
};

export const logSearchLifecycle = (payload: {
  requestId: string;
  phase: string;
  surface?: string;
  extra?: Record<string, unknown>;
}) => {
  if (process.env.ENTERPRISE_SEARCH_DIAGNOSTICS !== 'true' && process.env.ENTERPRISE_SEARCH_DIAGNOSTICS !== '1') {
    return;
  }
  try {
    console.info(
      JSON.stringify({
        svc: 'enterprise-search',
        requestId: payload.requestId,
        searchId: payload.requestId,
        phase: payload.phase,
        surface: payload.surface,
        ...payload.extra,
        ts: new Date().toISOString()
      })
    );
  } catch {
    // ignore
  }
};
