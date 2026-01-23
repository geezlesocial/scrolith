import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { Notification } from '../types';

interface NotificationContextType {
  notifications: Notification[];
  addNotification: (notification: any) => void;
  markAsRead: (id: string) => void;
  clearNotifications: () => void;
  showNotification: (type: 'success' | 'error' | 'warning' | 'info' | 'alert', title: string, message: string, actionUrl?: string) => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const addNotification = useCallback((notificationData: any) => {
    const newNotification: Notification = {
      id: `notif-${Date.now()}`,
      title: notificationData.title,
      message: notificationData.message,
      type: notificationData.type,
      timestamp: new Date().toISOString(),
      // provide both snake_case and camelCase for compatibility
      isRead: false,
      is_read: false as any,
      actionUrl: notificationData.actionUrl,
      action_url: notificationData.actionUrl
    } as any;
    
    setNotifications(prev => [newNotification, ...prev.slice(0, 9)]); // Keep only latest 10
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
    actionUrl?: string
  ) => {
    addNotification({ type, title, message, actionUrl });
  }, [addNotification]);

  const contextValue = useMemo(() => ({
    notifications,
    addNotification,
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
