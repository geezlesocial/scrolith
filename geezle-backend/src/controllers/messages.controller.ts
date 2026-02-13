import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { resolveUserProStatus } from '../utils/proStatus';
import { syncFileUsages, removeUsage } from '../utils/fileUsage';
import { notifyAdmins } from '../utils/notify';
import { sendSystemMessage } from '../services/systemMessaging';

const nowIso = () => new Date().toISOString();
const isMessagesTraceEnabled = () =>
  ['1', 'true', 'yes', 'on'].includes(String(process.env.MESSAGES_TRACE_DEBUG || '').toLowerCase());

const traceMessageEvent = (event: string, details?: Record<string, any>) => {
  if (!isMessagesTraceEnabled()) return;
  try {
    console.log('[messages-trace]', JSON.stringify({ event, timestamp: nowIso(), ...(details || {}) }));
  } catch {
    console.log('[messages-trace]', event, details || {});
  }
};

const summarizeMessagePayload = (payload: any) => {
  if (!payload || typeof payload !== 'object') return { type: typeof payload };
  const text = String(payload.text || '');
  const attachments = Array.isArray(payload.attachments)
    ? payload.attachments
    : Array.isArray(payload.attachment_ids)
      ? payload.attachment_ids
      : [];
  return {
    conversationId: payload.conversationId || payload.conversation_id || null,
    messageId: payload.messageId || payload.id || null,
    senderId: payload.senderId || payload.sender_id || null,
    receiverId: payload.receiverId || payload.receiver_id || null,
    textLength: text.length,
    attachmentsCount: attachments.length,
    isDeleted: Boolean(payload.isDeleted ?? payload.is_deleted ?? false),
    editedAt: payload.editedAt || payload.edited_at || null,
    reactionCount: Array.isArray(payload.reactions) ? payload.reactions.length : undefined
  };
};

const resolveUserId = (req: Request) => {
  const userId = req.user?.id;
  if (typeof userId === 'string' && userId.length > 0) return userId;
  return (req.query.userId as string) || '';
};

const resolveRole = (req: Request) => {
  const role = req.user?.role;
  if (typeof role === 'string' && role.length > 0) return role.toLowerCase();
  return ((req.query.role as string) || '').toLowerCase();
};

const isAdminRole = (role: string) =>
  role.includes('admin') || role.includes('moderator') || role.includes('superadmin');

const normalizeGender = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'male') return 'Male';
  if (normalized === 'female') return 'Female';
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const isReplyFeatureUnsupportedError = (error: any) => {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  const normalized = message.replace(/\s+/g, ' ').toLowerCase();
  const hasReplyToMessageUnknown =
    normalized.includes('replytomessage') &&
    (normalized.includes('unknown field') || normalized.includes('unknown argument'));
  const hasReplyToMessageIdUnknown =
    normalized.includes('replytomessageid') &&
    (normalized.includes('unknown field') || normalized.includes('unknown argument') || normalized.includes('does not exist'));
  const hasReplyToSnapshotUnknown =
    normalized.includes('replytosnapshot') &&
    (normalized.includes('unknown field') || normalized.includes('unknown argument') || normalized.includes('does not exist'));
  return (
    code === 'P2022' ||
    message.includes('Unknown field `replyToMessage`') ||
    message.includes('Unknown argument `replyToMessage`') ||
    message.includes('Unknown argument `replyToMessageId`') ||
    message.includes('Unknown argument `replyToSnapshot`') ||
    message.includes('Unknown field `replyToMessageId`') ||
    message.includes('Unknown field `replyToSnapshot`') ||
    (message.includes('replyToMessageId') && message.includes('does not exist')) ||
    (message.includes('replyToSnapshot') && message.includes('does not exist')) ||
    hasReplyToMessageUnknown ||
    hasReplyToMessageIdUnknown ||
    hasReplyToSnapshotUnknown
  );
};

const replyToMessageSelect: any = {
  id: true,
  senderId: true,
  text: true,
  attachments: true,
  deletedAt: true,
  sender: { select: { id: true, name: true, email: true } }
};

const messagesIncludeWithReply: any = {
  orderBy: { createdAt: 'asc' },
  take: 200,
  include: {
    reactions: true,
    replyToMessage: {
      select: replyToMessageSelect
    }
  }
};

const messagesIncludeBase: any = {
  orderBy: { createdAt: 'asc' },
  take: 200,
  include: {
    reactions: true
  }
};

const normalizeAttachmentIds = (input: any): string[] => {
  if (!Array.isArray(input)) return [];
  return Array.from(new Set(input.map((value) => String(value)).filter((value) => value.length > 0)));
};

const buildAttachmentMap = async (fileIds: string[]) => {
  const ids = Array.from(new Set((fileIds || []).filter(Boolean)));
  if (!ids.length) return new Map<string, any>();
  const files = await prisma.file.findMany({ where: { id: { in: ids } } });
  const entries: Array<[string, any]> = files.map((file) => [file.id, file]);
  return new Map<string, any>(entries);
};

const participantUserSelect: any = {
  id: true,
  name: true,
  email: true,
  avatar: true,
  role: true,
  isOnline: true,
  lastSeenAt: true,
  username: true,
  profile: {
    select: {
      gender: true
    }
  }
};

