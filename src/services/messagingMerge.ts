import type { Conversation } from '../types';
import { formatConversationPreview } from './conversationPreview';

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

const isActiveParticipant = (participant: any) => {
  if (!participant) return false;
  // Soft-left members must not affect the pair key (legacy duplicate root cause).
  if (participant.deletedAt || participant.deleted_at) return false;
  return true;
};

/**
 * Collect stable participant user ids for DIRECT merge keys.
 * Prefers active participants; falls back to message sender/receiver pair when the
 * participant list is incomplete (e.g. one-sided preview payloads).
 * Pass selfUserId so single-sided participant lists still form the canonical pair key
 * (fixes duplicate inbox rows for the same peer account).
 */
const collectDirectParticipantIds = (
  conversation: Conversation,
  selfUserId?: string
): string[] => {
  if (!conversation || String(conversation.type || '').toLowerCase() !== 'direct') return [];
  const selfId = safeString(selfUserId);

  const fromParticipants = safeArray<any>(conversation.participants)
    .filter(isActiveParticipant)
    .map((participant) => safeString(participant?.id ?? participant?.userId ?? participant?.user_id))
    .filter(Boolean);

  let uniqueIds = Array.from(new Set(fromParticipants));

  // Soft-deleted rows may leave only the deleted set on participants — use full list as fallback.
  if (uniqueIds.length === 0) {
    uniqueIds = Array.from(
      new Set(
        safeArray<any>(conversation.participants)
          .map((participant) => safeString(participant?.id ?? participant?.userId ?? participant?.user_id))
          .filter(Boolean)
      )
    );
  }

  // Exactly 2 → canonical pair.
  if (uniqueIds.length === 2) return uniqueIds.sort();

  // More than 2 active on a DIRECT row is legacy noise — keep the two most recent message peers if possible.
  if (uniqueIds.length > 2) {
    const messagePeerIds = new Set<string>();
    safeArray<any>(conversation.messages).forEach((message) => {
      const sender = safeString(message?.senderId ?? message?.sender_id);
      const receiver = safeString(message?.receiverId ?? message?.receiver_id);
      if (sender) messagePeerIds.add(sender);
      if (receiver) messagePeerIds.add(receiver);
    });
    const peersFromMessages = Array.from(messagePeerIds).filter((id) => uniqueIds.includes(id));
    if (peersFromMessages.length === 2) return peersFromMessages.sort();
    // Prefer self + one peer when self is present.
    if (selfId && uniqueIds.includes(selfId)) {
      const peer = uniqueIds.find((id) => id !== selfId);
      if (peer) return [selfId, peer].sort();
    }
    // Last resort: first two sorted ids keeps key stable across dual rows with same extras.
    return uniqueIds.sort().slice(0, 2);
  }

  // Single participant (other user only) — augment from last message peers, then self.
  if (uniqueIds.length === 1) {
    const known = uniqueIds[0];
    const messages = safeArray<any>(conversation.messages);
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const message = messages[i];
      const sender = safeString(message?.senderId ?? message?.sender_id);
      const receiver = safeString(message?.receiverId ?? message?.receiver_id);
      const other =
        sender && sender !== known ? sender : receiver && receiver !== known ? receiver : '';
      if (other) return [known, other].sort();
    }
    // Known is peer → pair with viewer; known is self → try peer fields on conversation.
    if (selfId && known !== selfId) return [known, selfId].sort();
    if (selfId && known === selfId) {
      const peer =
        safeString((conversation as any)?.peerUserId) ||
        safeString((conversation as any)?.otherUserId) ||
        safeString((conversation as any)?.participantUserId) ||
        safeString((conversation as any)?.peer?.id) ||
        safeString((conversation as any)?.otherUser?.id);
      if (peer && peer !== selfId) return [selfId, peer].sort();
    }
    return uniqueIds;
  }

  // No participants — derive pair purely from messages, then self.
  const messagePeerIds = new Set<string>();
  safeArray<any>(conversation.messages).forEach((message) => {
    const sender = safeString(message?.senderId ?? message?.sender_id);
    const receiver = safeString(message?.receiverId ?? message?.receiver_id);
    if (sender) messagePeerIds.add(sender);
    if (receiver) messagePeerIds.add(receiver);
  });
  const fromMessages = Array.from(messagePeerIds);
  if (fromMessages.length >= 2) return fromMessages.sort().slice(0, 2);
  if (fromMessages.length === 1 && selfId && fromMessages[0] !== selfId) {
    return [fromMessages[0], selfId].sort();
  }
  return fromMessages;
};

const getConversationParticipantsKey = (conversation: Conversation, selfUserId?: string) => {
  const uniqueIds = collectDirectParticipantIds(conversation, selfUserId);
  if (uniqueIds.length === 0) return '';
  // Require a real pair for DIRECT merge keys so incomplete rows don't create phantom buckets.
  if (uniqueIds.length === 1) {
    // Still key single-id rows by that id so multiple incomplete rows for same peer can merge,
    // then self pairing above should upgrade when selfUserId is known.
    return uniqueIds[0];
  }
  return uniqueIds.join(':');
};

/**
 * Inbox row merge key for direct chats.
 * Always participant-pair based so legacy duplicate DIRECT rows (including story reaction /
 * story comment threads that share the same pair) collapse to a single conversation row.
 * Message-level story keys remain available via getMessageMergeKey for realtime matching.
 */
export const getConversationMergeKey = (conversation: Conversation, selfUserId?: string) => {
  const participantKey = getConversationParticipantsKey(conversation, selfUserId);
  if (!participantKey) return '';
  // Normalize single-id keys with self when available so "peer-only" and "self:peer" collide.
  if (!participantKey.includes(':') && selfUserId) {
    const selfId = safeString(selfUserId);
    const peer = participantKey;
    if (selfId && peer && peer !== selfId) {
      return `direct:${[peer, selfId].sort().join(':')}`;
    }
  }
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

export const mergeDirectConversations = (list: Conversation[], selfUserId?: string) => {
  if (!Array.isArray(list) || list.length === 0) return [];

  const directBuckets = new Map<string, Conversation[]>();
  const passthrough: Conversation[] = [];

  list.forEach((conversation) => {
    // Phase 20.7.5: force all Scrolitha DMs into one defensive inbox bucket
    // even if participant keys temporarily diverge during consolidation races.
    let key = getConversationMergeKey(conversation, selfUserId);
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
    const preview = formatConversationPreview({
      message: lastVisibleMessage || null,
      fallbackPreview: primary?.lastMessage || primary?.last_message || ''
    });
    const previewText = preview.isEmpty ? '' : preview.text;

    return {
      ...primary,
      messages: mergedMessages,
      last_message: safeString(previewText || primary?.last_message),
      last_message_at: safeString(lastVisibleMessage?.timestamp ?? primary?.last_message_at),
      lastMessage: safeString(previewText || primary?.lastMessage),
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
