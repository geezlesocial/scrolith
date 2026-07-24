import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { resolveUserProStatus } from '../utils/proStatus';
import { syncFileUsages, removeUsage } from '../utils/fileUsage';
import { notifyAdmins } from '../utils/notify';
import {
  dispatchMessageReceiptNotifications,
  dispatchMessageReactionNotifications
} from '../services/messageNotifications';
import {
  formatLastMessagePreview,
  resolveStoredLastMessageText,
  MESSAGE_PREVIEW_LABELS
} from '../services/messaging/lastMessagePreview';
import { parseClientMessageId } from '../services/messaging/clientMessageId';
import {
  SCROLITHA_OFFICIAL_PROFILE_PHOTO_URL,
  withScrolithaAssetVersion
} from '../services/scrolitha/scrolitha.platformIdentity';

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
/** Inbox list only needs a short preview; full history loads via getConversation. */
const DEFAULT_CONVERSATION_PREVIEW_LIMIT = 5;

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
  // Canonical photo id — many accounts only store this (avatar URL may be empty/stale).
  profilePhotoFileId: true,
  role: true,
  isOnline: true,
  lastSeenAt: true,
  username: true,
  isVerified: true,
  // Phase 22.3B — for privacy-safe receipt/presence projection
  presenceVisibility: true,
  lastSeenVisibility: true,
  readReceiptsEnabled: true,
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
  lastDeliveredAt: true,
  label: true,
  isStarred: true,
  isMuted: true,
  isArchived: true,
  deletedAt: true,
  role: true,
  notifications: true,
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
      // Prefer auth-backed content path for previews. Storage object URLs may be
      // private / non-browser-loadable; clients resolve bytes via /api/files/content/:id.
      const contentUrl = `/api/files/content/${encodeURIComponent(String(file.id))}`;
      return {
        id: file.id,
        fileId: file.id,
        url: contentUrl,
        contentUrl,
        // Preserve original storage locator for ops/debug without using it as img src.
        storageUrl: file.url || undefined,
        name: file.originalName,
        originalName: file.originalName,
        mimeType: file.mimeType,
        type,
        size: Number(file.size || 0),
        thumbnailUrl: file.thumbnailUrl || undefined,
        width: file.width ?? undefined,
        height: file.height ?? undefined,
        duration: file.duration ?? undefined
      };
    })
    .filter(Boolean);
};

const formatParticipant = (participant: any) => {
  const pro = resolveUserProStatus(participant.user);
  const isPro = Boolean(pro.freelancerIsPro || pro.employerIsPro);
  const username = String(participant.user?.username || '').trim();
  const email = String(participant.user?.email || '').trim().toLowerCase();
  // Identity is based on the platform user account — not the human participant label.
  const isScrolitha =
    username.toLowerCase() === 'scrolitha' ||
    email === 'scrolitha@system.scrolith.internal' ||
    String(participant.label || '').toLowerCase() === 'system';
  const profileUrl = participant.user?.username
    ? `/u/${participant.user.username}`
    : `/profile/${participant.user.id}`;
  const profilePhotoFileId = String(participant.user?.profilePhotoFileId || '').trim() || null;
  const avatarRaw = String(participant.user?.avatar || '').trim();
  // Prefer durable platform content URL when profilePhotoFileId is set.
  // Stale OAuth/GCS avatar strings often fail in <img> (no bearer / expired signature).
  // Keep raw avatar as secondary so clients can fall back via multi-candidate resolution.
  const contentFromFileId = profilePhotoFileId
    ? `/api/files/content/${encodeURIComponent(profilePhotoFileId)}`
    : '';
  const avatarIsBareFileId =
    Boolean(avatarRaw) &&
    !/^https?:\/\//i.test(avatarRaw) &&
    !avatarRaw.startsWith('/') &&
    !avatarRaw.includes('://') &&
    /^[a-z0-9_-]{12,}$/i.test(avatarRaw);
  const avatarFromRaw =
    avatarIsBareFileId
      ? `/api/files/content/${encodeURIComponent(avatarRaw)}`
      : avatarRaw;
  // Prefer admin-managed Scrolitha avatar when present; fall back to official art.
  const avatarResolved = isScrolitha
    ? withScrolithaAssetVersion(
        avatarRaw ||
          contentFromFileId ||
          SCROLITHA_OFFICIAL_PROFILE_PHOTO_URL
      )
    : contentFromFileId || avatarFromRaw || '';

  return {
    id: participant.user.id,
    name: isScrolitha
      ? participant.user.name || 'Scrolitha'
      : participant.user.name || participant.user.email || 'User',
    avatar: avatarResolved,
    avatarUrl: avatarResolved,
    // Secondary candidate for FE multi-source avatar loading (when primary content URL fails).
    fallbackAvatar:
      !isScrolitha && avatarFromRaw && avatarFromRaw !== avatarResolved ? avatarFromRaw : null,
    fallback_avatar:
      !isScrolitha && avatarFromRaw && avatarFromRaw !== avatarResolved ? avatarFromRaw : null,
    profilePhotoFileId: isScrolitha ? null : profilePhotoFileId,
    profile_photo_file_id: isScrolitha ? null : profilePhotoFileId,
    username: participant.user.username || '',
    gender: normalizeGender(participant.user?.profile?.gender),
    profile_url: isScrolitha ? '/u/scrolitha' : profileUrl,
    profileUrl: isScrolitha ? '/u/scrolitha' : profileUrl,
    role: participant.user.role,
    is_online: isScrolitha ? true : Boolean(participant.user.isOnline),
    isOnline: isScrolitha ? true : Boolean(participant.user.isOnline),
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
    isArchived: Boolean(participant.isArchived),
    member_role: participant.role || 'MEMBER',
    memberRole: participant.role || 'MEMBER',
    notifications: participant.notifications || 'ALL',
    notificationLevel: participant.notifications || 'ALL',
    // Phase 22.3B — presence fields remain; FE applies viewer privacy via batch API
    is_scrolitha: isScrolitha,
    isScrolitha,
    is_verified: Boolean(participant.user?.isVerified) || isScrolitha,
    isVerified: Boolean(participant.user?.isVerified) || isScrolitha,
    system_label: isScrolitha ? 'AI assistant' : undefined,
    systemLabel: isScrolitha ? 'AI assistant' : undefined
  };
};

const formatReaction = (reaction: any) => ({
  user_id: reaction.userId,
  userId: reaction.userId,
  emoji: reaction.emoji,
  timestamp: reaction.createdAt ? reaction.createdAt.toISOString() : nowIso()
});

