/**
 * Phase 21.0 — privacy-safe interest signal batching for personalization.
 * Uses existing /intelligence/feedback fabric. No content bodies, no messages.
 */
import {
  type FeedbackAction,
  type FeedbackEntityType,
  type IntelligenceFeedbackEvent,
  getFeedbackSessionId,
  submitIntelligenceFeedbackEvents
} from '../services/intelligenceFeedback';

export type FeedInterestObservation = {
  entityId: string;
  entityType?: FeedbackEntityType;
  action: FeedbackAction;
  surface: string;
  feedMode?: string;
  feedPosition?: number;
  viewDurationMs?: number;
  reasonCodes?: string[];
};

const deviceType = (): string => {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = String(navigator.userAgent || '').toLowerCase();
  if (/android|iphone|ipad|mobile/.test(ua)) return 'mobile';
  if (/tablet/.test(ua)) return 'tablet';
  return 'desktop';
};

const queue: FeedInterestObservation[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const FLUSH_MS = 1800;
const MAX_BATCH = 12;

const sanitize = (obs: FeedInterestObservation): IntelligenceFeedbackEvent | null => {
  const entityId = String(obs.entityId || '').trim();
  if (!entityId || entityId.length > 128) return null;
  return {
    entityType: obs.entityType || 'post',
    entityId,
    action: obs.action,
    sourceSurface: String(obs.surface || 'member_home').slice(0, 64),
    sessionId: getFeedbackSessionId(),
    deviceType: deviceType(),
    feedMode: obs.feedMode ? String(obs.feedMode).slice(0, 32) : undefined,
    feedPosition:
      typeof obs.feedPosition === 'number' && Number.isFinite(obs.feedPosition)
        ? Math.max(0, Math.min(500, Math.trunc(obs.feedPosition)))
        : undefined,
    viewDurationMs:
      typeof obs.viewDurationMs === 'number' && Number.isFinite(obs.viewDurationMs)
        ? Math.max(0, Math.min(120_000, Math.trunc(obs.viewDurationMs)))
        : undefined,
    reasonCodes: Array.isArray(obs.reasonCodes)
      ? obs.reasonCodes.map((c) => String(c).slice(0, 48)).filter(Boolean).slice(0, 6)
      : undefined
  };
};

const flush = () => {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!queue.length) return;
  const batch = queue.splice(0, MAX_BATCH).map(sanitize).filter(Boolean) as IntelligenceFeedbackEvent[];
  if (!batch.length) return;
  void submitIntelligenceFeedbackEvents(batch).catch(() => {
    // Fire-and-forget telemetry — never break the feed.
  });
  if (queue.length) {
    flushTimer = setTimeout(flush, FLUSH_MS);
  }
};

/** Queue a privacy-safe interest observation (batched). */
export const observeFeedInterest = (observation: FeedInterestObservation): void => {
  if (!observation?.entityId) return;
  queue.push(observation);
  if (queue.length >= MAX_BATCH) {
    flush();
    return;
  }
  if (!flushTimer) {
    flushTimer = setTimeout(flush, FLUSH_MS);
  }
};

/** Record that a post was visible long enough to count as a soft positive signal. */
export const observeFeedViewDuration = (params: {
  entityId: string;
  surface: string;
  viewDurationMs: number;
  feedPosition?: number;
  feedMode?: string;
}): void => {
  const ms = Number(params.viewDurationMs || 0);
  if (!params.entityId || ms < 900) return;
  observeFeedInterest({
    entityId: params.entityId,
    entityType: 'post',
    action: ms >= 8000 ? 'view_duration' : 'partial_read',
    surface: params.surface,
    viewDurationMs: ms,
    feedPosition: params.feedPosition,
    feedMode: params.feedMode
  });
};

/** Record a fast skip (negative soft signal). */
export const observeFeedScrollPast = (params: {
  entityId: string;
  surface: string;
  feedPosition?: number;
  feedMode?: string;
}): void => {
  if (!params.entityId) return;
  observeFeedInterest({
    entityId: params.entityId,
    entityType: 'post',
    action: 'scroll_past',
    surface: params.surface,
    feedPosition: params.feedPosition,
    feedMode: params.feedMode
  });
};

export const flushFeedInterestSignals = (): void => {
  flush();
};
