/**
 * Pure helpers for enterprise messaging surfaces (header popup + dock).
 * Classification uses authoritative conversation metadata only — no name/text guessing.
 */
import type { Conversation, Message } from '../types';
import { getConversationMergeKey, mergeDirectConversations } from './messagingMerge';
import {
  formatConversationPreview,
  getConversationPreviewText,
  getMessagePreviewText
} from './conversationPreview';

export { formatConversationPreview, getConversationPreviewText, getMessagePreviewText };

/**
 * Phase 20.7 corrective patch: dedicated full-page messaging already provides the
 * workspace. The floating DesktopMessagingDock must not mount on these routes.
 *
 * Segment-aware (not substring): only `/messages` and `/messages/*`.
 * Query/hash ignored by callers (pass pathname only).
 */
export const isMessagingDockExcludedPath = (pathname: string | null | undefined): boolean => {
  const raw = String(pathname || '').trim();
  if (!raw) return false;
  // Strip query/hash if a full path-like string is passed.
  const withoutQuery = raw.split('?')[0].split('#')[0];
  // Normalize trailing slashes except root.
  let path = withoutQuery.replace(/\/+$/, '') || '/';
  // Optional locale or app prefix is not used by Scrolith today; keep segment check strict.
  if (path === '/messages') return true;
  if (path.startsWith('/messages/')) return true;
  // Phase 26B — onboarding must not be blocked by floating messaging launcher.
  if (path === '/auth/follow-onboarding') return true;
  if (path.startsWith('/auth/follow-onboarding/')) return true;
  return false;
};

/** Inverse of exclusion — mount dock only when true. */
export const shouldShowMessagingDock = (pathname: string | null | undefined): boolean =>
  !isMessagingDockExcludedPath(pathname);

export const MESSAGING_PREVIEW_LIMIT = 15;
export const MESSAGING_SEARCH_DEBOUNCE_MS = 300;
export const MESSAGING_DESKTOP_MIN_WIDTH = 1024;
export const MESSAGING_WIDE_CHAT_WIDTH = 1440;
export const MESSAGING_MAX_CHAT_WINDOWS_NARROW = 1;
export const MESSAGING_MAX_CHAT_WINDOWS_WIDE = 3;

/** Collapsed desktop Messaging bar footprint (Phase 6.2 / 6.2.1). */
export const MESSAGING_DOCK_COLLAPSED_MAX_WIDTH_PX = 280;
export const MESSAGING_DOCK_COLLAPSED_MIN_WIDTH_PX = 240;
export const MESSAGING_DOCK_COLLAPSED_HEIGHT_PX = 48;
export const MESSAGING_DOCK_COMPACT_WIDTH_PX = 228;
export const MESSAGING_DOCK_COMPACT_HEIGHT_PX = 46;
export const MESSAGING_DOCK_ICON_SIZE_PX = 48;
export const MESSAGING_DOCK_EDGE_OFFSET_PX = 16;
export const MESSAGING_DOCK_SAFE_GAP_PX = 12;
export const MESSAGING_DOCK_MIN_GAP_PX = 8;

export type MessagingDockMode = 'normal' | 'compact' | 'icon-only' | 'hidden';

export type MessagingDockRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

export type MessagingDockPlacement = {
  mode: MessagingDockMode;
  /** CSS `bottom` in px */
  bottom: number;
  /** CSS `right` in px */
  right: number;
  width: number;
  height: number;
};

export const messagingDockRectsIntersect = (
  a: MessagingDockRect,
  b: MessagingDockRect,
  gap = 0
): boolean => {
  const g = Math.max(0, gap);
  return !(
    a.right + g <= b.left ||
    b.right + g <= a.left ||
    a.bottom + g <= b.top ||
    b.bottom + g <= a.top
  );
};

const dockRectFromBottomRight = (
  viewportWidth: number,
  viewportHeight: number,
  bottom: number,
  right: number,
  width: number,
  height: number
): MessagingDockRect => {
  const left = viewportWidth - right - width;
  const top = viewportHeight - bottom - height;
  return {
    top,
    left,
    right: left + width,
    bottom: top + height,
    width,
    height
  };
};