const mapAttachments = (fileIds: string[], fileMap: Map<string, any>) => {
  const ids = Array.from(new Set((fileIds || []).filter(Boolean)));
  if (!ids.length) return [];
  return ids
    .map((id) => {
      const file = fileMap.get(id);
      if (!file) return null;
      const mimeType = file.mimeType || '';
      const type = mimeType.startsWith('image/')
        ? 'image'
        : mimeType.startsWith('video/')
          ? 'video'
          : 'document';
      return {
        id: file.id,
        url: file.url,
        name: file.originalName,
        mimeType: file.mimeType,
        type,
        size: Number(file.size || 0)
      };
    })
    .filter(Boolean);
};

const formatParticipant = (participant: any) => {
  const pro = resolveUserProStatus(participant.user);
  const isPro = Boolean(pro.freelancerIsPro || pro.employerIsPro);
  const profileUrl = participant.user?.username
    ? `/u/${participant.user.username}`
    : `/profile/${participant.user.id}`;
  return {
    id: participant.user.id,
    name: participant.user.name || participant.user.email || 'User',
    avatar: participant.user.avatar || '',
    username: participant.user.username || '',
    gender: normalizeGender(participant.user?.profile?.gender),
    profile_url: profileUrl,
    profileUrl,
    role: participant.user.role,
    is_online: Boolean(participant.user.isOnline),
    isOnline: Boolean(participant.user.isOnline),
    last_seen_at: participant.user.lastSeenAt ? participant.user.lastSeenAt.toISOString() : undefined,
    lastSeenAt: participant.user.lastSeenAt ? participant.user.lastSeenAt.toISOString() : undefined,
    is_pro: isPro,
    isPro,
    is_pro_freelancer: Boolean(pro.freelancerIsPro),
    isProFreelancer: Boolean(pro.freelancerIsPro),
    is_pro_employer: Boolean(pro.employerIsPro),
    isProEmployer: Boolean(pro.employerIsPro),
    label: participant.label || 'other',
    is_starred: Boolean(participant.isStarred),
    isStarred: Boolean(participant.isStarred),
    is_muted: Boolean(participant.isMuted),
    isMuted: Boolean(participant.isMuted),
    is_archived: Boolean(participant.isArchived),
    isArchived: Boolean(participant.isArchived)
  };
};

const formatReaction = (reaction: any) => ({
  user_id: reaction.userId,
  userId: reaction.userId,
  emoji: reaction.emoji,
  timestamp: reaction.createdAt ? reaction.createdAt.toISOString() : nowIso()
});

const resolveMessageSnippet = (message: any) => {
  const text = String(message?.text || '').trim();
  if (text) return text.slice(0, 160);
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  if (attachments.length) return 'Attachment';
  return 'Message';
};

const buildReplyPreview = (message: any) => {
  if (!message?.replyToMessageId && !message?.replyToSnapshot) return null;

  const snapshot = message?.replyToSnapshot && typeof message.replyToSnapshot === 'object'
    ? message.replyToSnapshot
    : null;
  const source = message?.replyToMessage || null;
  const sourceSender = source?.sender || null;

  const senderName =
    snapshot?.senderName ||
    sourceSender?.name ||
    sourceSender?.email ||
    'User';
  const sourceDeleted = Boolean(source?.deletedAt);
  const snippet = sourceDeleted
    ? 'Message unavailable'
    : snapshot?.snippet ||
      resolveMessageSnippet(source);
  const attachmentPreview =
    snapshot?.attachmentPreview ||
    (Array.isArray(source?.attachments) && source.attachments.length
      ? { type: 'file', label: 'Attachment' }
      : undefined);
  const unavailable = sourceDeleted || (!source && !snapshot);

  return {
    messageId: message.replyToMessageId || snapshot?.messageId || null,
    senderId: snapshot?.senderId || source?.senderId || null,
    senderName,
    snippet,
    attachmentPreview,
    unavailable: Boolean(unavailable)
  };
};

const formatConversationMessage = (
  message: any,
  conversation: any,
  viewerId?: string,
  lastReadAt: number = 0
) => {
  const receiverId =
    conversation.type === 'DIRECT'
      ? conversation.participants.find((p: any) => p.userId !== message.senderId)?.userId || ''
      : '';
  const createdAt = message.createdAt ? new Date(message.createdAt).getTime() : 0;
  const isRead =
    viewerId && (message.senderId === viewerId || (lastReadAt && createdAt <= lastReadAt));
  const attachmentIds = Array.isArray(message.attachments) ? message.attachments : [];
  const replyPreview = buildReplyPreview(message);

  return {
    id: message.id,
    conversation_id: conversation.id,
    sender_id: message.senderId,
    receiver_id: receiverId,
    text: message.text,
    timestamp: message.createdAt ? message.createdAt.toISOString() : nowIso(),
    is_read: Boolean(isRead),
    is_deleted: Boolean(message.deletedAt),
    isDeleted: Boolean(message.deletedAt),
    deleted_at: message.deletedAt ? message.deletedAt.toISOString() : null,
    deletedAt: message.deletedAt ? message.deletedAt.toISOString() : null,
    edited_at: message.editedAt ? message.editedAt.toISOString() : null,
    editedAt: message.editedAt ? message.editedAt.toISOString() : null,
    reactions: message.reactions ? message.reactions.map(formatReaction) : [],
    attachments: attachmentIds,
    attachment_ids: attachmentIds,
    reply_to_message_id: message.replyToMessageId || null,
    replyToMessageId: message.replyToMessageId || null,
    reply_to_snapshot: message.replyToSnapshot || null,
    replyToSnapshot: message.replyToSnapshot || null,
    reply_to: replyPreview,
    replyTo: replyPreview
  };
};