const resolveMessageSnippet = (message: any, fallbackStoredPreview?: string | null) => {
  const preview = formatLastMessagePreview(message, {
    fallbackStoredPreview: fallbackStoredPreview || null,
    maxLen: 160
  });
  if (preview.kind === 'empty') return MESSAGE_PREVIEW_LABELS.message;
  return preview.text;
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
  lastReadAt: number = 0,
  peerWatermarks: Array<{ userId: string; lastReadAt: number | null; lastDeliveredAt: number | null }> = []
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
  const isScrolithaMessage = Boolean(
    message?.isSystem ||
      (metadata as any)?.scrolitha ||
      (metadata as any)?.kind === 'assistant_reply' ||
      (metadata as any)?.kind === 'welcome'
  );

  const clientMessageId = message?.clientMessageId
    ? String(message.clientMessageId)
    : (metadata as any)?.clientMessageId || (metadata as any)?.clientSendId || null;

  // Phase 22.3 / 22.3B — outgoing delivery ticks; read only from peers who disclose receipts
  let deliveryStatus: 'sending' | 'sent' | 'delivered' | 'read' = 'sent';
  if (viewerId && message.senderId === viewerId) {
    try {
      const { resolveOutgoingDeliveryStatus } = require('../services/messaging/receiptPolicy');
      const peers = (peerWatermarks || []).filter((p) => p.userId && p.userId !== viewerId);
      const memberCount = Array.isArray(conversation.participants)
        ? conversation.participants.filter((p: any) => !p.deletedAt).length
        : peers.length + 1;
      const disclosureIds = Array.isArray((conversation as any)._readDisclosurePeerIds)
        ? (conversation as any)._readDisclosurePeerIds
        : null;
      deliveryStatus = resolveOutgoingDeliveryStatus({
        messageCreatedAt: createdAt,
        peers,
        isGroup: conversation.type === 'GROUP',
        memberCount,
        readDisclosurePeerIds: disclosureIds
      });
    } catch {
      deliveryStatus = isRead ? 'read' : 'sent';
    }
  } else if (isRead) {
    deliveryStatus = 'read';
  }

  return {
    id: message.id,
    conversation_id: conversation.id,
    conversationId: conversation.id,
    sender_id: message.senderId,
    senderId: message.senderId,
    receiver_id: receiverId,
    text: message.text,
    client_message_id: clientMessageId,
    clientMessageId,
    client_send_id: clientMessageId,
    clientSendId: clientMessageId,
    is_scrolitha: isScrolithaMessage,
    isScrolitha: isScrolithaMessage,
    timestamp: message.createdAt ? message.createdAt.toISOString() : nowIso(),
    is_read: Boolean(isRead) || deliveryStatus === 'read',
    isRead: Boolean(isRead) || deliveryStatus === 'read',
    is_delivered: deliveryStatus === 'delivered' || deliveryStatus === 'read',
    isDelivered: deliveryStatus === 'delivered' || deliveryStatus === 'read',
    delivery_status: deliveryStatus,
    deliveryStatus,
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
  // Phase 22.3B — hide lastReadAt for peers who disabled read receipts (internal watermark still stored)
  const peerWatermarks = (Array.isArray(conversation.participants) ? conversation.participants : [])
    .filter((p: any) => !p.deletedAt)
    .map((p: any) => {
      const uid = String(p.userId || '');
      const discloseRead = p.user?.readReceiptsEnabled !== false || uid === viewerId;
      return {
        userId: uid,
        lastReadAt:
          discloseRead && p.lastReadAt ? new Date(p.lastReadAt).getTime() : null,
        lastDeliveredAt: p.lastDeliveredAt ? new Date(p.lastDeliveredAt).getTime() : null
      };
    });
  (conversation as any)._readDisclosurePeerIds = peerWatermarks
    .filter((p) => p.lastReadAt != null || p.userId === viewerId)
    .map((p) => p.userId)
    .filter((id) => id && id !== viewerId);
  // Prefer peers whose user.readReceiptsEnabled is true
  const disclosurePeers = (Array.isArray(conversation.participants) ? conversation.participants : [])
    .filter((p: any) => !p.deletedAt && p.userId !== viewerId && p.user?.readReceiptsEnabled !== false)
    .map((p: any) => String(p.userId || ''))
    .filter(Boolean);
  (conversation as any)._readDisclosurePeerIds = disclosurePeers;
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
    formatConversationMessage(message, conversation, viewerId, lastReadAt, peerWatermarks)
  );

  const lastVisibleMessage = messages[messages.length - 1] || null;
  const storedPreview = String(conversation?.lastMessageText || conversation?.last_message_text || '').trim();
  const lastMessagePreview = formatLastMessagePreview(lastVisibleMessage, {
    fallbackStoredPreview: storedPreview || null,
    maxLen: 160
  });
  // Empty conversation → empty string so clients can show localized "No messages".
  // Media-only → attachment label (never blank when a visible message exists).
  const lastMessage =
    lastMessagePreview.kind === 'empty' ? '' : lastMessagePreview.text;
  const lastMessageAt =
    lastVisibleMessage?.timestamp ||
    (conversation?.lastMessageAt
      ? new Date(conversation.lastMessageAt).toISOString()
      : String(conversation?.last_message_at || '').trim()) ||
    '';

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
        isArchived: Boolean(viewer.isArchived),
        // Phase 22.2 — viewer membership role + notification level on conversation payload
        memberRole: (viewer as any).role || 'MEMBER',
        member_role: (viewer as any).role || 'MEMBER',
        notifications: (viewer as any).notifications || 'ALL',
        notificationLevel: (viewer as any).notifications || 'ALL'
      }
    : undefined;

  const isScrolithaConversation = participants.some(
    (p: any) => Boolean(p?.isScrolitha || p?.is_scrolitha)
  );

  return {
    id: conversation.id,
    type: conversation.type === 'GROUP' ? 'group' : 'direct',
    // Phase 22.2 group meta
    title: conversation.title || null,
    description: conversation.description || null,
    avatarFileId: conversation.avatarFileId || null,
    avatar_file_id: conversation.avatarFileId || null,
    visibility: conversation.visibility || 'PRIVATE',
    source: conversation.source || null,
    sourceId: conversation.sourceId || null,
    source_id: conversation.sourceId || null,
    participants,
    last_message: lastMessage,
    lastMessage: lastMessage,
    last_message_preview_kind: lastMessagePreview.kind,
    lastMessagePreviewKind: lastMessagePreview.kind,
    last_message_attachment_count: lastMessagePreview.attachmentCount,
    lastMessageAttachmentCount: lastMessagePreview.attachmentCount,
    last_message_at: lastMessageAt,
    lastMessageAt: lastMessageAt,
    unread_count: unreadCount,
    ...(participantState ? participantState : {}),
    // Official AI assistant threads stay pinned / starred in the inbox.
    is_starred: isScrolithaConversation ? true : Boolean(participantState?.is_starred),
    isStarred: isScrolithaConversation ? true : Boolean(participantState?.isStarred),
    is_scrolitha: isScrolithaConversation,
    isScrolitha: isScrolithaConversation,
    is_pinned: isScrolithaConversation,
    isPinned: isScrolithaConversation,
    assistant_kind: isScrolithaConversation ? 'scrolitha' : undefined,
    messages
  };
};

