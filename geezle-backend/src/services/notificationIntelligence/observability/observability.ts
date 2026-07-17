/**
 * Notification Intelligence metrics hooks (Phase 10.2).
 * In-process counters only — no new telemetry providers.
 */

type MetricBucket = { count: number; totalMs: number; maxMs: number };

const counters = new Map<string, number>();
const timers = new Map<string, MetricBucket>();

export const recordNotifIntelMetric = (name: string, delta = 1) => {
  const key = String(name || 'unknown');
  counters.set(key, (counters.get(key) || 0) + delta);
};

export const recordNotifIntelLatency = (name: string, ms: number) => {
  const key = String(name || 'unknown');
  const n = Math.max(0, Number(ms) || 0);
  const prev = timers.get(key) || { count: 0, totalMs: 0, maxMs: 0 };
  prev.count += 1;
  prev.totalMs += n;
  prev.maxMs = Math.max(prev.maxMs, n);
  timers.set(key, prev);
  recordNotifIntelMetric(`${key}_count`, 1);
};

export const startNotifIntelTimer = (name: string) => {
  const t0 = Date.now();
  return () => {
    const ms = Date.now() - t0;
    recordNotifIntelLatency(name, ms);
    return ms;
  };
};

export const getNotifIntelMetricsSnapshot = () => {
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
  return { counts, latency, at: new Date().toISOString() };
};

export const resetNotifIntelMetricsForTests = () => {
  counters.clear();
  timers.clear();
};

export const logNotifIntelLifecycle = (payload: {
  requestId?: string | null;
  phase: string;
  extra?: Record<string, unknown>;
}) => {
  const diag = process.env.NOTIF_INTEL_DIAGNOSTICS;
  if (diag !== 'true' && diag !== '1') return;
  try {
    console.info(
      JSON.stringify({
        svc: 'notification-intelligence',
        requestId: payload.requestId || null,
        phase: payload.phase,
        ...payload.extra,
        ts: new Date().toISOString()
      })
    );
  } catch {
    // ignore
  }
};
