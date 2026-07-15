/**
 * Event integration observability (Phase 10.6).
 */
import {
  recordNotifIntelMetric,
  startNotifIntelTimer,
  logNotifIntelLifecycle,
  getNotifIntelMetricsSnapshot
} from '../observability/observability';
import type { NotificationEvaluationRequest } from './event.types';

export const startEventIntegrationTimer = (name: string) =>
  startNotifIntelTimer(`event_integration_${name}`);

export const recordEventIntegrationMetric = (name: string, delta = 1) =>
  recordNotifIntelMetric(`event_integration_${name}`, delta);

export const logEventIntegrationRequest = (
  req: NotificationEvaluationRequest,
  requestId?: string | null
) => {
  logNotifIntelLifecycle({
    requestId: requestId || req.requestId,
    phase: 'event_integration',
    extra: {
      reason: req.reason,
      engineActive: req.engineActive,
      source: req.source,
      eventType: req.eventType,
      recipients: req.recipientIds.length,
      duplicate: req.idempotency.isDuplicate,
      published: req.published,
      executed: req.executed
    }
  });
};

export const getEventIntegrationMetricsSnapshot = () => {
  const snap = getNotifIntelMetricsSnapshot();
  const counts: Record<string, number> = {};
  for (const [k, v] of Object.entries(snap.counts || {})) {
    if (k.startsWith('event_integration_')) counts[k] = v;
  }
  const latency: typeof snap.latency = {};
  for (const [k, v] of Object.entries(snap.latency || {})) {
    if (k.startsWith('event_integration_')) latency[k] = v;
  }
  return { counts, latency, at: snap.at };
};
