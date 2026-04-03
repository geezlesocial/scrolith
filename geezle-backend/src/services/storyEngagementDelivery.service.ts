import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';
import { notifyUser } from '../utils/notify';

const normalizeId = (value: unknown) => String(value || '').trim();

const buildSnippet = (value: unknown, maxLength = 140) => {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
};

export const buildStoryActionUrl = (storyId: string) =>
  `/community?story=${encodeURIComponent(String(storyId || '').trim())}`;

const getActorSnapshot = async (actorId?: string | null) => {
  const normalizedActorId = normalizeId(actorId);
  if (!normalizedActorId) return null;
  const actor = await prisma.user.findUnique({
    where: { id: normalizedActorId },
    select: { id: true, name: true, username: true, avatar: true }
  });
  if (!actor) return null;
  return {
    actorId: normalizedActorId,
    actorName: actor.name || actor.username || 'Scrolith member',
    actorUsername: actor.username || null,
    actorAvatar: actor.avatar || null
  };
};

const getOrCreateDirectConversation = async (leftUserId: string, rightUserId: string) => {
  const userAId = normalizeId(leftUserId);
  const userBId = normalizeId(rightUserId);
  if (!userAId || !userBId) {
    throw new Error('Conversation participants are required.');
  }
  const existing = await prisma.conversation.findFirst({
    where: {
      type: 'DIRECT',
      participants: {
        some: {
          userId: userAId
        }
      },
      AND: [
        {
          participants: {
            some: {
              userId: userBId
            }
          }
        }
      ]
    },
    include: {
      participants: {
        select: {
          userId: true
        }
      }
    }
  });
  if (existing?.id && Array.isArray(existing.participants) && existing.participants.length === 2) return existing;
  return prisma.conversation.create({
    data: {
      type: 'DIRECT',
      participants: {
        create: [
          { userId: userAId, label: 'other' },
          { userId: userBId, label: 'other' }
        ]
      }
    },
    include: {
      participants: {
        select: {
          userId: true
        }
      }
    }
  });
};

export const createStoryInboxMessage = async (input: {
  senderId: string;
  recipientId: string;
  storyId: string;
  kind: string;
  text: string;
  metadata?: Record<string, any> | null;
}) => {
  const senderId = normalizeId(input.senderId);
  const recipientId = normalizeId(input.recipientId);
  const storyId = normalizeId(input.storyId);
  const text = String(input.text || '').trim();
  if (!senderId || !recipientId || !storyId || !text || senderId === recipientId) {
    return null;
  }

  const conversation = await getOrCreateDirectConversation(senderId, recipientId);
  await prisma.conversationParticipant.updateMany({
    where: {
      conversationId: conversation.id,
      userId: { in: [senderId, recipientId] }
    },
    data: {
      deletedAt: null,
      isArchived: false
    }
  });

  const message = await prisma.directMessage.create({
    data: {
      conversationId: conversation.id,
      senderId,
      text,
      isSystem: true,
      metadata: {
        category: String(input.kind || 'story_event').trim() || 'story_event',
        storyId,
        actionUrl: buildStoryActionUrl(storyId),
        ...(input.metadata || {})
      }
    },
    select: {
      id: true,
      conversationId: true,
      senderId: true,
      text: true,
      createdAt: true,
      messageType: true,
      metadata: true
    }
  });

  const lastMessageText = buildSnippet(message.text, 220);
  await prisma.conversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageText,
      lastMessageAt: message.createdAt,
      lastMessageSenderId: senderId
    }
  });

  const payload = {
    id: message.id,
    messageId: message.id,
    conversationId: conversation.id,
    conversation_id: conversation.id,
    senderId,
    sender_id: senderId,
    receiverId: recipientId,
    receiver_id: recipientId,
    text: message.text,
    messageType: String(message.messageType || 'text').toLowerCase(),
    message_type: String(message.messageType || 'text').toLowerCase(),
    timestamp: message.createdAt.toISOString(),
    createdAt: message.createdAt.toISOString(),
    metadata: message.metadata || {},
    attachments: [],
    attachment_ids: [],
    is_deleted: false,
    isDeleted: false
  };

  try {
    realtime.emitToUser(recipientId, 'messages:new', payload);
    realtime.emitToUser(senderId, 'messages:sent', payload);
    const conversationPayload = {
      conversationId: conversation.id,
      last_message: lastMessageText,
      lastMessage: lastMessageText,
      last_message_at: message.createdAt.toISOString(),
      lastMessageAt: message.createdAt.toISOString()
    };
    realtime.emitToUser(recipientId, 'messages:conversation_updated', conversationPayload);
    realtime.emitToUser(senderId, 'messages:conversation_updated', conversationPayload);
  } catch {
    // Ignore realtime delivery failures; persistence already succeeded.
  }

  return {
    conversationId: conversation.id,
    messageId: message.id
  };
};

