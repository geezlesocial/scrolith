/**
 * Phase 20.2.6R — messaging/media observability without user content.
 * Metrics are aggregate timings and counters only.
 */

export type MessagingMetricName =
  | 'conversation_open_ms'
  | 'conversation_switch_ms'
  | 'message_send_ack_ms'
  | 'media_upload_ms'
  | 'media_download_ms'
  | 'attachment_render_ms'
  | 'preview_generate_ms'
  | 'cache_hit'
  | 'cache_miss'
  | 'upload_retry'
  | 'download_retry'
  | 'socket_reconnect'
  | 'notification_display_ms';

type MetricBucket = {
  count: number;
  total: number;
  min: number;
  max: number;
  last: number;
};

const buckets = new Map<MessagingMetricName, MetricBucket>();
const counters = new Map<string, number>();
const MAX_SAMPLES_LOG = 40;
const recentSamples: Array<{ name: MessagingMetricName; value: number; at: number }> = [];

const ensureBucket = (name: MessagingMetricName): MetricBucket => {
  let bucket = buckets.get(name);
  if (!bucket) {
    bucket = { count: 0, total: 0, min: Number.POSITIVE_INFINITY, max: 0, last: 0 };
    buckets.set(name, bucket);
  }
  return bucket;
};

export const recordMessagingMetric = (
  name: MessagingMetricName,
  value: number,
  meta?: Record<string, string | number | boolean | null | undefined>
) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) return;
  const bucket = ensureBucket(name);
  bucket.count += 1;
  bucket.total += numeric;
  bucket.min = Math.min(bucket.min, numeric);
  bucket.max = Math.max(bucket.max, numeric);
  bucket.last = numeric;
  recentSamples.push({ name, value: numeric, at: Date.now() });
  if (recentSamples.length > MAX_SAMPLES_LOG) recentSamples.shift();

  // Fire-and-forget runtime telemetry when available (no content fields).
  if (typeof window !== 'undefined' && meta?.export === true) {
    void import('../../mobile/mobileTelemetry')
      .then(({ trackMobileRuntimeEvent }) =>
        trackMobileRuntimeEvent(
          'messaging_metric' as any,
          {
            metric: name,
            value: Math.round(numeric),
            count: bucket.count,
            avg: Math.round(bucket.total / Math.max(1, bucket.count))
          },
          { dedupeMs: 5_000, sourcePath: '/messages' }
        )
      )
      .catch(() => undefined);
  }
};

export const incrementMessagingCounter = (name: string, by = 1) => {
  const key = String(name || '').trim();
  if (!key) return;
  counters.set(key, (counters.get(key) || 0) + by);
};

export const startMessagingTimer = (name: MessagingMetricName) => {
  const started = typeof performance !== 'undefined' ? performance.now() : Date.now();
  return (meta?: Record<string, string | number | boolean | null | undefined>) => {
    const ended = typeof performance !== 'undefined' ? performance.now() : Date.now();
    recordMessagingMetric(name, ended - started, meta);
  };
};

export const getMessagingTelemetrySnapshot = () => {
  const metrics: Record<string, { count: number; avg: number; min: number; max: number; last: number }> = {};
  buckets.forEach((bucket, name) => {
    metrics[name] = {
      count: bucket.count,
      avg: bucket.count ? bucket.total / bucket.count : 0,
      min: bucket.count ? bucket.min : 0,
      max: bucket.max,
      last: bucket.last
    };
  });
  const counterObj: Record<string, number> = {};
  counters.forEach((value, key) => {
    counterObj[key] = value;
  });
  return {
    metrics,
    counters: counterObj,
    recent: recentSamples.slice(-20)
  };
};

export const __resetMessagingTelemetryForTests = () => {
  buckets.clear();
  counters.clear();
  recentSamples.length = 0;
};

export const computeCacheHitRatio = (): number => {
  const hits = buckets.get('cache_hit')?.count || 0;
  const misses = buckets.get('cache_miss')?.count || 0;
  const total = hits + misses;
  if (!total) return 1;
  return hits / total;
};
