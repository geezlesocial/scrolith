import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { resolveUserProStatus } from '../utils/proStatus';
import { syncFileUsages, removeUsage } from '../utils/fileUsage';
import { notifyAdmins } from '../utils/notify';
import { dispatchMessageReceiptNotifications } from '../services/messageNotifications';

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

const DEFAULT_CONVERSATION_MESSAGE_LIMIT = 200;
const DEFAULT_CONVERSATION_PREVIEW_LIMIT = 20;

const parseIntInRange = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const messageReactionSelect: any = {
  userId: true,
  emoji: true,
  createdAt: true
};

const directMessageBaseSelect: any = {
  id: true,
  conversationId: true,
  senderId: true,
  text: true,
  messageType: true,
  metadata: true,
  attachments: true,
  replyToMessageId: true,
  replyToSnapshot: true,
  createdAt: true,
  deletedAt: true,
  editedAt: true,
  reactions: {
    select: messageReactionSelect
  }
};

const buildMessagesRelationSelect = (limit: number, includeReply: boolean): any => ({
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  take: limit,
  select: includeReply
    ? {
        ...directMessageBaseSelect,
        replyToMessage: {
          select: replyToMessageSelect
        }
      }
    : directMessageBaseSelect
});

const normalizeAttachmentIds = (input: any): string[] => {
  if (!Array.isArray(input)) return [];
  return Array.from(new Set(input.map((value) => String(value)).filter((value) => value.length > 0)));
};

const buildAttachmentMap = async (fileIds: string[]) => {
  const ids = Array.from(new Set((fileIds || []).filter(Boolean)));
  if (!ids.length) return new Map<string, any>();
  const files = await prisma.file.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      url: true,
      originalName: true,
      mimeType: true,
      size: true,
      thumbnailUrl: true,
      width: true,
      height: true,
      duration: true
    }
  });
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

