// C:\Projects\Scrolith\src\context\SocketContext.tsx
import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import { Socket } from 'socket.io-client'
import { useUser } from './UserContext'
import { socketService } from '../utils/socket'
import { tokenStore } from '../services/tokenStore'
import { getBackendOrigin } from '../utils/apiBase'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import type { PluginListenerHandle } from '@capacitor/core'

export interface SocketContextType {
  socket: Socket | null
  isConnected: boolean
}

export const SocketContext = createContext<SocketContextType | undefined>(undefined)
const isSocketTraceEnabled = () => {
  const raw = String(import.meta.env.VITE_SOCKET_TRACE || '').toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

const buildSocketSignature = (input: {
  url: string
  namespace: string
  userId: string
  role: string
  token: string
}) => JSON.stringify({
  url: String(input.url || '').trim(),
  namespace: String(input.namespace || '').trim(),
  userId: String(input.userId || '').trim(),
  role: String(input.role || '').trim(),
  tokenPresent: Boolean(String(input.token || '').trim())
})

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
        if (isSocketTraceEnabled()) {
          console.log(`Forwarded socket event -> ${eventName}`, payload);
        }
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
      { ev: 'community:post_ai_insight_ready', fn: forward('community:post_ai_insight_ready') },
      { ev: 'post:aiInsightReady', fn: forward('post:aiInsightReady') },
      { ev: 'community:follow_updated', fn: forward('community:follow_updated') },
      { ev: 'community:story_created', fn: forward('community:story_created') },
      { ev: 'community:story_deleted', fn: forward('community:story_deleted') },
      { ev: 'community:story_updated', fn: forward('community:story_updated') },
      { ev: 'community:story_liked', fn: forward('community:story_liked') },
      { ev: 'community:story_engaged', fn: forward('community:story_engaged') },
      { ev: 'community:business_page_created', fn: forward('community:business_page_created') },
      { ev: 'community:business_page_updated', fn: forward('community:business_page_updated') },
      { ev: 'community:thread_pinned', fn: forward('community:thread_pinned') },
      { ev: 'community:thread_locked', fn: forward('community:thread_locked') },
      { ev: 'community:thread_deleted', fn: forward('community:thread_deleted') },
      { ev: 'community:comment_deleted', fn: forward('community:comment_deleted') },
      { ev: 'community:event_registered', fn: forward('community:event_registered') },
      { ev: 'community:event_unregistered', fn: forward('community:event_unregistered') },
      { ev: 'community:event_created', fn: forward('community:event_created') },
      { ev: 'community:event_updated', fn: forward('community:event_updated') },
      { ev: 'community:event_deleted', fn: forward('community:event_deleted') },
      { ev: 'community:stats_updated', fn: forward('community:stats_updated') }
      ,{ ev: 'scroll:new', fn: forward('scroll:new') }
      ,{ ev: 'scroll:engagement_update', fn: forward('scroll:engagement_update') }
      ,{ ev: 'scroll:impression_update', fn: forward('scroll:impression_update') }
      ,{ ev: 'scroll:comment_created', fn: forward('scroll:comment_created') }
      ,{ ev: 'scroll:comment_updated', fn: forward('scroll:comment_updated') }
      ,{ ev: 'scroll:comment_deleted', fn: forward('scroll:comment_deleted') }
      ,{ ev: 'scroll:comment_reaction_updated', fn: forward('scroll:comment_reaction_updated') }
      ,{ ev: 'scroll:removed', fn: forward('scroll:removed') }
      ,{ ev: 'scroll:gcoin_donated', fn: forward('scroll:gcoin_donated') }
      ,{ ev: 'community:ad_created', fn: forward('community:ad_created') }
      ,{ ev: 'community:ad_status_updated', fn: forward('community:ad_status_updated') }
      ,{ ev: 'community:ad_payment_initiated', fn: forward('community:ad_payment_initiated') }
      ,{ ev: 'community:ad_metrics_updated', fn: forward('community:ad_metrics_updated') }
      ,{ ev: 'community:gcoin_transaction_created', fn: forward('community:gcoin_transaction_created') }
      ,{ ev: 'community:gcoin_balance_updated', fn: forward('community:gcoin_balance_updated') }
      ,{ ev: 'community:gcoin_donated', fn: forward('community:gcoin_donated') }
      ,{ ev: 'community:gcoin_settings_updated', fn: forward('community:gcoin_settings_updated') }
      ,{ ev: 'community:gcoin_conversion_requested', fn: forward('community:gcoin_conversion_requested') }
      ,{ ev: 'community:gcoin_conversion_processed', fn: forward('community:gcoin_conversion_processed') }
      ,{ ev: 'community:post_metrics_updated', fn: forward('community:post_metrics_updated') }
      ,{ ev: 'community:homepage_updated', fn: forward('community:homepage_updated') }
      ,{ ev: 'community:fiat_balance_updated', fn: forward('community:fiat_balance_updated') }
      ,{ ev: 'community:admin_config_updated', fn: forward('community:admin_config_updated') }
      ,{ ev: 'community:reactions_updated', fn: forward('community:reactions_updated') }
      ,{ ev: 'community:profile_view_logged', fn: forward('community:profile_view_logged') }
      ,{ ev: 'community:job_published', fn: forward('community:job_published') }
      ,{ ev: 'community:gig_published', fn: forward('community:gig_published') }
      ,{ ev: 'apps:event_tracked', fn: forward('apps:event_tracked') }
      ,{ ev: 'apps:metrics_updated', fn: forward('apps:metrics_updated') }
      ,{ ev: 'apps:campaign_sent', fn: forward('apps:campaign_sent') }
      ,{ ev: 'apps:config_updated', fn: forward('apps:config_updated') }
      ,{ ev: 'feature_flags:updated', fn: forward('feature_flags:updated') }
      ,{ ev: 'feature_flags:kill_switch_toggled', fn: forward('feature_flags:kill_switch_toggled') }
      ,{ ev: 'search:rules_updated', fn: forward('search:rules_updated') }
      ,{ ev: 'feed:recipe_updated', fn: forward('feed:recipe_updated') }
      ,{ ev: 'config:snapshot_created', fn: forward('config:snapshot_created') }
      ,{ ev: 'config:rollback_completed', fn: forward('config:rollback_completed') }
      ,{ ev: 'config:release_logged', fn: forward('config:release_logged') }
      ,{ ev: 'realtime:session_changed', fn: forward('realtime:session_changed') }
      ,{ ev: 'realtime:incident_opened', fn: forward('realtime:incident_opened') }
      ,{ ev: 'realtime:incident_resolved', fn: forward('realtime:incident_resolved') }
      ,{ ev: 'delivery:replayed', fn: forward('delivery:replayed') }
      ,{ ev: 'presence:updated', fn: forward('presence:updated') }
      ,{ ev: 'moderation:policy_updated', fn: forward('moderation:policy_updated') }
      ,{ ev: 'moderation:appeal_updated', fn: forward('moderation:appeal_updated') }
      ,{ ev: 'trust:profile_updated', fn: forward('trust:profile_updated') }
      ,{ ev: 'trust:signal_updated', fn: forward('trust:signal_updated') }
      ,{ ev: 'i18n:updated', fn: forward('i18n:updated') }
      ,{ ev: 'i18n:override_updated', fn: forward('i18n:override_updated') }
      ,{ ev: 'reactions:updated', fn: forward('reactions:updated') }
      ,{ ev: 'messages:updated', fn: forward('messages:updated') }
      ,{ ev: 'messages:typing', fn: forward('messages:typing') }
      ,{ ev: 'cart:updated', fn: forward('cart:updated') }
      ,{ ev: 'favorites:updated', fn: forward('favorites:updated') }
      ,{ ev: 'notifications:new', fn: forward('notifications:new') }
      ,{ ev: 'community:post_report_submitted', fn: forward('community:post_report_submitted') }
      ,{ ev: 'community:post_report_updated', fn: forward('community:post_report_updated') }
      ,{ ev: 'kyc.updated', fn: forward('kyc.updated') }
      ,{ ev: 'kyc.submitted', fn: forward('kyc.submitted') }
      ,{ ev: 'insights:pgs_updated', fn: forward('insights:pgs_updated') }
      ,{ ev: 'insights:achievement_unlocked', fn: forward('insights:achievement_unlocked') }
      ,{ ev: 'insights:streak_updated', fn: forward('insights:streak_updated') }
      ,{ ev: 'insights:quests_assigned', fn: forward('insights:quests_assigned') }
      ,{ ev: 'insights:quests_progress', fn: forward('insights:quests_progress') }
      ,{ ev: 'insights:quests_completed', fn: forward('insights:quests_completed') }
      ,{ ev: 'insights:quest_reward_granted', fn: forward('insights:quest_reward_granted') }
      ,{ ev: 'insights:leaderboard_updated', fn: forward('insights:leaderboard_updated') }
      ,{ ev: 'insights:copilot_tip', fn: forward('insights:copilot_tip') }
      ,{ ev: 'insights:post_prediction_ready', fn: forward('insights:post_prediction_ready') }
      ,{ ev: 'insights:opportunity_match_ready', fn: forward('insights:opportunity_match_ready') }
      ,{ ev: 'insights:toxicity_flagged', fn: forward('insights:toxicity_flagged') }
      ,{ ev: 'dev:link_status_updated', fn: forward('dev:link_status_updated') }
      ,{ ev: 'dev:app_updated', fn: forward('dev:app_updated') }
      ,{ ev: 'dev:config_updated', fn: forward('dev:config_updated') }
      ,{ ev: 'dev:log_created', fn: forward('dev:log_created') }
      ,{ ev: 'dev:docs_updated', fn: forward('dev:docs_updated') }
      ,{ ev: 'admin:system_backup_updated', fn: forward('admin:system_backup_updated') }
      ,{ ev: 'homepage:guest_updated', fn: forward('homepage:guest_updated') }
      ,{ ev: 'live:session_created', fn: forward('live:session_created') }
      ,{ ev: 'live:started', fn: forward('live:started') }
      ,{ ev: 'live:ended', fn: forward('live:ended') }
      ,{ ev: 'live:participant_invited', fn: forward('live:participant_invited') }
      ,{ ev: 'live:participant_joined', fn: forward('live:participant_joined') }
      ,{ ev: 'live:participant_left', fn: forward('live:participant_left') }
      ,{ ev: 'live:reaction', fn: forward('live:reaction') }
      ,{ ev: 'live:gift_sent', fn: forward('live:gift_sent') }
      ,{ ev: 'live:viewer_count_updated', fn: forward('live:viewer_count_updated') }
      ,{ ev: 'live:config_updated', fn: forward('live:config_updated') }
      ,{ ev: 'live:signal', fn: forward('live:signal') }
      ,{ ev: 'live:filter_updated', fn: forward('live:filter_updated') }
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
      // Keep socket origin aligned with the canonical API base resolver so
      // accidental placeholder domains (e.g. api.example.com) are ignored.
      const socketUrl = getBackendOrigin() || ''
      const token = (await tokenStore.get()) || ''
      const nextSignature = buildSocketSignature({
        url: socketUrl,
        namespace: '/community',
        userId: user?.id || 'guest',
        role: user?.role || 'guest',
        token
      })
      const existingSocket = socketService.getSocket()
      const existingSignature = String(lastOptionsRef.current?.signature || '')

      // Reuse the current socket only when its identity matches the current
      // auth state. This prevents a guest socket from surviving after login.
      if (existingSocket?.connected && existingSignature === nextSignature) {
        setSocket(existingSocket)
        setIsConnected(true)
        return
      }

      cleanupSocket()

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
          if (isSocketTraceEnabled()) {
            console.error('Socket connect error:', error.message)
          }
          setIsConnected(false)
        },
        onError: (error) => {
          if (isSocketTraceEnabled()) {
            console.error('Socket error:', error)
          }
        },
        onConnectedEvent: (data) => {
          if (isSocketTraceEnabled()) {
            console.log('Server connected event:', data)
          }
        },
        onHeartbeat: (data) => {
          if (isSocketTraceEnabled()) {
            console.log('Heartbeat received:', data)
          }
        },
        onHandshakeAck: (data) => {
          if (isSocketTraceEnabled()) {
            console.log('Handshake ack:', data)
          }
        }
      }
      lastOptionsRef.current = {
        ...options,
        signature: nextSignature
      }
      socketService.connect(options)
    }

    void connectSocket()

    return () => {
      cleanupSocket()
    }
  }, [user?.id, user?.role, isAuthenticated])

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let listenerHandle: PluginListenerHandle | null = null;
    let cancelled = false;
    const handlePromise = App.addListener('appStateChange', (state) => {
      if (state.isActive) {
        const last = lastOptionsRef.current;
        if (last) socketService.connect(last);
      } else {
        socketService.disconnect();
      }
    });

    void handlePromise.then((handle) => {
      if (cancelled) {
        void handle.remove();
        return;
      }
      listenerHandle = handle;
    }).catch(() => {
      listenerHandle = null;
    });

    return () => {
      cancelled = true;
      if (listenerHandle) {
        void listenerHandle.remove();
      }
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