const fitsInViewport = (
  viewportWidth: number,
  viewportHeight: number,
  rect: MessagingDockRect,
  edge: number
): boolean =>
  rect.left >= edge - 0.5 &&
  rect.top >= edge - 0.5 &&
  rect.right <= viewportWidth - edge + 0.5 &&
  rect.bottom <= viewportHeight - edge + 0.5;

/**
 * Deterministic adaptive placement for the collapsed Messaging bar.
 * Prefer keeping the dock visible outside modal geometry; hide only as last resort.
 */
export const resolveMessagingDockPlacement = (input: {
  viewportWidth: number;
  viewportHeight: number;
  modal: MessagingDockRect | null;
  edge?: number;
  preferredGap?: number;
  minGap?: number;
}): MessagingDockPlacement => {
  const vw = input.viewportWidth;
  const vh = input.viewportHeight;
  const edge = input.edge ?? MESSAGING_DOCK_EDGE_OFFSET_PX;
  const preferredGap = input.preferredGap ?? MESSAGING_DOCK_SAFE_GAP_PX;
  const minGap = input.minGap ?? MESSAGING_DOCK_MIN_GAP_PX;

  if (!Number.isFinite(vw) || !Number.isFinite(vh) || vw < 1 || vh < 1) {
    return {
      mode: 'hidden',
      bottom: edge,
      right: edge,
      width: 0,
      height: 0
    };
  }

  type Candidate = {
    mode: Exclude<MessagingDockMode, 'hidden'>;
    bottom: number;
    right: number;
    width: number;
    height: number;
    gap: number;
  };

  const sizes: Array<{ mode: Candidate['mode']; width: number; height: number }> = [
    {
      mode: 'normal',
      width: MESSAGING_DOCK_COLLAPSED_MAX_WIDTH_PX,
      height: MESSAGING_DOCK_COLLAPSED_HEIGHT_PX
    },
    {
      mode: 'compact',
      width: MESSAGING_DOCK_COMPACT_WIDTH_PX,
      height: MESSAGING_DOCK_COMPACT_HEIGHT_PX
    },
    {
      mode: 'icon-only',
      width: MESSAGING_DOCK_ICON_SIZE_PX,
      height: MESSAGING_DOCK_ICON_SIZE_PX
    }
  ];

  const candidates: Candidate[] = [];

  for (const size of sizes) {
    // A/B: bottom-right and bottom-left at preferred edge
    candidates.push({
      mode: size.mode,
      bottom: edge,
      right: edge,
      width: size.width,
      height: size.height,
      gap: preferredGap
    });
    candidates.push({
      mode: size.mode,
      bottom: edge,
      right: Math.max(edge, vw - edge - size.width),
      width: size.width,
      height: size.height,
      gap: preferredGap
    });

    if (input.modal) {
      const m = input.modal;
      // C: sit above modal (dock bottom edge above modal top)
      const aboveBottom = Math.max(edge, vh - m.top + preferredGap);
      candidates.push({
        mode: size.mode,
        bottom: aboveBottom,
        right: edge,
        width: size.width,
        height: size.height,
        gap: preferredGap
      });
      candidates.push({
        mode: size.mode,
        bottom: aboveBottom,
        right: Math.max(edge, vw - edge - size.width),
        width: size.width,
        height: size.height,
        gap: preferredGap
      });

      // B: to the right of modal (CSS right when dock left = m.right + gap)
      const rightCssForRightOfModal = vw - (m.right + preferredGap + size.width);
      if (rightCssForRightOfModal >= edge - 0.5) {
        candidates.push({
          mode: size.mode,
          bottom: edge,
          right: rightCssForRightOfModal,
          width: size.width,
          height: size.height,
          gap: preferredGap
        });
        // Vertically align toward modal bottom if possible
        const bottomAlign = Math.max(edge, vh - m.bottom);
        candidates.push({
          mode: size.mode,
          bottom: bottomAlign,
          right: rightCssForRightOfModal,
          width: size.width,
          height: size.height,
          gap: preferredGap
        });
      }

      // B: to the left of modal (dock right edge left of modal left)
      const leftCss = m.left - preferredGap - size.width;
      if (leftCss >= edge - 0.5) {
        const rightCss = vw - (leftCss + size.width);
        candidates.push({
          mode: size.mode,
          bottom: edge,
          right: rightCss,
          width: size.width,
          height: size.height,
          gap: preferredGap
        });
        const bottomAlign = Math.max(edge, vh - m.bottom);
        candidates.push({
          mode: size.mode,
          bottom: bottomAlign,
          right: rightCss,
          width: size.width,
          height: size.height,
          gap: preferredGap
        });
      }

      // Retry above with emergency min gap
      const aboveBottomMin = Math.max(edge, vh - m.top + minGap);
      candidates.push({
        mode: size.mode,
        bottom: aboveBottomMin,
        right: edge,
        width: size.width,
        height: size.height,
        gap: minGap
      });
    }
  }

  // Deduplicate near-identical candidates
  const seen = new Set<string>();
  for (const c of candidates) {
    const key = `${c.mode}:${Math.round(c.bottom)}:${Math.round(c.right)}:${c.width}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const rect = dockRectFromBottomRight(vw, vh, c.bottom, c.right, c.width, c.height);
    if (!fitsInViewport(vw, vh, rect, Math.min(edge, 8))) continue;
    if (input.modal && messagingDockRectsIntersect(rect, input.modal, c.gap)) continue;

    return {
      mode: c.mode,
      bottom: Math.round(c.bottom),
      right: Math.round(c.right),
      width: c.width,
      height: c.height
    };
  }

  // E: no safe placement
  return {
    mode: 'hidden',
    bottom: edge,
    right: edge,
    width: 0,
    height: 0
  };
};

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

/**
 * Shared conversation source for the header popover and floating dock.
 * Keep this aligned with the full /messages workspace so legacy direct rows
 * cannot render the same participant pair twice in compact surfaces.
 */
export const getMessagingSurfaceConversations = (
  conversations: Conversation[],
  currentUserId: string | null | undefined,
  tab: MessagingInboxTab,
  limit = MESSAGING_PREVIEW_LIMIT
): Conversation[] =>
  filterConversationsForTab(
    mergeDirectConversations(
      Array.isArray(conversations) ? conversations : [],
      currentUserId || undefined
    ),
    tab,
    limit
  );

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

/**
 * Group/community avatar file id when set; otherwise null (caller shows initials).
 * Personal DM avatars come from participants — use getConversationAvatarParticipant.
 */
export const getConversationGroupAvatarFileId = (
  conversation: Conversation | null | undefined
): string | null => {
  if (!conversation) return null;
  const category = getConversationCategory(conversation);
  if (category !== 'group' && category !== 'community') return null;
  const fileId = safeString(
    (conversation as any).avatarFileId ?? (conversation as any).avatar_file_id
  );
  return fileId || null;
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
  // Prefer explicit clientSendId / metadata match (enterprise delivery IDs).
  const serverClientSendId = safeString(
    (serverMessage as any)?.metadata?.clientSendId ||
      (serverMessage as any)?.metadata?.client_send_id ||
      (serverMessage as any)?.clientSendId ||
      (serverMessage as any)?.client_send_id
  );
  if (serverClientSendId) {
    const byClient = list.findIndex((message) => {
      const metaId = safeString(
        (message as any)?.metadata?.clientSendId ||
          (message as any)?.metadata?.client_send_id ||
          message.id
      );
      return metaId === serverClientSendId || safeString(message.id) === serverClientSendId;
    });
    if (byClient >= 0) {
      list[byClient] = { ...list[byClient], ...serverMessage, id: serverId };
      return list;
    }
  }

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
  const previewFromPayload = safeString(
    (message as any)?.lastMessage ?? (message as any)?.last_message
  );
  const preview =
    previewFromPayload || getMessagePreviewText(message) || '';
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
