export type NativeCapabilities = {
  bridgeVersion?: string;
  nativeNotifications?: boolean;
  nativeNavigationPilot?: boolean;
  nativeNavigation?: boolean;
};

export type ScrolithNativeBridge = {
  getBridgeVersion?: () => string;
  getCapabilities?: () => string;
  openNativeNotifications?: () => void;
  closeNativeNotifications?: () => void;
  postEvent?: (eventName: string, payloadJson: string) => void;
};

const MAX_TEXT_LENGTH = 600;
const MAX_ITEMS = 40;
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