const buildConversationPayload = (conversation: any, viewerId?: string) => {
  const participants = conversation.participants.map(formatParticipant);
  const viewer = viewerId
    ? conversation.participants.find((p: any) => p.userId === viewerId)
    : null;
  const lastReadAt = viewer?.lastReadAt ? new Date(viewer.lastReadAt).getTime() : 0;

  const messages = conversation.messages.map((message: any) =>
    formatConversationMessage(message, conversation, viewerId, lastReadAt)
  );

  const lastMessage =
    conversation.lastMessageText || messages[messages.length - 1]?.text || '';
  const lastMessageAt =
    conversation.lastMessageAt?.toISOString() || messages[messages.length - 1]?.timestamp || '';

  const unreadCount = viewerId
    ? messages.filter(
        (msg) =>
          msg.sender_id !== viewerId &&
          (!lastReadAt || new Date(msg.timestamp).getTime() > lastReadAt)
      ).length
    : 0;

  const participantState = viewer
    ? {
        label: viewer.label || 'other',
        is_starred: Boolean(viewer.isStarred),
        isStarred: Boolean(viewer.isStarred),
        is_muted: Boolean(viewer.isMuted),
        isMuted: Boolean(viewer.isMuted),
        is_archived: Boolean(viewer.isArchived),
        isArchived: Boolean(viewer.isArchived)
      }
    : undefined;

  return {
    id: conversation.id,
    type: conversation.type === 'GROUP' ? 'group' : 'direct',
    participants,
    last_message: lastMessage,
    last_message_at: lastMessageAt,
    unread_count: unreadCount,
    ...(participantState ? participantState : {}),
    messages
  };
};

const buildConversationPayloadWithAttachments = async (conversation: any, viewerId?: string) => {
  const payload = buildConversationPayload(conversation, viewerId);
  const attachmentIds = payload.messages.flatMap((msg: any) =>
    Array.isArray(msg.attachments) ? msg.attachments : []
  );
  const fileMap = await buildAttachmentMap(attachmentIds);
  const messages = payload.messages.map((msg: any) => ({
    ...msg,
    attachments: mapAttachments(msg.attachments || [], fileMap)
  }));
  return { ...payload, messages };
};

const emitToUser = (req: Request, userId: string, event: string, payload: any) => {
  try {
    const ns = req.app.get('communityNs');
    if (ns && typeof ns.to === 'function') {
      ns.to(`community:user:${userId}`).emit(event, payload);
      if (String(event || '').startsWith('messages:')) {
        traceMessageEvent('socket.emit_to_user', {
          userId,
          socketEvent: event,
          payload: summarizeMessagePayload(payload)
        });
      }
    }
  } catch (e) {
    console.warn('Message emit failed:', e);
  }
};

const isMessageRecordStoreUnsupportedError = (error: any) => {
  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '');
  return (
    code === 'P2021' ||
    code === 'P2022' ||
    message.includes('directmessagerecord') ||
    message.includes('message record')
  );
};

const writeMessageRecord = async (payload: {
  messageId?: string | null;
  conversationId: string;
  action: string;
  actorUserId?: string | null;
  targetUserId?: string | null;
  beforeText?: string | null;
  afterText?: string | null;
  beforeAttachments?: string[];
  afterAttachments?: string[];
  metadata?: Record<string, any> | null;
}) => {
  try {
    const repo = (prisma as any).directMessageRecord;
    if (!repo || typeof repo.create !== 'function') return;
    await repo.create({
      data: {
        messageId: payload.messageId || null,
        conversationId: payload.conversationId,
        action: payload.action,
        actorUserId: payload.actorUserId || null,
        targetUserId: payload.targetUserId || null,
        beforeText: payload.beforeText || null,
        afterText: payload.afterText || null,
        beforeAttachments: Array.isArray(payload.beforeAttachments) ? payload.beforeAttachments : [],
        afterAttachments: Array.isArray(payload.afterAttachments) ? payload.afterAttachments : [],
        metadata: payload.metadata || null
      }
    });
  } catch (error: any) {
    if (!isMessageRecordStoreUnsupportedError(error)) {
      console.warn('[messages] failed to persist message record', error);
    }
  }
};

