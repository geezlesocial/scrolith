/**
 * Search analytics hooks (query store not persisted in 9.2 foundation).
 */
import { recordSearchMetric } from '../observability/observability';

export type SearchAnalyticsEvent = {
  type: 'query' | 'suggest' | 'empty' | 'fallback' | 'error';
  requestId: string;
  viewerId?: string | null;
  query?: string;
  domainCount?: number;
  resultCount?: number;
  fallbackUsed?: boolean;
  latencyMs?: number;
};

export const emitSearchAnalytics = (event: SearchAnalyticsEvent) => {
  recordSearchMetric(`analytics_${event.type}`, 1);
  if (event.fallbackUsed) recordSearchMetric('analytics_fallback', 1);
  if (event.resultCount === 0) recordSearchMetric('analytics_empty', 1);
  // Persistence deferred to later phase (history/trending store)
};
