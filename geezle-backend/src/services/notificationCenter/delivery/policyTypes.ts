import type { NotificationCenterCategory, NotificationPriorityLevel } from '../taxonomy';

export type DeliveryChannel = 'IN_APP' | 'PUSH' | 'EMAIL' | 'SMS' | 'DESKTOP' | 'WEBHOOK';

export type DeliveryMode = 'immediate' | 'digest' | 'priority_only' | 'muted';

export type DeliveryAction = 'DELIVER_NOW' | 'QUEUE_FOR_DIGEST' | 'SUPPRESS' | 'DEFER';

export type PreferenceSource =
  | 'emergency_platform'
  | 'mandatory_security'
  | 'admin_enforced'
  | 'event_override'
  | 'category_preference'
  | 'device_channel'
  | 'focus_mode'
  | 'quiet_hours'
  | 'digest_mode'
  | 'global_pause'
  | 'default_platform';

export type DeliveryPolicyInput = {
  userId: string;
  eventType: string;
  category: NotificationCenterCategory | string;
  channel: DeliveryChannel;
  priority?: NotificationPriorityLevel | string | null;
  timestamp?: Date | string | number | null;
  actorId?: string | null;
  conversationId?: string | null;
  isMandatorySecurity?: boolean;
  isEmergencySystem?: boolean;
  deviceId?: string | null;
  timezone?: string | null;
};

export type DeliveryPolicyDecision = {
  allowed: boolean;
  action: DeliveryAction;
  reason: string;
  effectivePreferenceSource: PreferenceSource | string;
  nextEligibleAt?: Date | null;
  deliveryMode?: DeliveryMode | null;
  channel: DeliveryChannel;
  category: string;
  eventType: string;
};

/** Deterministic precedence (highest → lowest authority) */
export const PREFERENCE_PRECEDENCE: PreferenceSource[] = [
  'emergency_platform',
  'mandatory_security',
  'admin_enforced',
  'event_override',
  'category_preference',
  'device_channel',
  'focus_mode',
  'quiet_hours',
  'digest_mode',
  'global_pause',
  'default_platform'
];

export const MANDATORY_SECURITY_EVENT_TYPES = new Set([
  'security.new_login',
  'security_login',
  'security.password_change',
  'security_password_change',
  'security.new_device',
  'security_new_device',
  'security.2fa_required',
  'security_2fa'
]);

export const EMERGENCY_SYSTEM_EVENT_TYPES = new Set([
  'system.emergency',
  'system_emergency',
  'system.maintenance_critical',
  'admin.broadcast_emergency'
]);

export const FUTURE_CHANNELS: DeliveryChannel[] = ['SMS', 'DESKTOP', 'WEBHOOK'];
export const ACTIVE_CHANNELS: DeliveryChannel[] = ['IN_APP', 'PUSH', 'EMAIL'];