export const listConversations = async (req: Request, res: Response) => {
  try {
    const role = resolveRole(req);
    const userId = resolveUserId(req);
    const admin = isAdminRole(role);

    if (!admin && !userId) {
      return res.json({ success: true, data: [] });
    }

    const where = admin
      ? {}
      : {
          participants: {
            some: {
              userId,
              deletedAt: null
            }
          }
        };

    let conversations: any[] = [];
    try {
      conversations = await prisma.conversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        include: {
          participants: {
            include: {
              user: {
                select: participantUserSelect
              }
            }
          },
          messages: messagesIncludeWithReply
        }
      } as any);
    } catch (error: any) {
      if (!isReplyFeatureUnsupportedError(error)) throw error;
      conversations = await prisma.conversation.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        include: {
          participants: {
            include: {
              user: {
                select: participantUserSelect
              }
            }
          },
          messages: messagesIncludeBase
        }
      } as any);
    }

    const basePayload = conversations.map((conversation) => buildConversationPayload(conversation, userId));
    const attachmentIds = basePayload.flatMap((conversation: any) =>
      conversation.messages.flatMap((msg: any) => (Array.isArray(msg.attachments) ? msg.attachments : []))
    );
    const fileMap = await buildAttachmentMap(attachmentIds);
    const payload = basePayload.map((conversation: any) => ({
      ...conversation,
      messages: conversation.messages.map((msg: any) => ({
        ...msg,
        attachments: mapAttachments(msg.attachments || [], fileMap)
      }))
    }));
    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('List conversations error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load conversations' });
  }
};

export const getConversation = async (req: Request, res: Response) => {
  try {
    const role = resolveRole(req);
    const userId = resolveUserId(req);
    const admin = isAdminRole(role);

    let conversation: any = null;
    try {
      conversation = await prisma.conversation.findUnique({
        where: { id: req.params.id },
        include: {
          participants: {
            include: {
              user: {
                select: participantUserSelect
              }
            }
          },
          messages: messagesIncludeWithReply
        }
      } as any);
    } catch (error: any) {
      if (!isReplyFeatureUnsupportedError(error)) throw error;
      conversation = await prisma.conversation.findUnique({
        where: { id: req.params.id },
        include: {
          participants: {
            include: {
              user: {
                select: participantUserSelect
              }
            }
          },
          messages: messagesIncludeBase
        }
      } as any);
    }

    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const isParticipant = conversation.participants.some((p) => p.userId === userId && !p.deletedAt);
    if (!admin && !isParticipant) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    return res.json({
      success: true,
      data: await buildConversationPayloadWithAttachments(conversation, userId)
    });
  } catch (error: any) {
    console.error('Get conversation error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load conversation' });
  }
};

export const createConversation = async (req: Request, res: Response) => {
  try {
    const role = resolveRole(req);
    const userId = resolveUserId(req);
    const admin = isAdminRole(role);
    const participantsRaw = Array.isArray(req.body?.participants) ? req.body.participants : [];
    const participantIds = participantsRaw
      .map((p: any) => p?.id || p?.userId || p)
      .filter((id: any) => typeof id === 'string' && id.length > 0);

    const uniqueIds = Array.from(new Set(participantIds));
    if (!uniqueIds.length) {
      return res.status(400).json({ success: false, error: 'Participants are required' });
    }
    if (!admin && userId && !uniqueIds.includes(userId)) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const type = uniqueIds.length > 2 ? 'GROUP' : 'DIRECT';

    let existing: any = null;
    if (type === 'DIRECT' && uniqueIds.length === 2) {
      const candidates = await prisma.conversation.findMany({
        where: {
          type: 'DIRECT',
          participants: { some: { userId: { in: uniqueIds } } }
        },
        include: { participants: true }
      });
      existing = candidates.find(
        (c) => c.participants.length === uniqueIds.length && c.participants.every((p) => uniqueIds.includes(p.userId))
      );
    }

    if (existing) {
      await prisma.conversationParticipant.updateMany({
        where: {
          conversationId: existing.id,
          userId: { in: uniqueIds }
        },
        data: {
          deletedAt: null,
          isArchived: false
        }
      });
      return res.json({ success: true, data: { id: existing.id } });
    }

    const users = await prisma.user.findMany({ where: { id: { in: uniqueIds } } });
    if (users.length !== uniqueIds.length) {
      return res.status(400).json({ success: false, error: 'One or more participants not found' });
    }

    const created = await prisma.conversation.create({
      data: {
        type,
        participants: {
          create: uniqueIds.map((id) => ({ userId: id }))
        }
      }
    });

    return res.json({ success: true, data: { id: created.id } });
  } catch (error: any) {
    console.error('Create conversation error:', error);
    const message = error?.code ? `${error.message || 'Failed to create conversation'} (${error.code})` : (error.message || 'Failed to create conversation');
    return res.status(500).json({ success: false, error: message });
  }
};

