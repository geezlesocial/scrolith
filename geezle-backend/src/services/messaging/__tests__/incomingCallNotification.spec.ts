import { ANDROID_CHANNEL_IDS } from '../../notificationAndroidChannels';
import { buildIncomingCallPushPayload } from '../incomingCallNotification';

describe('buildIncomingCallPushPayload', () => {
  it('builds a self-contained high-priority video call payload', () => {
    const payload = buildIncomingCallPushPayload({
      callId: 'call-123',
      conversationId: 'conversation-456',
      initiatorId: 'user-1',
      initiatorName: 'Jima',
      mediaMode: 'video',
      callType: 'direct',
      participantIds: ['user-1', 'user-2', 'user-2']
    });

    expect(payload.type).toBe('call_ringing');
    expect(payload.title).toBe('Incoming video call');
    expect(payload.deepLink).toBe('/messages/conversation-456');
    expect(payload.data).toMatchObject({
      type: 'call_ringing',
      channelId: ANDROID_CHANNEL_IDS.alerts,
      callId: 'call-123',
      conversationId: 'conversation-456',
      initiatorId: 'user-1',
      mediaMode: 'video',
      status: 'ringing'
    });
    expect(payload.data.participantIds).toEqual(['user-1', 'user-2']);
  });

  it('normalizes missing media mode to an audio call', () => {
    const payload = buildIncomingCallPushPayload({
      callId: 'call-123',
      conversationId: 'conversation-456',
      initiatorId: 'user-1'
    });

    expect(payload.title).toBe('Incoming voice call');
    expect(payload.body).toBe('A Scrolith member is calling you.');
    expect(payload.data.mediaMode).toBe('audio');
  });
});
