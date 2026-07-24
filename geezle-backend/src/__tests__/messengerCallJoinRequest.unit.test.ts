import {
  createJoinRequest,
  expireStaleJoinRequests,
  findApprovedRequest,
  findPendingRequest,
  listJoinRequests,
  resolveJoinRequest,
  upsertJoinRequestsInMetadata
} from '../services/messaging/messengerCallJoinRequest.service';
import { authorizeCallAction, resolveGroupCallPolicy } from '../services/messaging/messengerCallPolicy.service';
import {
  buildTimeLimitedTurnCredentials,
  getMessengerIceClientPayload
} from '../services/messaging/messengerCallIce.service';

const platform = {
  enabledVoiceCalls: true,
  enabledConferenceCalls: true,
  maxParticipants: 8,
  blockedUserIds: [] as string[]
};

describe('messengerCallJoinRequest', () => {
  test('create + pending + approve lifecycle', () => {
    const created = createJoinRequest({
      callId: 'call-1',
      conversationId: 'conv-1',
      requesterId: 'user-m'
    });
    expect(created.status).toBe('pending');
    let requests = [created];
    expect(findPendingRequest(requests, 'user-m')?.requestId).toBe(created.requestId);
    const { next, resolved } = resolveJoinRequest(requests, created.requestId, 'approved', 'user-owner');
    expect(resolved?.status).toBe('approved');
    expect(findApprovedRequest(next, 'user-m')?.requestId).toBe(created.requestId);
    const meta = upsertJoinRequestsInMetadata({ foo: 1 }, next);
    expect(meta.foo).toBe(1);
    expect(listJoinRequests(meta)).toHaveLength(1);
  });

  test('expire stale pending requests', () => {
    const created = createJoinRequest({
      callId: 'call-1',
      conversationId: 'conv-1',
      requesterId: 'user-m',
      ttlMs: 1000
    });
    const expired = expireStaleJoinRequests(
      [{ ...created, expiresAt: new Date(Date.now() - 5000).toISOString() }],
      Date.now()
    );
    expect(expired[0].status).toBe('expired');
  });

  test('REQUEST mode blocks join without approval', () => {
    const policy = resolveGroupCallPolicy({
      policyJson: { callPolicy: { participationMode: 'REQUEST', whoCanJoin: 'ALL_MEMBERS' } }
    });
    const denied = authorizeCallAction({
      action: 'join',
      platform,
      actorUserId: 'm1',
      conversationType: 'GROUP',
      memberRole: 'MEMBER',
      groupPolicy: policy,
      isInvited: false,
      isJoinApproved: false
    });
    expect(denied.allowed).toBe(false);
    expect((denied as any).code).toBe('GROUP_CALL_JOIN_REQUEST_REQUIRED');

    const allowed = authorizeCallAction({
      action: 'join',
      platform,
      actorUserId: 'm1',
      conversationType: 'GROUP',
      memberRole: 'MEMBER',
      groupPolicy: policy,
      isJoinApproved: true
    });
    expect(allowed.allowed).toBe(true);

    const canRequest = authorizeCallAction({
      action: 'request_join',
      platform,
      actorUserId: 'm1',
      conversationType: 'GROUP',
      memberRole: 'MEMBER',
      groupPolicy: policy
    });
    expect(canRequest.allowed).toBe(true);
  });
});

describe('messengerCallIce time-limited credentials', () => {
  test('builds username expiry:user and hmac credential', () => {
    const minted = buildTimeLimitedTurnCredentials({
      secret: 'test-secret-not-for-prod',
      userId: 'user_abc',
      ttlSeconds: 600
    });
    expect(minted.username).toMatch(/^\d+:user_abc$/);
    expect(minted.credential.length).toBeGreaterThan(10);
    expect(minted.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  test('hasTurn false without turn env', () => {
    const prev = process.env.VOICE_ICE_TURN_URLS;
    delete process.env.VOICE_ICE_TURN_URLS;
    delete process.env.VOICE_ICE_TURN_SECRET;
    delete process.env.VOICE_ICE_TURN_USERNAME;
    const payload = getMessengerIceClientPayload({ userId: 'u1' });
    expect(payload.hasTurn).toBe(false);
    if (prev !== undefined) process.env.VOICE_ICE_TURN_URLS = prev;
  });

  test('hasTurn true with secret + turn urls', () => {
    process.env.VOICE_ICE_TURN_URLS = 'turn:turn.example.test:3478';
    process.env.VOICE_ICE_TURN_SECRET = 'unit-test-secret';
    const payload = getMessengerIceClientPayload({ userId: 'u1' });
    expect(payload.hasTurn).toBe(true);
    expect(payload.turnCredentialMode).toBe('time-limited');
    expect(payload.iceServers.some((s) => s.username && s.credential)).toBe(true);
    delete process.env.VOICE_ICE_TURN_URLS;
    delete process.env.VOICE_ICE_TURN_SECRET;
  });
});
