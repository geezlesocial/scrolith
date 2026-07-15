/**
 * Delivery-engine observability (Phase 10.5).
 * Thin wrappers over NI metrics — no external telemetry providers.
 */
import {
  recordNotifIntelMetric,
  startNotifIntelTimer,
  logNotifIntelLifecycle,
  getNotifIntelMetricsSnapshot
} from '../observability/observability';
import type { DeliveryPlan } from './delivery.types';

export const startDeliveryTimer = (name: string) => startNotifIntelTimer(`delivery_${name}`);

export const recordDeliveryMetric = (name: string, delta = 1) =>
  recordNotifIntelMetric(`delivery_${name}`, delta);

export const logDeliveryPlan = (plan: DeliveryPlan, requestId?: string | null) => {
  logNotifIntelLifecycle({
    requestId,
    phase: 'delivery_plan',
    extra: {
      planId: plan.planId,
      engineActive: plan.engineActive,
      reason: plan.reason,
      selected: plan.selectedChannels,
      mode: plan.timing.mode,
      suppressed: plan.suppression.suppressed,
      executed: plan.executed
    }
  });
};

export const getDeliveryMetricsSnapshot = () => {
  const snap = getNotifIntelMetricsSnapshot();
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(snap.counts || {})) {
    if (k.startsWith('delivery_')) counts[k] = v;
  }
  const latency: typeof snap.latency = {};
  for (const [k, v] of Object.entries(snap.latency || {})) {
    if (k.startsWith('delivery_')) latency[k] = v;
  }
  return { counts, latency, at: snap.at };
};
