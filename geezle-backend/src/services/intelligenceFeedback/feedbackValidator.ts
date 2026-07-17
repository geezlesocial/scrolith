import { normalizeFeedbackEvent } from './feedbackNormalizer';
import type { FeedbackEventInput, FeedbackValidationIssue, FeedbackValidationResult } from './types';

const issue = (field: string, code: string, message: string): FeedbackValidationIssue => ({
  field,
  code,
  message
});

export const validateFeedbackEvent = (
  input: FeedbackEventInput,
  viewerId: string | undefined | null
): FeedbackValidationResult => {
  const issues: FeedbackValidationIssue[] = [];
  if (!viewerId) issues.push(issue('viewerId', 'AUTH_REQUIRED', 'Authentication required'));
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    issues.push(issue('event', 'INVALID_EVENT', 'Feedback event must be an object'));
    return { ok: false, issues };
  }
  if (!input.entityType) issues.push(issue('entityType', 'REQUIRED', 'entityType is required'));
  if (!input.entityId) issues.push(issue('entityId', 'REQUIRED', 'entityId is required'));
  if (!input.action) issues.push(issue('action', 'REQUIRED', 'action is required'));
  if (issues.length) return { ok: false, issues };

  const event = normalizeFeedbackEvent(input, String(viewerId || ''));
  if (!event) {
    return {
      ok: false,
      issues: [
        issue('event', 'UNSUPPORTED_EVENT', 'Unsupported feedback entity type, entity id, or action')
      ]
    };
  }
  return { ok: true, event };
};

export const normalizeFeedbackBatch = (body: unknown): FeedbackEventInput[] => {
  const payload = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const events = Array.isArray(payload.events) ? payload.events : [payload];
  return events.filter((event) => event && typeof event === 'object') as FeedbackEventInput[];
};
