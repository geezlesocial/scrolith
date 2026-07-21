/**
 * Phase 29.2 — realtime engine unit tests (pure + catalog + ephemeral + ack mapping).
 */
import {
  GROUP_EVENT_ALIASES,
  GROUP_WIRE_EVENTS,
  groupRoomName,
  mapGateToAckStatus
} from '../messaging/groupRealtimeEvents';
import {
  checkTypingRate,
  clearEphemeralForTests,
  setTypingState,
  setRecordingState,
  snapshotEphemeral,
  clearUserEphemeralEverywhere
} from '../messaging/groupEphemeralIndicators';
import { groupMetrics } from '../messaging/groupMetrics';
import {
  encodeCatchupCursor,
  decodeCatchupCursor
} from '../messaging/groupCatchup';

describe('Phase 29.2 event catalog & aliases', () => {
  test('wire events use messages:* namespace', () => {
    expect(GROUP_WIRE_EVENTS.GROUP_UPDATED).toBe('messages:group_updated');
    expect(GROUP_WIRE_EVENTS.MESSAGE_NEW).toBe('messages:new');
    expect(GROUP_WIRE_EVENTS.TYPING).toBe('messages:typing');
    expect(GROUP_WIRE_EVENTS.PIN_UPDATED).toBe('messages:pin_updated');
    expect(groupRoomName('abc')).toBe('messages:group:abc');
  });

  test('executive aliases map to wire events', () => {
    expect(GROUP_EVENT_ALIASES['group.locked']).toBe(GROUP_WIRE_EVENTS.GROUP_LOCKED);
    expect(GROUP_EVENT_ALIASES['member.joined']).toBe(GROUP_WIRE_EVENTS.MEMBER_JOINED);
    expect(GROUP_EVENT_ALIASES['message.sent']).toBe(GROUP_WIRE_EVENTS.MESSAGE_NEW);
    expect(GROUP_EVENT_ALIASES['typing.started']).toBe(GROUP_WIRE_EVENTS.TYPING);
    expect(GROUP_EVENT_ALIASES['pin.created']).toBe(GROUP_WIRE_EVENTS.PIN_UPDATED);
  });

  test('gate codes map to stable ack statuses', () => {
    expect(mapGateToAckStatus('GROUP_SLOW_MODE')).toBe('slow_mode');
    expect(mapGateToAckStatus('GROUP_LOCKED')).toBe('group_locked');
    expect(mapGateToAckStatus('GROUP_CONTENT_FORBIDDEN', 'content_image')).toBe('content_type_disabled');
    expect(mapGateToAckStatus('GROUP_PERMISSION_DENIED', 'rate_limit')).toBe('rate_limited');
    expect(mapGateToAckStatus('GROUP_NOT_MEMBER')).toBe('not_member');
  });
});

describe('Phase 29.2 multi-typer / recording ephemeral', () => {
  beforeEach(() => clearEphemeralForTests());

  test('supports multiple concurrent typers', () => {
    setTypingState({ conversationId: 'c1', userId: 'u1', name: 'A', isTyping: true });
    setTypingState({ conversationId: 'c1', userId: 'u2', name: 'B', isTyping: true });
    const snap = snapshotEphemeral('c1');
    expect(snap.typing).toHaveLength(2);
    expect(snap.typing.map((t) => t.userId).sort()).toEqual(['u1', 'u2']);
  });

  test('stops typing removes only that user', () => {
    setTypingState({ conversationId: 'c1', userId: 'u1', name: 'A', isTyping: true });
    setTypingState({ conversationId: 'c1', userId: 'u2', name: 'B', isTyping: true });
    setTypingState({ conversationId: 'c1', userId: 'u1', isTyping: false });
    const snap = snapshotEphemeral('c1');
    expect(snap.typing).toHaveLength(1);
    expect(snap.typing[0].userId).toBe('u2');
  });

  test('recording multi-user + disconnect clear', () => {
    setRecordingState({ conversationId: 'c1', userId: 'u1', name: 'A', isRecording: true });
    setRecordingState({ conversationId: 'c2', userId: 'u1', name: 'A', isRecording: true });
    const affected = clearUserEphemeralEverywhere('u1');
    expect(affected.sort()).toEqual(['c1', 'c2']);
    expect(snapshotEphemeral('c1').recording).toHaveLength(0);
  });

  test('typing rate limit eventually blocks', () => {
    let blocked = false;
    for (let i = 0; i < 50; i += 1) {
      const r = checkTypingRate('c-rate', 'u-rate');
      if (!r.allowed) {
        blocked = true;
        break;
      }
    }
    expect(blocked).toBe(true);
  });
});

describe('Phase 29.2 catch-up cursor', () => {
  test('round-trips cursor', () => {
    const enc = encodeCatchupCursor(new Date('2026-07-21T12:00:00.000Z'), 'msg-1');
    const dec = decodeCatchupCursor(enc);
    expect(dec?.id).toBe('msg-1');
    expect(dec?.createdAt).toBe('2026-07-21T12:00:00.000Z');
  });

  test('invalid cursor returns null', () => {
    expect(decodeCatchupCursor('not-valid')).toBeNull();
    expect(decodeCatchupCursor('')).toBeNull();
  });
});

describe('Phase 29.2 metrics', () => {
  beforeEach(() => groupMetrics.resetForTests());

  test('increments counters without storing content', () => {
    groupMetrics.socketJoin();
    groupMetrics.socketJoinDenied();
    groupMetrics.messageSend();
    groupMetrics.messageSendRejected();
    groupMetrics.messageDuplicate();
    groupMetrics.typingEvent();
    groupMetrics.pin();
    groupMetrics.reaction();
    groupMetrics.membershipEvent();
    groupMetrics.reconnectCatchup();
    groupMetrics.deliveryLatency(12);
    const snap = groupMetrics.snapshot();
    expect(snap.group_socket_join_total).toBe(1);
    expect(snap.group_message_send_rejected_total).toBe(1);
    expect(snap.group_event_delivery_latency_ms_count).toBe(1);
  });
});
