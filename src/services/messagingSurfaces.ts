/**
 * Pure helpers for enterprise messaging surfaces (header popup + dock).
 * Classification uses authoritative conversation metadata only — no name/text guessing.
 */
import type { Conversation, Message } from '../types';
import { getConversationMergeKey } from './messagingMerge';

export const MESSAGING_PREVIEW_LIMIT = 15;
export const MESSAGING_SEARCH_DEBOUNCE_MS = 300;
export const MESSAGING_DESKTOP_MIN_WIDTH = 1024;
export const MESSAGING_WIDE_CHAT_WIDTH = 1440;
export const MESSAGING_MAX_CHAT_WINDOWS_NARROW = 1;
export const MESSAGING_MAX_CHAT_WINDOWS_WIDE = 3;

export type MessagingInboxTab = 'all' | 'unread' | 'groups' | 'communities';

export type OpenChatWindowState = {
  conversationId: string;
  minimized: boolean;
  openedAt: number;
};

export type MessagingSurfaceConversation = Conversation & {
  category?: MessagingConversationCategory;
};

export type MessagingConversationCategory = 'direct' | 'group' | 'community' | 'other';

const safeString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;

const safeNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const formatMessagingBadgeCount = (count: number): string => {
  if (!Number.isFinite(count) || count <= 0) return '';
  if (count > 99) return '99+';
  return String(Math.trunc(count));
};

export const getConversationUnreadCount = (conversation: Conversation | null | undefined): number => {
  if (!conversation) return 0;
  const camel = (conversation as any).unreadCount;
  const snake = (conversation as any).unread_count;
  const value =
    camel !== undefined && camel !== null && camel !== ''
      ? safeNumber(camel, 0)
      : safeNumber(snake, 0);
  return Math.max(0, Math.trunc(value));
};

export const sumConversationUnread = (conversations: Conversation[]): number => {
  return (Array.isArray(conversations) ? conversations : []).reduce(
    (acc, conversation) => acc + getConversationUnreadCount(conversation),
    0
  );
};

export const getConversationActivityAt = (conversation: Conversation | null | undefined): number => {
  if (!conversation) return 0;
  const raw =
    (conversation as any).lastMessageAt ??
    (conversation as any).last_message_at ??
    (conversation as any).updatedAt ??
    (conversation as any).updated_at ??
    '';
  const ts = new Date(raw).getTime();
  return Number.isFinite(ts) ? ts : 0;
};

export const sortConversationsByRecent = (conversations: Conversation[]): Conversation[] => {
  const list = Array.isArray(conversations) ? [...conversations] : [];
  return list.sort((left, right) => {
    const leftAt = getConversationActivityAt(left);
    const rightAt = getConversationActivityAt(right);
    if (leftAt !== rightAt) return rightAt - leftAt;
    return String(right?.id || '').localeCompare(String(left?.id || ''));
  });
};

/**
 * Detect community linkage from conversation/message metadata fields only.
 * Does not use display names or free-text matching.
 */
