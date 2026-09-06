export type NativeCapabilities = {
  bridgeVersion?: string;
  nativeNotifications?: boolean;
  nativeMessagesList?: boolean;
  nativeNavigationPilot?: boolean;
  nativeNavigation?: boolean;
};

export type ScrolithNativeBridge = {
  getBridgeVersion?: () => string;
  getCapabilities?: () => string;
  openNativeNotifications?: () => void;
  closeNativeNotifications?: () => void;
  openNativeMessages?: () => void;
  closeNativeMessages?: () => void;
  postEvent?: (eventName: string, payloadJson: string) => void;
};

const MAX_TEXT_LENGTH = 600;
const MAX_ITEMS = 40;
const MAX_MESSAGE_ITEMS = 100;
const sessionBinding = (() => {
  try {
    return globalThis.crypto?.randomUUID?.() || `native-session-${Date.now()}`;
  } catch {
    return `native-session-${Date.now()}`;
  }
})();

export const getScrolithNative = (): ScrolithNativeBridge | null => {
  if (typeof window === 'undefined') return null;
  const bridge = (window as Window & { ScrolithNative?: ScrolithNativeBridge }).ScrolithNative;
  return bridge && typeof bridge === 'object' ? bridge : null;
};

export const getNativeCapabilities = (bridge = getScrolithNative()): NativeCapabilities => {
  if (!bridge?.getCapabilities) return {};
  try {
    const parsed = JSON.parse(bridge.getCapabilities());
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

export const isSafeInternalPath = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const path = value.trim();
  return path.startsWith('/') && !path.startsWith('//') && !path.includes('\\')
    && !/javascript:/i.test(path) && !/[\u0000-\u001f\u007f]/.test(path)
    && path.length <= 512;
};

export const postNativeEvent = (
  eventName: string,
  payload: Record<string, unknown> = {},
  bridge = getScrolithNative()
) => {
  if (!bridge?.postEvent) return false;
  try {
    bridge.postEvent(eventName, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
};

const boundedText = (value: unknown, max = MAX_TEXT_LENGTH) => {
  const normalized = String(value ?? '').trim();
  return normalized.length > max ? normalized.slice(0, max) : normalized;
};

const internalActionPath = (value: unknown) => {
  const path = boundedText(value, 512);
  return isSafeInternalPath(path) ? path : undefined;
};

export const buildNativeNotificationEnvelope = (
  notifications: any[],
  requestId?: string
) => {
  const items = (Array.isArray(notifications) ? notifications : [])
    .slice(0, MAX_ITEMS)
    .map((item) => {
      const actionPath = internalActionPath(item?.actionUrl ?? item?.action_url);
      return {
        id: boundedText(item?.id, 128),
        type: boundedText(item?.type || 'info', 48),
        title: boundedText(item?.title || 'Notification', 160),
        message: boundedText(item?.message || item?.body || '', MAX_TEXT_LENGTH),
        isRead: Boolean(item?.isRead ?? item?.is_read),
        category: boundedText(item?.category || item?.metadata?.category, 48),
        priority: boundedText(item?.priority || item?.metadata?.priority || 'normal', 24),
        createdAt: boundedText(item?.createdAt || item?.timestamp || '', 80),
        ...(actionPath ? { actionPath } : {})
      };
    })
    .filter((item) => item.id);

  return {
    bridgeVersion: '2',
    requestId: boundedText(requestId, 80),
    kind: 'snapshot',
    sessionBinding,
    items,
    unreadCount: items.filter((item) => !item.isRead).length,
    hasMore: Array.isArray(notifications) && notifications.length > MAX_ITEMS,
    serverTime: new Date().toISOString()
  };
};

const safeMessagePreviewKind = (value: unknown): 'text' | 'image' | 'video' | 'audio' | 'voice' | 'file' | 'empty' => {
  const kind = String(value || '').trim().toLowerCase();
  if (kind === 'image' || kind === 'video' || kind === 'audio' || kind === 'voice') return kind;
  if (kind === 'file' || kind === 'pdf' || kind === 'document' || kind === 'attachments') return 'file';
  if (kind === 'empty' || kind === 'deleted') return 'empty';
  return kind ? 'text' : 'empty';
};

const safeNativeAvatarPath = (value: unknown): string | undefined => {
  const raw = boundedText(value, 1024);
  if (!raw) return undefined;
  if (!raw.startsWith('/') && !/^https?:\/\//i.test(raw)) return undefined;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin || !url.pathname.startsWith('/')) return undefined;
    return `${url.pathname}${url.search}`.slice(0, 1024);
  } catch {
    return undefined;
  }
};

const messageParticipant = (conversation: any, currentUserId?: string | null) => {
  const participants = Array.isArray(conversation?.participants) ? conversation.participants : [];
  return participants.find((participant: any) => {
    const id = String(participant?.id || participant?.userId || '').trim();
    return id && id !== String(currentUserId || '').trim();
  }) || participants[0] || null;
};

const messageDisplayName = (conversation: any, currentUserId?: string | null) => {
  const participant = messageParticipant(conversation, currentUserId);
  const type = String(conversation?.type || '').toLowerCase();
  const title = String(conversation?.title || '').trim();
  if (type === 'group' || title) return title || 'Group conversation';
  return String(participant?.name || participant?.username || 'Conversation').trim() || 'Conversation';
};

/**
 * Project the existing authenticated inbox into a bounded native-only shape.
 * This deliberately accepts normalized web conversations, never raw socket data.
 */
export const buildNativeMessagesEnvelope = (
  conversations: any[],
  currentUserId?: string | null,
  requestId?: string,
  revision = 0
) => {
  const source = Array.isArray(conversations) ? conversations : [];
  const items = source
    .slice(0, MAX_MESSAGE_ITEMS)
    .map((conversation: any) => {
      const id = boundedText(conversation?.id, 128);
      if (!id) return null;
      const participant = messageParticipant(conversation, currentUserId);
      const typeRaw = String(conversation?.type || '').trim().toLowerCase();
      const type = typeRaw === 'group'
        ? (String(conversation?.category || '').toLowerCase() === 'community' ? 'community' : 'group')
        : 'direct';
      const previewText = boundedText(
        conversation?.lastMessage ?? conversation?.last_message ?? '',
        240
      );
      const avatarCandidate = participant?.avatar || participant?.avatar_url || participant?.avatarUrl
        || participant?.profilePhotoFileId || participant?.profile_photo_file_id;
      const lastMessageAt = boundedText(
        conversation?.lastMessageAt ?? conversation?.last_message_at ?? '',
        80
      );
      const unreadCount = Math.max(0, Math.min(9999, Number(
        conversation?.unreadCount ?? conversation?.unread_count ?? 0
      ) || 0));
      const item: Record<string, unknown> = {
        id,
        type,
        title: boundedText(messageDisplayName(conversation, currentUserId), 160),
        preview: {
          kind: safeMessagePreviewKind(
            conversation?.lastMessagePreviewKind
              ?? conversation?.last_message_preview_kind
              ?? conversation?.previewKind
          ),
          text: previewText
        },
        lastMessageAt,
        unreadCount,
        isMuted: Boolean(conversation?.isMuted ?? conversation?.is_muted),
        isStarred: Boolean(conversation?.isStarred ?? conversation?.is_starred),
        isPinned: Boolean(conversation?.isPinned ?? conversation?.is_pinned),
        actionPath: `/messages/${encodeURIComponent(id)}`
      };
      const avatarPath = safeNativeAvatarPath(avatarCandidate);
      if (avatarPath) item.avatarPath = avatarPath;
      const participantId = String(participant?.id || participant?.userId || '').trim();
      const isOnline = participant?.isOnline ?? participant?.is_online;
      const lastSeenAt = participant?.lastSeenAt ?? participant?.last_seen_at;
      if (participantId && (isOnline === true || isOnline === false)) {
        item.presence = {
          state: isOnline ? 'online' : 'offline',
          ...(lastSeenAt ? { lastSeenAt: boundedText(lastSeenAt, 80) } : {})
        };
      }
      return item;
    })
    .filter(Boolean) as Record<string, unknown>[];

  return {
    bridgeVersion: '2',
    requestId: boundedText(requestId, 80),
    kind: 'snapshot',
    sessionBinding,
    revision: Math.max(0, Number(revision) || 0),
    items,
    unreadCount: items.reduce((sum, item) => sum + Number(item.unreadCount || 0), 0),
    hasMore: source.length > MAX_MESSAGE_ITEMS,
    serverTime: new Date().toISOString()
  };
};
