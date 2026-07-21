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
  /** Phase 22.2 — @mentioned user ids (mention bypass when muted / MENTIONS level) */
  mentionedUserIds?: string[];
  isGroup?: boolean;
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

  // Phase 22.1/22.2 — mute + group notification levels (forcePush cannot override).
  let mutedUserIds: string[] = [];
  let notificationLevelByUserId: Record<string, string> = {};
  let isGroup = Boolean(input.isGroup);
  try {
    const rows = await prisma.conversationParticipant.findMany({
      where: {
        conversationId,
        userId: { in: receiverIds }
      },
      select: {
        userId: true,
        isMuted: true,
        notifications: true
      } as any
    });
    mutedUserIds = rows
      .filter((row: any) => Boolean(row.isMuted))
      .map((row: any) => String(row.userId || '').trim())
      .filter(Boolean);
    rows.forEach((row: any) => {
      const id = String(row.userId || '').trim();
      if (id && row.notifications) notificationLevelByUserId[id] = String(row.notifications);
    });
    if (!isGroup) {
      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { type: true }
      });
      isGroup = conv?.type === 'GROUP';
    }
  } catch (muteError) {
    // Fallback: older schema without notifications column
    try {
      const mutedRows = await prisma.conversationParticipant.findMany({
        where: { conversationId, userId: { in: receiverIds }, isMuted: true },
        select: { userId: true }
      });
      mutedUserIds = mutedRows.map((row) => String(row.userId || '').trim()).filter(Boolean);
    } catch (e2) {
      console.warn('[message-notifications] mute lookup failed; notifying all receivers', e2);
    }
  }

  const mentionedUserIds = Array.isArray(input.mentionedUserIds) ? input.mentionedUserIds : [];
  const notifyIds = filterReceiversForMessagePush({
    receiverIds,
    mutedUserIds,
    senderId,
    allowMentionBypass: mentionedUserIds.length > 0,
    mentionedUserIds,
    notificationLevelByUserId,
    isGroup
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

  // Phase 22.3B — per-recipient notification preview privacy
  let previewAllowedByUser: Record<string, boolean> = {};
  try {
    const { canIncludeMessagePreview } = await import('./messaging/messagingPrivacyPolicy');
    await Promise.all(
      notifyIds.map(async (receiverId) => {
        previewAllowedByUser[receiverId] = await canIncludeMessagePreview(receiverId);
      })
    );
  } catch {
    previewAllowedByUser = {};
  }

  const results = await Promise.allSettled(
    notifyIds.map((receiverId) => {
      const allowPreview = previewAllowedByUser[receiverId] !== false;
      const safePreview = allowPreview
        ? preview
        : `New message from ${senderName}`;
      return sendSystemMessage({
        templateKey: 'new_message',
        userId: receiverId,
        context: {
          sender: { name: senderName, email: senderEmail },
          message: { preview: safePreview, link: messageLink }
        },
        actionUrl: messageLink,
        typeOverride: 'message',
        meta: {
          conversationId,
          messageId,
          senderId,
          receiverId,
          messageType: input.messageType || 'text',
          mutedSuppressed: false,
          previewRedacted: !allowPreview
        },
        // force flags apply only to unmuted receivers (already filtered).
        forceNotification: true,
        forcePush: true
      });
    })
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

type DispatchMessageReactionNotificationsInput = {
  /** Conversation participants who should be eligible (excluding reactor). */
  receiverIds: string[];
  reactorUserId: string;
  conversationId: string;
  messageId: string;
  /** Author of the original message — preferred notify target. */
  messageAuthorId?: string | null;
  emoji: string;
  messagePreview?: string | null;
  isGroup?: boolean;
};

/**
 * Push + in-app when someone reacts to an inbox message.
 * Notifies other participants (never the reactor), respecting mute / group levels.
 * Only call on reaction add (not remove).
 */
export const dispatchMessageReactionNotifications = async (
  input: DispatchMessageReactionNotificationsInput
) => {
  const reactorUserId = String(input.reactorUserId || '').trim();
  const conversationId = String(input.conversationId || '').trim();
  const messageId = String(input.messageId || '').trim();
  const emoji = String(input.emoji || '').trim() || '👍';
  const messageAuthorId = String(input.messageAuthorId || '').trim();

  const preferredReceivers = Array.from(
    new Set(
      [
        messageAuthorId,
        ...(input.receiverIds || []).map((id) => String(id || '').trim())
      ].filter((id) => Boolean(id) && id !== reactorUserId)
    )
  );

  if (!reactorUserId || !conversationId || !messageId || preferredReceivers.length === 0) {
    return { attempted: 0, notified: 0, suppressedMuted: 0 };
  }

  let mutedUserIds: string[] = [];
  let notificationLevelByUserId: Record<string, string> = {};
  let isGroup = Boolean(input.isGroup);
  try {
    const rows = await prisma.conversationParticipant.findMany({
      where: {
        conversationId,
        userId: { in: preferredReceivers }
      },
      select: {
        userId: true,
        isMuted: true,
        notifications: true
      } as any
    });
    mutedUserIds = rows
      .filter((row: any) => Boolean(row.isMuted))
      .map((row: any) => String(row.userId || '').trim())
      .filter(Boolean);
    rows.forEach((row: any) => {
      const id = String(row.userId || '').trim();
      if (id && row.notifications) notificationLevelByUserId[id] = String(row.notifications);
    });
    if (!isGroup) {
      const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { type: true }
      });
      isGroup = conv?.type === 'GROUP';
    }
  } catch (muteError) {
    try {
      const mutedRows = await prisma.conversationParticipant.findMany({
        where: { conversationId, userId: { in: preferredReceivers }, isMuted: true },
        select: { userId: true }
      });
      mutedUserIds = mutedRows.map((row) => String(row.userId || '').trim()).filter(Boolean);
    } catch (e2) {
      console.warn('[message-notifications] reaction mute lookup failed; notifying all', e2);
    }
  }

  const notifyIds = filterReceiversForMessagePush({
    receiverIds: preferredReceivers,
    mutedUserIds,
    senderId: reactorUserId,
    allowMentionBypass: false,
    mentionedUserIds: [],
    notificationLevelByUserId,
    isGroup
  });
  const suppressedMuted = preferredReceivers.length - notifyIds.length;

  if (notifyIds.length === 0) {
    return { attempted: 0, notified: 0, suppressedMuted };
  }

  const reactor = await prisma.user.findUnique({
    where: { id: reactorUserId },
    select: { id: true, name: true, email: true }
  });

  const reactorName = reactor?.name || reactor?.email || 'Someone';
  const messageLink = `/messages/${encodeURIComponent(conversationId)}`;
  const previewSnippet = normalizePreview(input.messagePreview, 'a message');
  const bodyPreview = `${reactorName} reacted ${emoji} to: ${previewSnippet}`;

  let previewAllowedByUser: Record<string, boolean> = {};
  try {
    const { canIncludeMessagePreview } = await import('./messaging/messagingPrivacyPolicy');
    await Promise.all(
      notifyIds.map(async (receiverId) => {
        previewAllowedByUser[receiverId] = await canIncludeMessagePreview(receiverId);
      })
    );
  } catch {
    previewAllowedByUser = {};
  }

  const results = await Promise.allSettled(
    notifyIds.map((receiverId) => {
      const allowPreview = previewAllowedByUser[receiverId] !== false;
      const safePreview = allowPreview
        ? bodyPreview
        : `${reactorName} reacted ${emoji} to a message`;
      return sendSystemMessage({
        templateKey: 'message_reaction',
        userId: receiverId,
        actorId: reactorUserId,
        context: {
          sender: { name: reactorName, email: reactor?.email || '' },
          message: {
            preview: safePreview,
            link: messageLink,
            emoji,
            reactionEmoji: emoji
          }
        },
        actionUrl: messageLink,
        typeOverride: 'message_reaction',
        meta: {
          conversationId,
          messageId,
          senderId: reactorUserId,
          reactorUserId,
          receiverId,
          emoji,
          messageType: 'reaction',
          previewRedacted: !allowPreview
        },
        forceNotification: true,
        forcePush: true
      });
    })
  );

  const failures = results.filter((result) => result.status === 'rejected');
  if (failures.length > 0) {
    console.warn('[message-notifications] failed to deliver some reaction notifications', {
      conversationId,
      messageId,
      reactorUserId,
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
