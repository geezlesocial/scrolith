/**
 * Search feedback engine — validate, dedupe, rate-limit, forward to Discovery.
 * Does not implement ranking; Discovery owns feedback persistence.
 */
import {
  recordDiscoveryFeedback,
  type DiscoveryFeedbackInput
} from '../../discoveryEngine/discoveryEngine.service';
import type { SearchDomain, SearchFeedbackAction, SearchFeedbackRequest } from '../contracts/types';
import { SearchContractError } from '../contracts/types';
import {
  SEARCH_FEEDBACK_DEDUPE_TTL_MS,
  SEARCH_FEEDBACK_IMPRESSION_RATE_MAX,
  SEARCH_FEEDBACK_RATE_MAX,
  SEARCH_FEEDBACK_RATE_WINDOW_MS
} from '../contracts/constants';
import { recordSearchMetric } from '../observability/observability';
import { invalidateSearchCacheForViewer } from '../cache/cache';
import { emitSearchInvalidation } from '../realtime/realtime';
import { SUPPORTED_SEARCH_DOMAINS } from '../contracts/constants';

const VALID_ACTIONS = new Set<SearchFeedbackAction>([
  'impression',
  'click',
  'open',
  'save',
  'hide',
  'not_interested',
  'dismiss',
  'follow',
  'apply',
  'purchase',
  'share',
  'report'
]);

const DOMAIN_SET = new Set<string>(SUPPORTED_SEARCH_DOMAINS as unknown as string[]);

const mapSurface = (surface?: string): DiscoveryFeedbackInput['surface'] => {
  if (surface === 'search_suggest') return 'search_suggest';
  return 'global';
};

/** Map Search actions to Discovery feedback actions (no Discovery enum changes required). */
const mapAction = (action: SearchFeedbackAction): DiscoveryFeedbackInput['action'] => {
  if (action === 'purchase') return 'inquire';
  if (action === 'open') return 'click';
  return action as DiscoveryFeedbackInput['action'];
};

type RateBucket = { windowStart: number; count: number; impressionCount: number };
const rateByViewer = new Map<string, RateBucket>();
const dedupeKeys = new Map<string, number>();

const pruneMaps = () => {
  const now = Date.now();
  for (const [k, exp] of dedupeKeys) {
    if (exp <= now) dedupeKeys.delete(k);
  }
  if (rateByViewer.size > 5_000) {
    // drop oldest half
    const keys = Array.from(rateByViewer.keys()).slice(0, Math.floor(rateByViewer.size / 2));
    keys.forEach((k) => rateByViewer.delete(k));
  }
};

export const validateSearchFeedback = (input: SearchFeedbackRequest) => {
  if (!input.viewerId || !String(input.viewerId).trim()) {
    throw new SearchContractError('UNAUTHORIZED', 'viewerId required', 401);
  }
  if (!VALID_ACTIONS.has(input.action)) {
    throw new SearchContractError('VALIDATION_ERROR', `Invalid feedback action: ${input.action}`);
  }
  if (!input.entityType || !DOMAIN_SET.has(String(input.entityType))) {
    throw new SearchContractError('VALIDATION_ERROR', `Invalid entityType: ${input.entityType}`);
  }
  if (!input.entityId || !String(input.entityId).trim()) {
    throw new SearchContractError('VALIDATION_ERROR', 'entityId required');
  }
  if (input.query && String(input.query).length > 200) {
    throw new SearchContractError('VALIDATION_ERROR', 'query too long for feedback');
  }
  if (input.trackingToken && String(input.trackingToken).length > 2_000) {
    throw new SearchContractError('VALIDATION_ERROR', 'trackingToken too long');
  }
};

const checkRateLimit = (viewerId: string, action: SearchFeedbackAction) => {
  const now = Date.now();
  let bucket = rateByViewer.get(viewerId);
  if (!bucket || now - bucket.windowStart > SEARCH_FEEDBACK_RATE_WINDOW_MS) {
    bucket = { windowStart: now, count: 0, impressionCount: 0 };
    rateByViewer.set(viewerId, bucket);
  }
  if (action === 'impression') {
    bucket.impressionCount += 1;
    if (bucket.impressionCount > SEARCH_FEEDBACK_IMPRESSION_RATE_MAX) {
      recordSearchMetric('feedback_rate_limited', 1);
      throw new SearchContractError('RATE_LIMITED', 'Impression rate limit exceeded', 429);
    }
  } else {
    bucket.count += 1;
    if (bucket.count > SEARCH_FEEDBACK_RATE_MAX) {
      recordSearchMetric('feedback_rate_limited', 1);
      throw new SearchContractError('RATE_LIMITED', 'Feedback rate limit exceeded', 429);
    }
  }
};

const dedupeKey = (input: SearchFeedbackRequest) =>
  [
    input.viewerId,
    input.action,
    input.entityType,
    input.entityId,
    input.surface || 'search_results',
    String(input.trackingToken || '').slice(0, 32)
  ].join('|');

export const submitSearchFeedback = async (input: SearchFeedbackRequest) => {
  pruneMaps();
  validateSearchFeedback(input);
  checkRateLimit(input.viewerId, input.action);

  const key = dedupeKey(input);
  const now = Date.now();
  const existing = dedupeKeys.get(key);
  if (existing && existing > now) {
    recordSearchMetric('feedback_deduped', 1);
    return { ok: true, skipped: true, reason: 'deduped' };
  }
  dedupeKeys.set(key, now + SEARCH_FEEDBACK_DEDUPE_TTL_MS);

  recordSearchMetric('feedback', 1);
  recordSearchMetric(`feedback_${input.action}`, 1);

  try {
    const data = await recordDiscoveryFeedback({
      viewerId: input.viewerId,
      surface: mapSurface(input.surface),
      entityType: input.entityType as DiscoveryEntityTypeSafe,
      entityId: String(input.entityId).trim(),
      action: mapAction(input.action),
      trackingToken: input.trackingToken,
      metadata: {
        ...(input.metadata || {}),
        searchQuery: input.query ? String(input.query).slice(0, 200) : undefined,
        position: input.position,
        searchRequestId: input.requestId,
        searchSurface: input.surface || 'search_results',
        searchAction: input.action
      }
    });

    // Strong negatives: invalidate viewer search caches + soft realtime refresh
    if (['hide', 'not_interested', 'dismiss', 'report'].includes(input.action)) {
      invalidateSearchCacheForViewer(input.viewerId, `feedback_${input.action}`);
      emitSearchInvalidation({
        viewerId: input.viewerId,
        reason: `feedback_${input.action}`,
        entityType: input.entityType,
        entityId: input.entityId
      });
    }

    return data;
  } catch (err: any) {
    recordSearchMetric('feedback_forward_error', 1);
    // Soft-fail: do not throw Discovery internal errors as 500 for abuse vectors when skipped
    const msg = String(err?.message || 'feedback_failed');
    if (/required|invalid/i.test(msg)) {
      throw new SearchContractError('VALIDATION_ERROR', msg);
    }
    return { ok: false, skipped: true, reason: 'discovery_feedback_error' };
  }
};

type DiscoveryEntityTypeSafe = DiscoveryFeedbackInput['entityType'];

export const resetSearchFeedbackStateForTests = () => {
  rateByViewer.clear();
  dedupeKeys.clear();
};
