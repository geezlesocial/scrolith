import type { FeedbackMetricsSnapshot, NormalizedFeedbackEvent } from './types';

const counters: Record<string, number> = Object.create(null);
let latencyCount = 0;
let latencyTotalMs = 0;
let latencyMaxMs = 0;

const bump = (key: string, by = 1) => {
  counters[key] = (counters[key] || 0) + by;
};

const safe = (value: string) => String(value || 'unknown').slice(0, 64);

export const feedbackMetrics = {
  recordReceived(count = 1) {
    bump('feedback.received', count);
  },
  recordAccepted(event: NormalizedFeedbackEvent) {
    bump('feedback.accepted');
    bump(`feedback.type.${safe(event.action)}`);
    bump(`feedback.category.${safe(event.category)}`);
    bump(`feedback.source.${safe(event.surface)}`);
    bump(`feedback.entity.${safe(event.entityType)}`);
  },
  recordRejected(code = 'unknown') {
    bump('feedback.rejected');
    bump(`feedback.validation.${safe(code)}`);
  },
  recordDuplicate() {
    bump('feedback.duplicate');
  },
  recordRateLimited() {
    bump('feedback.rate_limited');
  },
  recordProcessingLatency(ms: number) {
    const normalized = Math.max(0, Math.floor(Number(ms) || 0));
    latencyCount += 1;
    latencyTotalMs += normalized;
    latencyMaxMs = Math.max(latencyMaxMs, normalized);
    bump('feedback.latency.samples');
  },
  snapshot(): FeedbackMetricsSnapshot {
    return {
      counters: { ...counters },
      latency: {
        count: latencyCount,
        avgMs: latencyCount ? Number((latencyTotalMs / latencyCount).toFixed(2)) : 0,
        maxMs: latencyMaxMs
      }
    };
  },
  resetForTests() {
    for (const key of Object.keys(counters)) delete counters[key];
    latencyCount = 0;
    latencyTotalMs = 0;
    latencyMaxMs = 0;
  }
};
