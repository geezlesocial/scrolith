
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { Conversation } from '../types';
import { MessagingService } from '../services/messaging';
import { useNetworkStatus } from './NetworkStatusContext';
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
  const { isOnline, recoveryTick } = useNetworkStatus();
  const [unreadCount, setUnreadCount] = useState(0);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlightRefreshRef = useRef<Promise<void> | null>(null);
  const lastRefreshAtRef = useRef(0);
  const REFRESH_MIN_INTERVAL_MS = 15_000;

  const refreshMessages = useCallback(async (options?: { force?: boolean }) => {
    if (!user?.id) {
      setUnreadCount(0);
      setConversations([]);
      setError(null);
      return;
    }

    if (!isOnline && !options?.force) {
      setLoading(false);
      return;
    }

    if (!options?.force && Date.now() - lastRefreshAtRef.current < REFRESH_MIN_INTERVAL_MS) {
      return;
    }

    if (inFlightRefreshRef.current) {
      return inFlightRefreshRef.current;
    }

    const request = (async () => {
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
        lastRefreshAtRef.current = Date.now();
      } catch (e: any) {
        setError(e?.response?.data?.error || e?.message || 'Failed to refresh messages');
      } finally {
        setLoading(false);
      }
    })();

    inFlightRefreshRef.current = request.finally(() => {
      inFlightRefreshRef.current = null;
    });

    return inFlightRefreshRef.current;
  }, [user?.id, user?.role, isOnline]);

  useEffect(() => {
    if (!user?.id) {
      setUnreadCount(0);
      setConversations([]);
      setError(null);
      return;
    }
    void refreshMessages();
    if (!isOnline) {
      return;
    }

    if (!socket || !isConnected) {
      const interval = window.setInterval(() => {
        void refreshMessages();
      }, 30_000);
      return () => window.clearInterval(interval);
    }

    const handleRefresh = () => {
      void refreshMessages({ force: true });
    };

    socket.on('messages:new', handleRefresh);
    socket.on('messages:sent', handleRefresh);
    socket.on('messages:read', handleRefresh);

    return () => {
      socket.off('messages:new', handleRefresh);
      socket.off('messages:sent', handleRefresh);
      socket.off('messages:read', handleRefresh);
    };
  }, [user?.id, socket, isConnected, refreshMessages, isOnline]);

  useEffect(() => {
    if (!user?.id || !isOnline || recoveryTick <= 0) return;
    void refreshMessages({ force: true });
  }, [user?.id, isOnline, recoveryTick, refreshMessages]);

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