export const postMessage = async (req: Request, res: Response) => {
  try {
    const role = resolveRole(req);
    const userId = resolveUserId(req);
    const admin = isAdminRole(role);
    const conversationId = req.params.id;
    const senderId = req.body?.senderId || userId || '';
    const text = (req.body?.text || '').toString().trim();
    const attachments = normalizeAttachmentIds(req.body?.attachments);
    const replyToMessageId = req.body?.replyToMessageId ? String(req.body.replyToMessageId).trim() : '';
    if (!senderId || (!text && attachments.length === 0)) {
      return res.status(400).json({ success: false, error: 'Sender and message content are required' });
    }
    traceMessageEvent('api.post_message.request', {
      conversationId,
      senderId,
      hasText: Boolean(text),
      textLength: text.length,
      attachmentsCount: attachments.length,
      replyToMessageId: replyToMessageId || null
    });

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { participants: true }
    });
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const senderParticipant = conversation.participants.find((p) => p.userId === senderId);
    const isParticipant = Boolean(senderParticipant);
    if (!isParticipant && !admin) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    if (!isParticipant && admin) {
      await prisma.conversationParticipant.create({
        data: { conversationId: conversation.id, userId: senderId }
      });
    } else if (senderParticipant?.deletedAt || senderParticipant?.isArchived) {
      await prisma.conversationParticipant.updateMany({
        where: {
          conversationId: conversation.id,
          userId: senderId
        },
        data: {
          deletedAt: null,
          isArchived: false
        }
      });
    }

    let replyToSnapshot: any = null;
    if (replyToMessageId) {
      const replySource = await prisma.directMessage.findUnique({
        where: { id: replyToMessageId },
        select: {
          id: true,
          conversationId: true,
          senderId: true,
          text: true,
          attachments: true,
          sender: { select: { id: true, name: true, email: true } }
        }
      });
      if (!replySource) {
        return res.status(404).json({ success: false, error: 'Reply target message not found' });
      }
      if (replySource.conversationId !== conversation.id) {
        return res.status(400).json({ success: false, error: 'Reply target must be in the same conversation' });
      }
      replyToSnapshot = {
        messageId: replySource.id,
        senderId: replySource.senderId,
        senderName: replySource.sender?.name || replySource.sender?.email || 'User',
        snippet: resolveMessageSnippet(replySource),
        attachmentPreview: Array.isArray(replySource.attachments) && replySource.attachments.length
          ? { type: 'file', label: 'Attachment' }
          : null
      };
    }

    const messageCreateData: any = {
      conversationId: conversation.id,
      senderId,
      text,
      attachments,
      replyToMessageId: replyToMessageId || null,
      replyToSnapshot: replyToSnapshot || null
    };

    let message: any;
    try {
      message = await prisma.directMessage.create({
        data: messageCreateData,
        include: {
          reactions: true,
          replyToMessage: {
            select: replyToMessageSelect
          }
        }
      } as any);
    } catch (error: any) {
      if (!isReplyFeatureUnsupportedError(error)) throw error;
      message = await prisma.directMessage.create({
        data: {
          conversationId: conversation.id,
          senderId,
          text,
          attachments
        },
        include: {
          reactions: true
        }
      } as any);
      if (replyToMessageId) {
        console.warn('[messages] reply fields unavailable in Prisma client; saved message without reply metadata');
      }
    }

    if (attachments.length) {
      try {
        await syncFileUsages('direct_message', message.id, attachments, 'Direct Message Attachment');
      } catch (e) {
        console.warn('Failed to sync message file usage:', e);
      }
    }

    const lastMessageText = text || (attachments.length ? 'Sent an attachment' : '');
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageText,
        lastMessageAt: message.createdAt,
        lastMessageSenderId: senderId
      }
    });

    const receiverIds = conversation.participants
      .map((p) => p.userId)
      .filter((id) => id !== senderId);

    await writeMessageRecord({
      messageId: message.id,
      conversationId: conversation.id,
      action: replyToMessageId ? 'REPLIED' : 'CREATED',
      actorUserId: senderId,
      targetUserId: receiverIds[0] || null,
      beforeText: null,
      afterText: message.text,
      beforeAttachments: [],
      afterAttachments: attachments,
      metadata: {
        replyToMessageId: message.replyToMessageId || null,
        hasAttachments: attachments.length > 0
      }
    });

    if (receiverIds.length) {
      await prisma.conversationParticipant.updateMany({
        where: {
          conversationId: conversation.id,
          userId: { in: receiverIds }
        },
        data: {
          deletedAt: null,
          isArchived: false
        }
      });
    }

    const fileMap = attachments.length ? await buildAttachmentMap(attachments) : new Map<string, any>();
    const payload = {
      id: message.id,
      conversation_id: conversation.id,
      sender_id: senderId,
      receiver_id: receiverIds[0] || '',
      text: message.text,
      timestamp: message.createdAt.toISOString(),
      is_read: false,
      is_deleted: false,
      isDeleted: false,
      deleted_at: null,
      deletedAt: null,
      edited_at: null,
      editedAt: null,
      reactions: [],
      attachments: mapAttachments(attachments, fileMap),
      attachment_ids: attachments,
      reply_to_message_id: message.replyToMessageId || null,
      replyToMessageId: message.replyToMessageId || null,
      reply_to_snapshot: message.replyToSnapshot || null,
      replyToSnapshot: message.replyToSnapshot || null,
      reply_to: buildReplyPreview(message),
      replyTo: buildReplyPreview(message)
    };

    receiverIds.forEach((id) => emitToUser(req, id, 'messages:new', payload));
    emitToUser(req, senderId, 'messages:sent', payload);
    traceMessageEvent('api.post_message.emitted', {
      conversationId: conversation.id,
      senderId,
      receiverIds,
      payload: summarizeMessagePayload(payload)
    });
    if (!admin) {
      notifyAdmins({
        type: 'message',
        title: 'New message',
        body: text || (attachments.length ? 'New attachment sent' : 'New message'),
        link: '/admin/dashboard?tab=messages',
        meta: { conversationId: conversation.id, senderId, receiverIds }
      });
    }

    try {
      const sender = await prisma.user.findUnique({ where: { id: senderId }, select: { id: true, name: true, email: true } });
      const preview = text || (attachments.length ? 'Sent an attachment' : 'New message');
      const messageLink = `/messages/${conversation.id}`;
      receiverIds.forEach((receiverId) => {
        void sendSystemMessage({
          templateKey: 'new_message',
          userId: receiverId,
          context: {
            sender: { name: sender?.name || sender?.email || 'Scrolith User', email: sender?.email || '' },
            message: { preview, link: messageLink }
          },
          actionUrl: messageLink,
          typeOverride: 'message'
        });
      });
    } catch (notifyError) {
      console.warn('Failed to send message notifications', notifyError);
    }

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('Post message error:', error);
    traceMessageEvent('api.post_message.error', {
      conversationId: req.params?.id,
      senderId: req.body?.senderId || resolveUserId(req),
      error: String(error?.message || error)
    });
    return res.status(500).json({ success: false, error: error.message || 'Failed to send message' });
  }
};

