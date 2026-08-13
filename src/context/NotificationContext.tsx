import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Notification } from '../types';
import { getRecoverableActionMessage, isOfflineLikeError } from '../mobile/runtime/requestRecovery';
import { useNetworkStatus } from './NetworkStatusContext';
import { useUser } from './UserContext';
import { useSocket } from './SocketContext';
import { NotificationService, notificationsApi } from '../services/notifications';
import {
  formatNotificationTitleWithCategory,
  getNotificationCategoryMeta
} from '../utils/notificationTaxonomy';
import { isLoginApprovalNotification, openLoginApprovalNotification } from '../utils/notificationRouting';

type NotificationItem = Notification & {
  dismissed?: boolean;
  localOnly?: boolean;
  timestamp?: string;
  action_url?: string;
  is_read?: boolean;
  actorId?: string | null;
  actorName?: string | null;
  actorAvatar?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  parentId?: string | null;
  metadata?: Record<string, any>;
  category?: string;
  categoryLabel?: string;
};

interface NotificationContextType {
  notifications: NotificationItem[];
  toasts: NotificationItem[];
  addNotification: (notification: any) => void;
  removeNotification: (id: string) => void;
  markAsRead: (id: string) => void;
  clearNotifications: () => void;
  refreshNotifications: (options?: { force?: boolean }) => Promise<void>;
  showNotification: (type: 'success' | 'error' | 'warning' | 'info' | 'alert', title: string, message: string, actionUrl?: string, durationMs?: number) => void;
  syncState: 'idle' | 'loading' | 'ready' | 'offline' | 'error' | 'retrying';
  error: string | null;
  lastSyncedAt: number | null;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useUser();
  const { socket, isConnected, connectionHealth } = useSocket();
  const { isOnline, recoveryTick } = useNetworkStatus();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<NotificationItem[]>([]);
  const [syncState, setSyncState] = useState<NotificationContextType['syncState']>('idle');
  const [error, setError] = useState<string | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const pollRef = useRef<number | null>(null);
  const inFlightRefreshRef = useRef<Promise<void> | null>(null);
  const lastRefreshAtRef = useRef(0);
  const recentSocketNotificationRef = useRef<Map<string, number>>(new Map());
  const REFRESH_MIN_INTERVAL_MS = 20_000;

  const getRoleBasePath = useCallback((role?: string) => {
    const r = String(role || '').toLowerCase();
    if (r.includes('admin')) return '/admin/dashboard';
    if (r.includes('freelancer')) return '/freelancer/dashboard';
    if (r.includes('employer') || r.includes('client')) return '/client/dashboard';
    return '/dashboard';
  }, []);

