import {
  wouldExceedVideoCap
} from '../services/messaging/messengerCallCapacity.service';
import { authorizeCallAction, resolveGroupCallPolicy } from '../services/messaging/messengerCallPolicy.service';
import { buildLivePlatformVoiceFlags } from '../services/messaging/messengerCallPlatform.service';

/**
 * In-memory transaction mock simulating FOR UPDATE serialization for concurrent accepts.
 */
function createCapacityMockDb(seed: {
  callId: string;
  maxVideo: number;
  joined: string[];
  invited: string[];
  mediaMode?: 'audio' | 'video';
  callType?: string;
}) {
  let joined = new Set(seed.joined);
  let acceptOrder: string[] = [];
  let lock: Promise<void> = Promise.resolve();

  const withLock = async <T>(fn: () => Promise<T>): Promise<T> => {
    const prev = lock;
    let release!: () => void;
    lock = new Promise<void>((r) => {
      release = r;
    });
    await prev;
    try {
      return await fn();
    } finally {
      release();
    }
  };

  const platform = buildLivePlatformVoiceFlags(
    {
      enabledVoiceCalls: true,
      enabledConferenceCalls: true,
      blockedUserIds: [],
      maxParticipants: 20
    },
    {
      videoFlags: {
        enabledVideoCalls: true,
        enabledScreenSharing: true,
        maxVideoParticipants: seed.maxVideo,
        defaultVideoQuality: 'medium',
        maxResolution: '1280x720',
        maxFrameRate: 30,
        cameraRecordingPolicy: 'disabled',
        maxBitrateKbps: 0,
        allowVirtualBackground: false
      }
    }
  );

  const tryAccept = async (userId: string) =>
    withLock(async () => {
      const already = joined.has(userId);
      const participantCount = joined.size + (already ? 0 : 1);
      const auth = authorizeCallAction({
        action: 'accept',
        platform,
        actorUserId: userId,
        conversationType: 'GROUP',
        memberRole: 'MEMBER',
        groupPolicy: resolveGroupCallPolicy({}),
        isConference: true,
        isInvited: seed.invited.includes(userId) || already,
        mediaMode: seed.mediaMode || 'video',
        participantCount
      });
      if (!auth.allowed) {
        return { ok: false as const, code: (auth as any).code as string };
      }
      joined.add(userId);
      acceptOrder.push(userId);
      return { ok: true as const, joined: joined.size };
    });

  const tryUpgrade = async (userId: string, action: 'toggle_video' | 'screen_share') =>
    withLock(async () => {
      const auth = authorizeCallAction({
        action,
        platform,
        actorUserId: userId,
        conversationType: 'GROUP',
        memberRole: 'MEMBER',
        groupPolicy: resolveGroupCallPolicy({}),
        isConference: true,
        isInvited: true,
        mediaMode: 'video',
        participantCount: joined.size
      });
      if (!auth.allowed) {
        return { ok: false as const, code: (auth as any).code as string, mediaMode: seed.mediaMode || 'audio' };
      }
      seed.mediaMode = 'video';
      return { ok: true as const, mediaMode: 'video' as const };
    });

  return { tryAccept, tryUpgrade, getJoined: () => joined.size, getAcceptOrder: () => acceptOrder, platform };
}

describe('R-02 concurrent accept capacity', () => {
  test('exactly one of two concurrent accepts succeeds when one slot remains', async () => {
    // maxVideo=3, already 2 joined → one slot
    const db = createCapacityMockDb({
      callId: 'c1',
      maxVideo: 3,
      joined: ['u1', 'u2'],
      invited: ['u3', 'u4'],
      mediaMode: 'video',
      callType: 'CONFERENCE'
    });

    const [a, b] = await Promise.all([db.tryAccept('u3'), db.tryAccept('u4')]);
    const oks = [a, b].filter((r) => r.ok);
    const fails = [a, b].filter((r) => !r.ok);
    expect(oks).toHaveLength(1);
    expect(fails).toHaveLength(1);
    expect((fails[0] as any).code).toBe('MAX_VIDEO_PARTICIPANTS_EXCEEDED');
    expect(db.getJoined()).toBe(3);
  });

  test('duplicate accept is idempotent-friendly (second join same user still allowed by policy math)', async () => {
    const db = createCapacityMockDb({
      callId: 'c1',
      maxVideo: 4,
      joined: ['u1'],
      invited: ['u2'],
      mediaMode: 'video'
    });
    const first = await db.tryAccept('u2');
    const second = await db.tryAccept('u2');
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(db.getJoined()).toBe(2);
  });
});

