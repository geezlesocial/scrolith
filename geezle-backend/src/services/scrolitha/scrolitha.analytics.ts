/**
 * Enterprise AI usage analytics — counters only, no private prompt content.
 */
import { enterpriseCache } from './scrolitha.enterpriseCache';
import { incrementMinuteCounter } from './scrolitha.cache';

export type AnalyticsEventName =
  | 'question_asked'
  | 'answer_success'
  | 'answer_failed'
  | 'verification_request'
  | 'summary_request'
  | 'recommendation_request'
  | 'moderator_assist'
  | 'workflow_run'
  | 'skill_run'
  | 'event_ingested'
  | 'cache_hit'
  | 'provider_failure'
  | 'retry';

const COUNTER_KEY = 'usage_counters_v1';

type CounterMap = Record<string, number>;

const readCounters = (): CounterMap =>
  enterpriseCache.get<CounterMap>('analytics', COUNTER_KEY) || {};

const writeCounters = (map: CounterMap) => {
  enterpriseCache.set('analytics', COUNTER_KEY, map, 24 * 60 * 60_000);
};

export const trackAnalytics = (
  event: AnalyticsEventName,
  dims?: { intent?: string; surface?: string; skillId?: string }
) => {
  const map = readCounters();
  map[event] = (map[event] || 0) + 1;
  if (dims?.intent) {
    const k = `intent:${dims.intent}`;
    map[k] = (map[k] || 0) + 1;
  }
  if (dims?.surface) {
    const k = `surface:${dims.surface}`;
    map[k] = (map[k] || 0) + 1;
  }
  if (dims?.skillId) {
    const k = `skill:${dims.skillId}`;
    map[k] = (map[k] || 0) + 1;
  }
  writeCounters(map);
  incrementMinuteCounter(`scrolitha:analytics:${event}`, 60_000);
};

export const trackIntentAnalytics = (intent: string) => {
  const i = String(intent || 'general').toLowerCase();
  trackAnalytics('question_asked', { intent: i });
  if (i.includes('verify') || i.includes('claim')) trackAnalytics('verification_request', { intent: i });
  if (i.includes('summar')) trackAnalytics('summary_request', { intent: i });
  if (i.includes('recommend')) trackAnalytics('recommendation_request', { intent: i });
  if (i.includes('moderat')) trackAnalytics('moderator_assist', { intent: i });
};

export const getAnalyticsSnapshot = () => {
  const counters = readCounters();
  return {
    generatedAt: new Date().toISOString(),
    totals: {
      questionsAsked: counters.question_asked || 0,
      successfulAnswers: counters.answer_success || 0,
      failedAnswers: counters.answer_failed || 0,
      verificationRequests: counters.verification_request || 0,
      summaries: counters.summary_request || 0,
      recommendations: counters.recommendation_request || 0,
      moderatorAssists: counters.moderator_assist || 0,
      workflows: counters.workflow_run || 0,
      skillRuns: counters.skill_run || 0,
      eventsIngested: counters.event_ingested || 0,
      cacheHits: counters.cache_hit || 0,
      providerFailures: counters.provider_failure || 0,
      retries: counters.retry || 0
    },
    raw: counters,
    privacy: 'No private prompt content is stored in analytics counters.'
  };
};
