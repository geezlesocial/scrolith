/**
 * Notification Event Integration service — Phase 10.6 dark launch.
 * EventEnvelope → NotificationEvaluationRequest only.
 * Does not publish notifications or execute delivery.
 */
import { resolveNotificationIntelRolloutFlags } from '../rollout/rollout';
import type { PreferenceCategoryKey } from '../preferences/preference.types';
import type { PreferenceEvaluationInput } from '../preferences/preference.types';
import type { PriorityEvaluationInput } from '../priority/priority.types';
import type { DeliveryEvaluationInput } from '../delivery/delivery.types';
import { applyDomainAdapter, listDomainEventAdapters } from './event.adapters';
import { mapEnvelopeToNotificationHints } from './event.mapping';
import {
  validateEventEnvelope,
  softValidateIssues,
  EventIntegrationValidationError
} from './event.validation';
import {
  startEventIntegrationTimer,
  recordEventIntegrationMetric,
  logEventIntegrationRequest
} from './event.observability';
import type {
  EventEnvelope,
  EventIntegrationDiagnostics,
  NotificationEvaluationRequest
} from './event.types';
import { ALL_EVENT_DOMAIN_SOURCES, PLACEHOLDER_EVENT_SOURCES } from './event.types';

const isEventIntegrationActive = () => {
  const flags = resolveNotificationIntelRolloutFlags();
  return Boolean(flags.master && flags.eventIntegration);
};

