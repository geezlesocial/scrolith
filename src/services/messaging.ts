import api from './api';
import { Conversation, Message, UserRole, MessageReaction } from '../types';

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

  const normalized = {
    id: safeString(raw?.id ?? `${conversationId}-msg-${Date.now()}`),
    conversation_id: conversationId,
    sender_id: senderId,
    receiver_id: receiverId,
    text: safeString(raw?.text ?? raw?.body ?? ''),
    timestamp,
    is_read: isRead,
    sender_role: raw?.senderRole ?? raw?.sender_role,
    reactions: safeArray<any>(raw?.reactions).map(normalizeReaction),
    ai_flagged: raw?.ai_flagged ?? raw?.aiFlagged,
    ai_reason: raw?.ai_reason ?? raw?.aiReason,
    conversationId,
    senderId,
    receiverId,
    isRead
  } as Message;
  return normalized;
};

const normalizeParticipant = (participant: any) => ({
  id: safeString(participant?.id),
  name: safeString(participant?.name, 'Unknown'),
  avatar: safeString(participant?.avatar ?? participant?.avatar_url),
  role: participant?.role ?? participant?.userRole,
  is_online: Boolean(participant?.isOnline ?? participant?.is_online ?? false),
  isOnline: Boolean(participant?.isOnline ?? participant?.is_online ?? false)
});

const normalizeConversation = (raw: any): Conversation => {
  const participants = safeArray<any>(raw?.participants).map(normalizeParticipant);
  const messages = safeArray<any>(raw?.messages).map(normalizeMessage);
  const lastMessageFromMessages = messages[messages.length - 1]?.text ?? '';
  const lastMessageAtFromMessages = messages[messages.length - 1]?.timestamp ?? '';
  const lastMessage = safeString(raw?.lastMessage ?? raw?.last_message ?? lastMessageFromMessages);
  const lastMessageAt = safeString(
    raw?.lastMessageAt ?? raw?.last_message_at ?? lastMessageAtFromMessages
  );
  const unreadCount = safeNumber(raw?.unreadCount ?? raw?.unread_count);

  return {
    id: safeString(raw?.id ?? raw?._id),
    type: raw?.type === 'group' ? 'group' : 'direct',
    participants,
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
  return list.map(normalizeConversation);
};

const conversationCache = new Map<string, { timestamp: number; data: Conversation[] }>();
const inFlight = new Map<string, Promise<Conversation[]>>();
const CACHE_TTL_MS = 5000;
const RATE_LIMIT_COOLDOWN_MS = 30000;
let rateLimitUntil = 0;

export const MessagingService = {
  getAllConversations: async (userId: string, role: UserRole): Promise<Conversation[]> => {
    const cacheKey = `${userId}:${role}`;
    const cached = conversationCache.get(cacheKey);
    const now = Date.now();

    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
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
      .get('/messages/conversations', { params: { userId, role } })
      .then(response => {
        const data = extractData<any>(response);
        const normalized = normalizeList(data);
        conversationCache.set(cacheKey, { timestamp: Date.now(), data: normalized });
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

  getConversationById: async (id: string): Promise<Conversation | null> => {
    const response = await api.get(`/messages/conversations/${id}`);
    const raw = extractData<any>(response);
    return raw ? normalizeConversation(raw) : null;
  },

  sendMessage: async (
    conversationId: string,
    senderId: string,
    text: string,
    role: string
  ): Promise<Message> => {
    const response = await api.post(`/messages/conversations/${conversationId}/messages`, {
      senderId,
      text,
      role
    });
    return normalizeMessage(extractData<any>(response));
  },

  markAsRead: async (conversationId: string, userId: string): Promise<void> => {
    await api.post(`/messages/conversations/${conversationId}/read`, { userId });
  },

  toggleReaction: async (
    conversationId: string,
    messageId: string,
    userId: string,
    emoji: string
  ): Promise<void> => {
    await api.post(`/messages/conversations/${conversationId}/messages/${messageId}/reactions`, {
      userId,
      emoji
    });
  },

  createConversation: async (participants: Conversation['participants']): Promise<string> => {
    const response = await api.post('/messages/conversations', { participants });
    const data = extractData<{ id: string } | string>(response);
    return typeof data === 'string' ? data : data.id;
  },

  deleteMessage: async (conversationId: string, messageId: string): Promise<void> => {
    await api.delete(`/messages/conversations/${conversationId}/messages/${messageId}`);
  }
};
