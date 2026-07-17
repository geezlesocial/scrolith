/**
 * Phase 10.6 — Notification Event Integration contracts (dark launch).
 * Consumes EventEnvelope → NotificationEvaluationRequest only.
 * Does not publish notifications, execute delivery, or migrate producers.
 */

import type { PreferenceCategoryKey } from '../preferences/preference.types';
import type { PreferenceEvaluationInput } from '../preferences/preference.types';
import type { PriorityEvaluationInput } from '../priority/priority.types';
import type { DeliveryEvaluationInput } from '../delivery/delivery.types';

/** Domain sources that may emit envelopes for NI (future bus wiring) */
export type EventDomainSource =
  | 'messaging'
  | 'posts'
  | 'comments'
  | 'reactions'
  | 'follows'
  | 'jobs'
  | 'marketplace'
  | 'communities'
  | 'companies'
  | 'system'
  | 'scrolitha'
  | 'discovery'
  | 'search'
  | 'unknown';

/** Standardized platform event envelope (Phase 10.0.5+ contract, implemented for NI in 10.6) */
export type EventEnvelope = {
  /** Unique event id from producer */
  eventId: string;
  /** Domain / system name */
  source: EventDomainSource | string;
  /** Stable event type, e.g. messaging.message.created */
  type: string;
  /** ISO-8601 timestamp */
  occurredAt: string;
  /** Actor who caused the event (may be system) */
  actor?: {
    id?: string | null;
    type?: 'user' | 'system' | 'service' | string | null;
    displayName?: string | null;
  } | null;
  /** Primary entity */
  entity?: {
    type?: string | null;
    id?: string | null;
    parentId?: string | null;
  } | null;
  /** Intended recipients when known by producer */
  recipients?: Array<{
    userId: string;
    role?: string | null;
  }> | null;
  /** Opaque payload */
  payload?: Record<string, unknown> | null;
  /** Permission / ACL hints for downstream evaluation */
  permissions?: {
    required?: string[] | null;
    audience?: 'self' | 'followers' | 'connections' | 'public' | 'system' | string | null;
    visibility?: string | null;
  } | null;
  /** Correlation / tracing */
  correlationId?: string | null;
  traceId?: string | null;
  /** Dedup key for at-least-once bus delivery */
  idempotencyKey?: string | null;
  /** Schema version for forward compatibility */
  schemaVersion?: string | number | null;
  meta?: Record<string, unknown> | null;
};

export type EventIntegrationIssue = {
  code: string;
  message: string;
  path?: string;
};

/** Preference handoff slice embedded in evaluation request */
export type PreferenceHandoff = {
  inputs: PreferenceEvaluationInput[];
  notes: string[];
};

/** Priority handoff — ready for priority.evaluate when that flag is also on */
export type PriorityHandoff = {
  inputs: PriorityEvaluationInput[];
  notes: string[];
};

/** Delivery handoff — ready for delivery.plan when that flag is also on */
export type DeliveryHandoff = {
  inputs: DeliveryEvaluationInput[];
  notes: string[];
};

/**
 * Sole output of the event integration layer (Phase 10.6).
 * Must not imply that a notification was created or delivered.
 */
export type NotificationEvaluationRequest = {
  requestId: string;
  engineActive: boolean;
  reason:
    | 'mapped'
    | 'event_integration_inactive'
    | 'validation_failed'
    | 'duplicate_idempotency'
    | 'no_recipients'
    | 'placeholder_source'
    | 'unsupported_mapping';
  /** Validated envelope snapshot (normalized) */
  envelope: EventEnvelope | null;
  source: EventDomainSource | string | null;
  eventType: string | null;
  /** Mapped NI notification type hint */
  notificationType: string | null;
  category: PreferenceCategoryKey | 'unknown' | null;
  actorId: string | null;
  actorType: string | null;
  recipientIds: string[];
  entityType: string | null;
  entityId: string | null;
  parentId: string | null;
  correlationId: string | null;
  traceId: string | null;
  idempotencyKey: string | null;
  idempotency: {
    key: string | null;
    isDuplicate: boolean;
    checked: boolean;
  };
  permissions: {
    required: string[];
    audience: string | null;
    visibility: string | null;
    propagated: boolean;
  };
  preferenceHandoff: PreferenceHandoff;
  priorityHandoff: PriorityHandoff;
  deliveryHandoff: DeliveryHandoff;
  mapping: {
    adapter: string | null;
    confidence: 'high' | 'medium' | 'low' | 'none';
    notes: string[];
  };
  issues: EventIntegrationIssue[];
  /**
   * Always false in Phase 10.6 — must not publish notifications.
   */
  published: false;
  /**
   * Always false in Phase 10.6 — must not execute delivery.
   */
  executed: false;
  createdAt: string;
};

export type EventIntegrationDiagnostics = {
  service: 'notification-event-integration';
  engineActive: boolean;
  published: false;
  executed: false;
  supportedSources: EventDomainSource[];
  placeholderSources: EventDomainSource[];
  defaultsOff: true;
  envKey: 'NOTIF_INTEL_EVENT_INTEGRATION';
};

export const ALL_EVENT_DOMAIN_SOURCES: EventDomainSource[] = [
  'messaging',
  'posts',
  'comments',
  'reactions',
  'follows',
  'jobs',
  'marketplace',
  'communities',
  'companies',
  'system',
  'scrolitha',
  'discovery',
  'search',
  'unknown'
];

export const PLACEHOLDER_EVENT_SOURCES: EventDomainSource[] = [
  'scrolitha',
  'discovery',
  'search'
];
