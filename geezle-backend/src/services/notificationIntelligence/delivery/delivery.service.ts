/**
 * Notification Delivery service — Phase 10.5 dark launch.
 * Builds a DeliveryPlan only. Never sends, enqueues, or mutates producers.
 */
import { resolveNotificationIntelRolloutFlags } from '../rollout/rollout';
import { listChannelCapabilities, listPlaceholderChannels, isKnownDeliveryChannel } from './delivery.channels';
import {
  buildRuleContext,
  evaluateChannelEligibility,
  evaluateGlobalSuppression,
  evaluatePreferenceGate,
  evaluatePriorityCompatibility
} from './delivery.rules';
import {
  scheduleChannel,
  aggregatePlanTiming,
  resolveRetryPolicy
} from './delivery.scheduler';
import {
  startDeliveryTimer,
  recordDeliveryMetric,
  logDeliveryPlan
} from './delivery.observability';
import type {
  DeliveryChannelDecision,
  DeliveryChannelKey,
  DeliveryEngineDiagnostics,
  DeliveryEvaluationInput,
  DeliveryPlan
} from './delivery.types';
import { ALL_DELIVERY_CHANNELS } from './delivery.types';

const isDeliveryFeatureActive = () => {
  const flags = resolveNotificationIntelRolloutFlags();
  return Boolean(flags.master && flags.delivery);
};

