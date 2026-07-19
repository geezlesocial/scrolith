import api from './api';
import { beginManagedIdempotentRequest } from './idempotency';
import { Conversation, Message, UserRole, MessageReaction, VoiceCall, MessengerVoiceConfig } from '../types';
import {
  annotateRecoverableError,
  createOfflineRecoveryError,
  isRetryableWriteError
} from '../mobile/runtime/requestRecovery';
import { getConversationMergeKey, mergeDirectConversations } from './messagingMerge';
import { formatConversationPreview } from './conversationPreview';
import { getScrolithaProfilePhotoUrl, resolveScrolithaAvatar } from '../utils/scrolithaIdentity';

export {
  getConversationMergeKey,
  getMessageMergeKey,
  mergeDirectConversations,
  messageMatchesConversation
} from './messagingMerge';
export {
  formatConversationPreview,
  getConversationPreviewText,
  getMessagePreviewText,
  MESSAGE_PREVIEW_DEFAULTS,
  MESSAGE_PREVIEW_KEYS
} from './conversationPreview';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

const safeString = (value: any, fallback = ''): string => {
  return typeof value === 'string' && value.trim() !== '' ? value : fallback;
};

const safeNumber = (value: any, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const safeArray = <T>(value: any): T[] => {
  return Array.isArray(value) ? value : [];
};

const normalizeAttachment = (attachment: any) => {
  if (!attachment) return null;
  if (typeof attachment === 'string') {
    const parts = attachment.split('/');
    const name = parts[parts.length - 1] || attachment;
    return {
      id: attachment,
      url: attachment,
      name,
      type: 'document',
      size: 0
    };
  }
  const mimeType = safeString(attachment?.mimeType ?? attachment?.mime_type);
  const rawType = safeString(attachment?.type ?? mimeType, 'document');
  const normalizedType = rawType.startsWith('audio/')
    ? 'audio'
    : rawType.startsWith('video/')
      ? 'video'
      : rawType.startsWith('image/')
        ? 'image'
        : rawType;
  return {
    id: safeString(attachment?.id ?? attachment?.fileId ?? attachment?.file_id),
    url: safeString(attachment?.url),
    name: safeString(attachment?.name ?? attachment?.filename ?? attachment?.originalName),
    type: safeString(normalizedType, 'document'),
    size: safeNumber(attachment?.size, 0),
    mimeType
  };
};

const normalizeAttachments = (value: any) => {
  return safeArray<any>(value).map(normalizeAttachment).filter(Boolean);
};

const normalizeReaction = (reaction: any): MessageReaction => {
  const userId = safeString(reaction?.userId ?? reaction?.user_id);
  return {
    user_id: userId,
    userId,
    emoji: safeString(reaction?.emoji),
    timestamp: safeString(reaction?.timestamp ?? reaction?.created_at ?? new Date().toISOString())
  } as MessageReaction;
};

const normalizeMessage = (raw: any): Message => {
  const conversationId = safeString(raw?.conversationId ?? raw?.conversation_id);
  const senderId = safeString(raw?.senderId ?? raw?.sender_id);
  const receiverId = safeString(raw?.receiverId ?? raw?.receiver_id);
  const timestamp =
    safeString(raw?.timestamp ?? raw?.createdAt ?? raw?.created_at ?? new Date().toISOString());
  const isRead = Boolean(raw?.isRead ?? raw?.is_read ?? false);

  const clientMessageId = safeString(
    raw?.clientMessageId ??
      raw?.client_message_id ??
      raw?.clientSendId ??
      raw?.client_send_id ??
      raw?.metadata?.clientMessageId ??
      raw?.metadata?.clientSendId
  );
  const baseMeta =
    raw?.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
      ? { ...raw.metadata }
      : {};
  if (clientMessageId) {
    baseMeta.clientMessageId = clientMessageId;
    baseMeta.clientSendId = clientMessageId;
  }
  const normalized = {
    id: safeString(raw?.id ?? `${conversationId}-msg-${Date.now()}`),
    conversation_id: conversationId,
    sender_id: senderId,
    receiver_id: receiverId,
    text: safeString(raw?.text ?? raw?.body ?? ''),
    timestamp,
    is_read: isRead,
    message_type: safeString(raw?.message_type ?? raw?.messageType ?? 'text').toLowerCase(),
    messageType: safeString(raw?.messageType ?? raw?.message_type ?? 'text').toLowerCase(),
    clientMessageId: clientMessageId || null,
    client_message_id: clientMessageId || null,
    clientSendId: clientMessageId || null,
    metadata: Object.keys(baseMeta).length ? baseMeta : raw?.metadata ?? null,
    voice_note: raw?.voice_note ?? raw?.voiceNote ?? null,
    voiceNote: raw?.voiceNote ?? raw?.voice_note ?? null,
    sender_role: raw?.senderRole ?? raw?.sender_role,
    reactions: safeArray<any>(raw?.reactions).map(normalizeReaction),
    attachments: normalizeAttachments(raw?.attachments ?? raw?.attachment_ids ?? raw?.attachmentIds),
    reply_to_message_id: raw?.reply_to_message_id ?? raw?.replyToMessageId ?? null,
    replyToMessageId: raw?.replyToMessageId ?? raw?.reply_to_message_id ?? null,
    reply_to_snapshot: raw?.reply_to_snapshot ?? raw?.replyToSnapshot ?? null,
    replyToSnapshot: raw?.replyToSnapshot ?? raw?.reply_to_snapshot ?? null,
    reply_to: raw?.reply_to ?? raw?.replyTo ?? null,
    replyTo: raw?.replyTo ?? raw?.reply_to ?? null,
    ai_flagged: raw?.ai_flagged ?? raw?.aiFlagged,
    ai_reason: raw?.ai_reason ?? raw?.aiReason,
    is_deleted: Boolean(raw?.is_deleted ?? raw?.isDeleted ?? false),
    isDeleted: Boolean(raw?.isDeleted ?? raw?.is_deleted ?? false),
    deleted_at: raw?.deleted_at ?? raw?.deletedAt ?? null,
    deletedAt: raw?.deletedAt ?? raw?.deleted_at ?? null,
    edited_at: raw?.edited_at ?? raw?.editedAt ?? null,
    editedAt: raw?.editedAt ?? raw?.edited_at ?? null,
    conversationId,
    senderId,
    receiverId,
    isRead
  } as Message;
  return normalized;
};

const normalizeParticipant = (participant: any) => {
  const isScrolitha = Boolean(
    participant?.isScrolitha ??
      participant?.is_scrolitha ??
      String(participant?.username || '').toLowerCase() === 'scrolitha'
  );
  return {
    id: safeString(participant?.id ?? participant?.userId ?? participant?.user_id),
    name: safeString(isScrolitha ? 'Scrolitha' : participant?.name, 'Unknown'),
    avatar: safeString(
      (isScrolitha
        ? resolveScrolithaAvatar({ ...participant, isScrolitha: true }) || getScrolithaProfilePhotoUrl()
        : null) ||
        participant?.avatar ||
        participant?.avatar_url ||
        ''
    ),
    username: safeString(participant?.username),
    gender: safeString(participant?.gender),
    profile_url: safeString(participant?.profile_url ?? participant?.profileUrl),
    profileUrl: safeString(participant?.profileUrl ?? participant?.profile_url),
    role: participant?.role ?? participant?.userRole,
    label: safeString(participant?.label, 'other'),
    is_starred: Boolean(participant?.isStarred ?? participant?.is_starred ?? false),
    isStarred: Boolean(participant?.isStarred ?? participant?.is_starred ?? false),
    is_muted: Boolean(participant?.isMuted ?? participant?.is_muted ?? false),
    isMuted: Boolean(participant?.isMuted ?? participant?.is_muted ?? false),
    is_archived: Boolean(participant?.isArchived ?? participant?.is_archived ?? false),
    isArchived: Boolean(participant?.isArchived ?? participant?.is_archived ?? false),
    is_online: isScrolitha ? true : Boolean(participant?.isOnline ?? participant?.is_online ?? false),
    isOnline: isScrolitha ? true : Boolean(participant?.isOnline ?? participant?.is_online ?? false),
    last_seen_at: safeString(participant?.lastSeenAt ?? participant?.last_seen_at ?? ''),
    lastSeenAt: safeString(participant?.lastSeenAt ?? participant?.last_seen_at ?? ''),
    is_scrolitha: isScrolitha,
    isScrolitha,
    is_verified: Boolean(participant?.isVerified ?? participant?.is_verified ?? isScrolitha),
    isVerified: Boolean(participant?.isVerified ?? participant?.is_verified ?? isScrolitha),
    system_label: isScrolitha ? 'AI assistant' : undefined,
    systemLabel: isScrolitha ? 'AI assistant' : undefined,
    // Phase 22.2 — group membership role (distinct from user platform role)
    memberRole: safeString(
      participant?.memberRole ?? participant?.member_role ?? participant?.conversationRole,
      'MEMBER'
    ),
    notifications: safeString(
      participant?.notifications ?? participant?.notificationLevel ?? participant?.notification_level,
      'ALL'
    )
  };
};

const normalizeConversation = (raw: any): Conversation => {
  const participants = safeArray<any>(raw?.participants).map(normalizeParticipant);
  const messages = safeArray<any>(raw?.messages).map(normalizeMessage);
  const lastMessageAtFromMessages = messages[messages.length - 1]?.timestamp ?? '';
  // Phase 20.7.7 — never treat media-only latest message as empty conversation.
  // Prefer API last_message (attachment-aware), then recompute from latest message.
  const storedPreview = safeString(raw?.lastMessage ?? raw?.last_message);
  const recomputed = formatConversationPreview({
    message: messages[messages.length - 1] || null,
    fallbackPreview: storedPreview
  });
  const lastMessage =
    recomputed.isEmpty && !storedPreview
      ? ''
      : safeString(recomputed.isEmpty ? storedPreview : recomputed.text || storedPreview);
  const lastMessageAt = safeString(
    raw?.lastMessageAt ?? raw?.last_message_at ?? lastMessageAtFromMessages
  );
  const unreadCount = safeNumber(raw?.unreadCount ?? raw?.unread_count);
  const isScrolitha = Boolean(
    raw?.isScrolitha ??
      raw?.is_scrolitha ??
      participants.some((p: any) => p?.isScrolitha || p?.is_scrolitha)
  );

  const isGroup =
    raw?.type === 'group' ||
    String(raw?.type || '').toUpperCase() === 'GROUP' ||
    Boolean(raw?.title && participants.length > 2);

  return {
    id: safeString(raw?.id ?? raw?._id),
    type: isGroup ? 'group' : 'direct',
    // Phase 22.2 group meta
    title: raw?.title != null ? safeString(raw.title) || null : null,
    description: raw?.description != null ? safeString(raw.description) || null : null,
    avatarFileId: safeString(raw?.avatarFileId ?? raw?.avatar_file_id) || null,
    visibility: safeString(raw?.visibility, 'PRIVATE') || 'PRIVATE',
    memberRole: safeString(raw?.memberRole ?? raw?.member_role ?? raw?.role, 'MEMBER') || 'MEMBER',
    notifications: safeString(
      raw?.notifications ?? raw?.notificationLevel ?? raw?.notification_level,
      'ALL'
    ),
    participants,
    label: safeString(raw?.label, 'other'),
    is_starred: isScrolitha ? true : Boolean(raw?.isStarred ?? raw?.is_starred ?? false),
    isStarred: isScrolitha ? true : Boolean(raw?.isStarred ?? raw?.is_starred ?? false),
    is_muted: Boolean(raw?.isMuted ?? raw?.is_muted ?? false),
    isMuted: Boolean(raw?.isMuted ?? raw?.is_muted ?? false),
    is_archived: Boolean(raw?.isArchived ?? raw?.is_archived ?? false),
    isArchived: Boolean(raw?.isArchived ?? raw?.is_archived ?? false),
    is_scrolitha: isScrolitha,
    isScrolitha,
    is_pinned: isScrolitha || Boolean(raw?.isPinned ?? raw?.is_pinned ?? false),
    isPinned: isScrolitha || Boolean(raw?.isPinned ?? raw?.is_pinned ?? false),
    messages,
    last_message: lastMessage,
    last_message_at: lastMessageAt,
    unread_count: unreadCount,
    lastMessage,
    lastMessageAt,
    unreadCount
  } as Conversation;
};

const normalizeList = (raw: any): Conversation[] => {
  const list = Array.isArray(raw)
    ? raw
    : safeArray<any>(raw?.conversations ?? raw?.items ?? raw?.data ?? []);
  return mergeDirectConversations(list.map(normalizeConversation));
};

export type MessageSearchMatchType = 'user' | 'username' | 'message';

export interface MessageSearchResult {
  conversationId: string;
  conversation: Conversation;
  participant?: Conversation['participants'][number] | null;
  participants: Conversation['participants'];
  lastMessage: string;
  matchedMessageSnippet?: string | null;
  matchedMessageId?: string | null;
  matchType: MessageSearchMatchType;
  unreadCount: number;
  updatedAt?: string;
  searchScope?: 'user' | 'admin' | string;
}

const normalizeSearchResult = (raw: any): MessageSearchResult => {
  const conversation = normalizeConversation(raw?.conversation ?? raw);
  const participant = raw?.participant ? normalizeParticipant(raw.participant) : undefined;
  const participants = safeArray<any>(raw?.participants).length
    ? safeArray<any>(raw.participants).map(normalizeParticipant)
    : conversation.participants;
  const matchType = safeString(raw?.matchType ?? raw?.match_type, 'user') as MessageSearchMatchType;

  return {
    conversationId: safeString(raw?.conversationId ?? raw?.conversation_id ?? conversation.id),
    conversation,
    participant: participant || participants.find((entry) => entry.id !== '') || null,
    participants,
    lastMessage: safeString(raw?.lastMessage ?? raw?.last_message ?? conversation.lastMessage ?? conversation.last_message),
    matchedMessageSnippet: raw?.matchedMessageSnippet ?? raw?.matched_message_snippet ?? null,
    matchedMessageId: raw?.matchedMessageId ?? raw?.matched_message_id ?? null,
    matchType: ['user', 'username', 'message'].includes(matchType) ? matchType : 'user',
    unreadCount: safeNumber(raw?.unreadCount ?? raw?.unread_count ?? conversation.unreadCount ?? conversation.unread_count),
    updatedAt: safeString(raw?.updatedAt ?? raw?.updated_at ?? conversation.lastMessageAt ?? conversation.last_message_at),
    searchScope: safeString(raw?.searchScope ?? raw?.search_scope)
  };
};

const conversationCache = new Map<string, { timestamp: number; data: Conversation[] }>();
const inFlight = new Map<string, Promise<Conversation[]>>();
const CACHE_TTL_MS = 5000;
const RATE_LIMIT_COOLDOWN_MS = 30000;
const WRITE_RETRY_ATTEMPTS = 2;
let rateLimitUntil = 0;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const MessagingService = {
  getVoiceRuntimeConfig: async (): Promise<MessengerVoiceConfig & { blockedForCurrentUser?: boolean }> => {
    const response = await api.get('/messages/voice/config');
    const data = extractData<any>(response) || {};
    return {
      enabledVoiceCalls: Boolean(data.enabledVoiceCalls ?? true),
      enabledConferenceCalls: Boolean(data.enabledConferenceCalls ?? true),
      enabledVoiceNotes: Boolean(data.enabledVoiceNotes ?? true),
      maxParticipants: Number(data.maxParticipants ?? 20),
      maxVoiceNoteDurationSeconds: Number(data.maxVoiceNoteDurationSeconds ?? 180),
      blockedUserIds: [],
      blockedForCurrentUser: Boolean(data.blockedForCurrentUser ?? false)
    };
  },

  getAllConversations: async (
    userId: string,
    role: UserRole,
    options?: { force?: boolean; limit?: number; cursor?: string; updatedSince?: string | null }
  ): Promise<Conversation[]> => {
    const updatedSince = String(options?.updatedSince || '').trim();
    const cacheKey = `${userId}:${role}${updatedSince ? `:since:${updatedSince}` : ''}`;
    const cached = conversationCache.get(cacheKey);
    const now = Date.now();

    // Delta queries must always hit the network.
    if (!updatedSince && !options?.force && cached && now - cached.timestamp < CACHE_TTL_MS) {
      return cached.data;
    }

    if (now < rateLimitUntil) {
      return cached ? cached.data : [];
    }

    const inflight = inFlight.get(cacheKey);
    if (inflight) {
      return inflight;
    }

    const requestPromise = api
      .get('/messages/conversations', {
        params: {
          userId,
          role,
          limit: Math.max(20, Math.min(200, Number(options?.limit || 120))),
          // Keep inbox payload small; open-thread loads full history separately.
          messagePreviewLimit: 5,
          ...(options?.cursor ? { cursor: options.cursor } : {}),
          ...(updatedSince ? { updatedSince } : {})
        }
      })
      .then(response => {
        const data = extractData<any>(response);
        const normalized = normalizeList(data);
        if (!updatedSince) {
          conversationCache.set(`${userId}:${role}`, { timestamp: Date.now(), data: normalized });
        }
        return normalized;
      })
      .catch(err => {
        if (err?.response?.status === 429) {
          rateLimitUntil = Date.now() + RATE_LIMIT_COOLDOWN_MS;
          return cached ? cached.data : [];
        }
        throw err;
      })
      .finally(() => {
        inFlight.delete(cacheKey);
      });

    inFlight.set(cacheKey, requestPromise);
    return requestPromise;
  },

  searchConversations: async (
    query: string,
    options?: { limit?: number; cursor?: string; signal?: AbortSignal; adminScope?: boolean }
  ): Promise<{ results: MessageSearchResult[]; nextCursor?: string | null; hasMore: boolean }> => {
    const trimmed = String(query || '').replace(/\s+/g, ' ').trim();
    if (trimmed.length < 2) {
      return { results: [], nextCursor: null, hasMore: false };
    }

    const response = await api.get('/messages/search', {
      signal: options?.signal,
      params: {
        q: trimmed,
        limit: Math.max(1, Math.min(50, Number(options?.limit || 20))),
        ...(options?.cursor ? { cursor: options.cursor } : {}),
        ...(options?.adminScope ? { scope: 'admin' } : {})
      },
      __suppressAuthRedirect: true,
      __skipRetry: true
    } as any);
    const data = extractData<any>(response);
    const results = Array.isArray(data)
      ? data
      : safeArray<any>(data?.results ?? data?.items ?? []);
    const pagination = response?.data?.pagination ?? data?.pagination ?? {};
    const normalizedResults = results.map(normalizeSearchResult);
    const dedupedResults = (() => {
      const directBuckets = new Map<string, MessageSearchResult[]>();
      const passthrough: MessageSearchResult[] = [];

      normalizedResults.forEach((result) => {
        const key = getConversationMergeKey(result.conversation);
        if (!key) {
          passthrough.push(result);
          return;
        }
        if (!directBuckets.has(key)) directBuckets.set(key, []);
        directBuckets.get(key)!.push(result);
      });

      const mergedDirects = Array.from(directBuckets.values()).map((bucket) => {
        const ordered = [...bucket].sort((left, right) => {
          const leftAt = new Date(left?.updatedAt || left?.conversation?.lastMessageAt || 0).getTime();
          const rightAt = new Date(right?.updatedAt || right?.conversation?.lastMessageAt || 0).getTime();
          if (leftAt !== rightAt) return rightAt - leftAt;
          return String(right?.conversationId || '').localeCompare(String(left?.conversationId || ''));
        });
        const primary = ordered[0];
        return {
          ...primary,
          conversation: primary.conversation,
          participants: primary.conversation.participants,
          participant: primary.participant || primary.participants.find((entry) => entry.id !== '') || null,
          lastMessage: primary.conversation.lastMessage,
          unreadCount: ordered.reduce((sum, entry) => sum + Number(entry.unreadCount || 0), 0),
          updatedAt: primary.conversation.lastMessageAt || primary.updatedAt
        } as MessageSearchResult;
      });

      return [...passthrough, ...mergedDirects].sort((left, right) => {
        const leftAt = new Date(left?.updatedAt || left?.conversation?.lastMessageAt || 0).getTime();
        const rightAt = new Date(right?.updatedAt || right?.conversation?.lastMessageAt || 0).getTime();
        if (leftAt !== rightAt) return rightAt - leftAt;
        return String(right?.conversationId || '').localeCompare(String(left?.conversationId || ''));
      });
    })();

    return {
      results: dedupedResults,
      nextCursor: pagination?.nextCursor ?? pagination?.next_cursor ?? null,
      hasMore: Boolean(pagination?.hasMore ?? pagination?.has_more ?? false)
    };
  },

  getConversationById: async (id: string): Promise<Conversation | null> => {
    const response = await api.get(`/messages/conversations/${id}`);
    const raw = extractData<any>(response);
    return raw ? normalizeConversation(raw) : null;
  },

  sendMessage: async (
    conversationId: string,
    senderId: string,
    text: string,
    role: string,
    attachments?: string[],
    replyToMessageId?: string | null,
    options?: {
      /** Phase 20.7.2 — longer timeout for Scrolitha AI turn in the same HTTP request */
      scrolitha?: boolean;
      clientRequestId?: string;
      /** Phase 22.1 — stable client message identity for idempotent retries */
      clientMessageId?: string;
      timeoutMs?: number;
    }
  ): Promise<Message & { scrolithaTurn?: any }> => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw createOfflineRecoveryError('Message is queued in the composer while you are offline. Retry when your connection returns.');
    }
    const isScrolitha = Boolean(options?.scrolitha);
    // Scrolitha generation is awaited server-side; default 16s API timeout aborts before AI finishes.
    const timeoutMs = Math.max(
      5_000,
      Math.min(120_000, Number(options?.timeoutMs || (isScrolitha ? 95_000 : 0)) || (isScrolitha ? 95_000 : 16_000))
    );
    const clientMessageId = String(options?.clientMessageId || options?.clientRequestId || '').trim();
    const clientRequestId =
      String(options?.clientRequestId || clientMessageId || '').trim() ||
      (isScrolitha
        ? typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `scr_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
        : '');
    const request = beginManagedIdempotentRequest(
      `message-send:${conversationId}:${senderId}:${clientMessageId || clientRequestId || 'default'}`
    );
    let lastError: any = null;
    // Do not auto-retry Scrolitha sends — retries create duplicate user turns while AI is in flight.
    // Phase 22.1: when clientMessageId is present, retries are safe (server idempotent).
    const maxAttempts = isScrolitha && !clientMessageId ? 0 : WRITE_RETRY_ATTEMPTS;
    for (let attempt = 0; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await api.post(
          `/messages/conversations/${conversationId}/messages`,
          {
            senderId,
            text,
            role,
            attachments: Array.isArray(attachments) ? attachments : [],
            replyToMessageId: replyToMessageId || null,
            ...(clientRequestId ? { clientRequestId } : {}),
            ...(clientMessageId
              ? { clientMessageId, client_message_id: clientMessageId, clientSendId: clientMessageId }
              : {})
          },
          {
            headers: {
              ...request.headers,
              ...(clientRequestId ? { 'X-Client-Request-Id': clientRequestId } : {}),
              ...(clientMessageId ? { 'X-Client-Message-Id': clientMessageId } : {})
            },
            timeout: timeoutMs
          }
        );
        request.complete();
        const body = (response as any)?.data;
        const data = extractData<any>(response);
        const message = normalizeMessage(data);
        // scrolithaTurn is sibling of data on the envelope: { success, data, scrolithaTurn }
        const scrolithaTurn = body?.scrolithaTurn || (data as any)?.scrolithaTurn || null;
        return Object.assign(message, scrolithaTurn ? { scrolithaTurn } : {});
      } catch (error) {
        lastError = annotateRecoverableError(error);
        if (!lastError.retryable || attempt >= maxAttempts) {
          request.retain();
          throw lastError;
        }
        await wait(400 * (attempt + 1));
      }
    }
    request.retain();
    throw annotateRecoverableError(lastError, {
      retryable: isRetryableWriteError(lastError)
    });
  },

  sendVoiceNote: async (
    conversationId: string,
    payload: { fileId: string; durationMs: number; text?: string }
  ): Promise<Message> => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw createOfflineRecoveryError('Voice note is paused while you are offline. Retry when your connection returns.');
    }
    const request = beginManagedIdempotentRequest(`voice-note:${conversationId}:${payload.fileId}`);
    let lastError: any = null;
    for (let attempt = 0; attempt <= WRITE_RETRY_ATTEMPTS; attempt += 1) {
      try {
        const response = await api.post(`/messages/conversations/${conversationId}/voice-notes`, payload, {
          headers: request.headers
        });
        request.complete();
        return normalizeMessage(extractData<any>(response));
      } catch (error) {
        lastError = annotateRecoverableError(error);
        if (!lastError.retryable || attempt >= WRITE_RETRY_ATTEMPTS) {
          request.retain();
          throw lastError;
        }
        await wait(400 * (attempt + 1));
      }
    }
    request.retain();
    throw annotateRecoverableError(lastError, {
      retryable: isRetryableWriteError(lastError)
    });
  },

  getVoiceCallHistory: async (conversationId: string): Promise<VoiceCall[]> => {
    const response = await api.get(`/messages/conversations/${conversationId}/voice-calls`);
    const data = extractData<any>(response);
    const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
    return items.map((entry: any) => ({
      ...entry,
      id: safeString(entry?.id),
      conversationId: safeString(entry?.conversationId ?? entry?.conversation_id),
      initiatorId: safeString(entry?.initiatorId ?? entry?.initiator_id),
      status: safeString(entry?.status).toLowerCase(),
      callType: safeString(entry?.callType ?? entry?.call_type).toLowerCase(),
      durationMs: safeNumber(entry?.durationMs ?? entry?.duration_ms, 0)
    })) as VoiceCall[];
  },

  markAsRead: async (conversationId: string, userId: string): Promise<void> => {
    await api.post(`/messages/conversations/${conversationId}/read`, { userId });
  },

  markConversationUnread: async (conversationId: string): Promise<void> => {
    await api.post(`/messages/conversations/${conversationId}/unread`);
  },

  updateConversationPreferences: async (
    conversationId: string,
    updates: { label?: 'other' | 'jobs'; isStarred?: boolean; isMuted?: boolean; isArchived?: boolean }
  ): Promise<any> => {
    const response = await api.patch(`/messages/conversations/${conversationId}/preferences`, updates);
    return extractData<any>(response);
  },

  reportBlockConversation: async (
    conversationId: string,
    options?: { block?: boolean; reason?: string }
  ): Promise<void> => {
    await api.post(`/messages/conversations/${conversationId}/report-block`, options || {});
  },

  deleteConversation: async (conversationId: string): Promise<void> => {
    await api.delete(`/messages/conversations/${conversationId}`);
  },

  toggleReaction: async (
    conversationId: string,
    messageId: string,
    userId: string,
    emoji: string
  ): Promise<{
    conversationId: string;
    messageId: string;
    reactions: MessageReaction[];
    reactionSummary?: Record<string, number>;
    userReaction?: string | null;
  }> => {
    const request = beginManagedIdempotentRequest(`message-reaction:${conversationId}:${messageId}:${emoji}`);
    try {
      const response = await api.post(`/messages/conversations/${conversationId}/messages/${messageId}/reactions`, {
        userId,
        emoji
      }, { headers: request.headers });
      request.complete();
      const data = extractData<any>(response) || {};
      return {
        conversationId: safeString(data?.conversationId ?? data?.conversation_id),
        messageId: safeString(data?.messageId ?? data?.message_id),
        reactions: safeArray<any>(data?.reactions).map(normalizeReaction),
        reactionSummary: data?.reactionSummary ?? data?.reaction_summary ?? {},
        userReaction: data?.userReaction ?? data?.user_reaction ?? null
      };
    } catch (error) {
      request.retain();
      throw error;
    }
  },

  createConversation: async (
    participants: Conversation['participants'] | string[],
    options?: {
      type?: 'direct' | 'group' | 'DIRECT' | 'GROUP';
      title?: string;
      description?: string;
      avatarFileId?: string | null;
      visibility?: 'PRIVATE' | 'PUBLIC' | 'UNLISTED';
    }
  ): Promise<string> => {
    try {
      const ids = (Array.isArray(participants) ? participants : []).map((p: any) =>
        typeof p === 'string' ? p : p?.id || p?.userId
      );
      const response = await api.post('/messages/conversations', {
        participants: ids,
        type: options?.type,
        title: options?.title,
        description: options?.description,
        avatarFileId: options?.avatarFileId,
        visibility: options?.visibility
      });
      const data = extractData<{ id: string } | string>(response);
      conversationCache.clear();
      return typeof data === 'string' ? data : data.id;
    } catch (error: any) {
      const message = error?.response?.data?.error || error?.message || 'Failed to create conversation';
      throw new Error(message);
    }
  },

  /** Phase 22.2 — group meta */
  updateGroupMeta: async (
    conversationId: string,
    patch: { title?: string; description?: string; avatarFileId?: string | null; visibility?: string }
  ) => {
    const response = await api.patch(`/messages/conversations/${conversationId}/group`, patch);
    conversationCache.clear();
    return extractData<any>(response);
  },

  listGroupMembers: async (conversationId: string) => {
    const response = await api.get(`/messages/conversations/${conversationId}/members`);
    return safeArray<any>(extractData<any>(response));
  },

  addGroupMembers: async (conversationId: string, userIds: string[], role?: string) => {
    const response = await api.post(`/messages/conversations/${conversationId}/members`, {
      userIds,
      role
    });
    return extractData<any>(response);
  },

  updateGroupMember: async (
    conversationId: string,
    memberUserId: string,
    patch: { role?: string; notifications?: string }
  ) => {
    const response = await api.patch(
      `/messages/conversations/${conversationId}/members/${memberUserId}`,
      patch
    );
    return extractData<any>(response);
  },

  removeGroupMember: async (conversationId: string, memberUserId: string) => {
    const response = await api.delete(
      `/messages/conversations/${conversationId}/members/${memberUserId}`
    );
    return extractData<any>(response);
  },

  createGroupInvite: async (
    conversationId: string,
    options?: { inviteeUserId?: string; role?: string; expiresInHours?: number }
  ) => {
    const response = await api.post(`/messages/conversations/${conversationId}/invites`, options || {});
    return extractData<any>(response);
  },

  acceptGroupInvite: async (code: string) => {
    const response = await api.post(`/messages/invites/${encodeURIComponent(code)}/accept`);
    conversationCache.clear();
    return extractData<any>(response);
  },

  /** Phase 22.2 — jump-to-message window */
  getMessagesAround: async (conversationId: string, messageId: string, limit = 40) => {
    const response = await api.get(
      `/messages/conversations/${conversationId}/messages/around/${messageId}`,
      { params: { limit } }
    );
    const data = extractData<any>(response);
    const messages = safeArray<any>(data?.messages).map(normalizeMessage);
    return {
      messages,
      anchorMessageId: safeString(data?.anchorMessageId || messageId),
      count: safeNumber(data?.count, messages.length)
    };
  },

  /**
   * Phase 20.7 — ensure exactly one private conversation with official Scrolitha assistant.
   */
  ensureScrolithaConversation: async (): Promise<{
    conversation: Conversation;
    conversationId: string;
    created?: boolean;
    messagingAssistantEnabled?: boolean;
    promptChips?: string[];
    platformUser?: any;
  }> => {
    const response = await api.post('/messages/scrolitha/ensure');
    const data = extractData<any>(response) || {};
    const conversation = normalizeConversation(data) || data;
    const conversationId = safeString(
      conversation?.id || data?.id || data?.conversationId || data?.conversation_id
    );
    // Invalidate conversation cache so inbox picks up the pinned assistant.
    conversationCache.clear();
    return {
      conversation,
      conversationId,
      created: Boolean(data?.created),
      messagingAssistantEnabled: data?.messagingAssistantEnabled !== false,
      promptChips: Array.isArray(data?.promptChips) ? data.promptChips : undefined,
      platformUser: data?.platformUser || null
    };
  },

  /**
   * Phase 20.7.1 — unified Scrolitha turn: persists user + assistant into canonical DM.
   */
  scrolithaUnifiedTurn: async (payload: {
    message: string;
    clientRequestId?: string;
    attachmentFileIds?: string[];
    source?: string;
    stream?: boolean;
  }): Promise<{
    conversationId: string;
    userMessageId?: string;
    assistantMessageId?: string;
    reply: string;
    suggestedActions?: any[];
    followUpPrompts?: string[];
    cards?: any[];
    scrolithaConversationId?: string | null;
    clientRequestId?: string | null;
    streamingMode?: string;
    messagingAssistantEnabled?: boolean;
  }> => {
    const response = await api.post('/messages/scrolitha/turn', {
      message: payload.message,
      clientRequestId: payload.clientRequestId,
      attachmentFileIds: payload.attachmentFileIds || [],
      source: payload.source || 'support_widget',
      stream: Boolean(payload.stream)
    });
    const data = extractData<any>(response) || {};
    conversationCache.clear();
    return {
      conversationId: safeString(data?.conversationId || data?.conversation_id),
      userMessageId: data?.userMessageId ? safeString(data.userMessageId) : undefined,
      assistantMessageId: data?.assistantMessageId ? safeString(data.assistantMessageId) : undefined,
      reply: safeString(data?.reply || ''),
      suggestedActions: Array.isArray(data?.suggestedActions) ? data.suggestedActions : [],
      followUpPrompts: Array.isArray(data?.followUpPrompts) ? data.followUpPrompts : [],
      cards: Array.isArray(data?.cards) ? data.cards : [],
      scrolithaConversationId: data?.scrolithaConversationId || null,
      clientRequestId: data?.clientRequestId || payload.clientRequestId || null,
      streamingMode: data?.streamingMode || 'none',
      messagingAssistantEnabled: data?.messagingAssistantEnabled !== false
    };
  },

  deleteMessage: async (
    conversationId: string,
    messageId: string,
    scope: 'me' | 'everyone' = 'everyone'
  ): Promise<{
    conversationId?: string;
    messageId?: string;
    scope?: 'me' | 'everyone';
    deletedForMe?: boolean;
    deleted_for_me?: boolean;
    isDeleted?: boolean;
    is_deleted?: boolean;
  }> => {
    const response = await api.delete(`/messages/conversations/${conversationId}/messages/${messageId}`, {
      params: { scope }
    });
    return extractData<any>(response) || {};
  },

  editMessage: async (conversationId: string, messageId: string, text: string): Promise<Message> => {
    const response = await api.patch(`/messages/conversations/${conversationId}/messages/${messageId}`, { text });
    const data = extractData<any>(response) || {};
    // Edit API returns mutation payload (messageId/text/editedAt), not a full message document.
    return normalizeMessage({
      ...data,
      id: data?.id ?? data?.messageId ?? messageId,
      conversationId: data?.conversationId ?? data?.conversation_id ?? conversationId,
      conversation_id: data?.conversation_id ?? data?.conversationId ?? conversationId,
      text: data?.text ?? text,
      editedAt: data?.editedAt ?? data?.edited_at ?? null,
      edited_at: data?.edited_at ?? data?.editedAt ?? null,
      isDeleted: Boolean(data?.isDeleted ?? data?.is_deleted ?? false),
      is_deleted: Boolean(data?.is_deleted ?? data?.isDeleted ?? false)
    });
  },

  copyMessage: async (conversationId: string, messageId: string): Promise<void> => {
    await api.post(`/messages/conversations/${conversationId}/messages/${messageId}/copy`);
  }
};
