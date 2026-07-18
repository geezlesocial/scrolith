import type { Conversation } from '../types';

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

const extractStoryIdFromMessage = (message: any): string => {
  const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : null;
  const storyReference = metadata?.storyReference && typeof metadata.storyReference === 'object'
    ? metadata.storyReference
    : null;
  const threadKey = safeString(metadata?.storyThreadKey ?? metadata?.threadKey);
  if (threadKey.startsWith('story:')) {
    const fromThreadKey = threadKey.slice('story:'.length).trim();
    if (fromThreadKey) return fromThreadKey;
  }
  return safeString(
    storyReference?.storyId ??
      metadata?.storyId ??
      metadata?.story_id ??
      message?.storyId ??
      message?.story_id
  );
};

const extractStoryThreadKey = (message: any): string => {
  const metadata = message?.metadata && typeof message.metadata === 'object' ? message.metadata : null;
  const threadKey = safeString(metadata?.storyThreadKey ?? metadata?.threadKey);
  if (threadKey) return threadKey;

  const storyId = extractStoryIdFromMessage(message);
  if (storyId) return `story:${storyId}`;

  const text = safeString(message?.text ?? message?.message ?? message?.body).toLowerCase();
  if (!text) return '';
  const isStoryContext =
    text.includes('story') &&
    (
      text.includes('reacted') ||
      text.includes('reaction') ||
      text.includes('replied') ||
      text.includes('reply') ||
      text.includes('comment') ||
      text.includes('liked') ||
      text.includes('love') ||
      text.includes('to your story') ||
      text.includes('your story')
    );
  return isStoryContext ? 'story-thread' : '';
};

const getConversationParticipantsKey = (conversation: Conversation) => {
  if (!conversation || String(conversation.type || '').toLowerCase() !== 'direct') return '';
  const ids = safeArray<any>(conversation.participants)
    .map((participant) => safeString(participant?.id ?? participant?.userId ?? participant?.user_id))
    .filter(Boolean);
  const uniqueIds = Array.from(new Set(ids));
  if (uniqueIds.length === 0) return '';
  return uniqueIds.sort().join(':');
};

/**
 * Inbox row merge key for direct chats.
 * Always participant-pair based so legacy duplicate DIRECT rows (including story reaction /
 * story comment threads that share the same pair) collapse to a single conversation row.
 * Message-level story keys remain available via getMessageMergeKey for realtime matching.
 */
export const getConversationMergeKey = (conversation: Conversation) => {
  const participantKey = getConversationParticipantsKey(conversation);
  if (!participantKey) return '';
  return `direct:${participantKey}`;
};

export const getMessageMergeKey = (message: any) => {
  const senderId = safeString(message?.senderId ?? message?.sender_id);
  const receiverId = safeString(message?.receiverId ?? message?.receiver_id);
  const participants = [senderId, receiverId].filter(Boolean).sort().join(':');
  const threadKey = extractStoryThreadKey(message);
  const storyId = extractStoryIdFromMessage(message);
  const storyThreadHint = storyId ? '' : threadKey;
  if (participants) {
    return storyId
      ? `direct:${participants}|story:${storyId}`
      : storyThreadHint
        ? `direct:${participants}|${storyThreadHint.startsWith('story:') ? storyThreadHint : `story:${storyThreadHint}`}`
        : `direct:${participants}`;
  }
  if (storyId) return `story:${storyId}`;
  if (storyThreadHint) return `story:${storyThreadHint}`;
  return safeString(message?.conversationId ?? message?.conversation_id);
};

/** True when a realtime message belongs to an inbox conversation row (id or merge-key match). */
export const messageMatchesConversation = (message: any, conversation: Conversation) => {
  if (!conversation) return false;
  const conversationId = safeString(conversation?.id);
  const messageConversationId = safeString(message?.conversationId ?? message?.conversation_id);
  if (conversationId && messageConversationId && conversationId === messageConversationId) return true;

  const conversationKey = getConversationMergeKey(conversation);
  if (!conversationKey) return false;
  const messageKey = getMessageMergeKey(message);
  if (!messageKey) return false;
  // Story-tagged message keys are prefixed with the participant pair key.
  return messageKey === conversationKey || messageKey.startsWith(`${conversationKey}|`);
};