export const createStoryNotification = async (input: {
  recipientId: string;
  actorId?: string | null;
  type: string;
  title: string;
  body: string;
  actionUrl?: string | null;
  metadata?: Record<string, any> | null;
}) => {
  const recipientId = normalizeId(input.recipientId);
  const actorId = normalizeId(input.actorId);
  if (!recipientId || (actorId && recipientId === actorId)) return null;

  const actorSnapshot = await getActorSnapshot(actorId || null);
  const metadata = {
    ...(input.metadata || {}),
    actionUrl: input.actionUrl || null,
    action_url: input.actionUrl || null,
    actorId: actorSnapshot?.actorId || actorId || null,
    actorName: actorSnapshot?.actorName || null,
    actorUsername: actorSnapshot?.actorUsername || null,
    actorAvatar: actorSnapshot?.actorAvatar || null
  };

  const created = await prisma.notification.create({
    data: {
      userId: recipientId,
      actorId: actorId || null,
      type: String(input.type || 'story_event').trim() || 'story_event',
      title: String(input.title || 'Story update').trim(),
      body: String(input.body || '').trim(),
      meta: metadata,
      isRead: false
    }
  });

  notifyUser(recipientId, {
    id: created.id,
    type: created.type,
    title: created.title || 'Story update',
    body: created.body || '',
    actionUrl: input.actionUrl || undefined,
    meta: metadata,
    createdAt: created.createdAt.toISOString()
  });

  return created;
};

export const deliverStoryEngagementAlert = async (input: {
  recipientId: string;
  actorId?: string | null;
  storyId: string;
  notificationType: string;
  title: string;
  body: string;
  inboxText?: string | null;
  inboxMetadata?: Record<string, any> | null;
  notificationMetadata?: Record<string, any> | null;
  notificationActionUrl?: string | null;
}) => {
  const recipientId = normalizeId(input.recipientId);
  const actorId = normalizeId(input.actorId);
  const storyId = normalizeId(input.storyId);
  if (!recipientId || !storyId || !actorId || recipientId === actorId) return null;

  const inboxDelivery = input.inboxText
    ? await createStoryInboxMessage({
        senderId: actorId,
        recipientId,
        storyId,
        kind: input.notificationType,
        text: input.inboxText,
        metadata: input.inboxMetadata || undefined
      })
    : null;

  const actionUrl =
    normalizeId(inboxDelivery?.conversationId)
      ? `/messages/${encodeURIComponent(String(inboxDelivery?.conversationId || '').trim())}`
      : input.notificationActionUrl || buildStoryActionUrl(storyId);

  const notification = await createStoryNotification({
    recipientId,
    actorId,
    type: input.notificationType,
    title: input.title,
    body: input.body,
    actionUrl,
    metadata: {
      storyId,
      entityType: 'story',
      entityId: storyId,
      conversationId: inboxDelivery?.conversationId || null,
      messageId: inboxDelivery?.messageId || null,
      ...(input.notificationMetadata || {})
    }
  });

  return {
    notificationId: notification?.id || null,
    conversationId: inboxDelivery?.conversationId || null,
    messageId: inboxDelivery?.messageId || null,
    actionUrl
  };
};
