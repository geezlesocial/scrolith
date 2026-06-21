
import React, { createContext, useContext, useState, useEffect } from 'react';
import { MessagingService } from '../services/messaging';
import { useUser } from './UserContext';

interface MessageContextType {
  unreadCount: number;
  refreshMessages: () => void;
}

const MessageContext = createContext<MessageContextType | undefined>(undefined);

export const MessageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useUser();
  const [unreadCount, setUnreadCount] = useState(0);

  const refreshMessages = async () => {
      if (user) {
          const convos = await MessagingService.getAllConversations(user.id, user.role);
          // Calculate total unread messages directed at user
          let count = 0;
          convos.forEach(c => {
              // Simple logic: if conversation has unread count and last message wasn't from me
              const lastMsg = c.messages[c.messages.length - 1];
              if (lastMsg && lastMsg.senderId !== user.id && !lastMsg.isRead) {
                  count += c.unreadCount || 0;
              }
          });
          setUnreadCount(count);
      }
  };

  useEffect(() => {
      refreshMessages();
      // Poll for new messages every 10s (simulating real-time)
      const interval = setInterval(refreshMessages, 10000);
      return () => clearInterval(interval);
  }, [user]);

  return (
    <MessageContext.Provider value={{ unreadCount, refreshMessages }}>
      {children}
    </MessageContext.Provider>
  );
};

export const useMessages = () => {
  const context = useContext(MessageContext);
  if (!context) throw new Error('useMessages must be used within MessageProvider');
  return context;
};