const newRequestId = () =>
  `ner_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;

/**
 * In-process idempotency window (dark launch).
 * No Prisma / Redis — process-local only; safe because flags default OFF
 * and layer does not publish.
 */
const IDEMPOTENCY_MAX = 5_000;
const seenIdempotency = new Map<string, number>();

const checkIdempotency = (key: string | null): { key: string | null; isDuplicate: boolean; checked: boolean } => {
  if (!key) return { key: null, isDuplicate: false, checked: false };
  const now = Date.now();
  // prune occasionally
  if (seenIdempotency.size > IDEMPOTENCY_MAX) {
    const cutoff = now - 60 * 60 * 1000;
    for (const [k, t] of seenIdempotency) {
      if (t < cutoff) seenIdempotency.delete(k);
    }
    // hard cap
    if (seenIdempotency.size > IDEMPOTENCY_MAX) {
      const keys = Array.from(seenIdempotency.keys()).slice(0, seenIdempotency.size - IDEMPOTENCY_MAX + 100);
      for (const k of keys) seenIdempotency.delete(k);
    }
  }
  if (seenIdempotency.has(key)) {
    return { key, isDuplicate: true, checked: true };
  }
  seenIdempotency.set(key, now);
  return { key, isDuplicate: false, checked: true };
};

/** Test helper */
export const resetEventIntegrationIdempotencyForTests = () => {
  seenIdempotency.clear();
};

const emptyHandoffs = () => ({
  preferenceHandoff: { inputs: [] as PreferenceEvaluationInput[], notes: ['not_built'] },
  priorityHandoff: { inputs: [] as PriorityEvaluationInput[], notes: ['not_built'] },
  deliveryHandoff: { inputs: [] as DeliveryEvaluationInput[], notes: ['not_built'] }
});

const inactiveRequest = (raw: unknown): NotificationEvaluationRequest => {
  let envelope: EventEnvelope | null = null;
  try {
    if (raw && typeof raw === 'object') {
      // best-effort parse without throwing for inactive path diagnostics
      envelope = validateEventEnvelope(raw);
    }
  } catch {
    envelope = null;
  }
  return {
    requestId: newRequestId(),
    engineActive: false,
    reason: 'event_integration_inactive',
    envelope,
    source: envelope?.source ?? null,
    eventType: envelope?.type ?? null,
    notificationType: null,
    category: null,
    actorId: envelope?.actor?.id ?? null,
    actorType: envelope?.actor?.type ?? null,
    recipientIds: (envelope?.recipients || []).map((r) => r.userId),
    entityType: envelope?.entity?.type ?? null,
    entityId: envelope?.entity?.id ?? null,
    parentId: envelope?.entity?.parentId ?? null,
    correlationId: envelope?.correlationId ?? null,
    traceId: envelope?.traceId ?? null,
    idempotencyKey: envelope?.idempotencyKey ?? null,
    idempotency: { key: envelope?.idempotencyKey ?? null, isDuplicate: false, checked: false },
    permissions: {
      required: envelope?.permissions?.required || [],
      audience: envelope?.permissions?.audience ?? null,
      visibility: envelope?.permissions?.visibility ?? null,
      propagated: false
    },
    ...emptyHandoffs(),
    mapping: { adapter: null, confidence: 'none', notes: ['engine_inactive'] },
    issues: [],
    published: false,
    executed: false,
    createdAt: new Date().toISOString()
  };
};

const buildHandoffs = (
  envelope: EventEnvelope,
  recipientIds: string[],
  notificationType: string,
  category: PreferenceCategoryKey | 'unknown',
  actorId: string | null
) => {
  const prefInputs: PreferenceEvaluationInput[] = recipientIds.map((userId) => ({
    userId,
    category: (category === 'unknown' ? 'system' : category) as PreferenceCategoryKey,
    channel: 'inApp' as const,
    legacyEngagementType: notificationType
  }));

  const priorityInputs: PriorityEvaluationInput[] = recipientIds.map((userId) => ({
    userId,
    type: notificationType,
    category: category === 'unknown' ? null : category,
    actorId,
    createdAt: envelope.occurredAt,
    meta: {
      eventId: envelope.eventId,
      source: envelope.source,
      correlationId: envelope.correlationId,
      traceId: envelope.traceId
    }
  }));

  const deliveryInputs: DeliveryEvaluationInput[] = recipientIds.map((userId) => ({
    userId,
    notificationId: null,
    type: notificationType,
    category: category === 'unknown' ? null : category,
    createdAt: envelope.occurredAt
  }));

  return {
    preferenceHandoff: {
      inputs: prefInputs,
      notes: ['handoff_for_preference_evaluate_when_enabled']
    },
    priorityHandoff: {
      inputs: priorityInputs,
      notes: ['handoff_for_priority_evaluate_when_enabled']
    },
    deliveryHandoff: {
      inputs: deliveryInputs,
      notes: ['handoff_for_delivery_plan_when_enabled']
    }
  };
};

export class NotificationEventIntegrationService {
  isEngineActive() {
    return isEventIntegrationActive();
  }

  /**
   * Integrate a single EventEnvelope into a NotificationEvaluationRequest.
   * Never publishes or executes delivery.
   */
  integrate(raw: unknown): NotificationEvaluationRequest {
    const end = startEventIntegrationTimer('integrate');
    recordEventIntegrationMetric('integrate', 1);
    try {
      if (!isEventIntegrationActive()) {
        recordEventIntegrationMetric('integrate_inactive', 1);
        return inactiveRequest(raw);
      }

      let envelope: EventEnvelope;
      try {
        envelope = validateEventEnvelope(raw);
      } catch (err) {
        recordEventIntegrationMetric('integrate_validation_failed', 1);
        const issues =
          err instanceof EventIntegrationValidationError
            ? err.issues
            : [{ code: 'validation_error', message: String((err as Error)?.message || err) }];
        return {
          requestId: newRequestId(),
          engineActive: true,
          reason: 'validation_failed',
          envelope: null,
          source: null,
          eventType: null,
          notificationType: null,
          category: null,
          actorId: null,
          actorType: null,
          recipientIds: [],
          entityType: null,
          entityId: null,
          parentId: null,
          correlationId: null,
          traceId: null,
          idempotencyKey: null,
          idempotency: { key: null, isDuplicate: false, checked: false },
          permissions: {
            required: [],
            audience: null,
            visibility: null,
            propagated: false
          },
          ...emptyHandoffs(),
          mapping: { adapter: null, confidence: 'none', notes: ['validation_failed'] },
          issues,
          published: false,
          executed: false,
          createdAt: new Date().toISOString()
        };
      }

      // Domain adapter enrichment
      const adapted = applyDomainAdapter(envelope);
      envelope = adapted.envelope;

      // Idempotency
      const idemKey =
        envelope.idempotencyKey ||
        `${envelope.source}:${envelope.type}:${envelope.eventId}`;
      const idempotency = checkIdempotency(idemKey);
      if (idempotency.isDuplicate) {
        recordEventIntegrationMetric('integrate_duplicate', 1);
        return {
          requestId: newRequestId(),
          engineActive: true,
          reason: 'duplicate_idempotency',
          envelope,
          source: envelope.source,
          eventType: envelope.type,
          notificationType: null,
          category: null,
          actorId: envelope.actor?.id ?? null,
          actorType: envelope.actor?.type ?? null,
          recipientIds: (envelope.recipients || []).map((r) => r.userId),
          entityType: envelope.entity?.type ?? null,
          entityId: envelope.entity?.id ?? null,
          parentId: envelope.entity?.parentId ?? null,
          correlationId: envelope.correlationId ?? null,
          traceId: envelope.traceId ?? null,
          idempotencyKey: idemKey,
          idempotency,
          permissions: {
            required: envelope.permissions?.required || [],
            audience: envelope.permissions?.audience ?? null,
            visibility: envelope.permissions?.visibility ?? null,
            propagated: true
          },
          ...emptyHandoffs(),
          mapping: {
            adapter: adapted.adapterName,
            confidence: 'none',
            notes: ['duplicate_skip']
          },
          issues: [
            {
              code: 'duplicate_idempotency',
              message: `Duplicate idempotency key: ${idemKey}`
            }
          ],
          published: false,
          executed: false,
          createdAt: new Date().toISOString()
        };
      }

      const mapping = mapEnvelopeToNotificationHints(envelope);
      const issues = softValidateIssues(envelope);
      const recipientIds = (envelope.recipients || [])
        .map((r) => r.userId)
        .filter(Boolean)
        // exclude actor self-notify by default unless system
        .filter((id) => {
          if (!envelope.actor?.id) return true;
          if (envelope.actor.type === 'system') return true;
          return id !== envelope.actor.id;
        });

      // Re-include if all filtered and only actor was recipient (system self)
      const rawRecipients = (envelope.recipients || []).map((r) => r.userId);
      const finalRecipients = recipientIds.length
        ? recipientIds
        : mapping.category === 'system'
          ? rawRecipients
          : rawRecipients.filter((id) => id !== envelope.actor?.id);

      let reason: NotificationEvaluationRequest['reason'] = 'mapped';
      if (mapping.isPlaceholderSource) reason = 'placeholder_source';
      else if (!finalRecipients.length) reason = 'no_recipients';
      else if (mapping.confidence === 'none') reason = 'unsupported_mapping';

      const handoffs = finalRecipients.length
        ? buildHandoffs(
            envelope,
            finalRecipients,
            mapping.notificationType,
            mapping.category,
            envelope.actor?.id ?? null
          )
        : emptyHandoffs();

      if (!finalRecipients.length) {
        handoffs.preferenceHandoff.notes = ['no_recipients'];
        handoffs.priorityHandoff.notes = ['no_recipients'];
        handoffs.deliveryHandoff.notes = ['no_recipients'];
      }

      const req: NotificationEvaluationRequest = {
        requestId: newRequestId(),
        engineActive: true,
        reason,
        envelope,
        source: envelope.source,
        eventType: envelope.type,
        notificationType: mapping.notificationType,
        category: mapping.category,
        actorId: envelope.actor?.id ?? null,
        actorType: envelope.actor?.type ?? null,
        recipientIds: finalRecipients,
        entityType: envelope.entity?.type ?? null,
        entityId: envelope.entity?.id ?? null,
        parentId: envelope.entity?.parentId ?? null,
        correlationId: envelope.correlationId ?? null,
        traceId: envelope.traceId ?? null,
        idempotencyKey: idemKey,
        idempotency,
        permissions: {
          required: envelope.permissions?.required || [],
          audience: envelope.permissions?.audience ?? null,
          visibility: envelope.permissions?.visibility ?? null,
          propagated: true
        },
        ...handoffs,
        mapping: {
          adapter: adapted.adapterName,
          confidence: mapping.confidence,
          notes: [
            ...mapping.notes,
            ...(adapted.placeholder ? ['adapter_placeholder'] : [])
          ]
        },
        issues,
        published: false,
        executed: false,
        createdAt: new Date().toISOString()
      };

      if (resolveNotificationIntelRolloutFlags().diagnostics) {
        logEventIntegrationRequest(req);
      }

      recordEventIntegrationMetric(`integrate_${reason}`, 1);
      return req;
    } finally {
      end();
    }
  }

  integrateMany(raws: unknown[]): NotificationEvaluationRequest[] {
    const end = startEventIntegrationTimer('integrate_many');
    recordEventIntegrationMetric('integrate_many', 1);
    try {
      return (raws || []).map((r) => this.integrate(r));
    } finally {
      end();
    }
  }

  getDiagnostics(): EventIntegrationDiagnostics {
    return {
      service: 'notification-event-integration',
      engineActive: isEventIntegrationActive(),
      published: false,
      executed: false,
      supportedSources: [...ALL_EVENT_DOMAIN_SOURCES],
      placeholderSources: [...PLACEHOLDER_EVENT_SOURCES],
      defaultsOff: true,
      envKey: 'NOTIF_INTEL_EVENT_INTEGRATION'
    };
  }

  listAdapters() {
    return listDomainEventAdapters();
  }
}

export const notificationEventIntegrationService = new NotificationEventIntegrationService();
export { EventIntegrationValidationError };
