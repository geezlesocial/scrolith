
import React, { createContext, useContext, useState, useEffect } from 'react';
import type { Conversation } from '../types';
import { MessagingService } from '../services/messaging';
import { useUser } from './UserContext';
import { useSocket } from './SocketContext';

interface MessageContextType {
  unreadCount: number;
  conversations: Conversation[];
  loading: boolean;
  error: string | null;
  refreshMessages: (options?: { force?: boolean }) => Promise<void>;
}

const MessageContext = createContext<MessageContextType | undefined>(undefined);

export const MessageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useUser();
  const { socket, isConnected } = useSocket();
  const [unreadCount, setUnreadCount] = useState(0);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshMessages = async (options?: { force?: boolean }) => {
    if (!user?.id) {
      setUnreadCount(0);
      setConversations([]);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const convos = await MessagingService.getAllConversations(user.id, user.role, {
        force: Boolean(options?.force)
      });
      setConversations(convos);
      const count = (Array.isArray(convos) ? convos : []).reduce((acc, c: any) => {
        const v = Number(c?.unreadCount ?? c?.unread_count ?? 0);
        return acc + (Number.isFinite(v) ? Math.max(0, Math.trunc(v)) : 0);
      }, 0);
      setUnreadCount(count);
    } catch (e: any) {
      setError(e?.response?.data?.error || e?.message || 'Failed to refresh messages');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
      if (!user) return;
      void refreshMessages();

      if (!socket || !isConnected) {
          const interval = setInterval(() => {
            void refreshMessages();
          }, 10000);
          return () => clearInterval(interval);
      }

      const handleRefresh = () => {
          void refreshMessages();
      };

      socket.on('messages:new', handleRefresh);
      socket.on('messages:sent', handleRefresh);
      socket.on('messages:read', handleRefresh);

      return () => {
          socket.off('messages:new', handleRefresh);
          socket.off('messages:sent', handleRefresh);
          socket.off('messages:read', handleRefresh);
      };
  }, [user, socket, isConnected]);

  return (
    <MessageContext.Provider value={{ unreadCount, conversations, loading, error, refreshMessages }}>
      {children}
    </MessageContext.Provider>
  );
};

export const useMessages = () => {
  const context = useContext(MessageContext);
  if (!context) throw new Error('useMessages must be used within MessageProvider');
  return context;
};
