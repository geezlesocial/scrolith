import {
  buildLivePlatformVoiceFlags,
  countJoinedParticipants,
  participantIsJoined,
  resolveCallStoredMediaMode,
  resolveMediaControlIntent
} from '../services/messaging/messengerCallPlatform.service';
import { authorizeCallAction, resolveGroupCallPolicy } from '../services/messaging/messengerCallPolicy.service';

describe('messengerCallPlatform', () => {
  test('buildLivePlatformVoiceFlags never hard-codes enabledVoiceCalls true', () => {
    const flags = buildLivePlatformVoiceFlags(
      {
        enabledVoiceCalls: false,
        enabledConferenceCalls: false,
        maxParticipants: 10,
        blockedUserIds: ['bad-user']
      },
      {
        videoFlags: {
          enabledVideoCalls: false,
          enabledScreenSharing: false,
          maxVideoParticipants: 4,
          defaultVideoQuality: 'medium',
          maxResolution: '1280x720',
          maxFrameRate: 30,
          cameraRecordingPolicy: 'disabled',
          maxBitrateKbps: 0,
          allowVirtualBackground: false
        }
      }
    );
    expect(flags.enabledVoiceCalls).toBe(false);
    expect(flags.enabledConferenceCalls).toBe(false);
    expect(flags.enabledVideoCalls).toBe(false);
    expect(flags.blockedUserIds).toEqual(['bad-user']);
  });

  test('resolveCallStoredMediaMode defaults missing metadata to audio', () => {
    expect(resolveCallStoredMediaMode(null)).toBe('audio');
    expect(resolveCallStoredMediaMode({})).toBe('audio');
    expect(resolveCallStoredMediaMode({ mediaMode: 'video' })).toBe('video');
  });

  test('camera start on audio call upgrades to video auth intent', () => {
    const intent = resolveMediaControlIntent({
      kind: 'camera',
      action: 'start',
      callMediaMode: 'audio',
      enabled: true
    });
    expect(intent.upgradesCallToVideo).toBe(true);
    expect(intent.requiresVideoAuth).toBe(true);
    expect(intent.authMediaMode).toBe('video');
    expect(intent.policyAction).toBe('toggle_video');
  });

  test('unauthorized media escalation denied by policy when video disabled', () => {
    const platform = buildLivePlatformVoiceFlags(
      { enabledVoiceCalls: true, enabledConferenceCalls: true, blockedUserIds: [] },
      {
        videoFlags: {
          enabledVideoCalls: false,
          enabledScreenSharing: false,
          maxVideoParticipants: 4,
          defaultVideoQuality: 'medium',
          maxResolution: '1280x720',
          maxFrameRate: 30,
          cameraRecordingPolicy: 'disabled',
          maxBitrateKbps: 0,
          allowVirtualBackground: false
        }
      }
    );
    const intent = resolveMediaControlIntent({
      kind: 'camera',
      action: 'start',
      callMediaMode: 'audio'
    });
    const result = authorizeCallAction({
      action: intent.policyAction,
      platform,
      actorUserId: 'u1',
      conversationType: 'DIRECT',
      mediaMode: intent.authMediaMode
    });
    expect(result.allowed).toBe(false);
    expect((result as any).code).toBe('VIDEO_CALLS_DISABLED');
  });

  test('admin-disabled account cannot start a video call', () => {
    const platform = buildLivePlatformVoiceFlags(
      { enabledVoiceCalls: true, enabledConferenceCalls: true, blockedUserIds: [] },
      {
        videoFlags: {
          enabledVideoCalls: true,
          enabledScreenSharing: true,
          maxVideoParticipants: 4,
          defaultVideoQuality: 'medium',
          maxResolution: '1280x720',
          maxFrameRate: 30,
          cameraRecordingPolicy: 'disabled',
          maxBitrateKbps: 0,
          allowVirtualBackground: false
        }
      }
    );
    platform.videoBlockedUserIds = ['disabled-user'];
    const result = authorizeCallAction({
      action: 'start',
      platform,
      actorUserId: 'disabled-user',
      conversationType: 'DIRECT',
      mediaMode: 'video',
      participantCount: 2
    });
    expect(result.allowed).toBe(false);
    expect((result as any).code).toBe('VIDEO_BLOCKED_FOR_USER');
  });

  test('admin-disabled account can still use audio when voice is allowed', () => {
    const platform = buildLivePlatformVoiceFlags({
      enabledVoiceCalls: true,
      enabledConferenceCalls: true,
      blockedUserIds: [],
      videoBlockedUserIds: ['disabled-user']
    });
    const result = authorizeCallAction({
      action: 'start',
      platform,
      actorUserId: 'disabled-user',
      conversationType: 'DIRECT',
      mediaMode: 'audio',
      participantCount: 2
    });
    expect(result.allowed).toBe(true);
  });

  test('blocked caller rejected on accept action', () => {
    const platform = buildLivePlatformVoiceFlags({
      enabledVoiceCalls: true,
      enabledConferenceCalls: true,
      blockedUserIds: ['blocked-1']
    });
    const result = authorizeCallAction({
      action: 'accept',
      platform,
      actorUserId: 'blocked-1',
      conversationType: 'DIRECT',
      mediaMode: 'audio',
      isInvited: true,
      participantCount: 2
    });
    expect(result.allowed).toBe(false);
    expect((result as any).code).toBe('VOICE_BLOCKED');
  });

  test('disabled feature rejected on accept', () => {
    const platform = buildLivePlatformVoiceFlags({
      enabledVoiceCalls: false,
      enabledConferenceCalls: false,
      blockedUserIds: []
    });
    const result = authorizeCallAction({
      action: 'accept',
      platform,
      actorUserId: 'u1',
      conversationType: 'DIRECT',
      mediaMode: 'audio',
      isInvited: true
    });
    expect(result.allowed).toBe(false);
    expect((result as any).code).toBe('VOICE_CALLS_DISABLED');
  });

  test('video accept denied when max video participants exceeded', () => {
    const platform = buildLivePlatformVoiceFlags(
      { enabledVoiceCalls: true, enabledConferenceCalls: true, blockedUserIds: [] },
      {
        videoFlags: {
          enabledVideoCalls: true,
          enabledScreenSharing: true,
          maxVideoParticipants: 2,
          defaultVideoQuality: 'medium',
          maxResolution: '1280x720',
          maxFrameRate: 30,
          cameraRecordingPolicy: 'disabled',
          maxBitrateKbps: 0,
          allowVirtualBackground: false
        }
      }
    );
    const result = authorizeCallAction({
      action: 'accept',
      platform,
      actorUserId: 'u3',
      conversationType: 'GROUP',
      memberRole: 'MEMBER',
      groupPolicy: resolveGroupCallPolicy({}),
      mediaMode: 'video',
      isInvited: true,
      isConference: true,
      participantCount: 4
    });
    expect(result.allowed).toBe(false);
    expect((result as any).code).toBe('MAX_VIDEO_PARTICIPANTS_EXCEEDED');
  });

  test('participant join helpers', () => {
    const rows = [
      { userId: 'a', status: 'JOINED' },
      { userId: 'b', status: 'INVITED' },
      { userId: 'c', status: 'joined' }
    ];
    expect(participantIsJoined(rows, 'a')).toBe(true);
    expect(participantIsJoined(rows, 'b')).toBe(false);
    // status comparison is uppercase-normalized
    expect(participantIsJoined(rows, 'c')).toBe(true);
    expect(countJoinedParticipants(rows)).toBe(2);
  });
});
