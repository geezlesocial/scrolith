import {
  authorizeCallAction,
  resolveGroupCallPolicy,
  roleMeetsStartScope,
  mergeCallPolicyIntoPolicyJson
} from '../services/messaging/messengerCallPolicy.service';

const platform = {
  enabledVoiceCalls: true,
  enabledConferenceCalls: true,
  maxParticipants: 8,
  blockedUserIds: [] as string[]
};

describe('messengerCallPolicy', () => {
  test('defaults allow all members when policy missing', () => {
    const policy = resolveGroupCallPolicy({});
    expect(policy.whoCanStart).toBe('ALL_MEMBERS');
    expect(policy.availability).toBe('ENABLED');
    expect(roleMeetsStartScope('MEMBER', policy.whoCanStart)).toBe(true);
  });

  test('allowVoice false disables group calls', () => {
    const policy = resolveGroupCallPolicy({ allowVoice: false });
    expect(policy.availability).toBe('DISABLED');
  });

  test('platform disable always wins', () => {
    const result = authorizeCallAction({
      action: 'start',
      platform: { ...platform, enabledVoiceCalls: false },
      actorUserId: 'u1',
      conversationType: 'GROUP',
      memberRole: 'OWNER',
      groupPolicy: resolveGroupCallPolicy({})
    });
    expect(result.allowed).toBe(false);
    expect((result as any).code).toBe('VOICE_CALLS_DISABLED');
  });

  test('owner-only start blocks members', () => {
    const policy = resolveGroupCallPolicy({
      policyJson: { callPolicy: { whoCanStart: 'OWNER_ONLY' } }
    });
    const denied = authorizeCallAction({
      action: 'start',
      platform,
      actorUserId: 'u2',
      conversationType: 'GROUP',
      memberRole: 'MEMBER',
      groupPolicy: policy
    });
    expect(denied.allowed).toBe(false);
    const allowed = authorizeCallAction({
      action: 'start',
      platform,
      actorUserId: 'u1',
      conversationType: 'GROUP',
      memberRole: 'OWNER',
      groupPolicy: policy
    });
    expect(allowed.allowed).toBe(true);
  });

  test('conference disabled at platform blocks multi-party', () => {
    const result = authorizeCallAction({
      action: 'start',
      platform: { ...platform, enabledConferenceCalls: false },
      actorUserId: 'u1',
      conversationType: 'GROUP',
      memberRole: 'OWNER',
      isConference: true,
      groupPolicy: resolveGroupCallPolicy({})
    });
    expect(result.allowed).toBe(false);
    expect((result as any).code).toBe('CONFERENCE_DISABLED');
  });

  test('blocked user cannot start', () => {
    const result = authorizeCallAction({
      action: 'start',
      platform: { ...platform, blockedUserIds: ['blocked-1'] },
      actorUserId: 'blocked-1',
      conversationType: 'DIRECT',
      memberRole: 'MEMBER'
    });
    expect(result.allowed).toBe(false);
    expect((result as any).code).toBe('VOICE_BLOCKED');
  });

  test('mergeCallPolicyIntoPolicyJson is backward compatible', () => {
    const next = mergeCallPolicyIntoPolicyJson({ keywordFilters: ['spam'] }, {
      whoCanStart: 'OWNERS_ADMINS'
    });
    expect(next.keywordFilters).toEqual(['spam']);
    expect(next.callPolicy.whoCanStart).toBe('OWNERS_ADMINS');
  });

  test('max participants enforced', () => {
    const result = authorizeCallAction({
      action: 'invite',
      platform: { ...platform, maxParticipants: 3 },
      actorUserId: 'u1',
      conversationType: 'GROUP',
      memberRole: 'OWNER',
      participantCount: 4,
      groupPolicy: resolveGroupCallPolicy({})
    });
    expect(result.allowed).toBe(false);
    expect((result as any).code).toBe('MAX_PARTICIPANTS_EXCEEDED');
  });
});