const conversationParticipantSelect: any = {
  userId: true,
  joinedAt: true,
  lastReadAt: true,
  label: true,
  isStarred: true,
  isMuted: true,
  isArchived: true,
  deletedAt: true,
  user: {
    select: participantUserSelect
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
          : mimeType.startsWith('audio/')
            ? 'audio'
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
  const messageType = String(message?.messageType || message?.message_type || '').toUpperCase();
  if (messageType === 'VOICE_NOTE') return 'Voice note';
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
  const normalizedMessageType = String(message?.messageType || message?.message_type || '').trim().toLowerCase();
  const messageType = normalizedMessageType || 'text';
  const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : null;
  const voiceNoteMetadata = metadata?.voiceNote && typeof metadata.voiceNote === 'object' ? metadata.voiceNote : null;

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
    message_type: messageType,
    messageType,
    metadata,
    voice_note: voiceNoteMetadata
      ? {
          id: voiceNoteMetadata.id || null,
          fileId: voiceNoteMetadata.fileId || null,
          durationMs: Number(voiceNoteMetadata.durationMs || 0) || 0,
          url: voiceNoteMetadata.url || null
        }
      : null,
    voiceNote: voiceNoteMetadata
      ? {
          id: voiceNoteMetadata.id || null,
          fileId: voiceNoteMetadata.fileId || null,
          durationMs: Number(voiceNoteMetadata.durationMs || 0) || 0,
          url: voiceNoteMetadata.url || null
        }
      : null,
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

const buildConversationPayload = (
  conversation: any,
  viewerId?: string,
  options?: { hiddenMessageIds?: Set<string> }
) => {
  const participants = conversation.participants.map(formatParticipant);
  const viewer = viewerId
    ? conversation.participants.find((p: any) => p.userId === viewerId)
    : null;
  const lastReadAt = viewer?.lastReadAt ? new Date(viewer.lastReadAt).getTime() : 0;
  const hiddenMessageIds = options?.hiddenMessageIds || new Set<string>();

  const visibleMessagesSource = Array.isArray(conversation.messages)
    ? conversation.messages.filter((message: any) => !hiddenMessageIds.has(String(message?.id || '')))
    : [];

  visibleMessagesSource.sort((left: any, right: any) => {
    const leftTime = left?.createdAt ? new Date(left.createdAt).getTime() : 0;
    const rightTime = right?.createdAt ? new Date(right.createdAt).getTime() : 0;
    if (leftTime !== rightTime) return leftTime - rightTime;
    return String(left?.id || '').localeCompare(String(right?.id || ''));
  });

  const messages = visibleMessagesSource.map((message: any) =>
    formatConversationMessage(message, conversation, viewerId, lastReadAt)
  );

  const lastVisibleMessage = messages[messages.length - 1];
  const lastMessage = lastVisibleMessage?.text || '';
  const lastMessageAt = lastVisibleMessage?.timestamp || '';

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

const buildConversationPayloadWithAttachments = async (
  conversation: any,
  viewerId?: string,
  options?: { hiddenMessageIds?: Set<string> }
) => {
  const payload = buildConversationPayload(conversation, viewerId, options);
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

const getDirectConversationKey = (conversation: any) => {
  if (!conversation || String(conversation.type || '').toUpperCase() !== 'DIRECT') return '';
  const participantIds = Array.isArray(conversation.participants)
    ? conversation.participants
        .map((participant: any) => String(participant?.userId || '').trim())
        .filter(Boolean)
    : [];
  const uniqueIds = Array.from(new Set(participantIds));
  if (uniqueIds.length !== 2) return '';
  return uniqueIds.sort().join(':');
};

const mergeConversationPayloads = (payloads: any[]) => {
  if (!Array.isArray(payloads) || payloads.length === 0) return [];

  const directBuckets = new Map<string, any[]>();
  const passthrough: any[] = [];

  payloads.forEach((payload) => {
    const key = getDirectConversationKey(payload);
    if (!key) {
      passthrough.push(payload);
      return;
    }
    if (!directBuckets.has(key)) directBuckets.set(key, []);
    directBuckets.get(key)!.push(payload);
  });

  const mergedDirects = Array.from(directBuckets.entries()).map(([, bucket]) => {
    const ordered = [...bucket].sort((left, right) => {
      const leftAt = new Date(left?.last_message_at || left?.lastMessageAt || 0).getTime();
      const rightAt = new Date(right?.last_message_at || right?.lastMessageAt || 0).getTime();
      if (leftAt !== rightAt) return rightAt - leftAt;
      return String(right?.id || '').localeCompare(String(left?.id || ''));
    });
    const primary = ordered[0] || bucket[0];
    const mergedMessages = ordered
      .flatMap((entry) => Array.isArray(entry?.messages) ? entry.messages : [])
      .sort((left, right) => {
        const leftAt = new Date(left?.timestamp || left?.createdAt || 0).getTime();
        const rightAt = new Date(right?.timestamp || right?.createdAt || 0).getTime();
        if (leftAt !== rightAt) return leftAt - rightAt;
        return String(left?.id || '').localeCompare(String(right?.id || ''));
      });
    const lastVisibleMessage = mergedMessages[mergedMessages.length - 1] || null;
    const unreadCount = ordered.reduce((sum, entry) => sum + Number(entry?.unread_count || entry?.unreadCount || 0), 0);
    return {
      ...primary,
      id: primary?.id,
      messages: mergedMessages,
      last_message: lastVisibleMessage?.text || primary?.last_message || '',
      last_message_at: lastVisibleMessage?.timestamp || primary?.last_message_at || '',
      unread_count: unreadCount,
      lastMessage: lastVisibleMessage?.text || primary?.lastMessage || '',
      lastMessageAt: lastVisibleMessage?.timestamp || primary?.lastMessageAt || '',
      unreadCount: unreadCount
    };
  });

  return [...passthrough, ...mergedDirects].sort((left, right) => {
    const leftAt = new Date(left?.last_message_at || left?.lastMessageAt || 0).getTime();
    const rightAt = new Date(right?.last_message_at || right?.lastMessageAt || 0).getTime();
    if (leftAt !== rightAt) return rightAt - leftAt;
    return String(right?.id || '').localeCompare(String(left?.id || ''));
  });
};

const getMergedDirectConversationRecords = async (conversation: any, userId: string, previewLimit: number, admin: boolean) => {
  const participantIds = Array.isArray(conversation?.participants)
    ? conversation.participants
        .map((participant: any) => String(participant?.userId || '').trim())
        .filter(Boolean)
    : [];
  const uniqueIds = Array.from(new Set(participantIds));
  if (String(conversation?.type || '').toUpperCase() !== 'DIRECT' || uniqueIds.length !== 2) {
    return [conversation];
  }

  const candidates = await prisma.conversation.findMany({
    where: {
      type: 'DIRECT',
      participants: { some: { userId: { in: uniqueIds } } }
    },
    include: {
      participants: {
        select: conversationParticipantSelect
      },
      messages: buildMessagesRelationSelect(previewLimit, true)
    }
  } as any);

  return candidates.filter((candidate: any) => {
    const candidateIds = Array.isArray(candidate?.participants)
      ? candidate.participants
          .map((entry: any) => String(entry?.userId || '').trim())
          .filter(Boolean)
      : [];
    const candidateSet = Array.from(new Set(candidateIds)).sort();
    return candidateSet.length === 2 && candidateSet.join(':') === uniqueIds.sort().join(':');
  });
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

const getDeletedForMeMessageMap = async (userId: string, conversationIds: string[]) => {
  const map = new Map<string, Set<string>>();
  const normalizedUserId = String(userId || '').trim();
  const normalizedConversationIds = Array.from(
    new Set((conversationIds || []).map((value) => String(value || '').trim()).filter(Boolean))
  );
  if (!normalizedUserId || !normalizedConversationIds.length) return map;
  try {
    const repo = (prisma as any).directMessageRecord;
    if (!repo || typeof repo.findMany !== 'function') return map;
    const rows = await repo.findMany({
      where: {
        actorUserId: normalizedUserId,
        action: 'DELETED_FOR_ME',
        conversationId: { in: normalizedConversationIds },
        messageId: { not: null }
      },
      select: {
        conversationId: true,
        messageId: true
      }
    });
    (rows || []).forEach((row: any) => {
      const conversationId = String(row?.conversationId || '').trim();
      const messageId = String(row?.messageId || '').trim();
      if (!conversationId || !messageId) return;
      if (!map.has(conversationId)) map.set(conversationId, new Set<string>());
      map.get(conversationId)!.add(messageId);
    });
  } catch (error: any) {
    if (!isMessageRecordStoreUnsupportedError(error)) {
      console.warn('[messages] failed to resolve deleted-for-me map', error);
    }
  }
  return map;
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

    const requestedLimit = Number.parseInt(String(req.query?.limit || ''), 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(10, Math.min(200, requestedLimit))
      : 80;
    const previewLimit = parseIntInRange(
      req.query?.messagePreviewLimit ?? req.query?.previewMessageLimit,
      DEFAULT_CONVERSATION_PREVIEW_LIMIT,
      1,
      40
    );
    const cursorId = String(req.query?.cursor || '').trim();
    const queryBase: any = {
      where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {})
    };

    let conversations: any[] = [];
    try {
      conversations = await prisma.conversation.findMany({
        ...queryBase,
        include: {
          participants: {
            select: conversationParticipantSelect
          },
          messages: buildMessagesRelationSelect(previewLimit, true)
        }
      } as any);
    } catch (error: any) {
      if (!isReplyFeatureUnsupportedError(error)) throw error;
      conversations = await prisma.conversation.findMany({
        ...queryBase,
        include: {
          participants: {
            select: conversationParticipantSelect
          },
          messages: buildMessagesRelationSelect(previewLimit, false)
        }
      } as any);
    }

    const hasMore = conversations.length > limit;
    const pageConversations = hasMore ? conversations.slice(0, limit) : conversations;

    const hiddenMessageMap = !admin && userId
      ? await getDeletedForMeMessageMap(userId, pageConversations.map((conversation) => String(conversation.id || '')))
      : new Map<string, Set<string>>();
    const basePayload = pageConversations.map((conversation) =>
      buildConversationPayload(conversation, userId, {
        hiddenMessageIds: hiddenMessageMap.get(String(conversation.id || '')) || new Set<string>()
      })
    );
    const attachmentIds = basePayload.flatMap((conversation: any) =>
      conversation.messages.flatMap((msg: any) => (Array.isArray(msg.attachments) ? msg.attachments : []))
    );
    const fileMap = await buildAttachmentMap(attachmentIds);
    const payload = mergeConversationPayloads(
      basePayload.map((conversation: any) => ({
        ...conversation,
        messages: conversation.messages.map((msg: any) => ({
          ...msg,
          attachments: mapAttachments(msg.attachments || [], fileMap)
        }))
      }))
    );
    return res.json({
      success: true,
      data: payload,
      pagination: {
        limit,
        hasMore,
        nextCursor: hasMore ? String(pageConversations[pageConversations.length - 1]?.id || '') : null
      }
    });
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
    const messageLimit = parseIntInRange(req.query?.messageLimit, DEFAULT_CONVERSATION_MESSAGE_LIMIT, 20, 200);

    let conversation: any = null;
    try {
      conversation = await prisma.conversation.findUnique({
        where: { id: req.params.id },
        include: {
          participants: {
            select: conversationParticipantSelect
          },
          messages: buildMessagesRelationSelect(messageLimit, true)
        }
      } as any);
    } catch (error: any) {
      if (!isReplyFeatureUnsupportedError(error)) throw error;
      conversation = await prisma.conversation.findUnique({
        where: { id: req.params.id },
        include: {
          participants: {
            select: conversationParticipantSelect
          },
          messages: buildMessagesRelationSelect(messageLimit, false)
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

    const mergedConversationRecords = await getMergedDirectConversationRecords(conversation, userId, messageLimit, admin);
    const mergedHiddenMessageMap = !admin && userId
      ? await getDeletedForMeMessageMap(
          userId,
          mergedConversationRecords.map((entry: any) => String(entry.id || ''))
        )
      : new Map<string, Set<string>>();

    const mergedPayloads = await Promise.all(
      mergedConversationRecords.map(async (entry: any) => {
        const hiddenMessageIds = mergedHiddenMessageMap.get(String(entry.id || '')) || new Set<string>();
        return buildConversationPayloadWithAttachments(entry, userId, { hiddenMessageIds });
      })
    );
    const mergedPayload = mergeConversationPayloads(mergedPayloads);
    if (!mergedPayload.length) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    return res.json({
      success: true,
      data: mergedPayload[0]
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

    void dispatchMessageReceiptNotifications({
      receiverIds,
      senderId,
      conversationId: conversation.id,
      messageId: message.id,
      preview: text,
      fallbackPreview: attachments.length ? 'Sent an attachment' : 'New message',
      messageType: 'text'
    }).catch((notifyError) => {
      console.warn('Failed to send message notifications', notifyError);
    });

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

export const searchMessages = async (req: Request, res: Response) => {
  try {
    const role = resolveRole(req);
    const userId = resolveUserId(req);
    const admin = isAdminRole(role);

    if (!admin && !userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const q = String(req.query?.q || '').trim();
    if (q.length < 2) return res.status(400).json({ success: false, error: 'Query too short' });

    const scope = String(req.query?.scope || '').trim();
    if (scope === 'admin' && !admin) return res.status(403).json({ success: false, error: 'Forbidden' });

    // Try to find conversation participant username/name matches first
    const convWhere: any = {
      AND: [
        { participants: { some: { userId: userId, deletedAt: null } } },
        { participants: { some: { userId: { not: userId } } } },
        {
          OR: [
            { participants: { some: { user: { username: { contains: q, mode: 'insensitive' } } } } },
            { participants: { some: { user: { name: { contains: q, mode: 'insensitive' } } } } }
          ]
        }
      ]
    };

    const convs = await prisma.conversation.findMany({
      where: convWhere as any,
      include: {
        participants: { select: conversationParticipantSelect },
        messages: buildMessagesRelationSelect(DEFAULT_CONVERSATION_PREVIEW_LIMIT, true)
      }
    } as any);

    const results: any[] = [];
    if (Array.isArray(convs) && convs.length) {
      convs.forEach((conv: any) => {
        const other = (conv.participants || []).find((p: any) => String(p.userId) !== String(userId));
        results.push({
          conversationId: conv.id,
          matchType: 'username',
          participant: other?.user ? { username: other.user.username, id: other.user.id } : { username: other?.username || '' },
          conversation: buildConversationPayload(conv, userId)
        });
      });
      return res.json({ success: true, data: results });
    }

    // Fallback: search message text
    const msgs = await prisma.directMessage.findMany({
      where: { text: { contains: q } } as any,
      include: {
        conversation: {
          include: {
            participants: { select: conversationParticipantSelect },
            messages: buildMessagesRelationSelect(DEFAULT_CONVERSATION_PREVIEW_LIMIT, true)
          }
        }
      }
    } as any);

    if (Array.isArray(msgs) && msgs.length) {
      msgs.forEach((m: any) => {
        results.push({
          conversationId: m.conversation?.id,
          matchType: 'message',
          matchedMessageId: m.id,
          matchedMessageSnippet: String(m.text || '').slice(0, 160),
          conversation: buildConversationPayload(m.conversation, userId)
        });
      });
    }

    return res.json({ success: true, data: results });
  } catch (error: any) {
    console.error('Search messages error:', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to search messages' });
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

    const existingForUser = await prisma.messageReaction.findFirst({
      where: { messageId, userId },
      orderBy: { createdAt: 'asc' },
      select: { emoji: true }
    });
    const hasSame = existingForUser?.emoji === emoji;

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
      orderBy: { createdAt: 'asc' },
      select: messageReactionSelect
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

    const fanoutUserIds = Array.from(
      new Set([
        String(message.senderId || '').trim(),
        ...message.conversation.participants.map((entry) => String(entry.userId || '').trim())
      ].filter(Boolean))
    );
    fanoutUserIds.forEach((targetUserId) => {
      emitToUser(req, targetUserId, 'messages:updated', payload);
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
      isDeleted: false,
      last_message: latest ? resolveMessageSnippet(latest) : '',
      lastMessage: latest ? resolveMessageSnippet(latest) : '',
      last_message_at: latest?.createdAt ? latest.createdAt.toISOString() : null,
      lastMessageAt: latest?.createdAt ? latest.createdAt.toISOString() : null
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
    const deleteScopeRaw = String(req.query?.scope || req.body?.scope || 'everyone').trim().toLowerCase();
    const deleteScope: 'me' | 'everyone' = deleteScopeRaw === 'me' ? 'me' : 'everyone';
    traceMessageEvent('api.delete_message.request', {
      conversationId: req.params?.id,
      messageId,
      userId,
      scope: deleteScope
    });
    const message = await prisma.directMessage.findUnique({
      where: { id: messageId },
      include: {
        conversation: {
          include: {
            participants: { select: { userId: true, deletedAt: true } }
          }
        }
      }
    });
    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }
    const isParticipant = message.conversation.participants.some(
      (entry) => entry.userId === userId && !entry.deletedAt
    );
    if (!admin && !isParticipant) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    if (deleteScope === 'me') {
      if (!userId) {
        return res.status(400).json({ success: false, error: 'User is required for delete scope "me"' });
      }
      let alreadyDeletedForMe = false;
      try {
        const repo = (prisma as any).directMessageRecord;
        if (repo && typeof repo.findFirst === 'function') {
          const existing = await repo.findFirst({
            where: {
              messageId: message.id,
              conversationId: message.conversationId,
              actorUserId: userId,
              action: 'DELETED_FOR_ME'
            },
            select: { id: true }
          });
          alreadyDeletedForMe = Boolean(existing?.id);
        }
      } catch (error: any) {
        if (!isMessageRecordStoreUnsupportedError(error)) {
          console.warn('[messages] failed to check deleted-for-me state', error);
        }
      }

      if (!alreadyDeletedForMe) {
        await writeMessageRecord({
          messageId: message.id,
          conversationId: message.conversationId,
          action: 'DELETED_FOR_ME',
          actorUserId: userId,
          targetUserId: message.senderId,
          beforeText: message.text,
          afterText: message.text,
          beforeAttachments: Array.isArray(message.attachments) ? message.attachments : [],
          afterAttachments: Array.isArray(message.attachments) ? message.attachments : [],
          metadata: {
            scope: 'me',
            conversationId: message.conversationId
          }
        });
      }

      const payload = {
        conversationId: message.conversationId,
        messageId: message.id,
        deleted_for_me: true,
        deletedForMe: true,
        scope: 'me'
      };
      emitToUser(req, userId, 'messages:updated', payload);
      traceMessageEvent('api.delete_message.success', {
        conversationId: message.conversationId,
        messageId: message.id,
        userId,
        scope: 'me'
      });
      return res.json({ success: true, data: payload });
    }

    if (!admin && message.senderId !== userId) {
      return res.status(403).json({ success: false, error: 'Only the sender can delete for everyone' });
    }

    if (message.deletedAt) {
      return res.json({ success: true, data: { conversationId: message.conversationId, messageId: message.id, scope: 'everyone' } });
    }

    const deletedAt = new Date();
    await prisma.directMessage.update({
      where: { id: messageId },
      data: {
        text: '[Message deleted]',
        attachments: [],
        deletedAt
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
      deleted_at: deletedAt.toISOString(),
      deletedAt: deletedAt.toISOString(),
      attachments: [],
      scope: 'everyone',
      last_message: latest ? resolveMessageSnippet(latest) : '',
      lastMessage: latest ? resolveMessageSnippet(latest) : '',
      last_message_at: latest?.createdAt ? latest.createdAt.toISOString() : null,
      lastMessageAt: latest?.createdAt ? latest.createdAt.toISOString() : null
    };

    const fanoutUserIds = Array.from(
      new Set([
        String(message.senderId || '').trim(),
        ...message.conversation.participants.map((entry) => String(entry.userId || '').trim())
      ].filter(Boolean))
    );
    fanoutUserIds.forEach((targetUserId) => {
      emitToUser(req, targetUserId, 'messages:updated', payload);
    });
    traceMessageEvent('api.delete_message.success', {
      conversationId: message.conversationId,
      messageId: message.id,
      userId,
      scope: 'everyone'
    });

    return res.json({ success: true, data: payload });
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
