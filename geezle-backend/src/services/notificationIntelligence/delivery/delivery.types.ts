/**
 * Phase 10.5 — Notification Delivery Engine contracts (dark launch).
 * Plans delivery strategy only — does not send, enqueue, or migrate producers.
 */

import type { PreferenceCategoryKey } from '../preferences/preference.types';
import type { PriorityBand } from '../priority/priority.types';

/** Future-ready delivery channels */
export type DeliveryChannelKey =
  | 'in_app'
  | 'push'
  | 'email'
  | 'sms'
  | 'webhook'
  | 'future';

export type DeliveryTimingMode = 'immediate' | 'scheduled' | 'suppressed';

export type DeliveryChannelCapability = {
  channel: DeliveryChannelKey;
  /** Whether this channel can actually send today (only in_app is "ready" as plan target) */
  implementationReady: boolean;
  /** Placeholder until transport is wired */
  placeholder: boolean;
  supportsRetry: boolean;
  supportsBatch: boolean;
  supportsSchedule: boolean;
  supportsQuietHours: boolean;
};

export type DeliveryChannelDecision = {
  channel: DeliveryChannelKey;
  eligible: boolean;
  status: 'planned' | 'suppressed' | 'placeholder' | 'deferred' | 'ineligible';
  timing: DeliveryTimingMode;
  scheduledFor: string | null;
  retryEligible: boolean;
  batchEligible: boolean;
  reasons: string[];
};

export type DeliveryQuietHoursInput = {
  /** Whether quiet hours are currently active for the user */
  active?: boolean | null;
  /** Channel-scoped quiet (ALL / PUSH / EMAIL / etc.) */
  channels?: string[] | null;
  /** Optional explicit end of quiet window (ISO) */
  endsAt?: string | null;
  engineReady?: boolean;
};

export type DeliveryPreferenceInput = {
  globalEnabled?: boolean | null;
  categoryEnabled?: boolean | null;
  /** Per-channel preference mirrors (from preference layer when available) */
  channels?: Partial<Record<'inApp' | 'email' | 'push' | 'digest', boolean>> | null;
  category?: PreferenceCategoryKey | string | null;
};

export type DeliveryPriorityInput = {
  band?: PriorityBand | null;
  score?: number | null;
  engineActive?: boolean | null;
};

export type DeliveryEvaluationInput = {
  userId: string;
  /** Optional correlation / notification id (not required for planning) */
  notificationId?: string | null;
  type?: string | null;
  category?: PreferenceCategoryKey | string | null;
  createdAt?: Date | string | null;
  preferences?: DeliveryPreferenceInput | null;
  priority?: DeliveryPriorityInput | null;
  quietHours?: DeliveryQuietHoursInput | null;
  /** Force-suppress (e.g. user blocked actor) */
  forceSuppress?: boolean | null;
  forceSuppressReason?: string | null;
  /** Requested channels; default evaluates all known channels */
  requestedChannels?: DeliveryChannelKey[] | null;
  now?: Date | string | null;
};

export type DeliveryPlan = {
  planId: string;
  userId: string;
  notificationId: string | null;
  engineActive: boolean;
  reason:
    | 'planned'
    | 'delivery_engine_inactive'
    | 'fully_suppressed'
    | 'validation_defaults';
  /** Eligible + planned channel decisions */
  channels: DeliveryChannelDecision[];
  /** Channels that would be used if execution existed */
  selectedChannels: DeliveryChannelKey[];
  timing: {
    mode: DeliveryTimingMode;
    scheduledFor: string | null;
    quietHoursActive: boolean;
    batchEligible: boolean;
  };
  suppression: {
    suppressed: boolean;
    reasons: string[];
  };
  retry: {
    eligible: boolean;
    maxAttempts: number;
    backoffMs: number | null;
  };
  batch: {
    eligible: boolean;
    reason: string;
  };
  preferenceCompatibility: {
    applied: boolean;
    globalEnabled: boolean | null;
    categoryEnabled: boolean | null;
    notes: string[];
  };
  priorityCompatibility: {
    applied: boolean;
    band: PriorityBand | null;
    score: number | null;
    notes: string[];
  };
  quietHoursCompatibility: {
    applied: boolean;
    active: boolean;
    notes: string[];
  };
  /**
   * Always false in Phase 10.5 — engine must not deliver.
   * Execution reserved for a later phase.
   */
  executed: false;
  diagnostics: {
    channelCount: number;
    eligibleCount: number;
    placeholderCount: number;
  };
  createdAt: string;
};

export type DeliveryEngineDiagnostics = {
  service: 'notification-delivery';
  engineActive: boolean;
  executed: false;
  supportedChannels: DeliveryChannelKey[];
  placeholders: DeliveryChannelKey[];
  defaultsOff: true;
  envKey: 'NOTIF_INTEL_DELIVERY';
};

export const ALL_DELIVERY_CHANNELS: DeliveryChannelKey[] = [
  'in_app',
  'push',
  'email',
  'sms',
  'webhook',
  'future'
];
