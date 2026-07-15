/**
 * Notification Priority service — Phase 10.4 dark launch.
 * Returns priority evaluation only; never reorders lists or changes delivery.
 */
import {
  resolveNotificationIntelRolloutFlags
} from '../rollout/rollout';
import {
  recordNotifIntelMetric,
  startNotifIntelTimer,
  logNotifIntelLifecycle
} from '../observability/observability';
import { computePriorityEvaluation } from './priority.evaluation';
import {
  emptyDiscoveryPrioritySignals,
  emptyScrolithaPrioritySignals,
  applyPriorityOrderingPlaceholder
} from './priority.placeholders';
import type {
  PriorityEvaluationInput,
  PriorityEvaluationResult,
  PriorityEngineDiagnostics,
  PriorityBand
} from './priority.types';
import { ALL_PRIORITY_BANDS, ALL_PRIORITY_FACTOR_KEYS } from './priority.types';

const isPriorityFeatureActive = () => {
  const flags = resolveNotificationIntelRolloutFlags();
  return Boolean(flags.master && flags.priority);
};

export class NotificationPriorityService {
  isEngineActive() {
    return isPriorityFeatureActive();
  }

  /**
   * Evaluate importance for a single notification-shaped input.
   * When flags OFF: returns inactive defaults (normal / 0.5) with orderingApplied:false.
   */
  evaluate(input: PriorityEvaluationInput): PriorityEvaluationResult {
    const end = startNotifIntelTimer('priority_evaluate');
    recordNotifIntelMetric('priority_evaluate', 1);
    try {
      const active = isPriorityFeatureActive();
      if (!active) {
        recordNotifIntelMetric('priority_evaluate_inactive', 1);
      }
      const result = computePriorityEvaluation(input, { engineActive: active });

      if (active && resolveNotificationIntelRolloutFlags().diagnostics) {
        logNotifIntelLifecycle({
          phase: 'priority_evaluate',
          extra: {
            band: result.band,
            score: result.score,
            userId: input.userId,
            type: input.type || null
          }
        });
      }

      return result;
    } finally {
      end();
    }
  }

  /**
   * Batch evaluate (parallel pure compute). Still does not reorder.
   */
  evaluateMany(inputs: PriorityEvaluationInput[]): PriorityEvaluationResult[] {
    const end = startNotifIntelTimer('priority_evaluate_many');
    recordNotifIntelMetric('priority_evaluate_many', 1);
    try {
      return (inputs || []).map((i) => this.evaluate(i));
    } finally {
      end();
    }
  }

  listBands(): PriorityBand[] {
    return [...ALL_PRIORITY_BANDS];
  }

  getDiagnostics(): PriorityEngineDiagnostics {
    return {
      service: 'notification-priority',
      engineActive: isPriorityFeatureActive(),
      orderingApplied: false,
      supportedBands: [...ALL_PRIORITY_BANDS],
      factorKeys: [...ALL_PRIORITY_FACTOR_KEYS],
      placeholders: ['discovery_signals', 'scrolitha_signals', 'list_reordering'],
      defaultsOff: true,
      envKey: 'NOTIF_INTEL_PRIORITY'
    };
  }

  /** Expose reserved signal builders for future dual-run wiring */
  placeholders() {
    return {
      discovery: emptyDiscoveryPrioritySignals,
      scrolitha: emptyScrolithaPrioritySignals,
      noReorder: applyPriorityOrderingPlaceholder
    };
  }
}

export const notificationPriorityService = new NotificationPriorityService();
