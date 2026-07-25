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

const isGroupConversation = (conversation: Conversation) => {
  const type = String(conversation?.type || '').toLowerCase();
  if (type === 'group') return true;
  // Never treat Scrolitha / unlabeled DMs as groups via title heuristics alone unless multi-party.
  if (type === 'direct' || type === 'dm' || type === 'private' || !type) {
    const count = safeArray<any>(conversation?.participants).length;
    return Boolean((conversation as any)?.title && count > 2);
  }
  return false;
};

const participantUserId = (participant: any) =>
  safeString(participant?.id ?? participant?.userId ?? participant?.user_id);

const extractPeerIdsFromMessages = (conversation: Conversation, excludeId?: string): string[] => {
  const exclude = safeString(excludeId);
  const messagePeerIds = new Set<string>();
  safeArray<any>(conversation.messages).forEach((message) => {
    const sender = safeString(message?.senderId ?? message?.sender_id);
    const receiver = safeString(message?.receiverId ?? message?.receiver_id);
    if (sender && sender !== exclude) messagePeerIds.add(sender);
    if (receiver && receiver !== exclude) messagePeerIds.add(receiver);
  });
  return Array.from(messagePeerIds);
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
  if (!conversation || isGroupConversation(conversation)) return [];
  const selfId = safeString(selfUserId);

  const fromParticipants = safeArray<any>(conversation.participants)
    .filter(isActiveParticipant)
    .map(participantUserId)
    .filter(Boolean);

  let uniqueIds = Array.from(new Set(fromParticipants));

  // Soft-deleted rows may leave only the deleted set on participants — use full list as fallback.
  if (uniqueIds.length === 0) {
    uniqueIds = Array.from(
      new Set(safeArray<any>(conversation.participants).map(participantUserId).filter(Boolean))
    );
  }

  // Exactly 2 → canonical pair.
  if (uniqueIds.length === 2) return uniqueIds.sort();

  // More than 2 active on a DIRECT row is legacy noise — keep the two most recent message peers if possible.
  if (uniqueIds.length > 2) {
    const peersFromMessages = extractPeerIdsFromMessages(conversation).filter((id) =>
      uniqueIds.includes(id)
    );
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
    const messagePeers = extractPeerIdsFromMessages(conversation, known);
    if (messagePeers[0]) return [known, messagePeers[0]].sort();
    // Known is peer → pair with viewer only for incomplete own-inbox rows.
    // If messages involve a third party (not self/known), this is a foreign admin row.
    if (selfId && known !== selfId) {
      const msgAll = extractPeerIdsFromMessages(conversation);
      const foreignThirdParty = msgAll.some((id) => id !== known && id !== selfId);
      if (!foreignThirdParty) return [known, selfId].sort();
      return uniqueIds;
    }
    if (selfId && known === selfId) {
      const peer =
        safeString((conversation as any)?.peerUserId) ||
        safeString((conversation as any)?.otherUserId) ||
        safeString((conversation as any)?.participantUserId) ||
        safeString((conversation as any)?.peer?.id) ||
        safeString((conversation as any)?.otherUser?.id) ||
        extractPeerIdsFromMessages(conversation, selfId)[0] ||
        '';
      if (peer && peer !== selfId) return [selfId, peer].sort();
    }
    return uniqueIds;
  }

  // No participants — derive pair purely from messages, then self.
  const fromMessages = extractPeerIdsFromMessages(conversation);
  if (fromMessages.length >= 2) return fromMessages.sort().slice(0, 2);
  if (fromMessages.length === 1 && selfId && fromMessages[0] !== selfId) {
    return [fromMessages[0], selfId].sort();
  }
  return fromMessages;
};

/**
 * Inbox row merge key for direct chats.
 *
 * When the viewer id is known, keys are **peer-relative** (`direct:peer:<peerId>`) so that:
 * - full-pair rows (self+peer)
 * - peer-only incomplete list rows
 * - rows with extra legacy participants that still share the same peer
 * all collapse to one inbox row.
 *
 * Without selfUserId, falls back to a sorted participant pair (admin/global views).
 */
