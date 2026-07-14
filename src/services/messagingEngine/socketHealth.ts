/**
 * Messaging socket health monitor (observes shared Socket.IO connection).
 * Does not open additional sockets — single connection remains SocketContext/socketService.
 */
import type { Socket } from 'socket.io-client';
import type { SocketHealthSnapshot } from './types';
import { publishMessagingEvent } from './eventBus';

let snapshot: SocketHealthSnapshot = {
  connected: false,
  lastConnectedAt: null,
  lastDisconnectedAt: null,
  lastHeartbeatAt: null,
  reconnectCount: 0,
  lastError: null,
  latencyMs: null
};

let boundSocket: Socket | null = null;
let unbindFns: Array<() => void> = [];
let pingSentAt: number | null = null;

const publishHealth = () => {
  publishMessagingEvent('SOCKET_HEALTH', { ...snapshot }, { source: 'system' });
};

export const getSocketHealthSnapshot = (): SocketHealthSnapshot => ({ ...snapshot });

export const bindMessagingSocketHealth = (socket: Socket | null) => {
  // Detach previous
  unbindFns.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore
    }
  });
  unbindFns = [];
  boundSocket = socket;

  if (!socket) {
    snapshot = {
      ...snapshot,
      connected: false,
      lastDisconnectedAt: Date.now()
    };
    publishHealth();
    return;
  }

  const onConnect = () => {
    const wasConnected = snapshot.connected;
    snapshot = {
      ...snapshot,
      connected: true,
      lastConnectedAt: Date.now(),
      lastError: null,
      reconnectCount: wasConnected ? snapshot.reconnectCount : snapshot.reconnectCount + (snapshot.lastDisconnectedAt ? 1 : 0)
    };
    // First connect should not count as reconnect.
    if (!snapshot.lastDisconnectedAt && snapshot.reconnectCount > 0 && !wasConnected) {
      snapshot.reconnectCount = Math.max(0, snapshot.reconnectCount - 1);
    }
    publishHealth();
  };

  const onDisconnect = () => {
    snapshot = {
      ...snapshot,
      connected: false,
      lastDisconnectedAt: Date.now()
    };
    publishHealth();
  };

  const onConnectError = (error: Error) => {
    snapshot = {
      ...snapshot,
      connected: false,
      lastError: String(error?.message || 'connect_error')
    };
    publishHealth();
  };

  const onHeartbeat = (data?: any) => {
    const now = Date.now();
    const serverTime = Number(data?.time || data?.timestamp || 0);
    snapshot = {
      ...snapshot,
      lastHeartbeatAt: now,
      latencyMs:
        pingSentAt != null
          ? Math.max(0, now - pingSentAt)
          : Number.isFinite(serverTime) && serverTime > 0
            ? Math.max(0, now - serverTime)
            : snapshot.latencyMs
    };
    pingSentAt = null;
    publishHealth();
  };

  const onPong = () => onHeartbeat({ time: Date.now() });

  socket.on('connect', onConnect);
  socket.on('disconnect', onDisconnect);
  socket.on('connect_error', onConnectError);
  socket.on('heartbeat', onHeartbeat);
  socket.on('pong', onPong);

  unbindFns.push(() => socket.off('connect', onConnect));
  unbindFns.push(() => socket.off('disconnect', onDisconnect));
  unbindFns.push(() => socket.off('connect_error', onConnectError));
  unbindFns.push(() => socket.off('heartbeat', onHeartbeat));
  unbindFns.push(() => socket.off('pong', onPong));

  snapshot = {
    ...snapshot,
    connected: Boolean(socket.connected),
    lastConnectedAt: socket.connected ? Date.now() : snapshot.lastConnectedAt
  };
  publishHealth();
};

export const markMessagingPingSent = () => {
  pingSentAt = Date.now();
};

export const noteMessagingReconnect = () => {
  snapshot = {
    ...snapshot,
    reconnectCount: snapshot.reconnectCount + 1
  };
  publishHealth();
};

export const __resetSocketHealthForTests = () => {
  unbindFns.forEach((fn) => {
    try {
      fn();
    } catch {
      // ignore
    }
  });
  unbindFns = [];
  boundSocket = null;
  pingSentAt = null;
  snapshot = {
    connected: false,
    lastConnectedAt: null,
    lastDisconnectedAt: null,
    lastHeartbeatAt: null,
    reconnectCount: 0,
    lastError: null,
    latencyMs: null
  };
};

export const getBoundMessagingSocket = () => boundSocket;
