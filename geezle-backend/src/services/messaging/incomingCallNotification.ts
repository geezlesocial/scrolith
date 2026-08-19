import { ANDROID_CHANNEL_IDS } from '../notificationAndroidChannels';

export type IncomingCallNotificationInput = {
  callId: string;
  conversationId: string;
  initiatorId: string;
  initiatorName?: string | null;
  mediaMode?: string | null;
  callType?: string | null;
  participantIds?: string[];
};

/**
 * Build the durable push contract used when the recipient has no live socket.
 * The notification payload is intentionally self-contained so Android can
 * display it while the WebView is cold and the app can restore the call after
 * the user taps it.
 */
export const buildIncomingCallPushPayload = (input: IncomingCallNotificationInput) => {
  const callId = String(input.callId || '').trim();
  const conversationId = String(input.conversationId || '').trim();
  const mediaMode = String(input.mediaMode || 'audio').trim().toLowerCase() === 'video' ? 'video' : 'audio';
  const callType = String(input.callType || 'direct').trim().toLowerCase() || 'direct';
  const initiatorName = String(input.initiatorName || '').trim() || 'A Scrolith member';
  const title = mediaMode === 'video' ? 'Incoming video call' : 'Incoming voice call';

  return {
    id: `call:${callId}`,
    type: 'call_ringing',
    title,
    body: `${initiatorName} is calling you.`,
    deepLink: `/messages/${encodeURIComponent(conversationId)}`,
    data: {
      type: 'call_ringing',
      notificationCategory: 'system',
      channelId: ANDROID_CHANNEL_IDS.alerts,
      callId,
      conversationId,
      initiatorId: String(input.initiatorId || '').trim(),
      initiatorName,
      mediaMode,
      callType,
      status: 'ringing',
      participantIds: Array.from(new Set((input.participantIds || []).map((id) => String(id || '').trim()).filter(Boolean))),
      badgeCount: 1
    },
    meta: {
      category: 'system',
      entityType: 'call',
      callId,
      conversationId
    }
  };
};