export const markRead = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const conversationId = req.params.id;
    traceMessageEvent('api.mark_read.request', { conversationId, userId });
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId
        }
      }
    });
    if (!participant) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }
    if (participant.deletedAt) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    await prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { lastReadAt: new Date() }
    });

    emitToUser(req, userId, 'messages:read', { conversationId });
    traceMessageEvent('api.mark_read.success', { conversationId, userId });
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Mark read error:', error);
    traceMessageEvent('api.mark_read.error', {
      conversationId: req.params?.id,
      userId: resolveUserId(req),
      error: String(error?.message || error)
    });
    return res.status(500).json({ success: false, error: error.message || 'Failed to mark read' });
  }
};

export const updateConversationPreferences = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const conversationId = req.params.id;
    traceMessageEvent('api.update_conversation_preferences.request', {
      conversationId,
      userId,
      updates: {
        label: req.body?.label,
        isStarred: req.body?.isStarred,
        isMuted: req.body?.isMuted,
        isArchived: req.body?.isArchived
      }
    });
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId
        }
      }
    });
    if (!participant || participant.deletedAt) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const updates: any = {};
    if (req.body?.label !== undefined) {
      const normalizedLabel = String(req.body.label || '').trim().toLowerCase();
      updates.label = normalizedLabel === 'jobs' ? 'jobs' : 'other';
    }
    if (req.body?.isStarred !== undefined) updates.isStarred = Boolean(req.body.isStarred);
    if (req.body?.isMuted !== undefined) updates.isMuted = Boolean(req.body.isMuted);
    if (req.body?.isArchived !== undefined) updates.isArchived = Boolean(req.body.isArchived);

    if (!Object.keys(updates).length) {
      return res.status(400).json({ success: false, error: 'No preference changes provided' });
    }

    const updated = await prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: updates
    });

    const payload = {
      conversationId,
      label: updated.label || 'other',
      isStarred: Boolean(updated.isStarred),
      isMuted: Boolean(updated.isMuted),
      isArchived: Boolean(updated.isArchived)
    };
    emitToUser(req, userId, 'messages:conversation_updated', payload);
    traceMessageEvent('api.update_conversation_preferences.success', { conversationId, userId, payload });

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('Update conversation preferences error:', error);
    traceMessageEvent('api.update_conversation_preferences.error', {
      conversationId: req.params?.id,
      userId: resolveUserId(req),
      error: String(error?.message || error)
    });
    return res.status(500).json({ success: false, error: error.message || 'Failed to update conversation preferences' });
  }
};

export const markConversationUnread = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const conversationId = req.params.id;
    traceMessageEvent('api.mark_unread.request', { conversationId, userId });
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId
        }
      }
    });
    if (!participant || participant.deletedAt) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    await prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: { lastReadAt: null }
    });

    emitToUser(req, userId, 'messages:conversation_updated', {
      conversationId,
      unread_count: 1
    });
    traceMessageEvent('api.mark_unread.success', { conversationId, userId });

    return res.json({ success: true });
  } catch (error: any) {
    console.error('Mark conversation unread error:', error);
    traceMessageEvent('api.mark_unread.error', {
      conversationId: req.params?.id,
      userId: resolveUserId(req),
      error: String(error?.message || error)
    });
    return res.status(500).json({ success: false, error: error.message || 'Failed to mark conversation unread' });
  }
};

export const deleteConversationForUser = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const conversationId = req.params.id;
    const participant = await prisma.conversationParticipant.findUnique({
      where: {
        conversationId_userId: {
          conversationId,
          userId
        }
      }
    });
    if (!participant || participant.deletedAt) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    await prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: {
        isArchived: true,
        deletedAt: new Date()
      }
    });

    emitToUser(req, userId, 'messages:conversation_deleted', { conversationId });
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Delete conversation error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to delete conversation' });
  }
};

