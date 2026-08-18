import type { Socket } from 'socket.io-client'

export type SocketTransport = 'polling' | 'websocket'

export function resolveSocketTransports(value?: string): SocketTransport[] {
  const configured = String(value || 'polling,websocket')
    .split(',')
    .map((transport) => transport.trim().toLowerCase())
    .filter((transport): transport is SocketTransport =>
      transport === 'polling' || transport === 'websocket'
    )
  return configured.length > 0 ? configured : ['polling', 'websocket']
}

/**
 * Resolve the realtime origin independently from the REST/API origin.
 * Dedicated realtime deployments use VITE_SOCKET_URL while local/default
 * deployments continue to fall back to the canonical backend origin.
 */
export function resolveSocketOrigin(explicitUrl?: string, fallbackUrl?: string): string {
  return String(explicitUrl || fallbackUrl || '').trim().replace(/\/+$/, '')
}

export type SocketConnectOptions = {
  url: string
  namespace?: string
  userId: string
  role?: string
  token?: string
  onConnect?: (socket: Socket) => void
  onDisconnect?: (reason: string) => void
  onConnectError?: (error: Error) => void
  onError?: (error: unknown) => void
  onConnectedEvent?: (data: any) => void
  onHeartbeat?: (data: any) => void
  onHandshakeAck?: (data: any) => void
}

class SocketService {
  private socket: Socket | null = null
  private socketSignature: string | null = null
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private pingInterval: ReturnType<typeof setInterval> | null = null
  private connectionAttempt = 0

  async connect(options: SocketConnectOptions) {
    const nextSignature = JSON.stringify({
      url: String(options.url || '').trim(),
      namespace: String(options.namespace || '').trim(),
      userId: String(options.userId || '').trim(),
      role: String(options.role || '').trim(),
      token: String(options.token || '').trim()
    })

    if (this.socket && this.socketSignature === nextSignature) {
      if (!this.socket.connected) {
        try {
          this.socket.connect()
        } catch {
          // Ignore reconnect errors; socket.io will continue retrying.
        }
      }
      return this.socket
    }

    this.disconnect()
    const attempt = ++this.connectionAttempt

    const namespace = options.namespace
      ? (options.namespace.startsWith('/') ? options.namespace : `/${options.namespace}`)
      : ''
    const rawBaseUrl = String(options.url || '').trim()
    // Avoid building URLs like "//community" when base is "/".
    const normalizedBaseUrl =
      rawBaseUrl && rawBaseUrl !== '/' ? rawBaseUrl.replace(/\/+$/, '') : ''
    const socketUrl = normalizedBaseUrl
      ? `${normalizedBaseUrl}${namespace}`
      : (namespace || undefined)

    this.socketSignature = nextSignature
    const { io } = await import('socket.io-client')
    // Auth/recovery state can request another connection while the dynamic
    // client import is still pending. Do not let a stale attempt create a
    // second socket after the newer attempt has taken ownership.
    if (attempt !== this.connectionAttempt) return null

    const transports = resolveSocketTransports(import.meta.env.VITE_SOCKET_TRANSPORTS)

    this.socket = io(socketUrl, {
      path: '/socket.io',
      // Production keeps polling-first upgrade behavior. QA can explicitly
      // select websocket-only when the ingress cannot preserve polling
      // session affinity across replicas.
      transports,
      upgrade: transports.length > 1,
      rememberUpgrade: false,
      tryAllTransports: true,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: true,
      forceNew: true,
      multiplex: false,
      withCredentials: true,
      auth: {
        token: options.token || ''
      },
      query: {
        userId: options.userId,
        role: options.role
      }
    })

    const socket = this.socket

    socket.on('connect', () => {
      this.reconnectAttempts = 0
      options.onConnect?.(socket)
      this.sendHandshake(options.userId, options.role)
      this.startPing()
    })

    socket.on('connected', (data) => {
      options.onConnectedEvent?.(data)
    })

    socket.on('handshake-ack', (data) => {
      options.onHandshakeAck?.(data)
    })

    socket.on('heartbeat', (data) => {
      options.onHeartbeat?.(data)
    })

    socket.on('disconnect', (reason) => {
      this.stopPing()
      options.onDisconnect?.(reason)
      if (reason === 'io server disconnect' || reason === 'ping timeout') {
        socket.connect()
      }
    })

    socket.on('connect_error', (error) => {
      this.reconnectAttempts += 1
      options.onConnectError?.(error)
      if (this.reconnectAttempts > this.maxReconnectAttempts) {
        socket.disconnect()
      }
    })

    socket.on('error', (error) => {
      options.onError?.(error)
    })

    return socket
  }

  private sendHandshake(userId: string, role?: string) {
    if (!this.socket?.connected) return
    this.socket.emit('handshake', {
      userId,
      role,
      timestamp: new Date().toISOString()
    })
  }

  private startPing() {
    this.stopPing()
    this.pingInterval = setInterval(() => {
      if (this.socket?.connected) {
        this.socket.emit('ping', { time: Date.now() })
      }
    }, 10000)
  }

  private stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval)
      this.pingInterval = null
    }
  }

  disconnect() {
    this.connectionAttempt += 1
    this.stopPing()
    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.disconnect()
    }
    this.socket = null
    this.socketSignature = null
    this.reconnectAttempts = 0
  }

  getSocket() {
    return this.socket
  }
}

export const socketService = new SocketService()