describe('R-03 media upgrade video caps', () => {
  test('upgrade denied when joined count exceeds max video', async () => {
    const db = createCapacityMockDb({
      callId: 'c1',
      maxVideo: 2,
      joined: ['u1', 'u2', 'u3'],
      invited: [],
      mediaMode: 'audio'
    });
    const result = await db.tryUpgrade('u1', 'toggle_video');
    expect(result.ok).toBe(false);
    expect((result as any).code).toBe('MAX_VIDEO_PARTICIPANTS_EXCEEDED');
  });

  test('upgrade allowed at exact cap', async () => {
    const db = createCapacityMockDb({
      callId: 'c1',
      maxVideo: 3,
      joined: ['u1', 'u2', 'u3'],
      invited: [],
      mediaMode: 'audio'
    });
    const result = await db.tryUpgrade('u2', 'toggle_video');
    expect(result.ok).toBe(true);
    expect((result as any).mediaMode).toBe('video');
  });

  test('two simultaneous upgrades under lock: policy recheck uses latest count', async () => {
    // When already at video with 3 joined and max 3, both upgrades authorized as toggle on existing video call
    // More interesting: audio call with 3 joined max 3 — both try upgrade; both see count 3 and both pass.
    // Cap is on participant count not number of upgrades. Use max 2 with 2 joined.
    const db = createCapacityMockDb({
      callId: 'c1',
      maxVideo: 2,
      joined: ['u1', 'u2'],
      invited: [],
      mediaMode: 'audio'
    });
    const [a, b] = await Promise.all([db.tryUpgrade('u1', 'toggle_video'), db.tryUpgrade('u2', 'screen_share')]);
    // Both at exact cap (2) → both allowed for video mode with count 2
    expect(a.ok && b.ok).toBe(true);
  });

  test('wouldExceedVideoCap helper matches policy actions', () => {
    expect(
      wouldExceedVideoCap({
        joinedCount: 5,
        maxVideoParticipants: 4,
        mediaMode: 'video',
        action: 'toggle_video'
      })
    ).toBe(true);
    expect(
      wouldExceedVideoCap({
        joinedCount: 3,
        maxVideoParticipants: 4,
        mediaMode: 'video',
        action: 'screen_share'
      })
    ).toBe(false);
    expect(
      wouldExceedVideoCap({
        joinedCount: 10,
        maxVideoParticipants: 4,
        mediaMode: 'audio',
        action: 'toggle_video'
      })
    ).toBe(false);
  });

  test('video disabled blocks upgrade', () => {
    const platform = buildLivePlatformVoiceFlags(
      { enabledVoiceCalls: true, enabledConferenceCalls: true, blockedUserIds: [] },
      {
        videoFlags: {
          enabledVideoCalls: false,
          enabledScreenSharing: false,
          maxVideoParticipants: 6,
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
      action: 'toggle_video',
      platform,
      actorUserId: 'u1',
      conversationType: 'DIRECT',
      mediaMode: 'video',
      participantCount: 2
    });
    expect(result.allowed).toBe(false);
    expect((result as any).code).toBe('VIDEO_CALLS_DISABLED');
  });

  test('screen share denied when screen sharing disabled', () => {
    const platform = buildLivePlatformVoiceFlags(
      { enabledVoiceCalls: true, enabledConferenceCalls: true, blockedUserIds: [] },
      {
        videoFlags: {
          enabledVideoCalls: true,
          enabledScreenSharing: false,
          maxVideoParticipants: 6,
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
      action: 'screen_share',
      platform,
      actorUserId: 'u1',
      conversationType: 'DIRECT',
      mediaMode: 'video',
      participantCount: 2
    });
    expect(result.allowed).toBe(false);
    expect((result as any).code).toBe('SCREEN_SHARING_DISABLED');
  });
});
