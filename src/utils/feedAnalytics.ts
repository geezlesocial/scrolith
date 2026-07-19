/**
 * Phase 21.0 — lightweight feed analytics (client-side, privacy-safe).
 * No PII, no content bodies, no exact geolocation. DEV console only unless
 * an optional sink is registered by the host app.
 */

export type FeedAnalyticsEventName =
  | 'feed_request_start'
  | 'feed_request_success'
  | 'feed_request_error'
  | 'feed_prefetch'
  | 'feed_terminal'
  | 'feed_render'
  | 'feed_scroll_sample'
  | 'feed_interaction';

export type FeedAnalyticsEvent = {
  name: FeedAnalyticsEventName;
  surface: string;
  ts: number;
  engineVersion: string;
  payload?: Record<string, string | number | boolean | null | undefined>;
};

type FeedAnalyticsSink = (event: FeedAnalyticsEvent) => void;

const ENGINE_VERSION = '21.0.0';
const recent: FeedAnalyticsEvent[] = [];
const MAX_RECENT = 40;
let sink: FeedAnalyticsSink | null = null;

export const registerFeedAnalyticsSink = (next: FeedAnalyticsSink | null): void => {
  sink = next;
};

export const getRecentFeedAnalytics = (): readonly FeedAnalyticsEvent[] => recent;

export const emitFeedAnalytics = (
  name: FeedAnalyticsEventName,
  surface: string,
  payload?: FeedAnalyticsEvent['payload']
): void => {
  const event: FeedAnalyticsEvent = {
    name,
    surface: String(surface || 'unknown'),
    ts: Date.now(),
    engineVersion: ENGINE_VERSION,
    payload: payload || undefined
  };
  recent.push(event);
  if (recent.length > MAX_RECENT) recent.shift();

  try {
    sink?.(event);
  } catch {
    // Never break feed for analytics.
  }

  try {
    const env = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env;
    if (env?.DEV) {
      // eslint-disable-next-line no-console
      console.debug('[feed-analytics]', event.name, event.surface, event.payload || {});
    }
  } catch {
    // ignore
  }
};

/** Mark request latency once a feed page settles. */
export const measureFeedRequest = (
  surface: string,
  startedAt: number,
  outcome: 'success' | 'error' | 'prefetch_success',
  extras?: FeedAnalyticsEvent['payload']
): void => {
  const latencyMs = Math.max(0, Date.now() - Number(startedAt || Date.now()));
  emitFeedAnalytics(
    outcome === 'error' ? 'feed_request_error' : outcome === 'prefetch_success' ? 'feed_prefetch' : 'feed_request_success',
    surface,
    { latencyMs, ...extras }
  );
};

/**
 * Rough scroll FPS sample using rAF over a short window.
 * Call startScrollFpsSample() when user starts scrolling; it self-stops.
 */
export const startScrollFpsSample = (
  surface: string,
  durationMs = 1000
): (() => void) => {
  if (typeof window === 'undefined' || typeof requestAnimationFrame !== 'function') {
    return () => undefined;
  }
  let frames = 0;
  let raf = 0;
  let stopped = false;
  const start = performance.now();
  const tick = (now: number) => {
    if (stopped) return;
    frames += 1;
    if (now - start >= durationMs) {
      const elapsed = Math.max(1, now - start);
      const fps = Math.round((frames * 1000) / elapsed);
      emitFeedAnalytics('feed_scroll_sample', surface, {
        fps,
        frames,
        durationMs: Math.round(elapsed)
      });
      stopped = true;
      return;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => {
    stopped = true;
    if (raf) cancelAnimationFrame(raf);
  };
};