const applyAttachmentAwareLastMessage = (payload: any) => {
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const lastVisibleMessage = messages.length ? messages[messages.length - 1] : null;
  const preview = formatLastMessagePreview(lastVisibleMessage, {
    fallbackStoredPreview: payload?.last_message || payload?.lastMessage || null,
    maxLen: 160
  });
  const lastMessage = preview.kind === 'empty' ? '' : preview.text;
  return {
    ...payload,
    last_message: lastMessage,
    lastMessage,
    last_message_preview_kind: preview.kind,
    lastMessagePreviewKind: preview.kind,
    last_message_attachment_count: preview.attachmentCount,
    lastMessageAttachmentCount: preview.attachmentCount
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
  return applyAttachmentAwareLastMessage({ ...payload, messages });
};

const getDirectConversationKey = (conversation: any) => {
  if (!conversation || String(conversation.type || '').toUpperCase() !== 'DIRECT') return '';
  const participantIds = Array.isArray(conversation.participants)
    ? conversation.participants
        .map((participant: any) => String(participant?.userId || participant?.id || '').trim())
        .filter(Boolean)
    : [];
  const uniqueIds = Array.from(new Set(participantIds));
  if (uniqueIds.length !== 2) return '';
  return uniqueIds.sort().join(':');
};

/**
 * Stable inbox merge key for direct chats.
 * Always merges by participant pair so legacy duplicate DIRECT rows collapse to one inbox row.
 * Story reaction + story comment messages already share the same pair (and usually the same row),
 * so they stay merged without splitting the inbox by story id.
 */
const getConversationInboxMergeKey = (conversation: any) => {
  const participantKey = getDirectConversationKey(conversation);
  if (!participantKey) return '';
  return `direct:${participantKey}`;
};

const dedupeMessagesById = (messages: any[]) => {
  if (!Array.isArray(messages) || messages.length === 0) return [];
  const byId = new Map<string, any>();
  messages.forEach((message) => {
    const messageId = String(message?.id || '').trim();
    if (!messageId) return;
    if (!byId.has(messageId)) byId.set(messageId, message);
  });
  return Array.from(byId.values()).sort((left, right) => {
    const leftAt = new Date(left?.timestamp || left?.createdAt || 0).getTime();
    const rightAt = new Date(right?.timestamp || right?.createdAt || 0).getTime();
    if (leftAt !== rightAt) return leftAt - rightAt;
    return String(left?.id || '').localeCompare(String(right?.id || ''));
  });
};

const mergeConversationPayloads = (payloads: any[]) => {
  if (!Array.isArray(payloads) || payloads.length === 0) return [];

  const directBuckets = new Map<string, any[]>();
  const passthrough: any[] = [];

  payloads.forEach((payload) => {
    const key = getConversationInboxMergeKey(payload);
    if (!key) {
      passthrough.push(payload);
      return undefined;
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
    const mergedMessages = dedupeMessagesById(
      ordered.flatMap((entry) => (Array.isArray(entry?.messages) ? entry.messages : []))
    );
    const lastVisibleMessage = mergedMessages[mergedMessages.length - 1] || null;
    const unreadCount = ordered.reduce((sum, entry) => sum + Number(entry?.unread_count || entry?.unreadCount || 0), 0);
    const mergedPreview = formatLastMessagePreview(lastVisibleMessage, {
      fallbackStoredPreview: primary?.last_message || primary?.lastMessage || null,
      maxLen: 160
    });
    const mergedLastText = mergedPreview.kind === 'empty' ? '' : mergedPreview.text;
    return {
      ...primary,
      id: primary?.id,
      messages: mergedMessages,
      last_message: mergedLastText || primary?.last_message || '',
      last_message_at: lastVisibleMessage?.timestamp || primary?.last_message_at || '',
      unread_count: unreadCount,
      lastMessage: mergedLastText || primary?.lastMessage || '',
      lastMessageAt: lastVisibleMessage?.timestamp || primary?.lastMessageAt || '',
      last_message_preview_kind: mergedPreview.kind,
      lastMessagePreviewKind: mergedPreview.kind,
      last_message_attachment_count: mergedPreview.attachmentCount,
      lastMessageAttachmentCount: mergedPreview.attachmentCount,
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

/** Test-only exports for focused inbox merge/pagination unit tests. */
export const messagingInboxTestUtils = {
  mergeConversationPayloads,
  getConversationInboxMergeKey,
  getDirectConversationKey,
  dedupeMessagesById,
  DEFAULT_CONVERSATION_PREVIEW_LIMIT
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

  const canonicalKey = uniqueIds.sort().join(':');
  const matchingCandidates = candidates.filter((candidate: any) => {
    const candidateIds = Array.isArray(candidate?.participants)
      ? candidate.participants
          .map((entry: any) => String(entry?.userId || entry?.id || '').trim())
          .filter(Boolean)
      : [];
    const candidateSet = Array.from(new Set(candidateIds)).sort();
    return candidateSet.length >= 2 && canonicalKey === candidateSet.slice(0, 2).join(':');
  });

  if (matchingCandidates.length > 0) {
    matchingCandidates.sort((left: any, right: any) => {
      const leftAt = new Date(left?.updatedAt || left?.lastMessageAt || left?.last_message_at || 0).getTime();
      const rightAt = new Date(right?.updatedAt || right?.lastMessageAt || right?.last_message_at || 0).getTime();
      if (leftAt !== rightAt) return rightAt - leftAt;
      return String(right?.id || '').localeCompare(String(left?.id || ''));
    });
    return matchingCandidates;
  }

  return [];
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

/**
 * Phase 20.7 — Ensure exactly one private conversation with Scrolitha and return it.
 */
export const ensureScrolithaMessagingConversation = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const {
      ensureScrolithaDirectConversation,
      getDefaultScrolithaPromptChips
    } = await import('../services/scrolitha/scrolitha.messagingBridge');

    const ensured = await ensureScrolithaDirectConversation(userId, { seedWelcome: true });
    const conversation = await prisma.conversation.findUnique({
      where: { id: ensured.conversationId },
      include: {
        participants: { select: conversationParticipantSelect },
        messages: buildMessagesRelationSelect(DEFAULT_CONVERSATION_PREVIEW_LIMIT, false)
      }
    });
    if (!conversation) {
      return res.status(500).json({ success: false, error: 'Failed to load Scrolitha conversation' });
    }
    const payload = await buildConversationPayloadWithAttachments(conversation, userId);
    return res.json({
      success: true,
      data: {
        ...payload,
        created: ensured.created,
        welcomeSeeded: ensured.welcomeSeeded,
        messagingAssistantEnabled: ensured.messagingAssistantEnabled,
        platformUser: ensured.platformUser,
        promptChips: getDefaultScrolithaPromptChips()
      }
    });
  } catch (error: any) {
    console.error('Ensure Scrolitha messaging conversation error:', error);
    const status = Number(error?.statusCode || 500);
    return res.status(status).json({
      success: false,
      error: error?.message || 'Failed to ensure Scrolitha conversation'
    });
  }
};

/**
 * Phase 20.7.1 — Unified Scrolitha turn (SupportWidget / Messages / Dock write-through).
 * Persists user + assistant messages into the canonical DirectMessage conversation.
 */
export const postScrolithaUnifiedTurn = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const attachmentFileIds = Array.isArray(req.body?.attachmentFileIds)
      ? req.body.attachmentFileIds.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 5)
      : [];
    const text = String(req.body?.message || req.body?.text || '').trim();
    if (!text && !attachmentFileIds.length) {
      return res.status(400).json({ success: false, error: 'message or attachmentFileIds is required' });
    }

    const clientRequestId = String(req.body?.clientRequestId || req.body?.requestId || '').trim() || null;
    const preferStream = Boolean(req.body?.stream);
    const source = String(req.body?.source || 'unified_api').slice(0, 80);

    const { resolveActorFromRequest } = await import('../services/scrolitha/scrolitha.audit');
    const actor = resolveActorFromRequest(req);
    const { processScrolithaUnifiedTurn } = await import('../services/scrolitha/scrolitha.messagingBridge');

    const result = await processScrolithaUnifiedTurn({
      userId,
      userText: text || (attachmentFileIds.length ? 'Please review the attached file(s).' : ''),
      actor,
      app: req.app,
      clientRequestId,
      attachmentFileIds,
      source,
      preferStream,
      emitToUser: (targetId, event, body) => emitToUser(req, targetId, event, body)
    });

    if (result.skipped && result.reason === 'messaging_assistant_disabled') {
      return res.status(403).json({
        success: false,
        error: 'Scrolitha messaging assistant is currently disabled',
        code: 'SCROLITHA_MESSAGING_DISABLED'
      });
    }

    return res.json({
      success: true,
      data: {
        conversationId: result.conversationId,
        userMessageId: result.userMessageId,
        assistantMessageId: result.assistantMessageId,
        reply: result.reply,
        suggestedActions: result.suggestedActions || [],
        followUpPrompts: result.followUpPrompts || [],
        cards: result.cards || [],
        scrolithaConversationId: result.scrolithaConversationId,
        clientRequestId: result.clientRequestId || clientRequestId,
        streamingMode: result.streamingMode || 'none',
        messagingAssistantEnabled: result.messagingAssistantEnabled !== false
      }
    });
  } catch (error: any) {
    console.error('Scrolitha unified turn error:', error);
    const status = Number(error?.statusCode || 500);
    return res.status(status).json({
      success: false,
      error: error?.message || 'Failed to process Scrolitha turn'
    });
  }
};

/**
 * Phase 20.7.1 — SSE streaming unified turn (provider-independent chunk_fallback).
 * User message is persisted first; final assistant message is persisted once.
 */
export const postScrolithaUnifiedTurnStream = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { isCapabilityEnabled } = await import('../services/scrolitha/scrolitha.rollout');
    const { resolveActorFromRequest } = await import('../services/scrolitha/scrolitha.audit');
    const actor = resolveActorFromRequest(req);
    const streamAllowed = await isCapabilityEnabled('messagingStream', actor);
    if (!streamAllowed) {
      return res.status(403).json({
        success: false,
        error: 'Scrolitha messaging stream is currently disabled',
        code: 'SCROLITHA_STREAM_DISABLED'
      });
    }

    const attachmentFileIds = Array.isArray(req.body?.attachmentFileIds)
      ? req.body.attachmentFileIds.map((x: any) => String(x || '').trim()).filter(Boolean).slice(0, 5)
      : [];
    const text = String(req.body?.message || req.body?.text || '').trim();
    if (!text && !attachmentFileIds.length) {
      return res.status(400).json({ success: false, error: 'message or attachmentFileIds is required' });
    }

    const clientRequestId =
      String(req.body?.clientRequestId || req.body?.requestId || '').trim() ||
      `sse_${userId}_${Date.now()}`;
    const source = String(req.body?.source || 'unified_stream').slice(0, 80);

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const writeEvent = (event: string, data: Record<string, unknown>) => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    writeEvent('start', { requestId: clientRequestId, streamingMode: 'chunk_fallback' });

    const { processScrolithaUnifiedTurn } = await import('../services/scrolitha/scrolitha.messagingBridge');
    const result = await processScrolithaUnifiedTurn({
      userId,
      userText: text || (attachmentFileIds.length ? 'Please review the attached file(s).' : ''),
      actor,
      app: req.app,
      clientRequestId,
      attachmentFileIds,
      source,
      preferStream: true,
      emitToUser: (targetId, event, body) => emitToUser(req, targetId, event, body),
      onStreamEvent: async (evt) => {
        writeEvent(evt.type, {
          requestId: evt.requestId,
          text: evt.text,
          index: evt.index,
          messageId: evt.messageId,
          streamingMode: evt.streamingMode || 'chunk_fallback'
        });
      }
    });

    if (result.skipped && result.reason === 'messaging_assistant_disabled') {
      writeEvent('error', {
        requestId: clientRequestId,
        error: 'messaging_assistant_disabled',
        code: 'SCROLITHA_MESSAGING_DISABLED'
      });
      res.end();
      return undefined;
    }

    writeEvent('final', {
      requestId: clientRequestId,
      conversationId: result.conversationId,
      userMessageId: result.userMessageId,
      assistantMessageId: result.assistantMessageId,
      reply: result.reply,
      cards: result.cards || [],
      suggestedActions: result.suggestedActions || [],
      followUpPrompts: result.followUpPrompts || [],
      streamingMode: result.streamingMode || 'chunk_fallback'
    });
    writeEvent('done', { requestId: clientRequestId });
    res.end();
    return undefined;
  } catch (error: any) {
    console.error('Scrolitha unified stream error:', error);
    if (!res.headersSent) {
      return res.status(500).json({
        success: false,
        error: error?.message || 'Failed to stream Scrolitha turn'
      });
    }
    try {
      res.write(`event: error\ndata: ${JSON.stringify({ error: error?.message || 'stream_failed' })}\n\n`);
      res.end();
    } catch {
      // ignore
    }
    return undefined;
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

    // Best-effort: ensure official assistant DM when messaging assistant is enabled for this user.
    if (!admin && userId) {
      try {
        const { ensureScrolithaDirectConversation, isMessagingAssistantEnabled } = await import(
          '../services/scrolitha/scrolitha.messagingBridge'
        );
        const enabled = await isMessagingAssistantEnabled({
          id: userId,
          role: resolveRole(req),
          email: (req.user as any)?.email,
          isAdmin: isAdminRole(resolveRole(req))
        });
        if (enabled) {
          await ensureScrolithaDirectConversation(userId, { seedWelcome: true });
        }
      } catch (ensureError) {
        console.warn('[messages] ensure Scrolitha conversation skipped', ensureError);
      }
    }

    // Phase 22.1 — delta reconnect: only conversations updated after ISO timestamp.
    const updatedSinceRaw = String(
      req.query?.updatedSince || req.query?.updated_since || ''
    ).trim();
    let updatedSinceDate: Date | null = null;
    if (updatedSinceRaw) {
      const parsed = new Date(updatedSinceRaw);
      if (!Number.isNaN(parsed.getTime())) updatedSinceDate = parsed;
    }

    const where: any = admin
      ? updatedSinceDate
        ? {
            OR: [
              { updatedAt: { gt: updatedSinceDate } },
              { lastMessageAt: { gt: updatedSinceDate } }
            ]
          }
        : {}
      : {
          participants: {
            some: {
              userId,
              deletedAt: null
            }
          },
          ...(updatedSinceDate
            ? {
                OR: [
                  { updatedAt: { gt: updatedSinceDate } },
                  { lastMessageAt: { gt: updatedSinceDate } }
                ]
              }
            : {})
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

    // Inbox list skips replyToMessage joins — reply previews load with the full conversation.
    let conversations: any[] = [];
    try {
      conversations = await prisma.conversation.findMany({
        ...queryBase,
        include: {
          participants: {
            select: conversationParticipantSelect
          },
          messages: buildMessagesRelationSelect(previewLimit, false)
        }
      } as any);
    } catch (error: any) {
      // Keep a single fallback path for environments where message selects are partially unsupported.
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
    // Single batched file lookup for the whole page (no per-conversation attachment N+1).
    const fileMap = await buildAttachmentMap(attachmentIds);
    const payload = mergeConversationPayloads(
      basePayload.map((conversation: any) =>
        applyAttachmentAwareLastMessage({
          ...conversation,
          messages: conversation.messages.map((msg: any) => ({
            ...msg,
            attachments: mapAttachments(msg.attachments || [], fileMap)
          }))
        })
      )
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
    // Phase 22.1 — delta reconnect: messages newer than a known anchor id.
    const afterMessageId = String(
      req.query?.afterMessageId || req.query?.after_message_id || ''
    ).trim();

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

    if (afterMessageId) {
      const anchor = await prisma.directMessage.findFirst({
        where: { id: afterMessageId, conversationId: conversation.id },
        select: { id: true, createdAt: true }
      });
      if (anchor?.createdAt) {
        const newer = await prisma.directMessage.findMany({
          where: {
            conversationId: conversation.id,
            OR: [
              { createdAt: { gt: anchor.createdAt } },
              { createdAt: anchor.createdAt, id: { gt: anchor.id } }
            ]
          },
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          take: Math.min(200, messageLimit),
          include: {
            reactions: true,
            replyToMessage: { select: replyToMessageSelect }
          }
        } as any);
        conversation = { ...conversation, messages: newer };
        // Delta mode: return single conversation payload without merge expansion thrash.
        const hiddenMessageMapDelta =
          !admin && userId
            ? await getDeletedForMeMessageMap(userId, [String(conversation.id)])
            : new Map<string, Set<string>>();
        const base = buildConversationPayload(conversation, userId, {
          hiddenMessageIds: hiddenMessageMapDelta.get(String(conversation.id || '')) || new Set<string>()
        });
        const attachmentIds = (base.messages || []).flatMap((msg: any) =>
          Array.isArray(msg.attachments) ? msg.attachments : []
        );
        const fileMap = await buildAttachmentMap(attachmentIds);
        const payload = applyAttachmentAwareLastMessage({
          ...base,
          messages: (base.messages || []).map((msg: any) => ({
            ...msg,
            attachments: mapAttachments(msg.attachments || [], fileMap)
          }))
        });
        return res.json({
          success: true,
          data: payload,
          delta: { afterMessageId, count: Array.isArray(payload.messages) ? payload.messages.length : 0 }
        });
      }
    }

    const mergedConversationRecords = await getMergedDirectConversationRecords(conversation, userId, messageLimit, admin);
    const mergedHiddenMessageMap = !admin && userId
      ? await getDeletedForMeMessageMap(
          userId,
          mergedConversationRecords.map((entry: any) => String(entry.id || ''))
        )
      : new Map<string, Set<string>>();

    // Build payloads first, then one batched attachment map (avoids N file queries for N merged rows).
    const baseMergedPayloads = mergedConversationRecords.map((entry: any) => {
      const hiddenMessageIds = mergedHiddenMessageMap.get(String(entry.id || '')) || new Set<string>();
      return buildConversationPayload(entry, userId, { hiddenMessageIds });
    });
    const attachmentIds = baseMergedPayloads.flatMap((entry: any) =>
      (Array.isArray(entry?.messages) ? entry.messages : []).flatMap((msg: any) =>
        Array.isArray(msg?.attachments) ? msg.attachments : []
      )
    );
    const fileMap = await buildAttachmentMap(attachmentIds);
    const mergedPayloads = baseMergedPayloads.map((entry: any) => ({
      ...entry,
      messages: (Array.isArray(entry?.messages) ? entry.messages : []).map((msg: any) => ({
        ...msg,
        attachments: mapAttachments(msg.attachments || [], fileMap)
      }))
    }));
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

    // Phase 22.2 — explicit type or auto GROUP when >2 / title provided
    const requestedType = String(req.body?.type || '').toUpperCase();
    const groupTitle = req.body?.title != null ? String(req.body.title || '').trim().slice(0, 120) : '';
    const forceGroup = requestedType === 'GROUP' || Boolean(groupTitle);
    const type = forceGroup || uniqueIds.length > 2 ? 'GROUP' : 'DIRECT';

    // Phase 22.3B — DM audience privacy (new conversations only; existing preserved)
    if (type === 'DIRECT' && uniqueIds.length === 2 && userId) {
      const otherId = uniqueIds.find((id) => id !== userId) || '';
      if (otherId) {
        try {
          const { canInitiateDirectMessage } = await import(
            '../services/messaging/messagingPrivacyPolicy'
          );
          const gate = await canInitiateDirectMessage(String(userId), String(otherId));
          if (!gate.allowed) {
            // Allow if conversation already exists (checked below); for brand-new, deny
            // Defer deny until after existing lookup
            (req as any)._dmPrivacyGate = gate;
            (req as any)._dmPrivacyOtherId = otherId;
          }
        } catch {
          /* policy optional pre-migration */
        }
      }
    }

    let existing: any = null;
    if (type === 'DIRECT' && uniqueIds.length === 2) {
      const candidates = await prisma.conversation.findMany({
        where: {
          type: 'DIRECT',
          participants: { some: { userId: { in: uniqueIds } } }
        },
        include: { participants: true }
      });
      const canonicalKey = uniqueIds.slice().sort().join(':');
      existing = candidates
        .filter((c) => {
          const candidateIds = Array.isArray(c.participants)
            ? c.participants.map((p) => String(p.userId || p.id || '').trim()).filter(Boolean)
            : [];
          const candidateKey = Array.from(new Set(candidateIds)).sort().join(':');
          return candidateKey === canonicalKey;
        })
        .sort((left, right) => {
          const leftAt = new Date(left?.updatedAt || left?.lastMessageAt || 0).getTime();
          const rightAt = new Date(right?.updatedAt || right?.lastMessageAt || 0).getTime();
          if (leftAt !== rightAt) return rightAt - leftAt;
          return String(right?.id || '').localeCompare(String(left?.id || ''));
        })[0] || null;
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

    // New DM denied by privacy (existing already returned above)
    if (type === 'DIRECT' && (req as any)._dmPrivacyGate && !(req as any)._dmPrivacyGate.allowed) {
      return res.status(403).json({
        success: false,
        error:
          (req as any)._dmPrivacyGate.reason ||
          'This member cannot be messaged due to their messaging preferences.',
        code: 'MESSAGING_PRIVACY_DM_DENIED'
      });
    }

    const users = await prisma.user.findMany({ where: { id: { in: uniqueIds } } });
    if (users.length !== uniqueIds.length) {
      return res.status(400).json({ success: false, error: 'One or more participants not found' });
    }

    const description =
      req.body?.description != null ? String(req.body.description || '').trim().slice(0, 2000) : null;
    const avatarFileId =
      req.body?.avatarFileId != null ? String(req.body.avatarFileId || '').trim() || null : null;
    const visibilityRaw = String(req.body?.visibility || 'PRIVATE').toUpperCase();
    const visibility = ['PRIVATE', 'PUBLIC', 'UNLISTED'].includes(visibilityRaw)
      ? visibilityRaw
      : 'PRIVATE';
    const ownerId = userId && uniqueIds.includes(userId) ? userId : uniqueIds[0];

    const created = await prisma.conversation.create({
      data: {
        type,
        ...(type === 'GROUP'
          ? {
              title: groupTitle || null,
              description: description || null,
              avatarFileId,
              visibility
            }
          : {}),
        participants: {
          create: uniqueIds.map((id) => ({
            userId: id as string,
            ...(type === 'GROUP'
              ? { role: id === ownerId ? 'OWNER' : 'MEMBER' }
              : {})
          })) as any
        }
      } as any
    });

    return res.json({
      success: true,
      data: {
        id: created.id,
        type: type === 'GROUP' ? 'group' : 'direct',
        title: (created as any).title || null
      }
    });
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
    const clientMessageId = parseClientMessageId(req.body, req.headers as any);
    if (!senderId || (!text && attachments.length === 0)) {
      return res.status(400).json({ success: false, error: 'Sender and message content are required' });
    }
    traceMessageEvent('api.post_message.request', {
      conversationId,
      senderId,
      hasText: Boolean(text),
      textLength: text.length,
      attachmentsCount: attachments.length,
      replyToMessageId: replyToMessageId || null,
      clientMessageId
    });

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { participants: true }
    });
    if (!conversation) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const senderParticipant = conversation.participants.find((p) => p.userId === senderId);
    const isParticipant = Boolean(senderParticipant && !(senderParticipant as any).deletedAt);
    if (!isParticipant && !admin) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    if (!isParticipant && admin) {
      await prisma.conversationParticipant.create({
        data: { conversationId: conversation.id, userId: senderId }
      });
    } else if (senderParticipant?.deletedAt || senderParticipant?.isArchived) {
      // Soft-deleted members may not rejoin group chats by sending (enterprise groups).
      // DIRECT still restores archive/delete for continuity of 1:1 threads.
      if (conversation.type === 'GROUP' && senderParticipant?.deletedAt && !admin) {
        return res.status(403).json({
          success: false,
          error: 'Not a member of this group',
          code: 'GROUP_NOT_MEMBER'
        });
      }
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

    // Phase 29.1 — UserBlock enforcement (DM + group): block either direction among participants
    try {
      const { hasActiveBlockBetween } = await import('../services/messaging/groupSendGate');
      const others = conversation.participants
        .map((p) => p.userId)
        .filter((id) => id && id !== senderId);
      if (await hasActiveBlockBetween(senderId, others)) {
        return res.status(403).json({
          success: false,
          error: 'Messaging blocked between users',
          code: 'MESSAGING_BLOCKED'
        });
      }
    } catch {
      /* optional */
    }

    // Phase 29.1 — server-authoritative group send gates (mode, permissions, content, slow mode, rate)
    if (conversation.type === 'GROUP') {
      try {
        const { evaluateGroupSendGate, markGroupMemberSent } = await import(
          '../services/messaging/groupSendGate'
        );
        const gate = await evaluateGroupSendGate({
          conversationId: conversation.id,
          senderId,
          text,
          attachments,
          messageType: req.body?.messageType || req.body?.message_type || null,
          metadata:
            req.body?.metadata && typeof req.body.metadata === 'object' ? req.body.metadata : null,
          conversation,
          membership: senderParticipant
        });
        if (!gate.allowed) {
          let ackStatus = 'rejected';
          try {
            const { recordGroupAudit } = await import('../services/messaging/groupAudit');
            await recordGroupAudit({
              conversationId: conversation.id,
              actorId: senderId,
              action: 'message.send_denied',
              reason: gate.reason || gate.code || null,
              metadata: { code: gate.code, retryAfterMs: gate.retryAfterMs || 0 }
            });
            const { groupMetrics } = await import('../services/messaging/groupMetrics');
            const { mapGateToAckStatus } = await import('../services/messaging/groupRealtimeEvents');
            groupMetrics.messageSendRejected();
            ackStatus = mapGateToAckStatus(gate.code, gate.reason);
          } catch {
            /* optional */
          }
          const status =
            gate.code === 'GROUP_SLOW_MODE' ? 429 : gate.code === 'GROUP_LOCKED' ? 403 : 403;
          return res.status(status).json({
            success: false,
            error: gate.reason || 'Send not allowed',
            code: gate.code || 'GROUP_PERMISSION_DENIED',
            retryAfterMs: gate.retryAfterMs || 0,
            sendAck: {
              status: ackStatus,
              code: gate.code || 'GROUP_PERMISSION_DENIED',
              reason: gate.reason || null,
              retryAfterMs: gate.retryAfterMs || 0,
              conversationId: conversation.id,
              clientMessageId: clientMessageId || null
            }
          });
        }
        // mark after successful create (see below) — stash flag on request local
        (req as any).__phase291_markGroupSent = true;
        // Phase 29.5 — abuse assessment (recommendations; optional auto-restrict signal only)
        try {
          const { assessMessageSendAbuse } = await import(
            '../services/messaging/groupAbuseProtection.service'
          );
          const abuse = assessMessageSendAbuse({
            userId: senderId,
            conversationId: conversation.id,
            text,
            attachmentCount: attachments.length
          });
          if (abuse.score >= 50) {
            (req as any).__phase295_abuse = abuse;
          }
        } catch {
          /* optional */
        }
      } catch (gateError) {
        console.warn('[messages] group send gate failed open=false policy', (gateError as any)?.message || gateError);
        // Fail closed for group mode/permission evaluation errors to avoid spam
        return res.status(503).json({
          success: false,
          error: 'Group send policy temporarily unavailable',
          code: 'GROUP_PERMISSION_DENIED'
        });
      }
    }

    // Phase 22.1 — idempotent send: duplicate clientMessageId returns existing message (200).
    if (clientMessageId) {
      try {
        const existingByClientId = await (prisma.directMessage as any).findFirst({
          where: {
            senderId,
            clientMessageId,
            conversationId: conversation.id
          },
          include: {
            reactions: true,
            replyToMessage: {
              select: replyToMessageSelect
            }
          }
        });
        if (existingByClientId) {
          const receiverIdsExisting = conversation.participants
            .map((p) => p.userId)
            .filter((id) => id !== senderId);
          const fileMapExisting = Array.isArray(existingByClientId.attachments) && existingByClientId.attachments.length
            ? await buildAttachmentMap(existingByClientId.attachments)
            : new Map<string, any>();
          const mappedExisting = mapAttachments(existingByClientId.attachments || [], fileMapExisting);
          const payloadExisting = {
            id: existingByClientId.id,
            conversation_id: conversation.id,
            conversationId: conversation.id,
            sender_id: senderId,
            senderId,
            receiver_id: receiverIdsExisting[0] || '',
            text: existingByClientId.text,
            timestamp: existingByClientId.createdAt.toISOString(),
            is_read: false,
            is_deleted: Boolean(existingByClientId.deletedAt),
            isDeleted: Boolean(existingByClientId.deletedAt),
            deleted_at: existingByClientId.deletedAt ? existingByClientId.deletedAt.toISOString() : null,
            deletedAt: existingByClientId.deletedAt ? existingByClientId.deletedAt.toISOString() : null,
            edited_at: existingByClientId.editedAt ? existingByClientId.editedAt.toISOString() : null,
            editedAt: existingByClientId.editedAt ? existingByClientId.editedAt.toISOString() : null,
            reactions: Array.isArray(existingByClientId.reactions)
              ? existingByClientId.reactions.map(formatReaction)
              : [],
            message_type: existingByClientId.messageType || 'text',
            messageType: existingByClientId.messageType || 'text',
            attachments: mappedExisting,
            attachment_ids: existingByClientId.attachments || [],
            reply_to_message_id: existingByClientId.replyToMessageId || null,
            replyToMessageId: existingByClientId.replyToMessageId || null,
            reply_to_snapshot: existingByClientId.replyToSnapshot || null,
            replyToSnapshot: existingByClientId.replyToSnapshot || null,
            reply_to: buildReplyPreview(existingByClientId),
            replyTo: buildReplyPreview(existingByClientId),
            client_message_id: clientMessageId,
            clientMessageId,
            client_send_id: clientMessageId,
            clientSendId: clientMessageId,
            metadata: {
              ...(existingByClientId.metadata && typeof existingByClientId.metadata === 'object'
                ? existingByClientId.metadata
                : {}),
              clientMessageId,
              clientSendId: clientMessageId
            },
            idempotentReplay: true
          };
          try {
            const { groupMetrics } = await import('../services/messaging/groupMetrics');
            if (conversation.type === 'GROUP') groupMetrics.messageDuplicate();
          } catch {
            /* optional */
          }
          return res.json({
            success: true,
            data: payloadExisting,
            idempotentReplay: true,
            sendAck: {
              status: 'duplicate',
              conversationId: conversation.id,
              messageId: payloadExisting.id,
              clientMessageId: clientMessageId || null
            }
          });
        }
      } catch (lookupError: any) {
        // Column may not exist until migration applied — fall through to create.
        if (!String(lookupError?.message || '').includes('clientMessageId')) {
          console.warn('[messages] clientMessageId lookup failed', lookupError?.message || lookupError);
        }
      }
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

    const baseMetadata =
      req.body?.metadata && typeof req.body.metadata === 'object' && !Array.isArray(req.body.metadata)
        ? { ...req.body.metadata }
        : {};
    if (clientMessageId) {
      baseMetadata.clientMessageId = clientMessageId;
      baseMetadata.clientSendId = clientMessageId;
    }

    const messageCreateData: any = {
      conversationId: conversation.id,
      senderId,
      text,
      attachments,
      replyToMessageId: replyToMessageId || null,
      replyToSnapshot: replyToSnapshot || null,
      ...(clientMessageId ? { clientMessageId } : {}),
      ...(Object.keys(baseMetadata).length ? { metadata: baseMetadata } : {})
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
      // Race: concurrent duplicate clientMessageId — return existing (idempotent).
      if (clientMessageId && (error?.code === 'P2002' || String(error?.message || '').includes('clientMessageId'))) {
        const raced = await (prisma.directMessage as any).findFirst({
          where: { senderId, clientMessageId, conversationId: conversation.id },
          include: {
            reactions: true,
            replyToMessage: { select: replyToMessageSelect }
          }
        });
        if (raced) {
          message = raced;
        } else if (!isReplyFeatureUnsupportedError(error)) {
          throw error;
        }
      } else if (!isReplyFeatureUnsupportedError(error)) {
        // Retry without clientMessageId column if migration not applied yet.
        if (clientMessageId && String(error?.message || '').includes('clientMessageId')) {
          message = await prisma.directMessage.create({
            data: {
              conversationId: conversation.id,
              senderId,
              text,
              attachments,
              replyToMessageId: replyToMessageId || null,
              replyToSnapshot: replyToSnapshot || null,
              metadata: baseMetadata
            },
            include: {
              reactions: true,
              replyToMessage: { select: replyToMessageSelect }
            }
          } as any);
        } else {
          throw error;
        }
      }
      if (!message) {
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
    }

    if (attachments.length) {
      try {
        await syncFileUsages('direct_message', message.id, attachments, 'Direct Message Attachment');
      } catch (e) {
        console.warn('Failed to sync message file usage:', e);
      }
    }

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
    const mappedAttachments = mapAttachments(attachments, fileMap);
    const previewForSocket = formatLastMessagePreview({
      text: message.text,
      attachments: mappedAttachments,
      messageType: message.messageType || (attachments.length ? 'file' : 'text')
    });
    const resolvedLastMessageText =
      previewForSocket.kind === 'empty' ? null : previewForSocket.text.slice(0, 240);

    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageText:
          resolvedLastMessageText ||
          (attachments.length ? MESSAGE_PREVIEW_LABELS.file : text || null),
        lastMessageAt: message.createdAt,
        lastMessageSenderId: senderId
      }
    });

    // Phase 29.1 — slow mode watermark + lastActivityAt for groups
    if ((req as any).__phase291_markGroupSent) {
      try {
        const { markGroupMemberSent } = await import('../services/messaging/groupSendGate');
        await markGroupMemberSent(conversation.id, senderId);
      } catch {
        /* optional */
      }
    }

    const resolvedClientMessageId =
      clientMessageId ||
      (message as any)?.clientMessageId ||
      (message?.metadata as any)?.clientMessageId ||
      null;
    const payload = {
      id: message.id,
      conversation_id: conversation.id,
      conversationId: conversation.id,
      sender_id: senderId,
      senderId,
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
      message_type: message.messageType || (attachments.length ? 'file' : 'text'),
      messageType: message.messageType || (attachments.length ? 'file' : 'text'),
      attachments: mappedAttachments,
      attachment_ids: attachments,
      reply_to_message_id: message.replyToMessageId || null,
      replyToMessageId: message.replyToMessageId || null,
      reply_to_snapshot: message.replyToSnapshot || null,
      replyToSnapshot: message.replyToSnapshot || null,
      reply_to: buildReplyPreview(message),
      replyTo: buildReplyPreview(message),
      client_message_id: resolvedClientMessageId,
      clientMessageId: resolvedClientMessageId,
      client_send_id: resolvedClientMessageId,
      clientSendId: resolvedClientMessageId,
      metadata: {
        ...(message.metadata && typeof message.metadata === 'object' ? message.metadata : {}),
        ...(resolvedClientMessageId
          ? { clientMessageId: resolvedClientMessageId, clientSendId: resolvedClientMessageId }
          : {})
      },
      // Phase 20.7.7 — attachment-aware preview for socket inbox updates
      last_message: resolvedLastMessageText || '',
      lastMessage: resolvedLastMessageText || '',
      last_message_at: message.createdAt.toISOString(),
      lastMessageAt: message.createdAt.toISOString(),
      last_message_preview_kind: previewForSocket.kind,
      lastMessagePreviewKind: previewForSocket.kind
    };

    receiverIds.forEach((id) => emitToUser(req, id, 'messages:new', payload));
    emitToUser(req, senderId, 'messages:sent', payload);
    // Phase 29.2 — dual-emit into authorized group room (members who joined room)
    if (conversation.type === 'GROUP') {
      try {
        const realtime = (await import('../utils/realtime')).default;
        const { groupRoomName } = await import('../services/messaging/groupRealtimeEvents');
        const { groupMetrics } = await import('../services/messaging/groupMetrics');
        realtime.emitToRoom(groupRoomName(conversation.id), 'messages:new', payload);
        groupMetrics.messageSend();
        // clear recording indicator for sender on successful send
        const { clearUserEphemeral, setRecordingState } = await import(
          '../services/messaging/groupEphemeralIndicators'
        );
        clearUserEphemeral(conversation.id, senderId);
        void setRecordingState({
          conversationId: conversation.id,
          userId: senderId,
          isRecording: false
        });
      } catch {
        /* optional */
      }
    }
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

    // Phase 22.2 — resolve @mentions for group notification / mute bypass
    let mentionedUserIds: string[] = [];
    try {
      const { resolveMentionUserIds } = await import('./groupMessaging.controller');
      mentionedUserIds = await resolveMentionUserIds(text);
      if (mentionedUserIds.length && message?.id) {
        const nextMeta = {
          ...(message.metadata && typeof message.metadata === 'object' ? message.metadata : {}),
          mentionedUserIds
        };
        await prisma.directMessage
          .update({ where: { id: message.id }, data: { metadata: nextMeta } as any })
          .catch(() => null);
      }
    } catch {
      mentionedUserIds = [];
    }

    void dispatchMessageReceiptNotifications({
      receiverIds,
      senderId,
      conversationId: conversation.id,
      messageId: message.id,
      preview: text,
      fallbackPreview: attachments.length ? 'Sent an attachment' : 'New message',
      messageType: 'text',
      mentionedUserIds,
      isGroup: conversation.type === 'GROUP'
    }).catch((notifyError) => {
      console.warn('Failed to send message notifications', notifyError);
    });

    // Phase 20.7 / 20.7.2: Scrolitha DM AI turn must finish inside this request
    // (Cloud Run drops fire-and-forget). User message already persisted.
    // AI failures must not fail the user send.
    // Phase 20.7.2 P1: do NOT skip admin/moderator users — that caused silent no-reply.
    let scrolithaTurn: Record<string, unknown> | null = null;
    // Allow attachment-only user turns on Scrolitha DMs (file intelligence).
    if ((text || (attachments && attachments.length)) && senderId === userId) {
      try {
        const {
          conversationIncludesScrolitha,
          processScrolithaMessagingTurn
        } = await import('../services/scrolitha/scrolitha.messagingBridge');
        const isScrolithaDm = await conversationIncludesScrolitha(conversation.id);
        if (!isScrolithaDm) {
          scrolithaTurn = { status: 'skipped', reason: 'not_scrolitha_dm' };
        } else {
          const { getScrolithaPlatformUserId, ensureScrolithaPlatformUser } = await import(
            '../services/scrolitha/scrolitha.platformIdentity'
          );
          const platformId = await getScrolithaPlatformUserId();
          if (senderId === platformId) {
            scrolithaTurn = { status: 'skipped', reason: 'bot_loop' };
          } else {
            const { resolveActorFromRequest } = await import('../services/scrolitha/scrolitha.audit');
            const actor = resolveActorFromRequest(req);
            const clientRequestId =
              String(
                req.body?.clientRequestId ||
                  req.body?.client_request_id ||
                  req.headers['x-client-request-id'] ||
                  ''
              ).trim() || null;

            const AI_TURN_BUDGET_MS = Math.max(
              10_000,
              Math.min(90_000, Number(process.env.SCROLITHA_MESSAGING_TURN_BUDGET_MS || 50_000) || 50_000)
            );
            const abortController = new AbortController();
            const budgetTimer = setTimeout(() => abortController.abort(), AI_TURN_BUDGET_MS);

            let turnResult: any;
            try {
              turnResult = await processScrolithaMessagingTurn({
                userId: senderId,
                conversationId: conversation.id,
                userText: text || (attachments.length ? 'Please review the attached file(s).' : ''),
                actor,
                app: req.app,
                clientRequestId,
                // Phase 20.7.6 — pass messaging attachments into secure file intelligence
                attachmentFileIds: Array.isArray(attachments) ? attachments.slice(0, 5) : [],
                signal: abortController.signal,
                emitToUser: (targetId, event, body) => emitToUser(req, targetId, event, body)
              });
            } finally {
              clearTimeout(budgetTimer);
            }

            if (turnResult?.skipped) {
              // If aborted by budget, force a single recoverable assistant message.
              if (
                turnResult.reason === 'aborted' ||
                turnResult.reason === 'turn_budget_exceeded' ||
                abortController.signal.aborted
              ) {
                const fallbackText =
                  "Scrolitha couldn't finish that reply just now. Please try again.";
                const platformUser = await ensureScrolithaPlatformUser();
                // Prefer existing assistant for this clientRequestId if turn partially finished.
                let assistantId = turnResult.assistantMessageId as string | undefined;
                let assistantText = String(turnResult.reply || fallbackText);
                if (!assistantId) {
                  const failed = await prisma.directMessage.create({
                    data: {
                      conversationId: conversation.id,
                      senderId: platformUser.id,
                      text: fallbackText,
                      metadata: {
                        scrolitha: true,
                        kind: 'error_fallback',
                        error: turnResult.reason || 'turn_budget_exceeded',
                        retryable: true,
                        clientRequestId
                      }
                    }
                  });
                  await prisma.conversation.update({
                    where: { id: conversation.id },
                    data: {
                      lastMessageText: fallbackText.slice(0, 240),
                      lastMessageAt: failed.createdAt,
                      lastMessageSenderId: platformUser.id
                    }
                  });
                  assistantId = failed.id;
                  assistantText = fallbackText;
                  const assistantPayload = {
                    id: failed.id,
                    conversation_id: conversation.id,
                    conversationId: conversation.id,
                    sender_id: platformUser.id,
                    senderId: platformUser.id,
                    receiver_id: senderId,
                    receiverId: senderId,
                    text: fallbackText,
                    timestamp: failed.createdAt.toISOString(),
                    is_read: false,
                    is_scrolitha: true,
                    isScrolitha: true,
                    metadata: failed.metadata
                  };
                  emitToUser(req, senderId, 'messages:new', assistantPayload);
                  scrolithaTurn = {
                    status: 'error',
                    reason: turnResult.reason || 'turn_budget_exceeded',
                    assistantMessageId: assistantId,
                    replyPreview: assistantText.slice(0, 160),
                    assistantMessage: assistantPayload,
                    retryable: true
                  };
                } else {
                  scrolithaTurn = {
                    status: 'error',
                    reason: turnResult.reason || 'turn_budget_exceeded',
                    assistantMessageId: assistantId,
                    replyPreview: assistantText.slice(0, 160),
                    retryable: true
                  };
                }
              } else {
                console.warn('[messages] scrolitha turn skipped', {
                  conversationId: conversation.id,
                  reason: turnResult.reason,
                  role,
                  isAdmin: admin
                });
                scrolithaTurn = {
                  status: 'skipped',
                  reason: turnResult.reason || 'skipped',
                  retryable: turnResult.reason === 'messaging_assistant_disabled'
                };
              }
            } else {
              let assistantMessage: Record<string, unknown> | null = null;
              const assistantMessageId = turnResult?.assistantMessageId || null;
              if (assistantMessageId) {
                try {
                  const row = await prisma.directMessage.findUnique({
                    where: { id: String(assistantMessageId) }
                  });
                  if (row) {
                    const platformUser = await ensureScrolithaPlatformUser();
                    assistantMessage = {
                      id: row.id,
                      conversation_id: conversation.id,
                      conversationId: conversation.id,
                      sender_id: platformUser.id,
                      senderId: platformUser.id,
                      receiver_id: senderId,
                      receiverId: senderId,
                      text: row.text,
                      timestamp: row.createdAt.toISOString(),
                      is_read: false,
                      is_scrolitha: true,
                      isScrolitha: true,
                      metadata: row.metadata || null
                    };
                  }
                } catch {
                  assistantMessage = null;
                }
              }
              scrolithaTurn = {
                status: 'ok',
                reason: null,
                assistantMessageId,
                replyPreview: String(turnResult?.reply || '').slice(0, 160),
                cardsCount: Array.isArray(turnResult?.cards) ? turnResult.cards.length : 0,
                streamingMode: turnResult?.streamingMode || 'none',
                assistantMessage,
                skipped: false
              };
            }
          }
        }
      } catch (bridgeError: any) {
        console.warn('[messages] scrolitha messaging bridge failed', {
          conversationId: conversation.id,
          error: String(bridgeError?.message || bridgeError),
          code: bridgeError?.code || null
        });
        scrolithaTurn = {
          status: 'error',
          reason: String(bridgeError?.code || bridgeError?.message || 'bridge_failed').slice(0, 120),
          retryable: true
        };
      }
    }

    return res.json({
      success: true,
      data: payload,
      ...(scrolithaTurn ? { scrolithaTurn } : {}),
      // Phase 29.2 — stable send acknowledgement (REST/socket parity contract)
      sendAck: {
        status: 'accepted',
        conversationId: conversation.id,
        messageId: payload.id,
        clientMessageId: resolvedClientMessageId || null,
        orderingCursor: `${message.createdAt.toISOString()}|${message.id}`
      },
      // Phase 29.5 — abuse recommendations (never auto-punish unless configured elsewhere)
      ...((req as any).__phase295_abuse
        ? {
            abuseSignals: {
              score: (req as any).__phase295_abuse.score,
              signals: (req as any).__phase295_abuse.signals,
              recommendations: (req as any).__phase295_abuse.recommendations
            }
          }
        : {})
    });
  } catch (error: any) {
    console.error('Post message error:', error);
    traceMessageEvent('api.post_message.error', {
      conversationId: req.params?.id,
      senderId: req.body?.senderId || resolveUserId(req),
      error: String(error?.message || error)
    });
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to send message',
      sendAck: { status: 'error', reason: String(error?.message || 'error').slice(0, 120) }
    });
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

    const now = new Date();
    // Phase 22.3 — advance read + delivered watermarks together
    let updated: any;
    try {
      updated = await prisma.conversationParticipant.update({
        where: { id: participant.id },
        data: { lastReadAt: now, lastDeliveredAt: now } as any
      });
    } catch {
      updated = await prisma.conversationParticipant.update({
        where: { id: participant.id },
        data: { lastReadAt: now }
      });
    }

    emitToUser(req, userId, 'messages:read', { conversationId });
    // Fan-out receipts to peers (backward compatible event)
    const receiptPayload = {
      conversationId,
      userId,
      lastReadAt: updated.lastReadAt ? new Date(updated.lastReadAt).toISOString() : now.toISOString(),
      lastDeliveredAt: (updated as any).lastDeliveredAt
        ? new Date((updated as any).lastDeliveredAt).toISOString()
        : now.toISOString(),
      version: '22.3'
    };
    try {
      const others = await prisma.conversationParticipant.findMany({
        where: { conversationId, deletedAt: null, userId: { not: userId } },
        select: { userId: true }
      });
      others.forEach((row) => emitToUser(req, row.userId, 'messages:receipts', receiptPayload));
      emitToUser(req, userId, 'messages:receipts', receiptPayload);
    } catch {
      /* best-effort */
    }
    traceMessageEvent('api.mark_read.success', { conversationId, userId });
    return res.json({ success: true, data: receiptPayload });
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

    // Phase 20.7.8 — peer controls blocked for canonical Scrolitha conversation
    const { isCanonicalScrolithaConversation, SCROLITHA_PEER_CONTROL_BLOCKED } = await import(
      '../services/scrolitha/scrolitha.conversationPolicy'
    );
    if (await isCanonicalScrolithaConversation(conversationId)) {
      const blockedKeys = ['label', 'isMuted', 'isArchived', 'isStarred'].filter(
        (key) => req.body?.[key] !== undefined
      );
      // Allow keeping star true; block mute/archive/label/unstar
      const peerMutation =
        req.body?.label !== undefined ||
        req.body?.isMuted !== undefined ||
        req.body?.isArchived !== undefined ||
        (req.body?.isStarred !== undefined && req.body.isStarred === false);
      if (peerMutation || blockedKeys.length) {
        if (
          req.body?.label !== undefined ||
          req.body?.isMuted !== undefined ||
          req.body?.isArchived !== undefined ||
          (req.body?.isStarred !== undefined && Boolean(req.body.isStarred) === false)
        ) {
          return res.status(403).json({
            success: false,
            error: SCROLITHA_PEER_CONTROL_BLOCKED,
            code: 'SCROLITHA_SYSTEM_CONVERSATION_PROTECTED'
          });
        }
      }
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
    const { isCanonicalScrolithaConversation, SCROLITHA_PEER_CONTROL_BLOCKED } = await import(
      '../services/scrolitha/scrolitha.conversationPolicy'
    );
    if (await isCanonicalScrolithaConversation(conversationId)) {
      return res.status(403).json({
        success: false,
        error: SCROLITHA_PEER_CONTROL_BLOCKED,
        code: 'SCROLITHA_SYSTEM_CONVERSATION_PROTECTED'
      });
    }
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
    const { isCanonicalScrolithaConversation, SCROLITHA_PEER_CONTROL_BLOCKED } = await import(
      '../services/scrolitha/scrolitha.conversationPolicy'
    );
    if (await isCanonicalScrolithaConversation(conversationId)) {
      return res.status(403).json({
        success: false,
        error: SCROLITHA_PEER_CONTROL_BLOCKED,
        code: 'SCROLITHA_SYSTEM_CONVERSATION_PROTECTED'
      });
    }
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

/**
 * Phase 20.7.5 — Messages search (people / username / conversation / message text).
 * Scoped to the authenticated user's conversations only.
 */
export const searchMessages = async (req: Request, res: Response) => {
  try {
    const role = resolveRole(req);
    const userId = resolveUserId(req);
    const admin = isAdminRole(role);

    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const q = String(req.query?.q || '').replace(/\s+/g, ' ').trim();
    if (q.length < 2) {
      return res.status(400).json({ success: false, error: 'Query too short' });
    }
    if (q.length > 80) {
      return res.status(400).json({ success: false, error: 'Query too long' });
    }

    const scope = String(req.query?.scope || '').trim().toLowerCase();
    if (scope === 'admin' && !admin) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const limit = Math.max(1, Math.min(50, Number(req.query?.limit || 20) || 20));
    const qLower = q.toLowerCase();

    // Conversations the current user can see (not soft-deleted for them)
    const membership = await prisma.conversationParticipant.findMany({
      where: { userId, deletedAt: null, isArchived: false },
      select: { conversationId: true },
      take: 500
    });
    const allowedIds = membership.map((m) => m.conversationId);
    if (!allowedIds.length) {
      return res.json({
        success: true,
        data: { results: [], nextCursor: null, hasMore: false },
        pagination: { hasMore: false }
      });
    }

    const scrolithaHit =
      'scrolitha'.includes(qLower) ||
      'ai assistant'.includes(qLower) ||
      qLower.includes('scrolith') ||
      qLower === 'ai';

    const convs = await prisma.conversation.findMany({
      where: {
        id: { in: allowedIds },
        OR: [
          {
            participants: {
              some: {
                userId: { not: userId },
                user: {
                  OR: [
                    { username: { contains: q, mode: 'insensitive' } },
                    { name: { contains: q, mode: 'insensitive' } }
                  ]
                }
              }
            }
          },
          ...(scrolithaHit
            ? [
                {
                  participants: {
                    some: {
                      OR: [
                        { label: { in: ['scrolitha', 'system'] } },
                        { user: { username: { equals: 'scrolitha', mode: 'insensitive' as const } } }
                      ]
                    }
                  }
                }
              ]
            : [])
        ]
      },
      include: {
        participants: { select: conversationParticipantSelect },
        messages: buildMessagesRelationSelect(DEFAULT_CONVERSATION_PREVIEW_LIMIT, false)
      },
      orderBy: [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }],
      take: limit
    });

    const seen = new Set<string>();
    const results: any[] = [];

    for (const conv of convs) {
      if (seen.has(conv.id)) continue;
      seen.add(conv.id);
      const payload = await buildConversationPayloadWithAttachments(conv, userId);
      const other = (payload.participants || []).find(
        (p: any) => String(p.id || p.userId) !== String(userId)
      );
      const isAi = Boolean(payload.isScrolitha || payload.is_scrolitha || other?.isScrolitha);
      results.push({
        conversationId: conv.id,
        conversation: payload,
        matchType: isAi ? 'user' : other?.username ? 'username' : 'user',
        participant: other || null,
        participants: payload.participants,
        lastMessage: payload.lastMessage || payload.last_message || '',
        unreadCount: payload.unreadCount || payload.unread_count || 0,
        updatedAt: payload.lastMessageAt || payload.last_message_at || null,
        searchScope: scope === 'admin' && admin ? 'admin' : 'user'
      });
    }

    // Message-content search (scoped to user's conversations only)
    if (results.length < limit) {
      const remaining = limit - results.length;
      const msgs = await prisma.directMessage.findMany({
        where: {
          conversationId: { in: allowedIds },
          deletedAt: null,
          text: { contains: q, mode: 'insensitive' }
        },
        orderBy: { createdAt: 'desc' },
        take: Math.min(remaining * 3, 60),
        select: {
          id: true,
          text: true,
          conversationId: true,
          createdAt: true
        }
      });

      for (const m of msgs) {
        if (seen.has(m.conversationId)) continue;
        if (results.length >= limit) break;
        seen.add(m.conversationId);
        try {
          const conv = await prisma.conversation.findUnique({
            where: { id: m.conversationId },
            include: {
              participants: { select: conversationParticipantSelect },
              messages: buildMessagesRelationSelect(DEFAULT_CONVERSATION_PREVIEW_LIMIT, false)
            }
          });
          if (!conv) continue;
          const payload = await buildConversationPayloadWithAttachments(conv, userId);
          results.push({
            conversationId: conv.id,
            conversation: payload,
            matchType: 'message',
            matchedMessageId: m.id,
            matchedMessageSnippet: String(m.text || '').slice(0, 160),
            participants: payload.participants,
            lastMessage: payload.lastMessage || payload.last_message || '',
            unreadCount: payload.unreadCount || 0,
            updatedAt: payload.lastMessageAt || null,
            searchScope: scope === 'admin' && admin ? 'admin' : 'user'
          });
        } catch {
          // skip broken conversation
        }
      }
    }

    return res.json({
      success: true,
      data: {
        results,
        nextCursor: null,
        hasMore: false
      },
      pagination: { hasMore: false, count: results.length }
    });
  } catch (error: any) {
    console.error('Search messages error:', error);
    return res.status(500).json({
      success: false,
      error: 'Search is temporarily unavailable. Please try again.'
    });
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
      const { getScrolithaPlatformUserId } = await import(
        '../services/scrolitha/scrolitha.platformIdentity'
      );
      const platformId = await getScrolithaPlatformUserId();
      for (const blockedId of targetUserIds) {
        // Official Scrolitha system identity cannot be blocked by normal users.
        if (blockedId === platformId) {
          return res.status(403).json({
            success: false,
            error: 'Scrolitha is a protected system assistant and cannot be blocked.'
          });
        }
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

    // Phase 29.2 — block between reactor and participants
    try {
      const { hasActiveBlockBetween } = await import('../services/messaging/groupSendGate');
      const others = message.conversation.participants
        .map((p) => p.userId)
        .filter((id) => id && id !== userId);
      if (await hasActiveBlockBetween(userId, others)) {
        return res.status(403).json({
          success: false,
          error: 'Messaging blocked',
          code: 'MESSAGING_BLOCKED'
        });
      }
    } catch {
      /* optional */
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
    const reacted = !hasSame;
    const payload = {
      conversationId: message.conversationId,
      conversation_id: message.conversationId,
      messageId,
      message_id: messageId,
      id: messageId,
      reactions: reactions.map(formatReaction),
      reactionSummary,
      reaction_summary: reactionSummary,
      userReaction: reacted ? emoji : null,
      user_reaction: reacted ? emoji : null,
      reactorUserId: userId,
      reactor_user_id: userId,
      reacted,
      emoji: reacted ? emoji : null,
      // Pure reaction update — clients must not clear text/attachments from absence of these fields.
      updateKind: 'reaction'
    };

    const fanoutUserIds = Array.from(
      new Set([
        String(message.senderId || '').trim(),
        ...message.conversation.participants.map((entry) => String(entry.userId || '').trim())
      ].filter(Boolean))
    );
    // Realtime: fanout to every participant (including reactor) so both sender and receiver
    // see reaction chips without a refresh. Dual-event for older and newer clients.
    fanoutUserIds.forEach((targetUserId) => {
      emitToUser(req, targetUserId, 'messages:updated', payload);
      emitToUser(req, targetUserId, 'messages:reaction', payload);
    });
    try {
      const { groupMetrics } = await import('../services/messaging/groupMetrics');
      groupMetrics.reaction();
      if ((message.conversation as any)?.type === 'GROUP') {
        const realtime = (await import('../utils/realtime')).default;
        const { groupRoomName } = await import('../services/messaging/groupRealtimeEvents');
        realtime.emitToRoom(groupRoomName(message.conversationId), 'messages:reaction', payload);
        realtime.emitToRoom(groupRoomName(message.conversationId), 'messages:updated', payload);
      }
    } catch {
      /* optional */
    }

    // Push / in-app for other participants when a reaction is added (not on remove).
    if (reacted) {
      const participantIds = message.conversation.participants
        .map((entry) => String(entry.userId || '').trim())
        .filter(Boolean);
      void dispatchMessageReactionNotifications({
        receiverIds: participantIds,
        reactorUserId: userId,
        conversationId: message.conversationId,
        messageId,
        messageAuthorId: message.senderId,
        emoji,
        messagePreview: resolveMessageSnippet(message),
        isGroup: (message.conversation as any)?.type === 'GROUP'
      }).catch((notifyError) => {
        console.warn('Failed to send message reaction notifications', notifyError);
      });
    }

    traceMessageEvent('api.toggle_reaction.success', {
      conversationId: message.conversationId,
      messageId,
      userId,
      emoji,
      reacted,
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
      where: { conversationId: message.conversationId, deletedAt: null },
      orderBy: { createdAt: 'desc' }
    });
    const latestPreviewText = resolveStoredLastMessageText(latest);

    await prisma.conversation.update({
      where: { id: message.conversationId },
      data: {
        lastMessageText: latestPreviewText,
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
      where: { conversationId: message.conversationId, deletedAt: null },
      orderBy: { createdAt: 'desc' }
    });
    const latestPreviewText = resolveStoredLastMessageText(latest);

    await prisma.conversation.update({
      where: { id: message.conversationId },
      data: {
        lastMessageText: latestPreviewText,
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

/** Phase 20.7.8 — Conversation attachment browser (member-scoped, no storage keys). */
export const listConversationAttachments = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const conversationId = String(req.params.id || '').trim();
    if (!conversationId) return res.status(400).json({ success: false, error: 'conversationId required' });

    const membership = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } }
    });
    if (!membership || membership.deletedAt) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const typeFilter = String(req.query?.type || 'all').toLowerCase();
    const limit = Math.max(1, Math.min(50, Number(req.query?.limit || 30) || 30));
    const cursor = String(req.query?.cursor || '').trim();

    const messages = await prisma.directMessage.findMany({
      where: {
        conversationId,
        deletedAt: null,
        NOT: { attachments: { equals: [] } },
        ...(cursor
          ? {
              createdAt: {
                lt: Number.isFinite(Date.parse(cursor)) ? new Date(cursor) : new Date(0)
              }
            }
          : {})
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(200, limit * 4 + 1),
      select: {
        id: true,
        senderId: true,
        attachments: true,
        createdAt: true,
        text: true,
        messageType: true,
        metadata: true
      }
    });

    const withAttachments = messages.filter((m) => Array.isArray(m.attachments) && m.attachments.length > 0);
    const allIds = withAttachments.flatMap((m) => m.attachments || []);
    const fileMap = await buildAttachmentMap(allIds);

    const items: any[] = [];
    for (const msg of withAttachments) {
      const mapped = mapAttachments(msg.attachments || [], fileMap);
      for (const att of mapped) {
        if (!att) continue;
        const mime = String((att as any).mimeType || '').toLowerCase();
        const kind = String((att as any).type || '').toLowerCase();
        let category = 'document';
        if (mime.startsWith('image/') || kind === 'image') category = 'photo';
        else if (mime.startsWith('video/') || kind === 'video') category = 'video';
        else if (mime.startsWith('audio/') || kind === 'audio' || kind === 'voice_note') category = 'audio';
        else if (mime === 'application/pdf') category = 'document';

        if (typeFilter === 'photos' && category !== 'photo') continue;
        if (typeFilter === 'videos' && category !== 'video') continue;
        if (typeFilter === 'audio' && category !== 'audio') continue;
        if (typeFilter === 'documents' && category !== 'document') continue;

        items.push({
          id: (att as any).id,
          fileId: (att as any).fileId || (att as any).id,
          messageId: msg.id,
          conversationId,
          senderId: msg.senderId,
          name: (att as any).name || (att as any).originalName || 'Attachment',
          mimeType: (att as any).mimeType || null,
          type: category,
          size: Number((att as any).size || 0) || null,
          createdAt: msg.createdAt.toISOString(),
          // Auth content path only — no permanent public URL / storage key
          contentUrl: (att as any).contentUrl || `/api/files/content/${encodeURIComponent(String((att as any).id))}`,
          thumbnailUrl: (att as any).thumbnailUrl || null
        });
        if (items.length > limit) break;
      }
      if (items.length > limit) break;
    }

    const hasMore = items.length > limit;
    const pageItems = items.slice(0, limit);

    const { isCanonicalScrolithaConversation } = await import('../services/scrolitha/scrolitha.conversationPolicy');
    const isScrolitha = await isCanonicalScrolithaConversation(conversationId);

    return res.json({
      success: true,
      data: {
        conversationId,
        isScrolitha,
        items: pageItems,
        pagination: {
          limit,
          hasMore,
          nextCursor:
            hasMore && pageItems.length ? pageItems[pageItems.length - 1].createdAt : null
        }
      }
    });
  } catch (error: any) {
    console.error('List conversation attachments error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to list attachments' });
  }
};

/** Phase 20.7.8 — Honest message security status for a conversation. */
export const getConversationSecurityStatus = async (req: Request, res: Response) => {
  try {
    const userId = resolveUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const conversationId = String(req.params.id || '').trim();
    if (!conversationId) return res.status(400).json({ success: false, error: 'conversationId required' });

    const membership = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId, userId } }
    });
    if (!membership || membership.deletedAt) {
      return res.status(404).json({ success: false, error: 'Conversation not found' });
    }

    const { isCanonicalScrolithaConversation } = await import('../services/scrolitha/scrolitha.conversationPolicy');
    const { getScrolithaMessageSecurityStatus } = await import('../services/scrolitha/scrolitha.publicProfile');
    const isScrolitha = await isCanonicalScrolithaConversation(conversationId);
    const base = getScrolithaMessageSecurityStatus();

    return res.json({
      success: true,
      data: {
        conversationId,
        isScrolitha,
        ...base,
        // Human DMs also lack client E2EE under current architecture
        appliesToHumanDm: !isScrolitha
          ? {
              e2eeImplemented: false,
              note: 'Standard Scrolith direct messages use protected transport (HTTPS/TLS) and server-side storage. End-to-end encryption verification is not available.'
            }
          : undefined
      }
    });
  } catch (error: any) {
    console.error('Conversation security status error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load security status' });
  }
};