const isScrolithaConversation = (conversation: Conversation) =>
  Boolean(
    (conversation as any)?.isScrolitha ||
      (conversation as any)?.is_scrolitha ||
      safeArray<any>(conversation?.participants).some(
        (p) =>
          Boolean(p?.isScrolitha || p?.is_scrolitha) ||
          safeString(p?.username).toLowerCase() === 'scrolitha' ||
          safeString(p?.label).toLowerCase() === 'scrolitha' ||
          safeString(p?.label).toLowerCase() === 'system'
      )
  );

export const mergeDirectConversations = (list: Conversation[]) => {
  if (!Array.isArray(list) || list.length === 0) return [];

  const directBuckets = new Map<string, Conversation[]>();
  const passthrough: Conversation[] = [];

  list.forEach((conversation) => {
    // Phase 20.7.5: force all Scrolitha DMs into one defensive inbox bucket
    // even if participant keys temporarily diverge during consolidation races.
    let key = getConversationMergeKey(conversation);
    if (isScrolithaConversation(conversation)) {
      key = 'direct:scrolitha-canonical';
    }
    if (!key) {
      passthrough.push(conversation);
      return;
    }
    if (!directBuckets.has(key)) directBuckets.set(key, []);
    directBuckets.get(key)!.push(conversation);
  });

  const mergedDirects = Array.from(directBuckets.values()).map((bucket) => {
    const ordered = [...bucket].sort((left, right) => {
      const leftAt = new Date(left?.lastMessageAt || left?.last_message_at || 0).getTime();
      const rightAt = new Date(right?.lastMessageAt || right?.last_message_at || 0).getTime();
      if (leftAt !== rightAt) return rightAt - leftAt;
      return String(right?.id || '').localeCompare(String(left?.id || ''));
    });
    const primary = ordered[0] || bucket[0];
    const mergedMessages = Array.from(
      ordered
        .flatMap((entry) => safeArray<any>(entry?.messages))
        .reduce((acc, message) => {
          const messageId = safeString(message?.id);
          if (!messageId) return acc;
          if (!acc.has(messageId)) acc.set(messageId, message);
          return acc;
        }, new Map<string, any>())
        .values()
    ).sort((left, right) => {
        const leftAt = new Date(left?.timestamp || left?.createdAt || 0).getTime();
        const rightAt = new Date(right?.timestamp || right?.createdAt || 0).getTime();
        if (leftAt !== rightAt) return leftAt - rightAt;
        return String(left?.id || '').localeCompare(String(right?.id || ''));
      });
    const lastVisibleMessage = mergedMessages[mergedMessages.length - 1];
    const unreadCount = ordered.reduce((sum, entry) => sum + safeNumber(entry?.unreadCount ?? entry?.unread_count), 0);

    return {
      ...primary,
      messages: mergedMessages,
      last_message: safeString(lastVisibleMessage?.text ?? primary?.last_message),
      last_message_at: safeString(lastVisibleMessage?.timestamp ?? primary?.last_message_at),
      lastMessage: safeString(lastVisibleMessage?.text ?? primary?.lastMessage),
      lastMessageAt: safeString(lastVisibleMessage?.timestamp ?? primary?.lastMessageAt),
      unread_count: unreadCount,
      unreadCount
    } as Conversation;
  });

  return [...passthrough, ...mergedDirects].sort((left, right) => {
    const leftAt = new Date(left?.lastMessageAt || left?.last_message_at || 0).getTime();
    const rightAt = new Date(right?.lastMessageAt || right?.last_message_at || 0).getTime();
    if (leftAt !== rightAt) return rightAt - leftAt;
    return String(right?.id || '').localeCompare(String(left?.id || ''));
  });
};
