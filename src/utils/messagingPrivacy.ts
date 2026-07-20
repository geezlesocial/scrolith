/**
 * Phase 22.3B — pure messaging privacy helpers (no API imports; unit-testable).
 */

export type PrivacyAudience = 'EVERYONE' | 'CONTACTS' | 'NOBODY';
export type GroupInviteAudience = PrivacyAudience;
export type DirectMessageAudience = 'EVERYONE' | 'CONTACTS' | 'FOLLOWERS' | 'NOBODY';

export type MessagingPrivacySettings = {
  onlineStatusVisibility: PrivacyAudience;
  lastSeenVisibility: PrivacyAudience;
  readReceiptsEnabled: boolean;
  typingIndicatorsEnabled: boolean;
  recordingIndicatorsEnabled: boolean;
  directMessageAudience: DirectMessageAudience;
  groupInviteAudience: GroupInviteAudience;
  notificationMessagePreviewEnabled: boolean;
  updatedAt: string | null;
};

export const MESSAGING_PRIVACY_DEFAULTS: MessagingPrivacySettings = {
  onlineStatusVisibility: 'EVERYONE',
  lastSeenVisibility: 'EVERYONE',
  readReceiptsEnabled: true,
  typingIndicatorsEnabled: true,
  recordingIndicatorsEnabled: true,
  directMessageAudience: 'EVERYONE',
  groupInviteAudience: 'EVERYONE',
  notificationMessagePreviewEnabled: true,
  updatedAt: null
};

export type MessagingPrivacyPatch = Partial<Omit<MessagingPrivacySettings, 'updatedAt'>>;

export const normalizePrivacyAudience = (
  value: unknown,
  fallback: PrivacyAudience = 'EVERYONE'
): PrivacyAudience => {
  const v = String(value || fallback).trim().toUpperCase();
  if (v === 'EVERYONE' || v === 'CONTACTS' || v === 'NOBODY') return v;
  return fallback;
};

export const normalizeDmAudience = (value: unknown): DirectMessageAudience => {
  const v = String(value || 'EVERYONE').trim().toUpperCase();
  if (v === 'EVERYONE' || v === 'CONTACTS' || v === 'FOLLOWERS' || v === 'NOBODY') return v;
  return 'EVERYONE';
};

export const normalizeMessagingPrivacySettings = (raw: any): MessagingPrivacySettings => {
  if (!raw || typeof raw !== 'object') return { ...MESSAGING_PRIVACY_DEFAULTS };
  return {
    onlineStatusVisibility: normalizePrivacyAudience(
      raw.onlineStatusVisibility ?? raw.presenceVisibility,
      'EVERYONE'
    ),
    lastSeenVisibility: normalizePrivacyAudience(raw.lastSeenVisibility, 'EVERYONE'),
    readReceiptsEnabled: raw.readReceiptsEnabled !== false,
    typingIndicatorsEnabled: raw.typingIndicatorsEnabled !== false,
    recordingIndicatorsEnabled: raw.recordingIndicatorsEnabled !== false,
    directMessageAudience: normalizeDmAudience(raw.directMessageAudience),
    groupInviteAudience: normalizePrivacyAudience(
      raw.groupInviteAudience,
      'EVERYONE'
    ) as GroupInviteAudience,
    notificationMessagePreviewEnabled: raw.notificationMessagePreviewEnabled !== false,
    updatedAt: raw.updatedAt
      ? String(raw.updatedAt)
      : raw.messagingPrivacyUpdatedAt
        ? String(raw.messagingPrivacyUpdatedAt)
        : null
  };
};
