import { io, Socket } from 'socket.io-client'

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
  private reconnectAttempts = 0
  private maxReconnectAttempts = 10
  private pingInterval: ReturnType<typeof setInterval> | null = null

  connect(options: SocketConnectOptions) {
    if (this.socket?.connected) {
      return this.socket
    }

    this.disconnect()

    const namespace = options.namespace ? (options.namespace.startsWith('/') ? options.namespace : `/${options.namespace}`) : ''
    const socketUrl = `${options.url}${namespace}`
    this.socket = io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
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
    this.stopPing()
    if (this.socket) {
      this.socket.removeAllListeners()
      this.socket.disconnect()
    }
    this.socket = null
    this.reconnectAttempts = 0
  }

  getSocket() {
    return this.socket
  }
}

export const socketService = new SocketService()