export const hasCommunityMetadata = (conversation: Conversation | null | undefined): boolean => {
  if (!conversation) return false;
  const raw = conversation as any;

  const topLevel = [
    raw.communityId,
    raw.community_id,
    raw.communityGroupId,
    raw.community_group_id,
    raw.channelId,
    raw.channel_id,
    raw.groupCommunityId,
    raw.group_community_id
  ];
  if (topLevel.some((value) => safeString(value))) return true;

  const sourceType = safeString(raw.sourceType ?? raw.source_type ?? raw.source).toUpperCase();
  if (
    sourceType === 'COMMUNITY' ||
    sourceType === 'COMMUNITY_GROUP' ||
    sourceType === 'COMMUNITY_CHANNEL' ||
    sourceType.includes('COMMUNITY')
  ) {
    return true;
  }

  const metadata = raw.metadata && typeof raw.metadata === 'object' ? raw.metadata : null;
  if (metadata) {
    const metaIds = [
      metadata.communityId,
      metadata.community_id,
      metadata.communityGroupId,
      metadata.community_group_id,
      metadata.channelId,
      metadata.channel_id
    ];
    if (metaIds.some((value) => safeString(value))) return true;
    const metaSource = safeString(metadata.sourceType ?? metadata.source_type ?? metadata.source).toUpperCase();
    if (metaSource.includes('COMMUNITY')) return true;
    const category = safeString(metadata.category ?? metadata.kind).toLowerCase();
    if (category === 'community' || category === 'community_group' || category === 'community_channel') {
      return true;
    }
  }

  const messages = Array.isArray(raw.messages) ? raw.messages : [];
  for (const message of messages.slice(-8)) {
    const msgMeta = message?.metadata && typeof message.metadata === 'object' ? message.metadata : null;
    if (!msgMeta) continue;
    if (
      safeString(msgMeta.communityId ?? msgMeta.community_id) ||
      safeString(msgMeta.communityGroupId ?? msgMeta.community_group_id) ||
      safeString(msgMeta.channelId ?? msgMeta.channel_id)
    ) {
      return true;
    }
    const msgSource = safeString(msgMeta.sourceType ?? msgMeta.source_type ?? msgMeta.source).toUpperCase();
    if (msgSource.includes('COMMUNITY')) return true;
  }

  return false;
};

export const getConversationCategory = (
  conversation: Conversation | null | undefined
): MessagingConversationCategory => {
  if (!conversation) return 'other';
  if (hasCommunityMetadata(conversation)) return 'community';
  const type = safeString((conversation as any).type).toLowerCase();
  if (type === 'group') return 'group';
  if (type === 'direct') return 'direct';
  return 'other';
};

export const conversationMatchesInboxTab = (
  conversation: Conversation,
  tab: MessagingInboxTab
): boolean => {
  switch (tab) {
    case 'all':
      return true;
    case 'unread':
      return getConversationUnreadCount(conversation) > 0;
    case 'groups':
      return getConversationCategory(conversation) === 'group';
    case 'communities':
      return getConversationCategory(conversation) === 'community';
    default:
      return true;
  }
};

export const filterConversationsForTab = (
  conversations: Conversation[],
  tab: MessagingInboxTab,
  limit = MESSAGING_PREVIEW_LIMIT
): Conversation[] => {
  const sorted = sortConversationsByRecent(conversations);
  const filtered = sorted.filter((conversation) => conversationMatchesInboxTab(conversation, tab));
  const max = Math.max(1, Math.min(50, Math.trunc(limit || MESSAGING_PREVIEW_LIMIT)));
  return filtered.slice(0, max);
};

export const localSearchConversations = (
  conversations: Conversation[],
  query: string,
  currentUserId?: string | null
): Conversation[] => {
  const needle = safeString(query).toLowerCase();
  if (needle.length < 1) return sortConversationsByRecent(conversations);

  return sortConversationsByRecent(conversations).filter((conversation) => {
    const participants = Array.isArray(conversation.participants) ? conversation.participants : [];
    const nameHit = participants.some((participant) => {
      const name = safeString(participant?.name).toLowerCase();
      const username = safeString((participant as any)?.username).toLowerCase();
      return name.includes(needle) || username.includes(needle);
    });
    if (nameHit) return true;

    const preview = safeString(
      (conversation as any).lastMessage ?? (conversation as any).last_message
    ).toLowerCase();
    if (preview.includes(needle)) return true;

    const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
    return messages.some((message) => safeString(message?.text).toLowerCase().includes(needle));
  });
};

