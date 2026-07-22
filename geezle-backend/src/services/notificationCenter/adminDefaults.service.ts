/**
 * Phase 32.2 — Admin-configurable notification defaults and policy locks.
 * In-memory with optional env overrides; audited when updated via admin API.
 * Full ops dashboard deferred to Phase 32.4.
 */
import { writeNotificationAudit } from './analytics';
import { MANDATORY_SECURITY_EVENT_TYPES, EMERGENCY_SYSTEM_EVENT_TYPES } from './delivery/policyTypes';

export type NotificationAdminDefaults = {
  defaultCategoryPreferences: Record<
    string,
    { inAppEnabled: boolean; pushEnabled: boolean; emailEnabled: boolean; deliveryMode: string; minPriority: string }
  >;
  defaultChannelPreferences: {
    IN_APP: boolean;
    PUSH: boolean;
    EMAIL: boolean;
    SMS: boolean;
    DESKTOP: boolean;
    WEBHOOK: boolean;
  };
  mandatorySecurityEventTypes: string[];
  emergencySystemEventTypes: string[];
  allowedDigestModes: string[];
  maxDigestRetentionDays: number;
  quietHoursDefaults: {
    enabled: boolean;
    startTime: string;
    endTime: string;
    timezone: string;
    allowCritical: boolean;
  };
  maxFocusDurationMinutes: number;
  emailDigestEnabled: boolean;
  pushDigestAlertEnabled: boolean;
  categoryPolicyLocks: Record<string, { lockPush?: boolean; lockEmail?: boolean; forceImmediate?: boolean }>;
  featureFlags: {
    preferencesV2: boolean;
    focusMode: boolean;
    digests: boolean;
    quietHours: boolean;
    eventOverrides: boolean;
  };
  version: number;
  updatedAt: string | null;
  updatedBy: string | null;
};

const DEFAULTS: NotificationAdminDefaults = {
  defaultCategoryPreferences: {
    personal: { inAppEnabled: true, pushEnabled: true, emailEnabled: false, deliveryMode: 'immediate', minPriority: 'normal' },
    messaging: { inAppEnabled: true, pushEnabled: true, emailEnabled: false, deliveryMode: 'immediate', minPriority: 'normal' },
    messaging_groups: { inAppEnabled: true, pushEnabled: true, emailEnabled: false, deliveryMode: 'immediate', minPriority: 'normal' },
    jobs: { inAppEnabled: true, pushEnabled: true, emailEnabled: true, deliveryMode: 'immediate', minPriority: 'normal' },
    marketplace: { inAppEnabled: true, pushEnabled: true, emailEnabled: true, deliveryMode: 'immediate', minPriority: 'normal' },
    communities: { inAppEnabled: true, pushEnabled: false, emailEnabled: false, deliveryMode: 'digest', minPriority: 'normal' },
    business: { inAppEnabled: true, pushEnabled: true, emailEnabled: true, deliveryMode: 'immediate', minPriority: 'normal' },
    wallet: { inAppEnabled: true, pushEnabled: true, emailEnabled: true, deliveryMode: 'immediate', minPriority: 'high' },
    security: { inAppEnabled: true, pushEnabled: true, emailEnabled: true, deliveryMode: 'immediate', minPriority: 'high' },
    support: { inAppEnabled: true, pushEnabled: true, emailEnabled: true, deliveryMode: 'immediate', minPriority: 'normal' },
    system: { inAppEnabled: true, pushEnabled: false, emailEnabled: false, deliveryMode: 'digest', minPriority: 'normal' },
    admin: { inAppEnabled: true, pushEnabled: true, emailEnabled: true, deliveryMode: 'immediate', minPriority: 'high' }
  },
  defaultChannelPreferences: {
    IN_APP: true,
    PUSH: true,
    EMAIL: true,
    SMS: false,
    DESKTOP: false,
    WEBHOOK: false
  },
  mandatorySecurityEventTypes: Array.from(MANDATORY_SECURITY_EVENT_TYPES),
  emergencySystemEventTypes: Array.from(EMERGENCY_SYSTEM_EVENT_TYPES),
  allowedDigestModes: ['off', 'morning', 'evening', 'daily', 'weekly'],
  maxDigestRetentionDays: 90,
  quietHoursDefaults: {
    enabled: false,
    startTime: '22:00',
    endTime: '07:00',
    timezone: 'UTC',
    allowCritical: true
  },
  maxFocusDurationMinutes: 7 * 24 * 60,
  emailDigestEnabled: true,
  pushDigestAlertEnabled: false,
  categoryPolicyLocks: {
    security: { lockPush: true, lockEmail: true, forceImmediate: true }
  },
  featureFlags: {
    preferencesV2: true,
    focusMode: true,
    digests: true,
    quietHours: true,
    eventOverrides: true
  },
  version: 1,
  updatedAt: null,
  updatedBy: null
};

let current: NotificationAdminDefaults = structuredClone(DEFAULTS);

export class NotificationAdminDefaultsService {
  static get(): NotificationAdminDefaults {
    return structuredClone(current);
  }

  static resetToCodeDefaults(actorId?: string | null) {
    current = structuredClone(DEFAULTS);
    current.version = (current.version || 1) + 1;
    current.updatedAt = new Date().toISOString();
    current.updatedBy = actorId || null;
    return this.get();
  }

  static async update(patch: Partial<NotificationAdminDefaults>, actorId?: string | null) {
    const next = { ...current, ...patch };
    if (patch.defaultCategoryPreferences) {
      next.defaultCategoryPreferences = {
        ...current.defaultCategoryPreferences,
        ...patch.defaultCategoryPreferences
      };
    }
    if (patch.defaultChannelPreferences) {
      next.defaultChannelPreferences = {
        ...current.defaultChannelPreferences,
        ...patch.defaultChannelPreferences,
        SMS: false,
        DESKTOP: false,
        WEBHOOK: false
      };
    }
    if (patch.featureFlags) {
      next.featureFlags = { ...current.featureFlags, ...patch.featureFlags };
    }
    if (patch.categoryPolicyLocks) {
      next.categoryPolicyLocks = { ...current.categoryPolicyLocks, ...patch.categoryPolicyLocks };
    }
    if (patch.quietHoursDefaults) {
      next.quietHoursDefaults = { ...current.quietHoursDefaults, ...patch.quietHoursDefaults };
    }
    // Future channels never enabled in 32.2
    next.defaultChannelPreferences.SMS = false;
    next.defaultChannelPreferences.DESKTOP = false;
    next.defaultChannelPreferences.WEBHOOK = false;

    next.version = (current.version || 1) + 1;
    next.updatedAt = new Date().toISOString();
    next.updatedBy = actorId || null;
    current = next;

    await writeNotificationAudit({
      action: 'admin_notification_defaults_updated',
      userId: actorId || undefined,
      actorId: actorId || undefined,
      details: { version: next.version, keys: Object.keys(patch || {}) }
    });

    return this.get();
  }
}

export default NotificationAdminDefaultsService;
