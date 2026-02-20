import React, { createContext, useContext, useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { Notification } from '../types';
import { useUser } from './UserContext';
import { useSocket } from './SocketContext';
import { NotificationService, notificationsApi } from '../services/notifications';

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
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated } = useUser();
  const { socket } = useSocket();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [toasts, setToasts] = useState<NotificationItem[]>([]);
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
    const title = String(raw?.title ?? raw?.subject ?? overrides.title ?? 'Notification');
    const message = String(raw?.message ?? raw?.body ?? raw?.text ?? overrides.message ?? title ?? 'Tap to view details.');
    const type = (raw?.type ?? overrides.type ?? 'info') as Notification['type'];
    const metadata = (raw?.metadata && typeof raw.metadata === 'object' ? raw.metadata : raw?.meta && typeof raw.meta === 'object' ? raw.meta : {}) as Record<string, any>;
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
      metadata,
      localOnly: overrides.localOnly ?? raw?.localOnly ?? false
    };
  }, []);

  const pushToast = useCallback((notification: NotificationItem, durationMs?: number) => {
    setToasts(prev => [notification, ...prev.slice(0, 4)]);
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
    if (!options?.force && Date.now() - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL_MS) {
      return;
    }
    if (inFlightRefreshRef.current) {
      return inFlightRefreshRef.current;
    }

    const request = (async () => {
      try {
        const raw = await NotificationService.getAll();
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
        lastRefreshAtRef.current = Date.now();
      } catch {
        // ignore
      }
    })();

    inFlightRefreshRef.current = request.finally(() => {
      inFlightRefreshRef.current = null;
    });

    return inFlightRefreshRef.current;
  }, [isAuthenticated, normalizeNotification]);

  const showNotification = useCallback((
    type: 'success' | 'error' | 'warning' | 'info' | 'alert',
    title: string,
    message: string,
    actionUrl?: string,
    durationMs?: number
  ) => {
    addNotification({ type, title, message, actionUrl, durationMs, toast: true, persist: false, localOnly: true });
  }, [addNotification]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      setNotifications([]);
      return;
    }
    void refreshNotifications({ force: true });
  }, [isAuthenticated, user?.id, refreshNotifications]);

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return;
    if (!socket) {
      if (pollRef.current) return;
      pollRef.current = window.setInterval(() => refreshNotifications(), 45000);
      return;
    }

    const handleConnect = () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      void refreshNotifications({ force: true });
    };

    const handleDisconnect = () => {
      if (pollRef.current) return;
      pollRef.current = window.setInterval(() => refreshNotifications(), 45000);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    if (socket.connected) handleConnect();

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [socket, isAuthenticated, user?.id, refreshNotifications]);

  useEffect(() => {
    if (!socket || !isAuthenticated || !user?.id) return;
    const basePath = getRoleBasePath(user.role);
    const isAdmin = String(user.role).toLowerCase().includes('admin');

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
      addNotification({ ...payload, toast: true, persist: true });
    };

    const onMessagesNew = (payload: any) => {
      const messagePreview = String(payload?.text || '').trim();
      addNotification({
        id: payload?.id ? `local-message-${payload.id}` : undefined,
        type: 'info',
        title: 'New message',
        message: messagePreview || 'You received a new message.',
        actionUrl: isAdmin ? `${basePath}?tab=messages` : '/messages',
        toast: true,
        persist: true,
        localOnly: true
      });
    };

    const onOrdersUpdated = (payload: any) => {
      const orderId = payload?.orderId || payload?.order_id || '';
      const status = payload?.status || payload?.newStatus || payload?.state || 'updated';
      addNotification({
        id: orderId ? `local-order-${orderId}-${status}` : undefined,
        type: 'info',
        title: 'Order update',
        message: orderId ? `Order ${orderId} is ${status}.` : 'An order was updated.',
        actionUrl: isAdmin ? `${basePath}?tab=overview` : `${basePath}?tab=orders`,
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
  }, [socket, isAuthenticated, user?.id, user?.role, addNotification, getRoleBasePath]);

  const contextValue = useMemo(() => ({
    notifications,
    toasts,
    addNotification,
    removeNotification,
    markAsRead,
    clearNotifications,
    refreshNotifications,
    showNotification
  }), [notifications, toasts, addNotification, removeNotification, markAsRead, clearNotifications, refreshNotifications, showNotification]);

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
