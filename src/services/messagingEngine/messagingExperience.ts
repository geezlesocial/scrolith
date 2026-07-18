/**
 * Phase 20.2.6R — pure messaging UX helpers (scroll, dates, unread, grouping).
 * No React / network side effects.
 */

export type ThreadMessageLike = {
  id?: string | null;
  timestamp?: string | null;
  createdAt?: string | null;
  senderId?: string | null;
  sender_id?: string | null;
  isRead?: boolean | null;
  is_read?: boolean | null;
  isDeleted?: boolean | null;
  is_deleted?: boolean | null;
};

export type ThreadTimelineItem =
  | { kind: 'date'; key: string; label: string; dayKey: string }
  | { kind: 'unread'; key: string; count: number }
  | { kind: 'message'; key: string; message: ThreadMessageLike; index: number; showAvatar: boolean; isClusterStart: boolean };

const coerceId = (value: unknown) => String(value ?? '').trim();

export const getMessageTimestampMs = (message: ThreadMessageLike | null | undefined): number => {
  const raw = String(message?.timestamp || message?.createdAt || '').trim();
  if (!raw) return 0;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? ms : 0;
};

export const toDayKey = (ms: number): string => {
  if (!ms) return 'unknown';
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const formatDaySeparatorLabel = (ms: number, nowMs = Date.now()): string => {
  if (!ms) return 'Earlier';
  const date = new Date(ms);
  const now = new Date(nowMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfMsg = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const dayDiff = Math.round((startOfToday - startOfMsg) / 86_400_000);
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Yesterday';
  if (dayDiff > 1 && dayDiff < 7) {
    return date.toLocaleDateString(undefined, { weekday: 'long' });
  }
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric'
  });
};

/**
 * First unread incoming message index for the viewer (excludes own messages).
 */
export const findFirstUnreadIndex = (
  messages: ThreadMessageLike[],
  viewerId?: string | null
): number => {
  const me = coerceId(viewerId);
  const list = Array.isArray(messages) ? messages : [];
  for (let i = 0; i < list.length; i += 1) {
    const msg = list[i];
    if (!msg) continue;
    if (Boolean(msg.isDeleted ?? msg.is_deleted)) continue;
    const sender = coerceId(msg.senderId || msg.sender_id);
    if (me && sender && sender === me) continue;
    const read = Boolean(msg.isRead ?? msg.is_read);
    if (!read) return i;
  }
  return -1;
};

export const countUnreadIncoming = (
  messages: ThreadMessageLike[],
  viewerId?: string | null
): number => {
  const me = coerceId(viewerId);
  return (Array.isArray(messages) ? messages : []).reduce((acc, msg) => {
    if (!msg || Boolean(msg.isDeleted ?? msg.is_deleted)) return acc;
    const sender = coerceId(msg.senderId || msg.sender_id);
    if (me && sender && sender === me) return acc;
    if (Boolean(msg.isRead ?? msg.is_read)) return acc;
    return acc + 1;
  }, 0);
};

/**
 * Build a render timeline with sticky date separators, optional unread divider,
 * and cluster metadata for optical grouping of consecutive same-sender bubbles.
 */
export const buildThreadTimeline = (
  messages: ThreadMessageLike[],
  options?: {
    viewerId?: string | null;
    insertUnreadDivider?: boolean;
    nowMs?: number;
  }
): ThreadTimelineItem[] => {
  const list = Array.isArray(messages) ? messages : [];
  const viewerId = options?.viewerId;
  const insertUnread = options?.insertUnreadDivider !== false;
  const firstUnread = insertUnread ? findFirstUnreadIndex(list, viewerId) : -1;
  const unreadCount = firstUnread >= 0 ? countUnreadIncoming(list, viewerId) : 0;
  const items: ThreadTimelineItem[] = [];
  let lastDayKey = '';
  let lastSender = '';

  list.forEach((message, index) => {
    const ms = getMessageTimestampMs(message);
    const dayKey = toDayKey(ms);
    if (dayKey !== lastDayKey) {
      items.push({
        kind: 'date',
        key: `date-${dayKey}-${index}`,
        label: formatDaySeparatorLabel(ms, options?.nowMs),
        dayKey
      });
      lastDayKey = dayKey;
      lastSender = '';
    }

    if (firstUnread === index && unreadCount > 0) {
      items.push({
        kind: 'unread',
        key: `unread-${index}`,
        count: unreadCount
      });
      lastSender = '';
    }

    const sender = coerceId(message.senderId || message.sender_id);
    const isClusterStart = !lastSender || lastSender !== sender;
    items.push({
      kind: 'message',
      key: `msg-${coerceId(message.id) || index}`,
      message,
      index,
      showAvatar: isClusterStart,
      isClusterStart
    });
    lastSender = sender;
  });

  return items;
};

/**
 * Preserve scroll position when content is prepended or height grows above the viewport.
 * Returns next scrollTop after a layout change.
 */
export const preserveScrollTopAfterGrowth = (params: {
  previousScrollHeight: number;
  previousScrollTop: number;
  nextScrollHeight: number;
  stickToBottom: boolean;
  clientHeight: number;
}): number => {
  const {
    previousScrollHeight,
    previousScrollTop,
    nextScrollHeight,
    stickToBottom,
    clientHeight
  } = params;
  if (stickToBottom) {
    return Math.max(0, nextScrollHeight - clientHeight);
  }
  const delta = nextScrollHeight - previousScrollHeight;
  if (!Number.isFinite(delta) || delta === 0) return previousScrollTop;
  return Math.max(0, previousScrollTop + delta);
};

export const isNearBottom = (
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  thresholdPx = 120
): boolean => scrollHeight - scrollTop - clientHeight < thresholdPx;

export const estimateConversationOpenBudgetMs = 200;
export const estimateConversationSwitchBudgetMs = 150;
