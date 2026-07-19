/**
 * Phase 22.2 — group roles, notification rules, mention extraction.
 */
import {
  canChangeRoles,
  canEditGroupMeta,
  canManageMembers,
  canRemoveMember,
  extractMentionUsernames,
  generateInviteCode,
  normalizeMemberRole,
  normalizeNotificationLevel,
  shouldNotifyGroupReceiver
} from '../services/messaging/groupPolicy';
import { filterReceiversForMessagePush } from '../services/messaging/notificationPolicy';

describe('Phase 22.2 group messaging policy', () => {
  test('normalizeMemberRole defaults unknown to MEMBER', () => {
    expect(normalizeMemberRole('OWNER')).toBe('OWNER');
    expect(normalizeMemberRole('admin')).toBe('ADMIN');
    expect(normalizeMemberRole('moderator')).toBe('MODERATOR');
    expect(normalizeMemberRole('nope')).toBe('MEMBER');
    expect(normalizeMemberRole(null)).toBe('MEMBER');
  });

  test('role capabilities: admin manages, member does not', () => {
    expect(canManageMembers('ADMIN')).toBe(true);
    expect(canManageMembers('OWNER')).toBe(true);
    expect(canManageMembers('MODERATOR')).toBe(false);
    expect(canManageMembers('MEMBER')).toBe(false);
    expect(canEditGroupMeta('ADMIN')).toBe(true);
    expect(canEditGroupMeta('MEMBER')).toBe(false);
  });

  test('canChangeRoles and canRemoveMember respect hierarchy', () => {
    expect(canChangeRoles('OWNER', 'MEMBER', 'ADMIN')).toBe(true);
    expect(canChangeRoles('ADMIN', 'MEMBER', 'MODERATOR')).toBe(true);
    expect(canChangeRoles('ADMIN', 'ADMIN', 'MEMBER')).toBe(false);
    expect(canChangeRoles('MEMBER', 'MEMBER', 'ADMIN')).toBe(false);
    expect(canRemoveMember('OWNER', 'ADMIN')).toBe(true);
    expect(canRemoveMember('ADMIN', 'MEMBER')).toBe(true);
    expect(canRemoveMember('ADMIN', 'OWNER')).toBe(false);
    expect(canRemoveMember('MEMBER', 'MEMBER')).toBe(false);
  });

  test('shouldNotifyGroupReceiver: mute + levels + mention bypass', () => {
    expect(
      shouldNotifyGroupReceiver({
        isMuted: false,
        notifications: 'ALL',
        isMentioned: false,
        isSender: false
      })
    ).toBe(true);
    expect(
      shouldNotifyGroupReceiver({
        isMuted: true,
        notifications: 'ALL',
        isMentioned: false,
        isSender: false
      })
    ).toBe(false);
    expect(
      shouldNotifyGroupReceiver({
        isMuted: true,
        notifications: 'ALL',
        isMentioned: true,
        isSender: false
      })
    ).toBe(true);
    expect(
      shouldNotifyGroupReceiver({
        isMuted: false,
        notifications: 'MENTIONS',
        isMentioned: false,
        isSender: false
      })
    ).toBe(false);
    expect(
      shouldNotifyGroupReceiver({
        isMuted: false,
        notifications: 'MENTIONS',
        isMentioned: true,
        isSender: false
      })
    ).toBe(true);
    expect(
      shouldNotifyGroupReceiver({
        isMuted: false,
        notifications: 'NONE',
        isMentioned: true,
        isSender: false
      })
    ).toBe(false);
    expect(
      shouldNotifyGroupReceiver({
        isMuted: false,
        notifications: 'ALL',
        isMentioned: false,
        isSender: true
      })
    ).toBe(false);
  });

  test('extractMentionUsernames is case-insensitive and deduped', () => {
    expect(extractMentionUsernames('hi @Alice and @bob and @alice')).toEqual(['alice', 'bob']);
    expect(extractMentionUsernames('no mentions here')).toEqual([]);
    expect(extractMentionUsernames('@a')).toEqual([]);
  });

  test('generateInviteCode is non-empty and unique enough', () => {
    const a = generateInviteCode();
    const b = generateInviteCode();
    expect(a.startsWith('g')).toBe(true);
    expect(a.length).toBeGreaterThanOrEqual(8);
    expect(a).not.toBe(b);
  });

  test('filterReceiversForMessagePush group levels + mention bypass', () => {
    const result = filterReceiversForMessagePush({
      receiverIds: ['owner', 'muted', 'mentions', 'none', 'all', 'sender'],
      mutedUserIds: ['muted'],
      senderId: 'sender',
      isGroup: true,
      allowMentionBypass: true,
      mentionedUserIds: ['muted', 'mentions'],
      notificationLevelByUserId: {
        muted: 'ALL',
        mentions: 'MENTIONS',
        none: 'NONE',
        all: 'ALL',
        owner: 'ALL'
      }
    });
    expect(result.sort()).toEqual(['all', 'mentions', 'muted', 'owner'].sort());
  });

  test('normalizeNotificationLevel defaults unknown to ALL', () => {
    expect(normalizeNotificationLevel('mentions')).toBe('MENTIONS');
    expect(normalizeNotificationLevel('NONE')).toBe('NONE');
    expect(normalizeNotificationLevel('x')).toBe('ALL');
  });
});
