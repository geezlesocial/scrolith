/**
 * Delivery timing / schedule helpers (Phase 10.5).
 * Plans immediate vs scheduled only — no Cloud Tasks, no queues, no sends.
 */
import type { PriorityBand } from '../priority/priority.types';
import { getChannelCapability } from './delivery.channels';
import {
  evaluateQuietHoursGate,
  evaluatePriorityCompatibility,
  type DeliveryRuleContext
} from './delivery.rules';
import type {
  DeliveryChannelDecision,
  DeliveryChannelKey,
  DeliveryTimingMode
} from './delivery.types';

const parseNow = (value: Date | string | null | undefined): Date => {
  if (!value) return new Date();
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value : new Date();
  const t = Date.parse(String(value));
  return Number.isFinite(t) ? new Date(t) : new Date();
};

/** Default quiet-hours deferral: next top of hour + 1h (plan placeholder) */
export const computeQuietHoursDeferral = (
  now: Date,
  endsAt?: string | null
): string => {
  if (endsAt) {
    const t = Date.parse(endsAt);
    if (Number.isFinite(t) && t > now.getTime()) return new Date(t).toISOString();
  }
  const d = new Date(now.getTime());
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  // ensure at least 30 minutes out
  if (d.getTime() - now.getTime() < 30 * 60 * 1000) {
    d.setHours(d.getHours() + 1);
  }
  return d.toISOString();
};

export type ScheduleChannelResult = {
  timing: DeliveryTimingMode;
  scheduledFor: string | null;
  status: DeliveryChannelDecision['status'];
  reasons: string[];
  batchEligible: boolean;
};

/**
 * Apply quiet-hours + priority timing to an eligible channel decision.
 */
export const scheduleChannel = (
  channel: DeliveryChannelKey,
  ctx: DeliveryRuleContext,
  base: Pick<DeliveryChannelDecision, 'eligible' | 'status' | 'reasons' | 'retryEligible' | 'batchEligible'>,
  nowInput?: Date | string | null
): ScheduleChannelResult => {
  const now = parseNow(nowInput);
  const reasons = [...base.reasons];
  const cap = getChannelCapability(channel);

  if (!base.eligible) {
    return {
      timing: 'suppressed',
      scheduledFor: null,
      status: base.status,
      reasons,
      batchEligible: false
    };
  }

  const qh = evaluateQuietHoursGate(ctx, channel);
  reasons.push(...qh.notes);

  const pri = evaluatePriorityCompatibility(ctx);
  const highPriority = pri.band === 'critical' || pri.band === 'high';

  // Quiet hours: defer external channels; in-app stays immediate (recorded in-app)
  if (qh.blocked && cap.supportsQuietHours) {
    const scheduledFor = computeQuietHoursDeferral(now, ctx.quietHours.endsAt || null);
    return {
      timing: 'scheduled',
      scheduledFor,
      status: 'deferred',
      reasons: [...reasons, 'scheduled_for_quiet_hours_end'],
      batchEligible: cap.supportsBatch
    };
  }

  // Low priority external placeholders → batch-eligible scheduled window (plan only)
  if (pri.deferExternal && channel !== 'in_app' && cap.supportsSchedule) {
    const d = new Date(now.getTime() + 15 * 60 * 1000);
    return {
      timing: 'scheduled',
      scheduledFor: d.toISOString(),
      status: base.status === 'placeholder' ? 'placeholder' : 'deferred',
      reasons: [...reasons, 'scheduled_low_priority_batch_window'],
      batchEligible: true
    };
  }

  // High priority / default: immediate plan
  if (highPriority) {
    reasons.push('immediate_high_priority');
  } else {
    reasons.push('immediate_default');
  }

  return {
    timing: 'immediate',
    scheduledFor: null,
    status: base.status,
    reasons,
    batchEligible: base.batchEligible
  };
};

/** Aggregate plan-level timing from channel decisions */
export const aggregatePlanTiming = (
  channels: DeliveryChannelDecision[]
): {
  mode: DeliveryTimingMode;
  scheduledFor: string | null;
  quietHoursActive: boolean;
  batchEligible: boolean;
} => {
  const eligible = channels.filter((c) => c.eligible);
  if (!eligible.length) {
    return {
      mode: 'suppressed',
      scheduledFor: null,
      quietHoursActive: channels.some((c) => c.reasons.includes('quiet_hours_active_defer')),
      batchEligible: false
    };
  }

  const anyImmediate = eligible.some((c) => c.timing === 'immediate');
  const scheduled = eligible.filter((c) => c.timing === 'scheduled' && c.scheduledFor);
  const earliest =
    scheduled
      .map((c) => c.scheduledFor as string)
      .sort()[0] || null;

  return {
    mode: anyImmediate ? 'immediate' : scheduled.length ? 'scheduled' : 'immediate',
    scheduledFor: anyImmediate ? null : earliest,
    quietHoursActive: channels.some((c) => c.reasons.some((r) => r.includes('quiet_hours'))),
    batchEligible: eligible.some((c) => c.batchEligible)
  };
};

/** Retry policy placeholders by priority band */
export const resolveRetryPolicy = (
  band: PriorityBand | null | undefined,
  anyEligible: boolean
): { eligible: boolean; maxAttempts: number; backoffMs: number | null } => {
  if (!anyEligible) return { eligible: false, maxAttempts: 0, backoffMs: null };
  switch (band) {
    case 'critical':
      return { eligible: true, maxAttempts: 5, backoffMs: 30_000 };
    case 'high':
      return { eligible: true, maxAttempts: 3, backoffMs: 60_000 };
    case 'normal':
      return { eligible: true, maxAttempts: 2, backoffMs: 120_000 };
    case 'low':
    case 'background':
      return { eligible: true, maxAttempts: 1, backoffMs: 300_000 };
    default:
      return { eligible: true, maxAttempts: 2, backoffMs: 120_000 };
  }
};
