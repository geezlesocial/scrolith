import {
  getMessengerVideoPlatformFlags,
  normalizeMediaMode,
  getMessengerVideoClientPayload
} from '../services/messaging/messengerVideoConfig.service';
import { authorizeCallAction, resolveGroupCallPolicy } from '../services/messaging/messengerCallPolicy.service';
import { sanitizeMessengerVoiceConfigInput } from '../services/messengerVoice.service';

describe('messengerVideoConfig', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
  });

  test('normalizeMediaMode maps video aliases', () => {
    expect(normalizeMediaMode('video')).toBe('video');
    expect(normalizeMediaMode('AUDIO_VIDEO')).toBe('video');
    expect(normalizeMediaMode('audio')).toBe('audio');
    expect(normalizeMediaMode(undefined)).toBe('audio');
  });

  test('defaults enable video and screen share', () => {
    delete process.env.VOICE_ENABLED_VIDEO_CALLS;
    delete process.env.VOICE_ENABLED_SCREEN_SHARING;
    const flags = getMessengerVideoPlatformFlags();
    expect(flags.enabledVideoCalls).toBe(true);
    expect(flags.enabledScreenSharing).toBe(true);
    expect(flags.maxVideoParticipants).toBeGreaterThanOrEqual(2);
  });

  test('env can disable video', () => {
    process.env.VOICE_ENABLED_VIDEO_CALLS = 'false';
    const flags = getMessengerVideoPlatformFlags();
    expect(flags.enabledVideoCalls).toBe(false);
  });

  test('client payload is secret-free and topology mesh', () => {
    const payload = getMessengerVideoClientPayload();
    expect(payload.mediaTopology).toBe('mesh');
    expect(payload.sfuReady).toBe(false);
    expect(payload).not.toHaveProperty('turnSecret');
  });

  test('admin messenger config accepts platform video on/off flag', () => {
    expect(sanitizeMessengerVoiceConfigInput({ enabledVideoCalls: false }).enabledVideoCalls).toBe(false);
    expect(sanitizeMessengerVoiceConfigInput({ enableVideoCalls: 'on' }).enabledVideoCalls).toBe(true);
  });
});

describe('messengerCallPolicy video gates', () => {
  const platform = {
    enabledVoiceCalls: true,
    enabledConferenceCalls: true,
    maxParticipants: 8,
    blockedUserIds: [] as string[],
    enabledVideoCalls: true,
    enabledScreenSharing: true,
    maxVideoParticipants: 4
  };

  test('video start denied when platform video disabled', () => {
    const result = authorizeCallAction({
      action: 'start',
      platform: { ...platform, enabledVideoCalls: false },
      actorUserId: 'u1',
      conversationType: 'DIRECT',
      mediaMode: 'video'
    });
    expect(result.allowed).toBe(false);
    expect((result as any).code).toBe('VIDEO_CALLS_DISABLED');
  });

  test('audio start still allowed when video disabled', () => {
    const result = authorizeCallAction({
      action: 'start',
      platform: { ...platform, enabledVideoCalls: false },
      actorUserId: 'u1',
      conversationType: 'DIRECT',
      mediaMode: 'audio'
    });
    expect(result.allowed).toBe(true);
  });

  test('screen share denied when platform screen sharing off', () => {
    const result = authorizeCallAction({
      action: 'screen_share',
      platform: { ...platform, enabledScreenSharing: false },
      actorUserId: 'u1',
      conversationType: 'DIRECT'
    });
    expect(result.allowed).toBe(false);
    expect((result as any).code).toBe('SCREEN_SHARING_DISABLED');
  });

  test('group allowVideo false blocks video', () => {
    const policy = resolveGroupCallPolicy({
      policyJson: { callPolicy: { allowVideo: false } }
    });
    expect(policy.allowVideo).toBe(false);
    const result = authorizeCallAction({
      action: 'start',
      platform,
      actorUserId: 'u1',
      conversationType: 'GROUP',
      memberRole: 'OWNER',
      groupPolicy: policy,
      mediaMode: 'video'
    });
    expect(result.allowed).toBe(false);
    expect((result as any).code).toBe('GROUP_VIDEO_DISABLED');
  });

  test('max video participants enforced', () => {
    const result = authorizeCallAction({
      action: 'start',
      platform: { ...platform, maxVideoParticipants: 3 },
      actorUserId: 'u1',
      conversationType: 'GROUP',
      memberRole: 'OWNER',
      groupPolicy: resolveGroupCallPolicy({}),
      mediaMode: 'video',
      isConference: true,
      participantCount: 5
    });
    expect(result.allowed).toBe(false);
    expect((result as any).code).toBe('MAX_VIDEO_PARTICIPANTS_EXCEEDED');
  });

  test('resolveGroupCallPolicy defaults allow video and screen', () => {
    const policy = resolveGroupCallPolicy({});
    expect(policy.allowVideo).toBe(true);
    expect(policy.allowScreenShare).toBe(true);
  });
});