const newPlanId = () =>
  `dplan_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

const resolveChannels = (requested?: DeliveryChannelKey[] | null): DeliveryChannelKey[] => {
  if (!requested || !requested.length) return [...ALL_DELIVERY_CHANNELS];
  const out: DeliveryChannelKey[] = [];
  for (const c of requested) {
    if (isKnownDeliveryChannel(c) && !out.includes(c)) out.push(c);
  }
  return out.length ? out : [...ALL_DELIVERY_CHANNELS];
};

const inactivePlan = (input: DeliveryEvaluationInput): DeliveryPlan => {
  const createdAt = new Date().toISOString();
  return {
    planId: newPlanId(),
    userId: String(input.userId || ''),
    notificationId: input.notificationId ? String(input.notificationId) : null,
    engineActive: false,
    reason: 'delivery_engine_inactive',
    channels: [],
    selectedChannels: [],
    timing: {
      mode: 'immediate',
      scheduledFor: null,
      quietHoursActive: false,
      batchEligible: false
    },
    suppression: { suppressed: false, reasons: ['delivery_engine_inactive'] },
    retry: { eligible: false, maxAttempts: 0, backoffMs: null },
    batch: { eligible: false, reason: 'engine_inactive' },
    preferenceCompatibility: {
      applied: false,
      globalEnabled: null,
      categoryEnabled: null,
      notes: ['not_evaluated_engine_inactive']
    },
    priorityCompatibility: {
      applied: false,
      band: null,
      score: null,
      notes: ['not_evaluated_engine_inactive']
    },
    quietHoursCompatibility: {
      applied: false,
      active: false,
      notes: ['not_evaluated_engine_inactive']
    },
    executed: false,
    diagnostics: { channelCount: 0, eligibleCount: 0, placeholderCount: 0 },
    createdAt
  };
};

export class NotificationDeliveryService {
  isEngineActive() {
    return isDeliveryFeatureActive();
  }

  /**
   * Build a delivery strategy plan. Never executes delivery.
   */
  plan(input: DeliveryEvaluationInput): DeliveryPlan {
    const end = startDeliveryTimer('plan');
    recordDeliveryMetric('plan', 1);
    try {
      if (!isDeliveryFeatureActive()) {
        recordDeliveryMetric('plan_inactive', 1);
        return inactivePlan(input);
      }

      const userId = String(input.userId || '').trim();
      if (!userId) {
        const empty = inactivePlan(input);
        return {
          ...empty,
          engineActive: true,
          reason: 'validation_defaults',
          suppression: { suppressed: true, reasons: ['userId_required'] },
          preferenceCompatibility: {
            applied: false,
            globalEnabled: null,
            categoryEnabled: null,
            notes: ['validation_failed']
          },
          priorityCompatibility: {
            applied: false,
            band: null,
            score: null,
            notes: ['validation_failed']
          },
          quietHoursCompatibility: {
            applied: false,
            active: false,
            notes: ['validation_failed']
          }
        };
      }

      const ctx = buildRuleContext(input);
      const global = evaluateGlobalSuppression(ctx);
      const prefGate = evaluatePreferenceGate(ctx);
      const pri = evaluatePriorityCompatibility(ctx);
      const channelKeys = resolveChannels(input.requestedChannels);

      const channels: DeliveryChannelDecision[] = channelKeys.map((channel) => {
        const base = evaluateChannelEligibility(channel, ctx, global);
        const timed = scheduleChannel(channel, ctx, base, input.now);
        return {
          channel,
          eligible: base.eligible && timed.timing !== 'suppressed',
          status: timed.status,
          timing: timed.timing,
          scheduledFor: timed.scheduledFor,
          retryEligible: base.retryEligible && base.eligible,
          batchEligible: timed.batchEligible,
          reasons: timed.reasons
        };
      });

      // Quiet-hours deferral: channel remains "eligible" as planned deferred delivery
      for (const ch of channels) {
        if (ch.status === 'deferred' && ch.timing === 'scheduled') {
          ch.eligible = true;
        }
      }

      const timing = aggregatePlanTiming(channels);
      const selectedChannels = channels.filter((c) => c.eligible).map((c) => c.channel);
      const anyEligible = selectedChannels.length > 0;
      const retry = resolveRetryPolicy(pri.band, anyEligible);

      const quietActive = Boolean(ctx.quietHours.active);
      const fullySuppressed = global.suppressed || !anyEligible;

      const plan: DeliveryPlan = {
        planId: newPlanId(),
        userId,
        notificationId: input.notificationId ? String(input.notificationId) : null,
        engineActive: true,
        reason: fullySuppressed ? 'fully_suppressed' : 'planned',
        channels,
        selectedChannels,
        timing: {
          ...timing,
          quietHoursActive: quietActive || timing.quietHoursActive
        },
        suppression: {
          suppressed: fullySuppressed,
          reasons: fullySuppressed
            ? global.reasons.length
              ? global.reasons
              : ['no_eligible_channels']
            : []
        },
        retry,
        batch: {
          eligible: timing.batchEligible,
          reason: timing.batchEligible ? 'batch_window_or_low_priority' : 'not_batch_eligible'
        },
        preferenceCompatibility: {
          applied: true,
          globalEnabled: prefGate.globalEnabled,
          categoryEnabled: prefGate.categoryEnabled,
          notes: prefGate.notes
        },
        priorityCompatibility: {
          applied: Boolean(pri.band || pri.score != null),
          band: pri.band,
          score: pri.score,
          notes: pri.notes
        },
        quietHoursCompatibility: {
          applied: true,
          active: quietActive,
          notes: quietActive ? ['quiet_hours_active'] : ['quiet_hours_inactive']
        },
        executed: false,
        diagnostics: {
          channelCount: channels.length,
          eligibleCount: selectedChannels.length,
          placeholderCount: channels.filter((c) => c.status === 'placeholder').length
        },
        createdAt: new Date().toISOString()
      };

      if (resolveNotificationIntelRolloutFlags().diagnostics) {
        logDeliveryPlan(plan);
      }

      recordDeliveryMetric(fullySuppressed ? 'plan_suppressed' : 'plan_ok', 1);
      return plan;
    } finally {
      end();
    }
  }

  /** Batch plan builder — still no execution */
  planMany(inputs: DeliveryEvaluationInput[]): DeliveryPlan[] {
    const end = startDeliveryTimer('plan_many');
    recordDeliveryMetric('plan_many', 1);
    try {
      return (inputs || []).map((i) => this.plan(i));
    } finally {
      end();
    }
  }

  getDiagnostics(): DeliveryEngineDiagnostics {
    return {
      service: 'notification-delivery',
      engineActive: isDeliveryFeatureActive(),
      executed: false,
      supportedChannels: [...ALL_DELIVERY_CHANNELS],
      placeholders: listPlaceholderChannels(),
      defaultsOff: true,
      envKey: 'NOTIF_INTEL_DELIVERY'
    };
  }

  listChannels() {
    return listChannelCapabilities();
  }
}

export const notificationDeliveryService = new NotificationDeliveryService();