export const reportBlockConversation = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const conversationId = req.params.id;
    const shouldBlock = req.body?.block !== false;
    const reason = String(req.body?.reason || '').trim();
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        participants: true
      }
    });
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const participant = conversation.participants.find((entry) => entry.userId === userId);
    if (!participant || participant.deletedAt) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const targetUserIds = conversation.participants
      .map((entry) => entry.userId)
      .filter((id) => id !== userId);

    if (shouldBlock && targetUserIds.length) {
      for (const blockedId of targetUserIds) {
        await prisma.userBlock.upsert({
          where: {
            blockerId_blockedId: {
              blockerId: userId,
              blockedId
            }
          },
          update: {},
          create: {
            blockerId: userId,
            blockedId
          }
        });
      }
    }

    await prisma.conversationParticipant.update({
      where: { id: participant.id },
      data: {
        isArchived: true
      }
    });

    if (reason) {
      notifyAdmins({
        type: 'message',
        title: 'Conversation reported',
        body: reason,
        link: `/admin/dashboard?tab=messages`,
        meta: { conversationId, reporterId: userId, targetUserIds }
      });
    }

    emitToUser(req, userId, 'messages:conversation_updated', {
      conversationId,
      isArchived: true
    });

    return res.json({ success: true, data: { blockedUserIds: targetUserIds, archived: true } });
  } catch (error: any) {
    console.error('Report/block conversation error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to report or block conversation' });
  }
};

export const toggleReaction = async (req: Request, res: Response) => {
  try {
    const userId = req.body?.userId || resolveUserId(req);
    const emoji = (req.body?.emoji || '').toString();
    if (!userId || !emoji) {
      return res.status(400).json({ success: false, error: 'User and emoji are required' });
    }
    traceMessageEvent('api.toggle_reaction.request', {
      conversationId: req.params?.id,
      messageId: req.params?.messageId,
      userId,
      emoji
    });

    const messageId = req.params.messageId;
    const message = await prisma.directMessage.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: {
            participants: { select: { userId: true } }
          }
        }
      }
    });
    if (!message || message.deletedAt) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    const isParticipant = message.conversation.participants.some((entry) => entry.userId === userId);
    if (!isParticipant) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const existingForUser = await prisma.messageReaction.findMany({
      where: { messageId, userId }
    });
    const hasSame = existingForUser.some((entry) => entry.emoji === emoji);

    if (hasSame) {
      await prisma.messageReaction.deleteMany({ where: { messageId, userId } });
    } else {
      await prisma.messageReaction.deleteMany({ where: { messageId, userId } });
      await prisma.messageReaction.create({
        data: { messageId, userId, emoji }
      });
    }

    const reactions = await prisma.messageReaction.findMany({
      where: { messageId },
      orderBy: { createdAt: 'asc' }
    });
    const reactionSummary: Record<string, number> = {};
    reactions.forEach((reaction) => {
      const emojiKey = String(reaction?.emoji || '').trim();
      if (!emojiKey) return;
      reactionSummary[emojiKey] = (reactionSummary[emojiKey] || 0) + 1;
    });
    const payload = {
      conversationId: message.conversationId,
      messageId,
      reactions: reactions.map(formatReaction),
      reactionSummary,
      userReaction: hasSame ? null : emoji
    };

    message.conversation.participants.forEach((entry) => {
      emitToUser(req, entry.userId, 'messages:updated', payload);
    });
    traceMessageEvent('api.toggle_reaction.success', {
      conversationId: message.conversationId,
      messageId,
      userId,
      emoji,
      reactionSummary
    });

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('Toggle reaction error:', error);
    traceMessageEvent('api.toggle_reaction.error', {
      conversationId: req.params?.id,
      messageId: req.params?.messageId,
      userId: req.body?.userId || resolveUserId(req),
      error: String(error?.message || error)
    });
    return res.status(500).json({ success: false, error: error.message || 'Failed to toggle reaction' });
  }
};

export const editMessage = async (req: Request, res: Response) => {
  try {
    const role = resolveRole(req);
    const userId = resolveUserId(req);
    const admin = isAdminRole(role);
    const messageId = req.params.messageId;
    const nextText = String(req.body?.text || '').trim();
    traceMessageEvent('api.edit_message.request', {
      conversationId: req.params?.id,
      messageId,
      userId,
      textLength: nextText.length
    });

    if (!nextText) {
      return res.status(400).json({ success: false, error: 'Edited message text is required' });
    }

    const message = await prisma.directMessage.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: {
            participants: { select: { userId: true } }
          }
        }
      }
    });

    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }
    if (!admin && message.senderId !== userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    if (message.deletedAt) {
      return res.status(400).json({ success: false, error: 'Deleted messages cannot be edited' });
    }

    const beforeText = String(message.text || '');
    if (beforeText === nextText) {
      return res.json({
        success: true,
        data: {
          messageId: message.id,
          conversationId: message.conversationId,
          text: message.text,
          editedAt: message.editedAt ? message.editedAt.toISOString() : null
        }
      });
    }

    const editedAt = new Date();
    const updated = await prisma.directMessage.update({
      where: { id: message.id },
      data: {
        text: nextText,
        editedAt
      }
    });

    await writeMessageRecord({
      messageId: message.id,
      conversationId: message.conversationId,
      action: 'EDITED',
      actorUserId: userId || message.senderId,
      targetUserId: message.senderId,
      beforeText,
      afterText: updated.text,
      beforeAttachments: Array.isArray(message.attachments) ? message.attachments : [],
      afterAttachments: Array.isArray(updated.attachments) ? updated.attachments : [],
      metadata: { editedByAdmin: admin && userId !== message.senderId }
    });

    const latest = await prisma.directMessage.findFirst({
      where: { conversationId: message.conversationId },
      orderBy: { createdAt: 'desc' }
    });

    await prisma.conversation.update({
      where: { id: message.conversationId },
      data: {
        lastMessageText: latest?.text || null,
        lastMessageAt: latest?.createdAt || null,
        lastMessageSenderId: latest?.senderId || null
      }
    });

    const payload = {
      conversationId: message.conversationId,
      messageId: message.id,
      text: updated.text,
      edited_at: editedAt.toISOString(),
      editedAt: editedAt.toISOString(),
      timestamp: updated.createdAt ? updated.createdAt.toISOString() : nowIso(),
      is_deleted: false,
      isDeleted: false
    };

    message.conversation.participants.forEach((entry) => {
      emitToUser(req, entry.userId, 'messages:updated', payload);
    });
    traceMessageEvent('api.edit_message.success', {
      conversationId: message.conversationId,
      messageId: message.id,
      userId,
      editedAt: payload.editedAt
    });

    return res.json({ success: true, data: payload });
  } catch (error: any) {
    console.error('Edit message error:', error);
    traceMessageEvent('api.edit_message.error', {
      conversationId: req.params?.id,
      messageId: req.params?.messageId,
      userId: resolveUserId(req),
      error: String(error?.message || error)
    });
    return res.status(500).json({ success: false, error: error.message || 'Failed to edit message' });
  }
};