  const normalizeNotification = useCallback((raw: any, overrides: Partial<NotificationItem> = {}): NotificationItem => {
    const id = String(raw?.id ?? overrides.id ?? `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
    const message = String(raw?.message ?? raw?.body ?? raw?.text ?? overrides.message ?? 'Tap to view details.');
    const type = (raw?.type ?? overrides.type ?? 'info') as Notification['type'];
    const metadata = (raw?.metadata && typeof raw.metadata === 'object' ? raw.metadata : raw?.meta && typeof raw.meta === 'object' ? raw.meta : {}) as Record<string, any>;
    const categoryMeta = getNotificationCategoryMeta({
      type,
      category: raw?.category ?? metadata.category,
      entityType: raw?.entityType ?? raw?.entity_type ?? metadata.entityType,
      title: raw?.title ?? raw?.subject,
      metadata
    });
    const rawTitle = String(raw?.title ?? raw?.subject ?? overrides.title ?? 'Notification');
    const title = formatNotificationTitleWithCategory(rawTitle, {
      type,
      category: categoryMeta.key,
      entityType: raw?.entityType ?? raw?.entity_type ?? metadata.entityType,
      title: rawTitle,
      metadata
    });
    const actionUrl = (raw?.actionUrl ?? raw?.action_url ?? raw?.link ?? raw?.url ?? overrides.actionUrl) as string | undefined;
    const timestamp = String(raw?.timestamp ?? raw?.created_at ?? raw?.createdAt ?? raw?.created_at ?? new Date().toISOString());
    const isRead = Boolean(raw?.isRead ?? raw?.is_read ?? overrides.isRead ?? false);
    return {
      id,
      title,
      message,
      type,
      timestamp,
      isRead,
      is_read: isRead,
      actionUrl,
      action_url: actionUrl,
      actorId: raw?.actorId ?? raw?.actor_id ?? metadata.actorId ?? null,
      actorName: raw?.actorName ?? raw?.actor_name ?? metadata.actorName ?? null,
      actorAvatar: raw?.actorAvatar ?? raw?.actor_avatar ?? metadata.actorAvatar ?? null,
      entityType: raw?.entityType ?? raw?.entity_type ?? metadata.entityType ?? null,
      entityId: raw?.entityId ?? raw?.entity_id ?? metadata.entityId ?? null,
      parentId: raw?.parentId ?? raw?.parent_id ?? metadata.parentId ?? null,
      metadata: {
        ...metadata,
        category: categoryMeta.key,
        categoryLabel: categoryMeta.label
      },
      localOnly: overrides.localOnly ?? raw?.localOnly ?? false,
      category: categoryMeta.key,
      categoryLabel: categoryMeta.label
    };
  }, []);

  const pushToast = useCallback((notification: NotificationItem, durationMs?: number) => {
    setToasts(prev => {
      const withoutDuplicate = prev.filter((item) => item.id !== notification.id);
      return [notification, ...withoutDuplicate].slice(0, 5);
    });
    const duration = typeof durationMs === 'number' ? durationMs : 2500;
    if (duration > 0) {
      setTimeout(() => {
        setToasts(prev => prev.map(n => n.id === notification.id ? { ...n, dismissed: true } : n));
        setTimeout(() => {
          setToasts(prev => prev.filter(n => n.id !== notification.id));
        }, 300);
      }, duration);
    }
  }, []);

  const addNotification = useCallback((notificationData: any) => {
    const persist = notificationData?.persist !== false;
    const toast = notificationData?.toast === true;
    const normalized = normalizeNotification(notificationData, {
      localOnly: notificationData?.localOnly ?? notificationData?.id?.toString().startsWith('local-')
    });

    if (persist) {
      setNotifications(prev => {
        const existingIndex = prev.findIndex(n => n.id === normalized.id);
        if (existingIndex >= 0) {
          const next = [...prev];
          next[existingIndex] = { ...next[existingIndex], ...normalized };
          return next;
        }
        return [normalized, ...prev].slice(0, 100);
      });
    }

    if (toast) {
      pushToast(normalized, notificationData?.durationMs);
    }
  }, [normalizeNotification, pushToast]);

  const removeNotification = useCallback((id: string) => {
    setToasts(prev => prev.map(n => n.id === id ? { ...n, dismissed: true } : n));
    setTimeout(() => {
      setToasts(prev => prev.filter(n => n.id !== id));
    }, 300);
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true, is_read: true } : n));
    if (id.toString().startsWith('local-')) return;
    notificationsApi.markAsRead(id).catch(() => {});
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const refreshNotifications = useCallback(async (options?: { force?: boolean }) => {
    if (!isAuthenticated) return;
    if (!isOnline && !options?.force) {
      setError('Notifications are paused while you are offline.');
      setSyncState('offline');
      return;
    }
    if (!options?.force && Date.now() - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL_MS) {
      return;
    }
    if (inFlightRefreshRef.current) {
      return inFlightRefreshRef.current;
    }

    const request = (async () => {
      try {
        setError(null);
        setSyncState(options?.force ? 'retrying' : 'loading');
        const raw = await NotificationService.getAll({ limit: 80 });
        const serverList = Array.isArray(raw) ? raw.map((n: any) => normalizeNotification(n)) : [];
        setNotifications(prev => {
          const locals = prev.filter(n => n.localOnly);
          const merged = [...serverList];
          const seen = new Set(merged.map(n => n.id));
          locals.forEach(n => {
            if (!seen.has(n.id)) merged.push(n);
          });
          return merged.slice(0, 100);
          });
        const refreshedAt = Date.now();
        lastRefreshAtRef.current = refreshedAt;
        setLastSyncedAt(refreshedAt);
        setSyncState('ready');
      } catch (error) {
        setError(getRecoverableActionMessage('Notification sync', error));
        setSyncState(isOfflineLikeError(error) ? 'offline' : 'error');
      }
    })();

    inFlightRefreshRef.current = request.finally(() => {
      inFlightRefreshRef.current = null;
    });

    return inFlightRefreshRef.current;
  }, [isAuthenticated, isOnline, normalizeNotification]);

  const showNotification = useCallback((
    type: 'success' | 'error' | 'warning' | 'info' | 'alert',
    title: string,
    message: string,
    actionUrl?: string,
    durationMs?: number
  ) => {
    addNotification({ type, title, message, actionUrl, durationMs, toast: true, persist: false, localOnly: true });
  }, [addNotification]);

  const showMessageReceiptNotification = useCallback((payload: any, options?: { persist?: boolean }) => {
    const messagePreview = String(payload?.text ?? payload?.body ?? payload?.message ?? '').trim();
    const conversationId = String(
      payload?.conversation_id ??
      payload?.conversationId ??
      payload?.metadata?.conversationId ??
      payload?.meta?.conversationId ??
      payload?.data?.conversationId ??
      ''
    ).trim();
    const messageId = String(
      payload?.id ??
      payload?.messageId ??
      payload?.message_id ??
      payload?.metadata?.messageId ??
      payload?.meta?.messageId ??
      payload?.data?.messageId ??
      ''
    ).trim();
    const basePath = getRoleBasePath(user?.role);
    const isAdmin = String(user?.role || '').toLowerCase().includes('admin');
    const actionUrl = isAdmin
      ? `${basePath}?tab=messages`
      : conversationId
        ? `/messages/${encodeURIComponent(conversationId)}`
        : '/messages';

    addNotification({
      id: messageId ? `local-message-${messageId}` : undefined,
      type: 'info',
      title: 'New message',
      message: messagePreview || 'You received a new message.',
      actionUrl,
      toast: true,
      persist: options?.persist === true,
      localOnly: true
    });
    if (isLoginApprovalNotification({ ...payload, metadata: data })) {
      openLoginApprovalNotification({ ...payload, metadata: data });
    }
  }, [addNotification, getRoleBasePath, user?.role]);

  const showForegroundPushNotification = useCallback((payload: any) => {
    const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};
    const normalizedType = String(
      payload?.type ??
      data?.type ??
      payload?.notificationType ??
      'info'
    ).trim().toLowerCase();

    if (normalizedType === 'message' || normalizedType === 'new_message') {
      showMessageReceiptNotification(payload, { persist: true });
      return;
    }

    const notificationId =
      payload?.id ||
      data?.notificationId ||
      data?.id ||
      (data?.campaignId ? `local-campaign-${data.campaignId}` : undefined) ||
      (data?.postId ? `local-post-${normalizedType}-${data.postId}` : undefined);
    const actionUrl =
      payload?.actionUrl ||
      payload?.action_url ||
      payload?.link ||
      data?.actionUrl ||
      data?.action_url ||
      data?.link ||
      data?.deepLink ||
      data?.deeplink ||
      data?.url;

    addNotification({
      id: notificationId,
      type: normalizedType || 'info',
      title: payload?.title || data?.title || 'Scrolith',
      message: payload?.message || payload?.body || data?.body || data?.message || 'You have a new notification.',
      actionUrl,
      metadata: data,
      toast: true,
      persist: true,
      localOnly: true
    });
  }, [addNotification, showMessageReceiptNotification]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      setNotifications([]);
      setError(null);
      setSyncState('idle');
      setLastSyncedAt(null);
      return;
    }
    void refreshNotifications({ force: true });
  }, [isAuthenticated, user?.id, refreshNotifications]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    if (!isOnline || recoveryTick <= 0) return;
    void refreshNotifications({ force: true });
    // Phase 32.3 — flush offline notification actions + recover badge on reconnect
    void import('../mobile/notificationSync').then(({ flushNotificationOfflineQueue, fetchAndApplySyncState }) => {
      void flushNotificationOfflineQueue().then(() => fetchAndApplySyncState());
    });
  }, [isAuthenticated, user?.id, isOnline, recoveryTick, refreshNotifications]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    if (!isOnline || connectionHealth === 'offline') {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    // Healthy socket: no notification polling.
    if (isConnected || connectionHealth === 'connected') {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }

    // Brief reconnect: do not start polling immediately.
    if (connectionHealth === 'connecting' || connectionHealth === 'reconnecting') {
      return;
    }

    if (pollRef.current) return;
    pollRef.current = window.setInterval(() => refreshNotifications(), 45000);

    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [socket, isConnected, connectionHealth, isAuthenticated, user?.id, refreshNotifications, isOnline]);

  // Phase 32.3 — multi-session badge / focus / preference sync
  useEffect(() => {
    if (!socket || !isAuthenticated || !user?.id) return;
    let unbind: (() => void) | undefined;
    void import('../mobile/notificationSync').then(({ bindNotificationSyncSocket, fetchAndApplySyncState }) => {
      unbind = bindNotificationSyncSocket(socket);
      void fetchAndApplySyncState();
    });
    const onBadgeHint = (ev: Event) => {
      const detail = (ev as CustomEvent)?.detail;
      if (detail && typeof detail.badgeCount === 'number') {
        void import('../mobile/notificationSync').then(({ applyRemoteSync, getLocalSyncVersion }) => {
          applyRemoteSync({
            badgeCount: detail.badgeCount,
            unreadCount: detail.badgeCount,
            version: getLocalSyncVersion(),
            serverTime: new Date().toISOString()
          });
        });
      }
    };
    window.addEventListener('notifications:badge-hint', onBadgeHint);
    return () => {
      unbind?.();
      window.removeEventListener('notifications:badge-hint', onBadgeHint);
    };
  }, [socket, isAuthenticated, user?.id]);

  useEffect(() => {
    if (!socket || !isAuthenticated || !user?.id) return;

    const onNotificationsNew = (payload: any) => {
      const normalized = normalizeNotification(payload);
      const id = String(normalized.id || '').trim();
      if (id) {
        const now = Date.now();
        const lastSeen = recentSocketNotificationRef.current.get(id) || 0;
        if (now - lastSeen < 5000) return;
        recentSocketNotificationRef.current.set(id, now);
        if (recentSocketNotificationRef.current.size > 500) {
          const cutoff = now - 120000;
          for (const [key, ts] of recentSocketNotificationRef.current.entries()) {
            if (ts < cutoff) recentSocketNotificationRef.current.delete(key);
          }
        }
      }
      const normalizedType = String(normalized.type || '').trim().toLowerCase();
      addNotification({
        ...payload,
        toast: normalizedType !== 'message' && normalizedType !== 'new_message',
        persist: true
      });
      if (isLoginApprovalNotification(normalized)) {
        openLoginApprovalNotification(normalized);
      }
    };

    const onMessagesNew = (payload: any) => {
      showMessageReceiptNotification(payload);
    };

    const onOrdersUpdated = (payload: any) => {
      const orderId = payload?.orderId || payload?.order_id || '';
      const status = payload?.status || payload?.newStatus || payload?.state || 'updated';
      const query = orderId ? `?tab=orders&order_id=${encodeURIComponent(String(orderId))}` : '?tab=orders';
      addNotification({
        id: orderId ? `local-order-${orderId}-${status}` : undefined,
        type: 'info',
        title: 'Order update',
        message: orderId ? `Order ${orderId} is ${status}.` : 'An order was updated.',
        actionUrl: isAdmin ? `${basePath}?tab=overview` : `${basePath}${query}`,
        toast: true,
        persist: true,
        localOnly: true
      });
    };

    const onGcoinTransaction = (payload: any) => {
      const tx = payload?.tx || payload;
      const txId = tx?.id || tx?.txId || tx?.referenceId;
      const amount = tx?.amount ?? payload?.amount;
      const label = amount ? `${amount} Gcoin` : 'Gcoin transaction';
      addNotification({
        id: txId ? `local-gcoin-${txId}` : undefined,
        type: 'info',
        title: 'Gcoin activity',
        message: `New ${label} activity.`,
        actionUrl: isAdmin ? `${basePath}?tab=community` : `${basePath}?tab=gcoin`,
        toast: true,
        persist: true,
        localOnly: true
      });
    };

    const onGcoinConversion = (payload: any, statusOverride?: string) => {
      const convId = payload?.id || payload?.conversionId || payload?.requestId;
      const status = statusOverride || payload?.status || 'updated';
      addNotification({
        id: convId ? `local-gcoin-conversion-${convId}-${status}` : undefined,
        type: 'info',
        title: 'Gcoin conversion',
        message: `Conversion ${status}.`,
        actionUrl: isAdmin ? `${basePath}?tab=community` : `${basePath}?tab=gcoin`,
        toast: true,
        persist: true,
        localOnly: true
      });
    };

    const onGcoinConversionProcessed = (payload: any) => onGcoinConversion(payload, payload?.status || 'processed');

    const onBalanceUpdate = (payload: any, label: string) => {
      const stamp = payload?.timestamp || payload?.time || Date.now();
      addNotification({
        id: `local-wallet-${label}-${stamp}`,
        type: 'info',
        title: 'Wallet update',
        message: `${label} balance updated.`,
        actionUrl: isAdmin ? `${basePath}?tab=finance` : `${basePath}?tab=wallet`,
        toast: true,
        persist: true,
        localOnly: true
      });
    };

    const onGcoinBalanceUpdated = (payload: any) => onBalanceUpdate(payload, 'Gcoin');
    const onFiatBalanceUpdated = (payload: any) => onBalanceUpdate(payload, 'Fiat');

    const onKycUpdated = (payload: any) => {
      const status = payload?.status || 'updated';
      addNotification({
        id: `local-kyc-${payload?.userId || user.id}-${status}`,
        type: 'info',
        title: 'KYC update',
        message: `Your KYC status is ${status}.`,
        actionUrl: isAdmin ? `${basePath}?tab=kyc` : `${basePath}?tab=kyc`,
        toast: true,
        persist: true,
        localOnly: true
      });
    };
    const onKycSubmitted = () => onKycUpdated({ status: 'submitted', userId: user.id });

    socket.on('notifications:new', onNotificationsNew);
    socket.on('messages:new', onMessagesNew);
    socket.on('orders:updated', onOrdersUpdated);
    socket.on('community:gcoin_transaction_created', onGcoinTransaction);
    socket.on('community:gcoin_conversion_requested', onGcoinConversion);
    socket.on('community:gcoin_conversion_processed', onGcoinConversionProcessed);
    socket.on('community:gcoin_balance_updated', onGcoinBalanceUpdated);
    socket.on('community:fiat_balance_updated', onFiatBalanceUpdated);
    socket.on('kyc.updated', onKycUpdated);
    socket.on('kyc.submitted', onKycSubmitted);

    return () => {
      socket.off('notifications:new', onNotificationsNew);
      socket.off('messages:new', onMessagesNew);
      socket.off('orders:updated', onOrdersUpdated);
      socket.off('community:gcoin_transaction_created', onGcoinTransaction);
      socket.off('community:gcoin_conversion_requested', onGcoinConversion);
      socket.off('community:gcoin_conversion_processed', onGcoinConversionProcessed);
      socket.off('community:gcoin_balance_updated', onGcoinBalanceUpdated);
      socket.off('community:fiat_balance_updated', onFiatBalanceUpdated);
      socket.off('kyc.updated', onKycUpdated);
      socket.off('kyc.submitted', onKycSubmitted);
    };
  }, [socket, isAuthenticated, user?.id, addNotification, normalizeNotification, showMessageReceiptNotification]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;

    const onMobilePushReceived = (event: Event) => {
      const payload = (event as CustomEvent<any>)?.detail;
      const type = String(
        payload?.type ??
        payload?.data?.type ??
        payload?.notificationType ??
        ''
      ).trim().toLowerCase();
      if (!type) return;
      showForegroundPushNotification(payload);
    };

    window.addEventListener('mobile:push-notification-received', onMobilePushReceived as EventListener);
    return () => {
      window.removeEventListener('mobile:push-notification-received', onMobilePushReceived as EventListener);
    };
  }, [isAuthenticated, user?.id, showForegroundPushNotification]);

  const contextValue = useMemo(() => ({
    notifications,
    toasts,
    addNotification,
    removeNotification,
    markAsRead,
    clearNotifications,
    refreshNotifications,
    showNotification,
    syncState,
    error,
    lastSyncedAt
  }), [
    notifications,
    toasts,
    addNotification,
    removeNotification,
    markAsRead,
    clearNotifications,
    refreshNotifications,
    showNotification,
    syncState,
    error,
    lastSyncedAt
  ]);

  return (
    <NotificationContext.Provider value={contextValue}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = (): NotificationContextType => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};
