// C:\Projects\Scrolith\src\context\SocketContext.tsx
import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import { Socket } from 'socket.io-client'
import { useUser } from './UserContext'
import { socketService } from '../utils/socket'
import { tokenStore } from '../services/tokenStore'
import { getBackendOrigin } from '../utils/apiBase'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'

export interface SocketContextType {
  socket: Socket | null
  isConnected: boolean
}

export const SocketContext = createContext<SocketContextType | undefined>(undefined)

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const { user, isAuthenticated } = useUser()
  const lastOptionsRef = useRef<any>(null)

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
      { ev: 'community:post_updated', fn: forward('community:post_updated') },
      { ev: 'community:post_deleted', fn: forward('community:post_deleted') },
      { ev: 'community:post_comment_created', fn: forward('community:post_comment_created') },
      { ev: 'community:post_comment_updated', fn: forward('community:post_comment_updated') },
      { ev: 'community:post_comment_deleted', fn: forward('community:post_comment_deleted') },
      { ev: 'community:post_comment_like_toggled', fn: forward('community:post_comment_like_toggled') },
      { ev: 'community:comment_created', fn: forward('community:comment_created') },
      { ev: 'community:like_toggled', fn: forward('community:like_toggled') },
      { ev: 'community:post_reaction_updated', fn: forward('community:post_reaction_updated') },
      { ev: 'community:follow_updated', fn: forward('community:follow_updated') },
      { ev: 'community:story_created', fn: forward('community:story_created') },
      { ev: 'community:story_deleted', fn: forward('community:story_deleted') },
      { ev: 'community:story_updated', fn: forward('community:story_updated') },
      { ev: 'community:story_liked', fn: forward('community:story_liked') },
      { ev: 'community:business_page_created', fn: forward('community:business_page_created') },
      { ev: 'community:business_page_updated', fn: forward('community:business_page_updated') },
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
      ,{ ev: 'community:admin_config_updated', fn: forward('community:admin_config_updated') }
      ,{ ev: 'community:reactions_updated', fn: forward('community:reactions_updated') }
      ,{ ev: 'community:profile_view_logged', fn: forward('community:profile_view_logged') }
      ,{ ev: 'apps:event_tracked', fn: forward('apps:event_tracked') }
      ,{ ev: 'apps:metrics_updated', fn: forward('apps:metrics_updated') }
      ,{ ev: 'apps:campaign_sent', fn: forward('apps:campaign_sent') }
      ,{ ev: 'apps:config_updated', fn: forward('apps:config_updated') }
      ,{ ev: 'i18n:updated', fn: forward('i18n:updated') }
      ,{ ev: 'i18n:override_updated', fn: forward('i18n:override_updated') }
      ,{ ev: 'reactions:updated', fn: forward('reactions:updated') }
      ,{ ev: 'messages:updated', fn: forward('messages:updated') }
      ,{ ev: 'cart:updated', fn: forward('cart:updated') }
      ,{ ev: 'favorites:updated', fn: forward('favorites:updated') }
      ,{ ev: 'notifications:new', fn: forward('notifications:new') }
      ,{ ev: 'kyc.updated', fn: forward('kyc.updated') }
      ,{ ev: 'kyc.submitted', fn: forward('kyc.submitted') }
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

    // Allow socket connections for unauthenticated (guest) users so public pages
    // can receive CMS realtime events (e.g. header updates). Pass token/userId
    // only when available; avoid joining private rooms when not authenticated.
    const existingSocket = socketService.getSocket()
    if (existingSocket?.connected) {
      setSocket(existingSocket)
      setIsConnected(true)
      return
    }

    // If an existing socket isn't connected, start fresh
    cleanupSocket()

    const backendEnv =
      import.meta.env.VITE_BACKEND_URL ||
      import.meta.env.VITE_API_URL ||
      import.meta.env.VITE_API_BASE_URL ||
      import.meta.env.VITE_MOBILE_API_URL ||
      import.meta.env.VITE_MOBILE_API_BASE_URL
    if (import.meta.env.PROD && !backendEnv) {
      console.error('VITE_BACKEND_URL (or VITE_API_URL) must be set in production to enable sockets')
    }
    const connectSocket = async () => {
      // Prefer explicit backend origin when provided, otherwise use same-origin proxy.
      // Be tolerant: if backendEnv is a relative path like '/api' (dev proxy), do not call new URL() on it.
      let socketUrl = getBackendOrigin() || '/'
      try {
        const be = String(backendEnv || '')
        if (/^https?:\/\//i.test(be)) {
          socketUrl = new URL(be).origin
        }
      } catch (e) {
        socketUrl = getBackendOrigin() || '/'
      }

      const token = (await tokenStore.get()) || ''

      const options = {
        url: socketUrl,
        namespace: '/community',
        userId: user?.id || 'guest',
        role: user?.role || 'guest',
        token,
        onConnect: (connectedSocket) => {
          setIsConnected(true)
          setSocket(connectedSocket)
          // Join user-specific rooms only when authenticated
          try {
            if (token && user && user.id) {
              connectedSocket.emit('join:wallet', { userId: user.id })
              connectedSocket.emit('community:join', { userId: user.id })
              // Retry once to avoid join-event races during initial namespace setup.
              window.setTimeout(() => {
                if (!connectedSocket.connected) return
                connectedSocket.emit('join:wallet', { userId: user.id })
                connectedSocket.emit('community:join', { userId: user.id })
              }, 400)
            }
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
      }
      lastOptionsRef.current = options
      socketService.connect(options)
    }

    void connectSocket()

    return () => {
      cleanupSocket()
    }
  }, [user?.id, user?.role, isAuthenticated])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const handler = App.addListener('appStateChange', (state) => {
      if (state.isActive) {
        const last = lastOptionsRef.current;
        if (last) socketService.connect(last);
      } else {
        socketService.disconnect();
      }
    });
    return () => {
      handler.remove();
    };
  }, []);

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

