/**
 * Phase 22.1B — Scroll recommendation analytics (privacy-safe; no media URLs/tokens).
 */
import { emitFeedAnalytics } from './feedAnalytics';

export type ScrollRecAnalyticsName =
  | 'recommendation_impression'
  | 'scroll_preview_started'
  | 'scroll_preview_completed'
  | 'scroll_recommendation_clicked'
  | 'scroll_video_opened'
  | 'scroll_watch_started'
  | 'scroll_watch_duration'
  | 'scroll_deeplink_resolution_success'
  | 'scroll_deeplink_resolution_failure'
  | 'scroll_recommendation_home_fallback';

const counters: Record<string, number> = {
  scroll_recommendation_preview_attempt_total: 0,
  scroll_recommendation_preview_started_total: 0,
  scroll_recommendation_preview_blocked_total: 0,
  scroll_recommendation_click_total: 0,
  scroll_deeplink_resolution_success_total: 0,
  scroll_deeplink_resolution_failure_total: 0,
  scroll_recommendation_home_fallback_total: 0
};

const bump = (key: keyof typeof counters) => {
  counters[key] = (counters[key] || 0) + 1;
};

export const getScrollRecommendationCounters = () => ({ ...counters });

export const resetScrollRecommendationCounters = () => {
  Object.keys(counters).forEach((k) => {
    counters[k] = 0;
  });
};

type ClickPayload = {
  recommendationId?: string;
  scrollVideoId: string;
  sourceSurface?: string;
  sourcePosition?: number | null;
  destination?: string;
};

export const trackScrollRecommendationClick = (payload: ClickPayload) => {
  bump('scroll_recommendation_click_total');
  emitFeedAnalytics('feed_interaction', payload.sourceSurface || 'member_home', {
    action: 'scroll_recommendation_clicked',
    recommendationId: payload.recommendationId || null,
    scrollVideoId: payload.scrollVideoId,
    sourcePosition: payload.sourcePosition ?? null,
    destination: payload.destination || '/scroll'
  });
};

export const trackScrollPreviewAttempt = (surface = 'member_home') => {
  bump('scroll_recommendation_preview_attempt_total');
  emitFeedAnalytics('feed_interaction', surface, { action: 'scroll_preview_attempt' });
};

export const trackScrollPreviewStarted = (surface = 'member_home', scrollVideoId?: string) => {
  bump('scroll_recommendation_preview_started_total');
  emitFeedAnalytics('feed_interaction', surface, {
    action: 'scroll_preview_started',
    scrollVideoId: scrollVideoId || null
  });
};

export const trackScrollPreviewBlocked = (surface = 'member_home') => {
  bump('scroll_recommendation_preview_blocked_total');
  emitFeedAnalytics('feed_interaction', surface, { action: 'scroll_preview_blocked' });
};

export const trackScrollDeepLinkSuccess = (scrollVideoId: string) => {
  bump('scroll_deeplink_resolution_success_total');
  emitFeedAnalytics('feed_interaction', 'scroll', {
    action: 'scroll_deeplink_resolution_success',
    scrollVideoId
  });
};

export const trackScrollDeepLinkFailure = (scrollVideoId: string, reason?: string) => {
  bump('scroll_deeplink_resolution_failure_total');
  emitFeedAnalytics('feed_interaction', 'scroll', {
    action: 'scroll_deeplink_resolution_failure',
    scrollVideoId,
    reason: reason || null
  });
};

/** Must remain 0 for Scroll recommendations after 22.1B. */
export const trackScrollHomeFallback = (context?: string) => {
  bump('scroll_recommendation_home_fallback_total');
  emitFeedAnalytics('feed_interaction', 'member_home', {
    action: 'scroll_recommendation_home_fallback',
    context: context || null
  });
};
