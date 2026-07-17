import { validateFeedbackEvent } from './feedbackValidator';
import { feedbackMetrics } from './feedbackMetrics';
import { FeedbackRateLimiter } from './feedbackRateLimiter';
import { storeFeedbackEvent } from './feedbackStorage';
import type {
  FeedbackBatchResult,
  FeedbackEventInput,
  NormalizedFeedbackEvent
} from './types';

export class FeedbackFabricError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

type StoreFn = typeof storeFeedbackEvent;

export type FeedbackFabricOptions = {
  rateLimiter?: FeedbackRateLimiter;
  store?: StoreFn;
};

const MAX_BATCH_SIZE = 25;

export class FeedbackFabricService {
  private readonly rateLimiter: FeedbackRateLimiter;
  private readonly store: StoreFn;

  constructor(options: FeedbackFabricOptions = {}) {
    this.rateLimiter = options.rateLimiter || new FeedbackRateLimiter();
    this.store = options.store || storeFeedbackEvent;
  }

  async submit(input: {
    viewerId?: string | null;
    events: FeedbackEventInput[];
  }): Promise<FeedbackBatchResult> {
    const started = Date.now();
    const viewerId = String(input.viewerId || '').trim();
    if (!viewerId) {
      throw new FeedbackFabricError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    const events = (Array.isArray(input.events) ? input.events : []).slice(0, MAX_BATCH_SIZE);
    feedbackMetrics.recordReceived(events.length);
    const limit = this.rateLimiter.check(viewerId, Math.max(1, events.length));
    if (!limit.allowed) {
      feedbackMetrics.recordRateLimited();
      throw new FeedbackFabricError(429, 'RATE_LIMITED', 'Feedback rate limit exceeded');
    }

    const errors: FeedbackBatchResult['errors'] = [];
    const storedIds: string[] = [];
    let accepted = 0;
    let rejected = 0;
    let deduped = 0;

    for (let index = 0; index < events.length; index += 1) {
      const validation = validateFeedbackEvent(events[index], viewerId);
      if (validation.ok === false) {
        rejected += 1;
        feedbackMetrics.recordRejected(validation.issues[0]?.code || 'INVALID');
        errors.push({ index, issues: validation.issues });
        continue;
      }

      const stored = await this.persist(validation.event);
      if (stored.duplicate) {
        deduped += 1;
        feedbackMetrics.recordDuplicate();
        continue;
      }
      accepted += 1;
      if (stored.id) storedIds.push(stored.id);
      feedbackMetrics.recordAccepted(validation.event);
    }

    feedbackMetrics.recordProcessingLatency(Date.now() - started);
    return {
      success: accepted > 0 || deduped > 0,
      received: events.length,
      accepted,
      rejected,
      deduped,
      errors,
      storedIds
    };
  }

  metrics() {
    return feedbackMetrics.snapshot();
  }

  resetForTests() {
    this.rateLimiter.resetForTests();
    feedbackMetrics.resetForTests();
  }

  private persist(event: NormalizedFeedbackEvent) {
    return this.store(event);
  }
}

export const feedbackFabricService = new FeedbackFabricService();
