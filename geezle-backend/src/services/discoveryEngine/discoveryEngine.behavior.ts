/**
 * Behavioral signal quality — semantics, dwell thresholds, dedupe, decay.
 * Does not infer negative preference from a single non-click impression.
 */
import type { DiscoveryFeedbackAction } from './discoveryEngine.types';

export type BehavioralEvent =
  | 'impression'
  | 'qualified_dwell'
  | 'click'
  | 'open'
  | 'save'
  | 'share'
  | 'meaningful_comment'
  | 'completed_video'
  | 'profile_visit'
  | 'follow'
  | 'connect'
  | 'apply'
  | 'inquiry'
  | 'hide'
  | 'not_interested'
  | 'report';

export const POSITIVE_WEIGHT: Partial<Record<BehavioralEvent, number>> = {
  qualified_dwell: 0.15,
  click: 0.25,
  open: 0.2,
  save: 0.35,
  share: 0.4,
  meaningful_comment: 0.45,
  completed_video: 0.35,
  profile_visit: 0.2,
  follow: 0.5,
  connect: 0.55,
  apply: 0.6,
  inquiry: 0.55
};

export const NEGATIVE_WEIGHT: Partial<Record<BehavioralEvent, number>> = {
  hide: 0.7,
  not_interested: 0.65,
  report: 1
};

/** Minimum dwell ms before qualified_dwell is accepted */
export const MIN_QUALIFIED_DWELL_MS = 1_800;

/** Accidental click window — rapid open+back suppressed in client metadata */
export const ACCIDENTAL_CLICK_MS = 400;

export const normalizeBehavioralAction = (raw: string): BehavioralEvent | null => {
  const a = String(raw || '').trim().toLowerCase();
  if (a === 'dismiss') return 'not_interested';
  if (a === 'not_interested') return 'not_interested';
  if (
    [
      'impression',
      'qualified_dwell',
      'click',
      'open',
      'save',
      'share',
      'meaningful_comment',
      'completed_video',
      'profile_visit',
      'follow',
      'connect',
      'apply',
      'inquiry',
      'hide',
      'report'
    ].includes(a)
  ) {
    return a as BehavioralEvent;
  }
  return null;
};

export const mapToRecoLogAction = (event: BehavioralEvent): string => {
  if (event === 'not_interested') return 'dismiss';
  if (event === 'impression') return 'impression';
  if (event === 'hide' || event === 'report' || event === 'follow' || event === 'click') return event;
  if (event === 'save' || event === 'share' || event === 'apply' || event === 'inquiry' || event === 'open') {
    return 'click';
  }
  if (event === 'qualified_dwell' || event === 'profile_visit' || event === 'completed_video') return 'click';
  if (event === 'meaningful_comment' || event === 'connect') return 'click';
  return 'click';
};

export type FeedbackQualityInput = {
  action: string;
  metadata?: Record<string, unknown>;
  hadImpression?: boolean;
};

export type FeedbackQualityResult = {
  accept: boolean;
  event: BehavioralEvent | null;
  weight: number;
  reason?: string;
};

export const evaluateFeedbackQuality = (input: FeedbackQualityInput): FeedbackQualityResult => {
  const event = normalizeBehavioralAction(input.action);
  if (!event) return { accept: false, event: null, weight: 0, reason: 'unknown_action' };

  const meta = input.metadata || {};
  const dwellMs = Number(meta.dwellMs || meta.dwell_ms || 0);
  const openDurationMs = Number(meta.openDurationMs || meta.durationMs || 0);

  if (event === 'qualified_dwell' && dwellMs < MIN_QUALIFIED_DWELL_MS) {
    return { accept: false, event, weight: 0, reason: 'dwell_too_short' };
  }

  // Accidental click: very short open
  if (event === 'click' && openDurationMs > 0 && openDurationMs < ACCIDENTAL_CLICK_MS) {
    return { accept: false, event, weight: 0, reason: 'accidental_click' };
  }

  // Do not accept negative non-engagement without prior impression in same session
  if ((event === 'not_interested' || event === 'hide') && input.hadImpression === false) {
    // Soft allow hide/not_interested without impression (explicit user action)
    // but down-weight
    const w = (NEGATIVE_WEIGHT[event] || 0.5) * 0.7;
    return { accept: true, event, weight: w };
  }

  if (NEGATIVE_WEIGHT[event] !== undefined) {
    return { accept: true, event, weight: NEGATIVE_WEIGHT[event]! };
  }
  if (POSITIVE_WEIGHT[event] !== undefined) {
    let w = POSITIVE_WEIGHT[event]!;
    // Cap family contribution later; per-event max 1
    if (event === 'click' && dwellMs >= MIN_QUALIFIED_DWELL_MS) w = Math.min(0.4, w + 0.1);
    return { accept: true, event, weight: w };
  }

  if (event === 'impression') {
    return { accept: true, event, weight: 0 };
  }

  return { accept: true, event, weight: 0.1 };
};

/** Session-aware affinity decay by age days */
export const decayAffinity = (weight: number, ageDays: number): number => {
  const halfLife = 21;
  const factor = Math.exp(-Math.max(0, ageDays) / halfLife);
  return Math.max(0, Math.min(1, weight * factor));
};

export type DiscoveryFeedbackActionCompat = DiscoveryFeedbackAction | BehavioralEvent;