export const getConversationMergeKey = (conversation: Conversation, selfUserId?: string) => {
  if (!conversation || isGroupConversation(conversation)) return '';

  const selfId = safeString(selfUserId);
  const uniqueIds = collectDirectParticipantIds(conversation, selfUserId);
  if (uniqueIds.length === 0) return '';

  if (selfId) {
    const viewerIsMember =
      uniqueIds.includes(selfId) ||
      safeArray<any>(conversation.participants).some(
        (p) => participantUserId(p) === selfId && isActiveParticipant(p)
      );
    const peers = uniqueIds.filter((id) => id !== selfId);

    // Foreign rows (admin/global list): never peer-relative under the admin id.
    if (!viewerIsMember) {
      if (uniqueIds.length >= 2) return `direct:${uniqueIds.sort().slice(0, 2).join(':')}`;
      if (uniqueIds.length === 1) return `direct:foreign:${uniqueIds[0]}:${safeString(conversation.id)}`;
      return `direct:id:${safeString(conversation.id)}`;
    }

    if (peers.length === 1) {
      return `direct:peer:${peers[0]}`;
    }
    if (peers.length === 0) {
      // Only self resolved — try harder for a peer via raw messages / fields.
      const msgPeer = extractPeerIdsFromMessages(conversation, selfId)[0];
      if (msgPeer && msgPeer !== selfId) return `direct:peer:${msgPeer}`;
      const fieldPeer =
        safeString((conversation as any)?.peerUserId) ||
        safeString((conversation as any)?.otherUserId) ||
        safeString((conversation as any)?.peer?.id);
      if (fieldPeer && fieldPeer !== selfId) return `direct:peer:${fieldPeer}`;
      // Single-id self-only incomplete rows cannot merge safely.
      return '';
    }
    // Multi-peer direct (legacy conference-as-direct): stable full set key.
    return `direct:multi:${[selfId, ...peers].sort().join(':')}`;
  }

  // No viewer context — sorted pair (or single id for incomplete admin payloads).
  if (uniqueIds.length === 1) return `direct:${uniqueIds[0]}`;
  return `direct:${uniqueIds.sort().slice(0, 2).join(':')}`;
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
export const messageMatchesConversation = (message: any, conversation: Conversation, selfUserId?: string) => {
  if (!conversation) return false;
  const conversationId = safeString(conversation?.id);
  const messageConversationId = safeString(message?.conversationId ?? message?.conversation_id);
  if (conversationId && messageConversationId && conversationId === messageConversationId) return true;

  const conversationKey = getConversationMergeKey(conversation, selfUserId);
  if (!conversationKey) return false;
  // Peer-relative keys: match message pair that includes the conversation peer.
  if (conversationKey.startsWith('direct:peer:')) {
    const peerId = conversationKey.slice('direct:peer:'.length);
    const senderId = safeString(message?.senderId ?? message?.sender_id);
    const receiverId = safeString(message?.receiverId ?? message?.receiver_id);
    if (peerId && (senderId === peerId || receiverId === peerId)) return true;
  }
  const messageKey = getMessageMergeKey(message);
  if (!messageKey) return false;
  // Story-tagged message keys are prefixed with the participant pair key.
  return messageKey === conversationKey || messageKey.startsWith(`${conversationKey}|`);
};

const isScrolithaConversation = (conversation: Conversation) =>
  Boolean(
    (conversation as any)?.isScrolitha ||
      (conversation as any)?.is_scrolitha ||
      safeArray<any>(conversation?.participants).some((p) => {
        if (Boolean(p?.isScrolitha || p?.is_scrolitha)) return true;
        const username = safeString(p?.username).toLowerCase().replace(/^@/, '');
        if (
          username === 'scrolitha' ||
          username === 'scrolitha_ai' ||
          username === 'scrolitha-bot'
        ) {
          return true;
        }
        const systemLabel = safeString(p?.systemLabel ?? p?.system_label).toLowerCase();
        if (systemLabel.includes('ai assistant') || systemLabel.includes('official ai')) {
          return true;
        }
        // Do not treat bare label === 'system' as Scrolitha (false positives in admin inbox).
        if (safeString(p?.label).toLowerCase() === 'scrolitha') return true;
        if (safeString(p?.name).toLowerCase() === 'scrolitha') return true;
        return false;
      })
  );

const conversationHasViewer = (conversation: Conversation, selfId: string) => {
  if (!selfId) return false;
  return safeArray<any>(conversation?.participants).some(
    (p) => participantUserId(p) === selfId && isActiveParticipant(p)
  );
};

export const mergeDirectConversations = (list: Conversation[], selfUserId?: string) => {
  if (!Array.isArray(list) || list.length === 0) return [];

  const directBuckets = new Map<string, Conversation[]>();
  const passthrough: Conversation[] = [];
  const selfId = safeString(selfUserId);

  list.forEach((conversation) => {
    // Phase 20.7.5: collapse Scrolitha DMs per viewer (never merge other users' assistant
    // threads into the admin/global inbox — that caused mark-as-read / appearance 404s).
    let key = getConversationMergeKey(conversation, selfUserId);
    if (isScrolithaConversation(conversation)) {
      const member = selfId && conversationHasViewer(conversation, selfId);
      key = member
        ? `direct:scrolitha:${selfId}`
        : `direct:scrolitha-row:${safeString(conversation.id)}`;
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
      // Prefer rows that still include the viewer (mark-as-read / appearance membership).
      if (selfId) {
        const leftHas = conversationHasViewer(left, selfId) ? 1 : 0;
        const rightHas = conversationHasViewer(right, selfId) ? 1 : 0;
        if (leftHas !== rightHas) return rightHas - leftHas;
      }
      return String(right?.id || '').localeCompare(String(left?.id || ''));
    });
    const primaryWithSelf = selfId ? ordered.find((entry) => conversationHasViewer(entry, selfId)) : undefined;
    const primary = primaryWithSelf || ordered[0] || bucket[0];
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
    // Union participants across bucket so Scrolitha (or peer) is not dropped when
    // the primary row only has a partial participant list.
    const mergedParticipants = Array.from(
      ordered
        .flatMap((entry) => safeArray<any>(entry?.participants))
        .reduce((acc, participant) => {
          const id = participantUserId(participant);
          if (!id) return acc;
          if (!acc.has(id)) acc.set(id, participant);
          else {
            const prev = acc.get(id);
            acc.set(id, {
              ...prev,
              ...participant,
              isScrolitha: Boolean(
                prev?.isScrolitha || prev?.is_scrolitha || participant?.isScrolitha || participant?.is_scrolitha
              ),
              is_scrolitha: Boolean(
                prev?.isScrolitha || prev?.is_scrolitha || participant?.isScrolitha || participant?.is_scrolitha
              ),
              name: safeString(participant?.name || prev?.name),
              username: safeString(participant?.username || prev?.username)
            });
          }
          return acc;
        }, new Map<string, any>())
        .values()
    );
    const lastVisibleMessage = mergedMessages[mergedMessages.length - 1];
    const unreadCount = ordered.reduce(
      (sum, entry) => sum + safeNumber(entry?.unreadCount ?? entry?.unread_count),
      0
    );
    const preview = formatConversationPreview({
      message: lastVisibleMessage || null,
      fallbackPreview: primary?.lastMessage || primary?.last_message || ''
    });
    const previewText = preview.isEmpty ? '' : preview.text;
    const scrolithaMerged = ordered.some((entry) => isScrolithaConversation(entry));
    const mergedIds = ordered.map((entry) => safeString(entry?.id)).filter(Boolean);

    return {
      ...primary,
      participants: mergedParticipants.length ? mergedParticipants : primary?.participants,
      messages: mergedMessages,
      last_message: safeString(previewText || primary?.last_message),
      last_message_at: safeString(lastVisibleMessage?.timestamp ?? primary?.last_message_at),
      lastMessage: safeString(previewText || primary?.lastMessage),
      lastMessageAt: safeString(lastVisibleMessage?.timestamp ?? primary?.lastMessageAt),
      unread_count: unreadCount,
      unreadCount,
      isScrolitha: Boolean((primary as any)?.isScrolitha || (primary as any)?.is_scrolitha || scrolithaMerged),
      is_scrolitha: Boolean((primary as any)?.isScrolitha || (primary as any)?.is_scrolitha || scrolithaMerged),
      // Help clients remap deep-links that pointed at absorbed duplicate ids.
      mergedFromIds: mergedIds,
      merged_from_ids: mergedIds
    } as Conversation;
  });

  return [...passthrough, ...mergedDirects].sort((left, right) => {
    const leftAt = new Date(left?.lastMessageAt || left?.last_message_at || 0).getTime();
    const rightAt = new Date(right?.lastMessageAt || right?.last_message_at || 0).getTime();
    if (leftAt !== rightAt) return rightAt - leftAt;
    return String(right?.id || '').localeCompare(String(left?.id || ''));
  });
};
