import React, { createContext, useContext, useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useContent } from './ContentContext';
import { useNotification } from './NotificationContext';
import { useUser } from './UserContext';

// Point to your backend
const SOCKET_URL = 'http://localhost:5000'; 

interface SocketContextType {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextType | undefined>(undefined);

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { updateSettings } = useContent();
  const { showNotification } = useNotification();
  const { user, logout } = useUser();

  useEffect(() => {
    const socketInstance = io(SOCKET_URL, {
        transports: ['websocket'],
        autoConnect: true
    });

    socketInstance.on('connect', () => {
      setIsConnected(true);
      if (user) {
          socketInstance.emit('join_room', `user_${user.id}`);
      }
    });

    socketInstance.on('disconnect', () => {
      setIsConnected(false);
    });

    // --- GLOBAL LISTENERS ---

    // 1. Settings Updated by Admin -> Reflect everywhere instantly
    socketInstance.on('settings:updated', (newSettings) => {
        console.log('[Socket] Settings updated:', newSettings);
        updateSettings(newSettings); // Updates ContentContext
    });

    // 2. Account Status Change (e.g. Ban)
    socketInstance.on('account:status_change', ({ status }) => {
        if (status === 'suspended') {
            alert("Your account has been suspended by an administrator.");
            logout();
        }
    });

    // Forward community-scoped socket events to window as CustomEvents
    const anyHandler = (eventName: string, ...args: any[]) => {
      try {
        if (typeof eventName === 'string' && eventName.startsWith('community:')) {
          const detail = args.length === 1 ? args[0] : args;
          // Dispatch a DOM CustomEvent so existing UI can listen on window
          window.dispatchEvent(new CustomEvent(eventName, { detail }));
          console.debug('[Socket] forwarded', eventName, detail);
        }
      } catch (e) {
        console.error('Failed to forward socket event', e);
      }
    };
    socketInstance.onAny(anyHandler);

    setSocket(socketInstance);

    return () => {
      try { socketInstance.offAny && socketInstance.offAny(anyHandler); } catch (e) {}
      socketInstance.disconnect();
    };
  }, [user]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within SocketProvider');
  return context;
};