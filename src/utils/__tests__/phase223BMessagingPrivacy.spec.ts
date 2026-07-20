import { describe, expect, it } from 'vitest';
import {
  MESSAGING_PRIVACY_DEFAULTS,
  normalizeMessagingPrivacySettings,
  normalizePrivacyAudience,
  normalizeDmAudience
} from '../messagingPrivacy';
import {
  buildConversationMenuItems,
  groupMenuItemsBySection
} from '../../components/messaging/conversationMenuPolicy';

describe('Phase 22.3B messaging privacy normalize', () => {
  it('maps presenceVisibility alias to onlineStatusVisibility', () => {
    const settings = normalizeMessagingPrivacySettings({
      presenceVisibility: 'NOBODY',
      lastSeenVisibility: 'CONTACTS',
      typingIndicatorsEnabled: false,
      notificationMessagePreviewEnabled: false,
      directMessageAudience: 'FOLLOWERS',
      groupInviteAudience: 'CONTACTS'
    });
    expect(settings.onlineStatusVisibility).toBe('NOBODY');
    expect(settings.lastSeenVisibility).toBe('CONTACTS');
    expect(settings.typingIndicatorsEnabled).toBe(false);
    expect(settings.notificationMessagePreviewEnabled).toBe(false);
    expect(settings.directMessageAudience).toBe('FOLLOWERS');
    expect(settings.groupInviteAudience).toBe('CONTACTS');
  });

  it('defaults preserve production-safe behavior', () => {
    const settings = normalizeMessagingPrivacySettings(null);
    expect(settings).toMatchObject({
      onlineStatusVisibility: MESSAGING_PRIVACY_DEFAULTS.onlineStatusVisibility,
      readReceiptsEnabled: true,
      typingIndicatorsEnabled: true,
      recordingIndicatorsEnabled: true,
      directMessageAudience: 'EVERYONE',
      groupInviteAudience: 'EVERYONE',
      notificationMessagePreviewEnabled: true
    });
  });

  it('normalizes audience enums', () => {
    expect(normalizePrivacyAudience('contacts')).toBe('CONTACTS');
    expect(normalizePrivacyAudience('x')).toBe('EVERYONE');
    expect(normalizeDmAudience('followers')).toBe('FOLLOWERS');
    expect(normalizeDmAudience('nope')).toBe('EVERYONE');
  });
});

describe('Phase 22.3B conversation menu IA', () => {
  it('separates messaging privacy from organization actions', () => {
    const items = buildConversationMenuItems({
      isStarred: false,
      isMuted: false,
      isArchived: false,
      label: 'other',
      isGroup: false,
      isDm: true
    });
    const groups = groupMenuItemsBySection(items);
    const org = groups.find((g) => g.section === 'organization');
    const privacy = groups.find((g) => g.section === 'privacy_safety');
    expect(org?.items.some((i) => i.id === 'manage_settings')).toBe(false);
    expect(privacy?.items.some((i) => i.id === 'manage_settings')).toBe(true);
  });

  it('toggles unarchive and leave-group labels', () => {
    const archived = buildConversationMenuItems({
      isStarred: true,
      isMuted: true,
      isArchived: true,
      label: 'jobs',
      isGroup: true,
      isDm: false
    });
    expect(archived.find((i) => i.id === 'archive')?.label).toBe('Unarchive');
    expect(archived.find((i) => i.id === 'delete')?.label).toBe('Leave group');
  });
});
