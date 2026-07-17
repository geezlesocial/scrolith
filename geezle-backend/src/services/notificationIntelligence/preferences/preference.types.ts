/**
 * Phase 10.3 — Notification preference model (single source of truth for future NI phases).
 * Backed by existing UserSettings + platform toggles; no schema change.
 */

import type { NotificationCategory, NotificationChannel } from '../contracts/types';

/** Canonical preference categories for NI */
export type PreferenceCategoryKey =
  | 'messages'
  | 'mentions'
  | 'comments'
  | 'likes'
  | 'replies'
  | 'followers'
  | 'jobs'
  | 'marketplace'
  | 'communities'
  | 'companies'
  | 'system'
  | 'future';

export type ChannelPreference = {
  /** When false, channel is disabled for this category (or global) */
  enabled: boolean;
  /** Placeholder for future per-channel overrides */
  reserved?: boolean;
};

export type CategoryPreference = {
  category: PreferenceCategoryKey;
  /** Master enable for category (in-app today) */
  enabled: boolean;
  channels: {
    inApp: ChannelPreference;
    email: ChannelPreference;
    push: ChannelPreference;
    digest: ChannelPreference;
  };
  /** Maps to legacy UserSettings field when applicable */
  legacyField?: string | null;
};

export type QuietHoursPlaceholder = {
  /** Loaded from QuietHourRule when available; empty array if none */
  rules: Array<{
    id: string;
    channel: NotificationChannel | string;
    daysOfWeek: string[];
    startMinute: number;
    endMinute: number;
    isActive: boolean;
    timezone?: string | null;
    label?: string | null;
  }>;
  /** Future: NI-owned quiet hours engine */
  engineReady: false;
};

export type DigestPreferencePlaceholder = {
  enabled: boolean;
  frequency: 'off' | 'daily' | 'weekly' | 'custom';
  /** Future */
  reserved: true;
};

export type DeliveryPreferencePlaceholder = {
  batchingEnabled: boolean;
  maxPerHour: number | null;
  reserved: true;
};

export type UserNotificationPreferences = {
  userId: string;
  /** Global kill switch (maps to inAppNotifications) */
  globalEnabled: boolean;
  /** Global email marketing-ish (maps to emailNotifications) */
  emailEnabled: boolean;
  /** Message-request style (maps to messageRequestsNotifications) */
  messageRequestsEnabled: boolean;
  categories: Record<PreferenceCategoryKey, CategoryPreference>;
  quietHours: QuietHoursPlaceholder;
  digest: DigestPreferencePlaceholder;
  delivery: DeliveryPreferencePlaceholder;
  /** When preferences feature flag is off, consumers must use legacy paths */
  preferencesEngineActive: boolean;
  source: 'legacy_user_settings' | 'defaults';
  resolvedAt: string;
};

export type PreferenceEvaluationInput = {
  userId: string;
  category: PreferenceCategoryKey;
  /** Optional channel; default inApp */
  channel?: 'inApp' | 'email' | 'push' | 'digest';
  /** Legacy engagement type for adapter parity checks */
  legacyEngagementType?: string | null;
};

export type PreferenceEvaluationResult = {
  allowed: boolean;
  reason:
    | 'allowed'
    | 'global_disabled'
    | 'category_disabled'
    | 'channel_disabled'
    | 'preferences_engine_inactive'
    | 'user_not_found_defaults'
    | 'unknown_category';
  preferencesEngineActive: boolean;
  category: PreferenceCategoryKey;
  channel: 'inApp' | 'email' | 'push' | 'digest';
};

/** Map engagement notification types → preference categories */
export const ENGAGEMENT_TYPE_TO_CATEGORY: Record<string, PreferenceCategoryKey> = {
  mention_post: 'mentions',
  mention_comment: 'mentions',
  comment_on_post: 'comments',
  reaction_on_post: 'likes',
  followed_you: 'followers',
  followed_new_post: 'followers',
  repost: 'likes',
  job_application_created: 'jobs',
  proposal_opened: 'jobs',
  proposal_reply: 'jobs',
  proposal_top_applicant: 'jobs',
  proposal_interview_scheduled: 'jobs'
};

export const ALL_PREFERENCE_CATEGORIES: PreferenceCategoryKey[] = [
  'messages',
  'mentions',
  'comments',
  'likes',
  'replies',
  'followers',
  'jobs',
  'marketplace',
  'communities',
  'companies',
  'system',
  'future'
];

export type NotificationCategoryAlias = NotificationCategory;
