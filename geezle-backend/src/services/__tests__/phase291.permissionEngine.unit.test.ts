/**
 * Phase 29.1 — permission engine + visibility + send inference unit tests.
 */
import {
  canSendWithMode,
  computeEffectivePermissions,
  defaultPermissionsForRole,
  modeAllowsSend,
  normalizeMessagingMode,
  normalizeProfileKey
} from '../messaging/permissionEngine';
import {
  isGroupDiscoverable,
  isGroupPreviewAllowed,
  normalizeGroupVisibility,
  resolveJoinPolicyForVisibility
} from '../messaging/groupVisibility';
import { inferContentKinds } from '../messaging/groupSendGate';
import { checkGroupSendRate, clearGroupRateLimitForTests } from '../messaging/groupRateLimit';

describe('Phase 29.1 permission engine', () => {
  test('OWNER has full defaults; MEMBER cannot kick/ban', () => {
    const owner = defaultPermissionsForRole('OWNER');
    const member = defaultPermissionsForRole('MEMBER');
    expect(owner.canSend).toBe(true);
    expect(owner.canBan).toBe(true);
    expect(owner.canEditGroup).toBe(true);
    expect(member.canSend).toBe(true);
    expect(member.canKick).toBe(false);
    expect(member.canBan).toBe(false);
    expect(member.canEditGroup).toBe(false);
  });

  test('readOnly profile cannot send or reply', () => {
    const perms = computeEffectivePermissions({ role: 'MEMBER', profileKey: 'readOnly' });
    expect(perms.canSend).toBe(false);
    expect(perms.canReply).toBe(false);
  });

  test('guest profile cannot send but may reply', () => {
    const perms = computeEffectivePermissions({ role: 'MEMBER', profileKey: 'guest' });
    expect(perms.canSend).toBe(false);
    expect(perms.canReply).toBe(true);
  });

  test('conversation overrides can grant MEMBER canInvite', () => {
    const perms = computeEffectivePermissions({
      role: 'MEMBER',
      conversationOverrides: { MEMBER: { canInvite: true } }
    });
    expect(perms.canInvite).toBe(true);
  });

  test('messaging modes suppress send', () => {
    expect(modeAllowsSend('EVERYONE', 'MEMBER')).toBe(true);
    expect(modeAllowsSend('ADMINS_ONLY', 'MEMBER')).toBe(false);
    expect(modeAllowsSend('ADMINS_ONLY', 'ADMIN')).toBe(true);
    expect(modeAllowsSend('ANNOUNCEMENT', 'MODERATOR')).toBe(false);
    expect(modeAllowsSend('MODS_PLUS', 'MODERATOR')).toBe(true);
    expect(modeAllowsSend('READ_ONLY', 'OWNER')).toBe(true);
    expect(modeAllowsSend('READ_ONLY', 'ADMIN')).toBe(false);
    expect(modeAllowsSend('LOCKED', 'OWNER')).toBe(false);
  });

  test('canSendWithMode combines matrix + mode', () => {
    const locked = canSendWithMode({ role: 'ADMIN', messagingMode: 'LOCKED' });
    expect(locked.allowed).toBe(false);
    expect(locked.reason).toContain('locked');

    const announcementMember = canSendWithMode({ role: 'MEMBER', messagingMode: 'ANNOUNCEMENT' });
    expect(announcementMember.allowed).toBe(false);

    const everyone = canSendWithMode({ role: 'MEMBER', messagingMode: 'EVERYONE' });
    expect(everyone.allowed).toBe(true);
  });

  test('normalize helpers', () => {
    expect(normalizeMessagingMode('announcement')).toBe('ANNOUNCEMENT');
    expect(normalizeProfileKey('read_only')).toBe('readOnly');
    expect(normalizeProfileKey('coOwner')).toBe('coOwner');
  });
});

describe('Phase 29.1 visibility SECRET', () => {
  test('SECRET is first-class visibility, not UNLISTED alias', () => {
    expect(normalizeGroupVisibility('SECRET')).toBe('SECRET');
    expect(normalizeGroupVisibility('UNLISTED')).toBe('UNLISTED');
    expect(normalizeGroupVisibility('SECRET')).not.toBe('UNLISTED');
  });

  test('SECRET is not discoverable and has no previews', () => {
    expect(isGroupDiscoverable('SECRET')).toBe(false);
    expect(isGroupDiscoverable('PUBLIC')).toBe(true);
    expect(isGroupPreviewAllowed('SECRET')).toBe(false);
    expect(isGroupPreviewAllowed('PUBLIC')).toBe(true);
  });

  test('SECRET forces INVITE_ONLY join policy', () => {
    expect(resolveJoinPolicyForVisibility('SECRET', 'OPEN')).toBe('INVITE_ONLY');
    expect(resolveJoinPolicyForVisibility('PUBLIC', 'REQUEST')).toBe('REQUEST');
    expect(resolveJoinPolicyForVisibility('PRIVATE')).toBe('INVITE_ONLY');
  });
});

describe('Phase 29.1 content inference + rate limit', () => {
  beforeEach(() => clearGroupRateLimitForTests());

  test('inferContentKinds detects text, link, file', () => {
    expect(inferContentKinds({ text: 'hello' })).toContain('text');
    expect(inferContentKinds({ text: 'see https://example.com' })).toEqual(
      expect.arrayContaining(['text', 'link'])
    );
    expect(inferContentKinds({ attachments: ['file1'] })).toContain('file');
    expect(inferContentKinds({ messageType: 'VOICE_NOTE' })).toContain('voice');
  });

  test('send rate limit eventually blocks', () => {
    const userId = 'u-rate';
    const conv = 'c-rate';
    let blocked = false;
    for (let i = 0; i < 200; i += 1) {
      const r = checkGroupSendRate(userId, conv);
      if (!r.allowed) {
        blocked = true;
        break;
      }
    }
    expect(blocked).toBe(true);
  });
});
