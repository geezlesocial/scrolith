// C:\Projects\geezle\src\context\SocketContext.tsx
import React, { createContext, useContext, useEffect, useState } from 'react'
import { Socket } from 'socket.io-client'
import { useUser } from './UserContext'
import { socketService } from '../utils/socket'
import { tokenStore } from '../services/tokenStore'

export interface SocketContextType {
  socket: Socket | null
  isConnected: boolean
}

export const SocketContext = createContext<SocketContextType | undefined>(undefined)

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const { user, isAuthenticated } = useUser()

  useEffect(() => {
    // Attach community event listeners when socket is available
    if (!socket) return;

    const forward = (eventName: string) => (payload: any) => {
      try {
        window.dispatchEvent(new CustomEvent(eventName, { detail: payload }));
        console.log(`Forwarded socket event -> ${eventName}`, payload);
      } catch (e) {
        console.error(`Failed to forward socket event ${eventName}:`, e);
      }
    }

    const handlers: Array<{ ev: string; fn: (...args: any[]) => void }> = [
      { ev: 'community:thread_created', fn: forward('community:thread_created') },
      { ev: 'community:post_created', fn: forward('community:post_created') },
      { ev: 'community:comment_created', fn: forward('community:comment_created') },
      { ev: 'community:like_toggled', fn: forward('community:like_toggled') },
      { ev: 'community:thread_pinned', fn: forward('community:thread_pinned') },
      { ev: 'community:thread_locked', fn: forward('community:thread_locked') },
      { ev: 'community:thread_deleted', fn: forward('community:thread_deleted') },
      { ev: 'community:comment_deleted', fn: forward('community:comment_deleted') }
      ,{ ev: 'community:ad_created', fn: forward('community:ad_created') }
      ,{ ev: 'community:ad_status_updated', fn: forward('community:ad_status_updated') }
      ,{ ev: 'community:ad_payment_initiated', fn: forward('community:ad_payment_initiated') }
      ,{ ev: 'community:ad_metrics_updated', fn: forward('community:ad_metrics_updated') }
      ,{ ev: 'community:gcoin_transaction_created', fn: forward('community:gcoin_transaction_created') }
      ,{ ev: 'community:gcoin_balance_updated', fn: forward('community:gcoin_balance_updated') }
      ,{ ev: 'community:gcoin_settings_updated', fn: forward('community:gcoin_settings_updated') }
      ,{ ev: 'community:gcoin_conversion_requested', fn: forward('community:gcoin_conversion_requested') }
      ,{ ev: 'community:gcoin_conversion_processed', fn: forward('community:gcoin_conversion_processed') }
      ,{ ev: 'community:post_metrics_updated', fn: forward('community:post_metrics_updated') }
      ,{ ev: 'community:homepage_updated', fn: forward('community:homepage_updated') }
      ,{ ev: 'community:fiat_balance_updated', fn: forward('community:fiat_balance_updated') }
    ];

    handlers.forEach(h => socket.on(h.ev, h.fn));

    return () => {
      handlers.forEach(h => socket.off(h.ev, h.fn));
    };
  }, [socket]);
  useEffect(() => {
    const cleanupSocket = () => {
      socketService.disconnect()
      setSocket(null)
      setIsConnected(false)
    }

    if (!isAuthenticated || !user) {
      cleanupSocket()
      return
    }

    const existingSocket = socketService.getSocket()
    if (existingSocket?.connected) {
      setSocket(existingSocket)
      setIsConnected(true)
      return
    }

    cleanupSocket()

    const backendEnv = import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL
    if (import.meta.env.PROD && !backendEnv) {
      console.error('VITE_BACKEND_URL (or VITE_API_URL) must be set in production to enable sockets')
    }
    // Prefer explicit backend origin when provided, otherwise use same-origin proxy.
    // Be tolerant: if backendEnv is a relative path like '/api' (dev proxy), do not call new URL() on it.
    let socketUrl = '/'
    try {
      const be = String(backendEnv || '')
      if (/^https?:\/\//i.test(be)) {
        socketUrl = new URL(be).origin
      } else {
        socketUrl = '/'
      }
    } catch (e) {
      socketUrl = '/'
    }
    const token = tokenStore.get() || ''

    socketService.connect({
      url: socketUrl,
      namespace: '/community',
      userId: user.id,
      role: user.role,
      token,
      onConnect: (connectedSocket) => {
        setIsConnected(true)
        setSocket(connectedSocket)
        try {
          connectedSocket.emit('join:wallet', { userId: user.id })
        } catch (e) {
          console.warn('Failed to join wallet room', e)
        }
      },
      onDisconnect: () => {
        setIsConnected(false)
        setSocket(null)
      },
      onConnectError: (error) => {
        console.error('Socket connect error:', error.message)
        setIsConnected(false)
      },
      onError: (error) => {
        console.error('Socket error:', error)
      },
      onConnectedEvent: (data) => {
        console.log('Server connected event:', data)
      },
      onHeartbeat: (data) => {
        console.log('Heartbeat received:', data)
      },
      onHandshakeAck: (data) => {
        console.log('Handshake ack:', data)
      }
    })

    return () => {
      cleanupSocket()
    }
  }, [user, isAuthenticated])

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  )
}

export const useSocket = (): SocketContextType => {
  const context = useContext(SocketContext)
  if (context === undefined) {
    throw new Error('useSocket must be used within a SocketProvider')
  }
  return context
}
