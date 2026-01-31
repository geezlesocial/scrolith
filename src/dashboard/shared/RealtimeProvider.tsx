import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useUser } from '../../context/UserContext';
import { UserRole } from '../../types';
import { useSocket } from '../../context/SocketContext';
import { notificationsApi as NotificationsService } from '../../services/notifications';
import { MessagingService } from '../../services/messaging';
import { ordersApi as OrdersService } from '../../services/orders';
import { ContractService } from '../../services/contract';
import { walletApi as WalletApi } from '../../services/wallet';

type RealtimeContextType = {
  socketConnected: boolean;
};

const RealtimeContext = createContext<RealtimeContextType>({ socketConnected: false });

const normalizeRole = (role?: string) => {
  if (!role) return undefined;
  const normalized = role.toString().toLowerCase();
  if (normalized.includes('employ') || normalized.includes('client')) return 'client';
  return normalized;
};

export const RealtimeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, isAuthenticated, updateAdminProfile, updateUser } = useUser();
  const { socket } = useSocket();
  const [socketConnected, setSocketConnected] = useState(false);
  const pollRef = useRef<number | null>(null);

  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = window.setInterval(async () => {
      if (!user) return;
      const roleStr = normalizeRole(String(user.role));
      const messagingRole = roleStr === 'freelancer' ? UserRole.FREELANCER : roleStr === 'client' ? UserRole.EMPLOYER : roleStr === 'admin' ? UserRole.ADMIN : UserRole.GUEST;
      const contractRole = roleStr === 'client' ? 'client' : roleStr === 'freelancer' ? 'freelancer' : roleStr === 'admin' ? 'admin' : 'client';
      await Promise.allSettled([
        NotificationsService.getUnreadCount?.(),
        MessagingService.getAllConversations?.(user.id, messagingRole),
        OrdersService.getOrders?.({ ownerId: 'me', role: contractRole, limit: 1 }),
        ContractService.getContracts?.(user.id, contractRole),
        WalletApi.getWalletInfo?.(),
      ]);
    }, 45000);
  };

  const stopPolling = () => {
    if (!pollRef.current) return;
    window.clearInterval(pollRef.current);
    pollRef.current = null;
  };

  useEffect(() => {
    if (!isAuthenticated || !user) {
      stopPolling();
      setSocketConnected(false);
      return;
    }

    if (!socket) {
      startPolling();
      return;
    }

    const onConnect = () => {
      setSocketConnected(true);
      stopPolling();
      socket.emit('auth:join', { userId: user.id, role: user.role });
    };

    const onDisconnect = () => {
      setSocketConnected(false);
      startPolling();
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    socket.on('notifications:new', () => {
      NotificationsService.getUnreadCount?.().catch(() => {});
    });

    socket.on('messages:new', () => {
      const mRole = normalizeRole(String(user.role));
      const messagingRole = mRole === 'freelancer' ? UserRole.FREELANCER : mRole === 'client' ? UserRole.EMPLOYER : mRole === 'admin' ? UserRole.ADMIN : UserRole.GUEST;
      MessagingService.getAllConversations?.(user.id, messagingRole).catch(() => {});
    });

    socket.on('orders:updated', () => {
      const oRole = normalizeRole(String(user.role));
      const contractRole = oRole === 'client' ? 'client' : oRole === 'freelancer' ? 'freelancer' : oRole === 'admin' ? 'admin' : 'client';
      OrdersService.getOrders?.({ ownerId: 'me', role: contractRole, limit: 1 }).catch(() => {});
    });

    socket.on('contracts:updated', () => {
      const cRole = normalizeRole(String(user.role));
      const contractRole = cRole === 'client' ? 'client' : cRole === 'freelancer' ? 'freelancer' : cRole === 'admin' ? 'admin' : 'client';
      ContractService.getContracts?.(user.id, contractRole).catch(() => {});
    });

    socket.on('wallet:updated', () => {
      WalletApi.getWalletInfo?.().catch(() => {});
    });

    // Admin profile updates (from other sessions)
    socket.on('admin:profile_updated', (payload: any) => {
      try {
        if (updateAdminProfile) updateAdminProfile(payload);
        if (updateUser) updateUser({ name: payload.username || payload.name, email: payload.email, avatar: payload.avatar });
      } catch (e) {
        console.warn('Failed to apply remote admin profile update', e);
      }
    });

    socket.on('gigs:status_updated', () => {});
    socket.on('jobs:status_updated', () => {});

    if (socket.connected) onConnect();

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('notifications:new');
      socket.off('messages:new');
      socket.off('orders:updated');
      socket.off('contracts:updated');
      socket.off('wallet:updated');
      socket.off('gigs:status_updated');
      socket.off('jobs:status_updated');
      stopPolling();
    };
  }, [socket, isAuthenticated, user?.id, user?.role]);

  const value = useMemo(() => ({ socketConnected }), [socketConnected]);
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
};

export const useRealtime = () => useContext(RealtimeContext);

export default RealtimeProvider;