export const getConversationDisplayName = (
  conversation: Conversation | null | undefined,
  currentUserId?: string | null
): string => {
  if (!conversation) return 'Conversation';
  const participants = Array.isArray(conversation.participants) ? conversation.participants : [];
  const others = participants.filter(
    (participant) => safeString(participant?.id) && safeString(participant.id) !== safeString(currentUserId)
  );

  const category = getConversationCategory(conversation);
  if (category === 'group' || category === 'community') {
    const titled = safeString((conversation as any).title ?? (conversation as any).name);
    if (titled) return titled;
    const names = (others.length ? others : participants)
      .map((participant) => safeString(participant?.name))
      .filter(Boolean);
    if (names.length === 0) return category === 'community' ? 'Community chat' : 'Group chat';
    if (names.length <= 3) return names.join(', ');
    return `${names.slice(0, 2).join(', ')} +${names.length - 2}`;
  }

  const other = others[0] || participants[0];
  return safeString(other?.name, 'Conversation');
};

export const getConversationAvatarParticipant = (
  conversation: Conversation | null | undefined,
  currentUserId?: string | null
) => {
  const participants = Array.isArray(conversation?.participants) ? conversation!.participants : [];
  return (
    participants.find(
      (participant) =>
        safeString(participant?.id) && safeString(participant.id) !== safeString(currentUserId)
    ) ||
    participants[0] ||
    null
  );
};

export const getMessagePreviewText = (message: Message | null | undefined): string => {
  if (!message) return '';
  if (Boolean((message as any).isDeleted ?? (message as any).is_deleted)) {
    return 'Message deleted';
  }
  const text = safeString(message.text);
  if (text) return text;
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  if (attachments.length > 0) {
    const first = attachments[0] as any;
    const type = safeString(first?.type ?? first?.mimeType).toLowerCase();
    if (type.startsWith('image') || type === 'image') return 'Photo';
    if (type.startsWith('video') || type === 'video') return 'Video';
    if (type.startsWith('audio') || type === 'audio' || type === 'voice_note') return 'Voice message';
    return 'Attachment';
  }
  const messageType = safeString(
    (message as any).messageType ?? (message as any).message_type
  ).toLowerCase();
  if (messageType === 'voice_note') return 'Voice message';
  if (messageType === 'file') return 'Attachment';
  return '';
};

