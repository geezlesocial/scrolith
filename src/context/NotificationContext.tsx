
import React, { createContext, useContext, useState, useCallback } from 'react';
import { Notification } from '../types';

interface NotificationContextType {
  notifications: Notification[];
  showNotification: (type: Notification['type'], title: string, message: string, actionUrl?: string, entityId?: string) => void;
  markAsRead: (id: string) => void;
  clearAll: () => void;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [visibleToasts, setVisibleToasts] = useState<Notification[]>([]);

  const showNotification = useCallback((type: Notification['type'], title: string, message: string, actionUrl?: string, entityId?: string) => {
    const newNotification: Notification = {
      id: Math.random().toString(36).substr(2, 9),
      type,
      title,
      message,
      actionUrl,
      entityId,
      isRead: false,
      timestamp: new Date().toISOString()
    };
    
    // Add to persistent history
    setNotifications(prev => [newNotification, ...prev]);
    
    // Add to active visual toasts
    setVisibleToasts(prev => [newNotification, ...prev]);
    
    // Auto remove visual toast after 5 seconds
    setTimeout(() => {
      setVisibleToasts(prev => prev.filter(n => n.id !== newNotification.id));
    }, 5000);
  }, []);

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
  };

  const clearAll = () => setNotifications([]);

  return (
    <NotificationContext.Provider value={{ notifications, showNotification, markAsRead, clearAll }}>
      {children}
      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-50 space-y-2 pointer-events-none">
        {visibleToasts.map(n => (
            <div key={n.id} className={`pointer-events-auto w-80 p-4 rounded-lg shadow-lg border-l-4 transform transition-all duration-500 ease-in-out ${
                n.type === 'success' ? 'bg-white border-green-500' :
                n.type === 'alert' ? 'bg-white border-red-500' :
                'bg-white border-blue-500'
            } animate-fade-in-down`}>
              <h4 className="font-semibold text-gray-800">{n.title}</h4>
              <p className="text-sm text-gray-600">{n.message}</p>
            </div>
        ))}
      </div>
      <style>{`
        @keyframes fade-in-down {
          0% { opacity: 0; transform: translateY(-20px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in-down {
          animation: fade-in-down 0.3s ease-out forwards;
        }
      `}</style>
    </NotificationContext.Provider>
  );
};

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotification must be used within NotificationProvider');
  return context;
};
