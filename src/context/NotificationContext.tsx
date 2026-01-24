import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { Notification } from '../types';

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (notification: any) => void;
  removeNotification: (id: string) => void;
  markAsRead: (id: string) => void;
  clearNotifications: () => void;
  showNotification: (type: 'success' | 'error' | 'warning' | 'info' | 'alert', title: string, message: string, actionUrl?: string, durationMs?: number) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((notificationData: any) => {
    const newNotification: Notification = {
      id: `notif-${Date.now()}`,
      title: String(notificationData.title ?? ''),
      message: String(notificationData.message ?? ''),
      type: (notificationData.type as Notification['type']) ?? 'info',
      timestamp: new Date().toISOString(),
      isRead: false,
      is_read: false,
      actionUrl: notificationData.actionUrl as string | undefined,
      action_url: notificationData.actionUrl as string | undefined
    };

    setNotifications(prev => [newNotification, ...prev.slice(0, 9)]); // Keep only latest 10

    // Auto-dismiss notifications after the configured duration (default 2000ms)
    const duration = typeof notificationData.durationMs === 'number' ? notificationData.durationMs : 2000;
    if (duration > 0) {
      setTimeout(() => {
        // Mark as dismissed to allow exit animation in UI
        setNotifications(prev => prev.map(n => n.id === newNotification.id ? { ...n, dismissed: true } : n));
        // Remove from list after short exit animation (300ms)
        setTimeout(() => {
          setNotifications(prev => prev.filter(n => n.id !== newNotification.id));
        }, 300);
      }, duration);
    }
  }, []);

  const removeNotification = useCallback((id: string) => {
    // Trigger dismiss animation then remove
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, dismissed: true } : n));
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 300);
  }, []);

  const markAsRead = useCallback((id: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, isRead: true, is_read: true } : n)
    );
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const showNotification = useCallback((
    type: 'success' | 'error' | 'warning' | 'info' | 'alert', 
    title: string, 
    message: string, 
    actionUrl?: string,
    durationMs?: number
  ) => {
    addNotification({ type, title, message, actionUrl, durationMs });
  }, [addNotification]);

  const contextValue = useMemo(() => ({
    notifications,
    addNotification,
    removeNotification,
    markAsRead,
    clearNotifications,
    showNotification
  }), [notifications, addNotification, markAsRead, clearNotifications, showNotification]);

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