export const formatRelativeMessageTime = (value: unknown, nowMs = Date.now()): string => {
  const raw = safeString(value);
  if (!raw) return '';
  const ts = new Date(raw).getTime();
  if (!Number.isFinite(ts)) return '';
  const diff = Math.max(0, nowMs - ts);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return 'Just now';
  if (diff < hour) return `${Math.floor(diff / minute)}m`;
  if (diff < day) return `${Math.floor(diff / hour)}h`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d`;
  try {
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
};

export const getMaxOpenChatWindows = (viewportWidth: number): number => {
  if (!Number.isFinite(viewportWidth) || viewportWidth < MESSAGING_DESKTOP_MIN_WIDTH) return 0;
  if (viewportWidth >= MESSAGING_WIDE_CHAT_WIDTH) return MESSAGING_MAX_CHAT_WINDOWS_WIDE;
  return MESSAGING_MAX_CHAT_WINDOWS_NARROW;
};

export const upsertOpenChatWindows = (
  current: OpenChatWindowState[],
  conversationId: string,
  viewportWidth: number,
  options?: { minimize?: boolean }
): OpenChatWindowState[] => {
  const id = safeString(conversationId);
  if (!id) return current;
  const max = getMaxOpenChatWindows(viewportWidth);
  if (max <= 0) return current;

  // Rule: minimized windows count toward the simultaneous-window limit.
  // Same conversation never opens twice — re-open refreshes/restores that entry.
  const existing = current.find((entry) => entry.conversationId === id);
  const nextEntry: OpenChatWindowState = {
    conversationId: id,
    minimized: options?.minimize === true ? true : false,
    openedAt: existing?.openedAt ?? Date.now()
  };

  const without = current.filter((entry) => entry.conversationId !== id);
  const next = [...without, nextEntry];
  if (next.length <= max) return next;
  // Deterministic eviction: drop oldest by openedAt first.
  return next
    .sort((a, b) => a.openedAt - b.openedAt)
    .slice(next.length - max);
};

export const reconcileOptimisticMessage = (
  messages: Message[],
  serverMessage: Message
): Message[] => {
  const list = Array.isArray(messages) ? [...messages] : [];
  const serverId = safeString(serverMessage?.id);
  if (!serverId) return list;

  if (list.some((message) => safeString(message.id) === serverId)) {
    return list.map((message) =>
      safeString(message.id) === serverId ? { ...message, ...serverMessage } : message
    );
  }

  const serverText = safeString(serverMessage.text);
  const serverSender = safeString(
    (serverMessage as any).senderId ?? (serverMessage as any).sender_id
  );
  const optimisticIndex = list.findIndex((message) => {
    const id = safeString(message.id);
    if (!id.startsWith('optimistic-') && !id.startsWith('temp-')) return false;
    const sender = safeString((message as any).senderId ?? (message as any).sender_id);
    if (serverSender && sender && sender !== serverSender) return false;
    return safeString(message.text) === serverText;
  });

  if (optimisticIndex >= 0) {
    list[optimisticIndex] = { ...list[optimisticIndex], ...serverMessage, id: serverId };
    return list;
  }

  return [...list, serverMessage];
};

/**
 * Authoritative unread delta rules for shared badge ownership.
 * Never goes negative. Self / already-present / active-visible never inflate.
 */
export const computeUnreadAfterIncoming = (options: {
  previousUnread: number;
  isFromOther: boolean;
  isActiveVisible: boolean;
  messageAlreadyPresent: boolean;
}): number => {
  const previous = Math.max(0, Math.trunc(safeNumber(options.previousUnread, 0)));
  if (options.isActiveVisible) return 0;
  if (!options.isFromOther) return previous;
  if (options.messageAlreadyPresent) return previous;
  return previous + 1;
};

/**
 * Session draft helpers (in-memory only; never persist tokens or private payloads).
 */
export const setConversationDraft = (
  drafts: Record<string, string>,
  conversationId: string,
  text: string
): Record<string, string> => {
  const id = safeString(conversationId);
  if (!id) return drafts;
  return { ...drafts, [id]: String(text ?? '') };
};

export const clearConversationDraft = (
  drafts: Record<string, string>,
  conversationId: string
): Record<string, string> => {
  const id = safeString(conversationId);
  if (!id || !(id in drafts)) return drafts;
  const next = { ...drafts };
  delete next[id];
  return next;
};

export const getConversationDraft = (
  drafts: Record<string, string>,
  conversationId: string
): string => {
  const id = safeString(conversationId);
  if (!id) return '';
  return typeof drafts[id] === 'string' ? drafts[id] : '';
};

/** Stale-response guard for debounced search request sequencing. */
export const isSearchResponseCurrent = (requestSeq: number, latestSeq: number): boolean =>
  Number(requestSeq) === Number(latestSeq);

export const applyIncomingPreviewUpdate = (
  conversations: Conversation[],
  message: Message,
  options: {
    currentUserId?: string | null;
    activeConversationIds?: Set<string> | string[];
  } = {}
): Conversation[] => {
  const conversationId = safeString(
    (message as any).conversationId ?? (message as any).conversation_id
  );
  if (!conversationId) return conversations;

  const activeIds = new Set(
    Array.isArray(options.activeConversationIds)
      ? options.activeConversationIds.map((id) => safeString(id)).filter(Boolean)
      : options.activeConversationIds instanceof Set
        ? Array.from(options.activeConversationIds).map((id) => safeString(id)).filter(Boolean)
        : []
  );

  const currentUserId = safeString(options.currentUserId);
  const senderId = safeString((message as any).senderId ?? (message as any).sender_id);
  const isFromOther = Boolean(senderId && currentUserId && senderId !== currentUserId);
  const isActive = activeIds.has(conversationId);
  const preview = getMessagePreviewText(message);
  const timestamp = safeString(message.timestamp ?? (message as any).createdAt, new Date().toISOString());
  const messageId = safeString(message.id);

  let found = false;
  const next = conversations.map((conversation) => {
    const matches =
      conversation.id === conversationId ||
      messageMatchesConversationLoose(message, conversation);
    if (!matches) return conversation;
    found = true;

    const messages = Array.isArray(conversation.messages) ? conversation.messages : [];
    const existsById = Boolean(messageId) && messages.some((entry) => safeString(entry.id) === messageId);
    // Optimistic self-send already in list (temp id) — reconciling must not treat as "new" for unread.
    const hadOptimisticMatch =
      !existsById &&
      messages.some((entry) => {
        const id = safeString(entry.id);
        if (!id.startsWith('optimistic-') && !id.startsWith('temp-')) return false;
        const sender = safeString((entry as any).senderId ?? (entry as any).sender_id);
        if (senderId && sender && sender !== senderId) return false;
        return safeString(entry.text) === safeString(message.text);
      });
    const messageAlreadyPresent = existsById || hadOptimisticMatch;

    const nextMessages = existsById
      ? messages.map((entry) =>
          safeString(entry.id) === messageId ? { ...entry, ...message } : entry
        )
      : reconcileOptimisticMessage(messages, message);

    const unreadBase = getConversationUnreadCount(conversation);
    const unreadCount = computeUnreadAfterIncoming({
      previousUnread: unreadBase,
      isFromOther,
      isActiveVisible: isActive,
      messageAlreadyPresent
    });

    return {
      ...conversation,
      messages: nextMessages,
      lastMessage: preview || conversation.lastMessage || conversation.last_message,
      last_message: preview || conversation.last_message || conversation.lastMessage,
      lastMessageAt: timestamp,
      last_message_at: timestamp,
      unreadCount,
      unread_count: unreadCount
    } as Conversation;
  });

  if (!found) return conversations;

  return sortConversationsByRecent(next);
};

const messageMatchesConversationLoose = (message: Message, conversation: Conversation): boolean => {
  const conversationId = safeString(
    (message as any).conversationId ?? (message as any).conversation_id
  );
  if (conversationId && conversationId === conversation.id) return true;
  const mergeKey = getConversationMergeKey(conversation);
  if (!mergeKey) return false;
  // Direct-only soft match by participant pair when IDs diverge after merge.
  const participants = Array.isArray(conversation.participants) ? conversation.participants : [];
  const ids = new Set(
    participants.map((participant) => safeString(participant?.id)).filter(Boolean)
  );
  const senderId = safeString((message as any).senderId ?? (message as any).sender_id);
  const receiverId = safeString((message as any).receiverId ?? (message as any).receiver_id);
  if (senderId && receiverId && ids.has(senderId) && ids.has(receiverId)) return true;
  return false;
};

export const setConversationUnreadLocal = (
  conversations: Conversation[],
  conversationId: string,
  unreadCount: number
): Conversation[] => {
  const id = safeString(conversationId);
  const nextUnread = Math.max(0, Math.trunc(unreadCount));
  return conversations.map((conversation) => {
    if (conversation.id !== id) return conversation;
    return {
      ...conversation,
      unreadCount: nextUnread,
      unread_count: nextUnread
    } as Conversation;
  });
};

export const dedupeMessagesById = (messages: Message[]): Message[] => {
  const map = new Map<string, Message>();
  (Array.isArray(messages) ? messages : []).forEach((message) => {
    const id = safeString(message?.id);
    if (!id) return;
    map.set(id, message);
  });
  return Array.from(map.values()).sort((left, right) => {
    const leftAt = new Date(String(left.timestamp || 0)).getTime();
    const rightAt = new Date(String(right.timestamp || 0)).getTime();
    if (leftAt !== rightAt) return leftAt - rightAt;
    return String(left.id || '').localeCompare(String(right.id || ''));
  });
};

export const isDesktopMessagingViewport = (width: number): boolean =>
  Number.isFinite(width) && width >= MESSAGING_DESKTOP_MIN_WIDTH;