export const copyMessage = async (req: Request, res: Response) => {
  try {
    const role = resolveRole(req);
    const userId = resolveUserId(req);
    const admin = isAdminRole(role);
    const messageId = req.params.messageId;

    const message = await prisma.directMessage.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: {
            participants: { select: { userId: true } }
          }
        }
      }
    });

    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    const isParticipant = message.conversation.participants.some((entry) => entry.userId === userId);
    if (!admin && !isParticipant) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    await writeMessageRecord({
      messageId: message.id,
      conversationId: message.conversationId,
      action: 'COPIED',
      actorUserId: userId || null,
      targetUserId: message.senderId,
      beforeText: message.text,
      afterText: message.text,
      beforeAttachments: Array.isArray(message.attachments) ? message.attachments : [],
      afterAttachments: Array.isArray(message.attachments) ? message.attachments : [],
      metadata: {
        copiedByAdmin: admin && userId !== message.senderId
      }
    });

    return res.json({ success: true });
  } catch (error: any) {
    console.error('Copy message audit error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to record copy action' });
  }
};

export const deleteMessage = async (req: Request, res: Response) => {
  try {
    const role = resolveRole(req);
    const userId = resolveUserId(req);
    const admin = isAdminRole(role);
    const messageId = req.params.messageId;
    traceMessageEvent('api.delete_message.request', {
      conversationId: req.params?.id,
      messageId,
      userId
    });
    const message = await prisma.directMessage.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: {
            participants: { select: { userId: true } }
          }
        }
      }
    });
    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }
    if (!admin && message.senderId !== userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    if (message.deletedAt) {
      return res.json({ success: true });
    }

    await prisma.directMessage.update({
      where: { id: messageId },
      data: {
        text: '[Message deleted]',
        attachments: [],
        deletedAt: new Date()
      }
    });

    await writeMessageRecord({
      messageId: message.id,
      conversationId: message.conversationId,
      action: 'DELETED',
      actorUserId: userId || message.senderId,
      targetUserId: message.senderId,
      beforeText: message.text,
      afterText: '[Message deleted]',
      beforeAttachments: Array.isArray(message.attachments) ? message.attachments : [],
      afterAttachments: [],
      metadata: { deletedByAdmin: admin && userId !== message.senderId }
    });

    try {
      await removeUsage('direct_message', messageId);
    } catch (e) {
      console.warn('Failed to remove message file usage:', e);
    }

    const latest = await prisma.directMessage.findFirst({
      where: { conversationId: message.conversationId },
      orderBy: { createdAt: 'desc' }
    });

    await prisma.conversation.update({
      where: { id: message.conversationId },
      data: {
        lastMessageText: latest?.text || null,
        lastMessageAt: latest?.createdAt || null,
        lastMessageSenderId: latest?.senderId || null
      }
    });

    const payload = {
      conversationId: message.conversationId,
      messageId: message.id,
      text: '[Message deleted]',
      is_deleted: true,
      isDeleted: true,
      deleted_at: new Date().toISOString(),
      deletedAt: new Date().toISOString(),
      attachments: []
    };

    message.conversation.participants.forEach((entry) => {
      emitToUser(req, entry.userId, 'messages:updated', payload);
    });
    traceMessageEvent('api.delete_message.success', {
      conversationId: message.conversationId,
      messageId: message.id,
      userId
    });

    return res.json({ success: true });
  } catch (error: any) {
    console.error('Delete message error:', error);
    traceMessageEvent('api.delete_message.error', {
      conversationId: req.params?.id,
      messageId: req.params?.messageId,
      userId: resolveUserId(req),
      error: String(error?.message || error)
    });
    return res.status(500).json({ success: false, error: error.message || 'Failed to delete message' });
  }
};

