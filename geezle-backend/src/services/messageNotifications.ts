import prisma from '../utils/prismaClient';
import { sendSystemMessage } from './systemMessaging';
import { filterReceiversForMessagePush } from './messaging/notificationPolicy';

type DispatchMessageReceiptNotificationsInput = {
  receiverIds: string[];
  senderId: string;
  conversationId: string;
  messageId: string;
  preview?: string | null;
  fallbackPreview?: string;
  messageType?: string | null;
  /** Optional mention ids for future 22.2 bypass; unused when empty. */
  mentionedUserIds?: string[];
};

const normalizePreview = (preview?: string | null, fallbackPreview?: string) => {
  const text = String(preview || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (text) {
    return text.length > 220 ? `${text.slice(0, 217)}...` : text;
  }
  const fallback = String(fallbackPreview || '').replace(/\s+/g, ' ').trim();
  return fallback || 'You received a new message.';
};

export const dispatchMessageReceiptNotifications = async (
  input: DispatchMessageReceiptNotificationsInput
) => {
  const senderId = String(input.senderId || '').trim();
  const conversationId = String(input.conversationId || '').trim();
  const messageId = String(input.messageId || '').trim();
  const receiverIds = Array.from(
    new Set(
      (input.receiverIds || [])
        .map((id) => String(id || '').trim())
        .filter((id) => Boolean(id) && id !== senderId)
    )
  );

  if (!senderId || !conversationId || !messageId || receiverIds.length === 0) {
    return { attempted: 0, notified: 0, suppressedMuted: 0 };
  }

  // Phase 22.1 — mute-aware push: conversation mute suppresses new_message (forcePush cannot override).
  let mutedUserIds: string[] = [];
  try {
    const mutedRows = await prisma.conversationParticipant.findMany({
      where: {
        conversationId,
        userId: { in: receiverIds },
        isMuted: true
      },
      select: { userId: true }
    });
    mutedUserIds = mutedRows.map((row) => String(row.userId || '').trim()).filter(Boolean);
  } catch (muteError) {
    console.warn('[message-notifications] mute lookup failed; notifying all receivers', muteError);
  }

  const notifyIds = filterReceiversForMessagePush({
    receiverIds,
    mutedUserIds,
    senderId,
    allowMentionBypass: false,
    mentionedUserIds: input.mentionedUserIds
  });
  const suppressedMuted = receiverIds.filter((id) => id !== senderId).length - notifyIds.length;

  if (notifyIds.length === 0) {
    return { attempted: 0, notified: 0, suppressedMuted };
  }

  const sender = await prisma.user.findUnique({
    where: { id: senderId },
    select: { id: true, name: true, email: true }
  });

  const preview = normalizePreview(input.preview, input.fallbackPreview);
  const messageLink = `/messages/${encodeURIComponent(conversationId)}`;
  const senderName = sender?.name || sender?.email || 'Scrolith User';
  const senderEmail = sender?.email || '';

  const results = await Promise.allSettled(
    notifyIds.map((receiverId) =>
      sendSystemMessage({
        templateKey: 'new_message',
        userId: receiverId,
        context: {
          sender: { name: senderName, email: senderEmail },
          message: { preview, link: messageLink }
        },
        actionUrl: messageLink,
        typeOverride: 'message',
        meta: {
          conversationId,
          messageId,
          senderId,
          receiverId,
          messageType: input.messageType || 'text',
          mutedSuppressed: false
        },
        // force flags apply only to unmuted receivers (already filtered).
        forceNotification: true,
        forcePush: true
      })
    )
  );

  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length > 0) {
    console.warn('[message-notifications] failed to deliver some message notifications', {
      conversationId,
      messageId,
      senderId,
      attempted: notifyIds.length,
      failed: failures.length,
      suppressedMuted
    });
  }

  return {
    attempted: notifyIds.length,
    notified: notifyIds.length - failures.length,
    suppressedMuted
  };
};
