import prisma from '../utils/prismaClient';

type RuntimeSocketRecord = {
  socketId: string;
  namespace: string;
  userId: string | null;
  role: string | null;
  transport: string | null;
  authSource: string | null;
  isAuthenticated: boolean;
  rooms: string[];
  connectedAt: string;
  lastSeenAt: string;
  metadata: Record<string, any> | null;
};

type RuntimeEventRecord = {
  namespace: string;
  roomKey: string | null;
  eventName: string;
  count: number;
  targetCount: number;
  lastOccurredAt: string;
  persistedCount: number;
  lastPayloadSample: any;
};

type RuntimeIncidentRecord = {
  code: string;
  source: string;
  severity: string;
  message: string;
  timestamp: string;
  context?: any;
};

type SocketSessionFilters = {
  namespace?: string;
  query?: string;
  activeOnly?: boolean;
  limit?: number;
};

type PresenceLeaseFilters = {
  namespace?: string;
  query?: string;
  activeOnly?: boolean;
  limit?: number;
};

type EventDeliveryFilters = {
  namespace?: string;
  eventName?: string;
  status?: string;
  query?: string;
  limit?: number;
};

type IncidentFilters = {
  status?: string;
  severity?: string;
  limit?: number;
};

type ReplayJobFilters = {
  status?: string;
  limit?: number;
};

type RecordSocketConnectedInput = {
  socketId: string;
  namespace: string;
  userId?: string | null;
  role?: string | null;
  transport?: string | null;
  authSource?: string | null;
  isAuthenticated?: boolean;
  rooms?: string[];
  handshakeQuery?: unknown;
  metadata?: Record<string, any> | null;
};

type RecordPresenceInput = {
  socketId: string;
  userId: string;
  namespace: string;
  rooms?: string[];
  metadata?: Record<string, any> | null;
};

type RecordIncidentInput = {
  code: string;
  severity?: string;
  source?: string;
  message: string;
  details?: unknown;
};

type ResolveIncidentInput = {
  notes?: string | null;
  status?: string;
};

type RecordDeliveryInput = {
  namespace: string;
  roomKey?: string | null;
  eventName: string;
  status?: string;
  targetCount?: number;
  triggeredBy?: string;
  triggeredByStaffId?: string | null;
  deliveryKey?: string | null;
  payload?: unknown;
  metadata?: unknown;
  persist?: boolean;
};

type ReplayDeliveryInput = {
  deliveryId: string;
  createdByStaffId?: string | null;
  io?: { emit: (event: string, payload: any) => void; to: (room: string) => { emit: (event: string, payload: any) => void } } | null;
  communityIo?: { emit: (event: string, payload: any) => void; to: (room: string) => { emit: (event: string, payload: any) => void } } | null;
};

const MAX_RUNTIME_EVENTS = 40;
const MAX_RUNTIME_ERRORS = 40;
const RECENT_INCIDENT_WINDOW_MS = 30 * 60 * 1000;

const runtimeSockets = new Map<string, RuntimeSocketRecord>();
const runtimePresenceByUser = new Map<string, Set<string>>();
const runtimeEvents = new Map<string, RuntimeEventRecord>();
const runtimeRecentIncidents: RuntimeIncidentRecord[] = [];

let peakConnectionCount = 0;

const nowIso = () => new Date().toISOString();
const trim = (value: unknown) => String(value || '').trim();
const normalizeNamespace = (value: unknown) => {
  const normalized = trim(value).toLowerCase();
  if (!normalized || normalized === 'root' || normalized === '/') return 'root';
  return normalized.replace(/^\/+/, '');
};
const normalizeLimit = (value: unknown, fallback = 25, max = 100) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.max(1, Math.round(parsed)), max);
};
const uniqueRooms = (rooms?: string[]) =>
  Array.from(new Set((Array.isArray(rooms) ? rooms : []).map((room) => trim(room)).filter(Boolean)));
const namespaceConnectionCount = (namespace: string) =>
  Array.from(runtimeSockets.values()).filter((entry) => entry.namespace === namespace).length;
const updatePeakConnections = () => {
  peakConnectionCount = Math.max(peakConnectionCount, runtimeSockets.size);
};

const shouldPersistEventDelivery = (eventName: string, persist?: boolean) => {
  if (persist === true) return true;
  if (persist === false) return false;
  return (
    /^presence:/.test(eventName) ||
    /^realtime:/.test(eventName) ||
    /^config:/.test(eventName) ||
    /^feature_flags:/.test(eventName) ||
    /^moderation:/.test(eventName) ||
    /^trust:/.test(eventName) ||
    /^apps:config_updated$/.test(eventName) ||
    /^homepage:guest_updated$/.test(eventName)
  );
};

const recordRuntimeIncident = (input: RuntimeIncidentRecord) => {
  runtimeRecentIncidents.unshift(input);
  if (runtimeRecentIncidents.length > MAX_RUNTIME_ERRORS) {
    runtimeRecentIncidents.length = MAX_RUNTIME_ERRORS;
  }
};

const recordRuntimeEventCounter = (input: {
  namespace: string;
  roomKey?: string | null;
  eventName: string;
  targetCount?: number;
  payload?: unknown;
  persisted?: boolean;
}) => {
  const namespace = normalizeNamespace(input.namespace);
  const roomKey = trim(input.roomKey) || null;
  const key = `${namespace}:${roomKey || '*'}:${trim(input.eventName)}`;
  const previous = runtimeEvents.get(key);
  const next: RuntimeEventRecord = {
    namespace,
    roomKey,
    eventName: trim(input.eventName),
    count: (previous?.count || 0) + 1,
    targetCount: Number(input.targetCount || 0),
    lastOccurredAt: nowIso(),
    persistedCount: (previous?.persistedCount || 0) + (input.persisted ? 1 : 0),
    lastPayloadSample: input.payload ?? previous?.lastPayloadSample ?? null
  };
  runtimeEvents.set(key, next);
  const ordered = Array.from(runtimeEvents.entries()).sort((a, b) =>
    String(b[1].lastOccurredAt).localeCompare(String(a[1].lastOccurredAt))
  );
  ordered.slice(MAX_RUNTIME_EVENTS).forEach(([staleKey]) => runtimeEvents.delete(staleKey));
};

const mapSocketSession = (row: any) => ({
  id: row.id,
  socketId: row.socketId,
  namespace: row.namespace,
  userId: row.userId || null,
  role: row.role || null,
  transport: row.transport || null,
  authSource: row.authSource || null,
  isAuthenticated: Boolean(row.isAuthenticated),
  rooms: Array.isArray(row.rooms) ? row.rooms : [],
  handshakeQuery: row.handshakeQuery || null,
  metadata: row.metadata || null,
  connectedAt: row.connectedAt,
  disconnectedAt: row.disconnectedAt,
  disconnectReason: row.disconnectReason || null,
  lastSeenAt: row.lastSeenAt,
  isLive: runtimeSockets.has(row.socketId)
});

const mapPresenceLease = (row: any) => ({
  id: row.id,
  socketId: row.socketId,
  userId: row.userId,
  namespace: row.namespace,
  status: row.status,
  rooms: Array.isArray(row.rooms) ? row.rooms : [],
  metadata: row.metadata || null,
  acquiredAt: row.acquiredAt,
  lastSeenAt: row.lastSeenAt,
  expiresAt: row.expiresAt,
  releasedAt: row.releasedAt,
  isLive: (runtimePresenceByUser.get(row.userId) || new Set<string>()).has(row.socketId)
});

const mapDelivery = (row: any) => ({
  id: row.id,
  namespace: row.namespace,
  roomKey: row.roomKey || null,
  eventName: row.eventName,
  status: row.status,
  targetCount: Number(row.targetCount || 0),
  triggeredBy: row.triggeredBy,
  triggeredByStaffId: row.triggeredByStaffId || null,
  deliveryKey: row.deliveryKey || null,
  payload: row.payload || null,
  metadata: row.metadata || null,
  occurredAt: row.occurredAt,
  replayedAt: row.replayedAt
});

const mapIncident = (row: any) => ({
  id: row.id,
  code: row.code,
  severity: row.severity,
  status: row.status,
  source: row.source,
  message: row.message,
  notes: row.notes || null,
  details: row.details || null,
  occurrences: Number(row.occurrences || 0),
  firstSeenAt: row.firstSeenAt,
  lastSeenAt: row.lastSeenAt,
  resolvedAt: row.resolvedAt,
  resolvedByStaffId: row.resolvedByStaffId || null
});

const mapReplayJob = (row: any) => ({
  id: row.id,
  deliveryId: row.deliveryId,
  namespace: row.namespace,
  roomKey: row.roomKey || null,
  eventName: row.eventName,
  status: row.status,
  payload: row.payload || null,
  result: row.result || null,
  createdByStaffId: row.createdByStaffId || null,
  createdAt: row.createdAt,
  completedAt: row.completedAt
});

export const getRealtimeRuntimeState = () => ({
  totalConnections: runtimeSockets.size,
  peakConnections: peakConnectionCount,
  rootConnections: namespaceConnectionCount('root'),
  communityConnections: namespaceConnectionCount('community'),
  activeUsers: runtimePresenceByUser.size,
  recentEvents: Array.from(runtimeEvents.values()).sort((a, b) =>
    String(b.lastOccurredAt).localeCompare(String(a.lastOccurredAt))
  ),
  recentIncidents: [...runtimeRecentIncidents],
  activeSockets: Array.from(runtimeSockets.values()).sort((a, b) =>
    String(b.connectedAt).localeCompare(String(a.connectedAt))
  )
});

export const recordRealtimeSocketConnected = async (input: RecordSocketConnectedInput) => {
  const socketId = trim(input.socketId);
  if (!socketId) return null;

  const entry: RuntimeSocketRecord = {
    socketId,
    namespace: normalizeNamespace(input.namespace),
    userId: trim(input.userId) || null,
    role: trim(input.role) || null,
    transport: trim(input.transport) || null,
    authSource: trim(input.authSource) || null,
    isAuthenticated: Boolean(input.isAuthenticated),
    rooms: uniqueRooms(input.rooms),
    connectedAt: nowIso(),
    lastSeenAt: nowIso(),
    metadata: input.metadata || null
  };

  runtimeSockets.set(socketId, entry);
  updatePeakConnections();

  await prisma.socketSession.upsert({
    where: { socketId },
    create: {
      socketId,
      namespace: entry.namespace,
      userId: entry.userId,
      role: entry.role,
      transport: entry.transport,
      authSource: entry.authSource,
      isAuthenticated: entry.isAuthenticated,
      rooms: entry.rooms,
      handshakeQuery: (input.handshakeQuery as any) || null,
      metadata: entry.metadata as any,
      connectedAt: new Date(),
      lastSeenAt: new Date(),
      disconnectedAt: null,
      disconnectReason: null
    },
    update: {
      namespace: entry.namespace,
      userId: entry.userId,
      role: entry.role,
      transport: entry.transport,
      authSource: entry.authSource,
      isAuthenticated: entry.isAuthenticated,
      rooms: entry.rooms,
      handshakeQuery: (input.handshakeQuery as any) || null,
      metadata: entry.metadata as any,
      connectedAt: new Date(),
      lastSeenAt: new Date(),
      disconnectedAt: null,
      disconnectReason: null
    }
  });

  return entry;
};

export const touchRealtimeSocketRooms = async (socketId: string, rooms?: string[]) => {
  const normalizedSocketId = trim(socketId);
  if (!normalizedSocketId) return;
  const normalizedRooms = uniqueRooms(rooms);
  const existing = runtimeSockets.get(normalizedSocketId);
  if (existing) {
    runtimeSockets.set(normalizedSocketId, {
      ...existing,
      rooms: normalizedRooms,
      lastSeenAt: nowIso()
    });
  }
  await prisma.socketSession.updateMany({
    where: { socketId: normalizedSocketId },
    data: {
      rooms: normalizedRooms,
      lastSeenAt: new Date()
    }
  });
};

export const recordRealtimeSocketDisconnected = async (socketId: string, reason?: string | null) => {
  const normalizedSocketId = trim(socketId);
  if (!normalizedSocketId) return;
  runtimeSockets.delete(normalizedSocketId);
  await prisma.socketSession.updateMany({
    where: { socketId: normalizedSocketId },
    data: {
      disconnectedAt: new Date(),
      disconnectReason: trim(reason) || null,
      lastSeenAt: new Date()
    }
  });
};

export const recordPresenceLease = async (input: RecordPresenceInput) => {
  const socketId = trim(input.socketId);
  const userId = trim(input.userId);
  if (!socketId || !userId) return null;

  const sockets = runtimePresenceByUser.get(userId) || new Set<string>();
  sockets.add(socketId);
  runtimePresenceByUser.set(userId, sockets);

  await prisma.presenceLease.upsert({
    where: { socketId },
    create: {
      socketId,
      userId,
      namespace: normalizeNamespace(input.namespace),
      status: 'ACTIVE',
      rooms: uniqueRooms(input.rooms),
      metadata: (input.metadata as any) || null,
      acquiredAt: new Date(),
      lastSeenAt: new Date(),
      releasedAt: null,
      expiresAt: null
    },
    update: {
      userId,
      namespace: normalizeNamespace(input.namespace),
      status: 'ACTIVE',
      rooms: uniqueRooms(input.rooms),
      metadata: (input.metadata as any) || null,
      lastSeenAt: new Date(),
      releasedAt: null,
      expiresAt: null
    }
  });

  return { socketId, userId };
};

export const releasePresenceLease = async (socketId: string, metadata?: Record<string, any> | null) => {
  const normalizedSocketId = trim(socketId);
  if (!normalizedSocketId) return null;

  const lease = await prisma.presenceLease.findUnique({
    where: { socketId: normalizedSocketId },
    select: { id: true, userId: true, metadata: true }
  });

  if (lease?.userId) {
    const sockets = runtimePresenceByUser.get(lease.userId);
    if (sockets) {
      sockets.delete(normalizedSocketId);
      if (!sockets.size) runtimePresenceByUser.delete(lease.userId);
    }
  }

  await prisma.presenceLease.updateMany({
    where: { socketId: normalizedSocketId },
    data: {
      status: 'RELEASED',
      metadata: { ...(lease?.metadata as any || {}), ...(metadata || {}) },
      releasedAt: new Date(),
      lastSeenAt: new Date()
    }
  });

  return lease;
};

export const recordRealtimeIncident = async (input: RecordIncidentInput) => {
  const code = trim(input.code) || 'SOCKET_RUNTIME';
  const source = trim(input.source) || 'socket';
  const severity = trim(input.severity) || 'ERROR';
  const message = trim(input.message) || 'Realtime incident';

  recordRuntimeIncident({
    code,
    source,
    severity,
    message,
    timestamp: nowIso(),
    context: input.details || null
  });

  const threshold = new Date(Date.now() - RECENT_INCIDENT_WINDOW_MS);
  const existing = await prisma.realtimeIncident.findFirst({
    where: {
      code,
      source,
      message,
      status: 'OPEN',
      lastSeenAt: { gte: threshold }
    },
    orderBy: { lastSeenAt: 'desc' }
  });

  const incident = existing
    ? await prisma.realtimeIncident.update({
        where: { id: existing.id },
        data: {
          severity,
          details: (input.details as any) || existing.details || null,
          occurrences: { increment: 1 },
          lastSeenAt: new Date()
        }
      })
    : await prisma.realtimeIncident.create({
        data: {
          code,
          severity,
          source,
          message,
          details: (input.details as any) || null,
          firstSeenAt: new Date(),
          lastSeenAt: new Date(),
          occurrences: 1
        }
      });

  return mapIncident(incident);
};

export const resolveRealtimeIncident = async (
  incidentId: string,
  input: ResolveIncidentInput,
  staffId?: string | null
) => {
  const normalizedIncidentId = trim(incidentId);
  if (!normalizedIncidentId) throw new Error('Incident id is required');
  const incident = await prisma.realtimeIncident.update({
    where: { id: normalizedIncidentId },
    data: {
      status: trim(input.status) || 'RESOLVED',
      notes: trim(input.notes) || null,
      resolvedAt: new Date(),
      resolvedByStaffId: trim(staffId) || null,
      lastSeenAt: new Date()
    }
  });
  return mapIncident(incident);
};

export const recordRealtimeEventDelivery = async (input: RecordDeliveryInput) => {
  const namespace = normalizeNamespace(input.namespace);
  const roomKey = trim(input.roomKey) || null;
  const eventName = trim(input.eventName);
  if (!eventName) return null;

  const shouldPersist = shouldPersistEventDelivery(eventName, input.persist);
  recordRuntimeEventCounter({
    namespace,
    roomKey,
    eventName,
    targetCount: Number(input.targetCount || 0),
    payload: input.payload,
    persisted: shouldPersist
  });

  if (!shouldPersist) return null;

  const delivery = await prisma.eventDelivery.create({
    data: {
      namespace,
      roomKey,
      eventName,
      status: trim(input.status) || 'SENT',
      targetCount: Number(input.targetCount || 0),
      triggeredBy: trim(input.triggeredBy) || 'system',
      triggeredByStaffId: trim(input.triggeredByStaffId) || null,
      deliveryKey: trim(input.deliveryKey) || null,
      payload: (input.payload as any) || null,
      metadata: (input.metadata as any) || null,
      occurredAt: new Date()
    }
  });

  return mapDelivery(delivery);
};

export const getRealtimeOpsSummary = async () => {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [persistedActiveSessions, activePresenceLeases, recentDeliveries, openIncidents, replayJobs] =
    await prisma.$transaction([
      prisma.socketSession.count({ where: { disconnectedAt: null } }),
      prisma.presenceLease.count({ where: { status: 'ACTIVE', releasedAt: null } }),
      prisma.eventDelivery.count({ where: { occurredAt: { gte: since } } }),
      prisma.realtimeIncident.count({ where: { status: 'OPEN' } }),
      prisma.deliveryReplayJob.count({ where: { createdAt: { gte: since } } })
    ]);

  const runtime = getRealtimeRuntimeState();
  return {
    liveConnections: runtime.totalConnections,
    persistedActiveSessions,
    communityConnections: runtime.communityConnections,
    rootConnections: runtime.rootConnections,
    peakConnections: runtime.peakConnections,
    activeUsers: runtime.activeUsers,
    activePresenceLeases,
    recentDeliveries,
    openIncidents,
    replayJobs,
    runtimeErrors: runtime.recentIncidents.length
  };
};

export const listRealtimeRuntime = async () => getRealtimeRuntimeState();

export const listSocketSessions = async (filters: SocketSessionFilters = {}) => {
  const query = trim(filters.query);
  const rows = await prisma.socketSession.findMany({
    where: {
      ...(trim(filters.namespace) ? { namespace: normalizeNamespace(filters.namespace) } : {}),
      ...(filters.activeOnly !== undefined ? { disconnectedAt: filters.activeOnly ? null : { not: null } } : {}),
      ...(query
        ? {
            OR: [
              { socketId: { contains: query, mode: 'insensitive' } },
              { userId: { contains: query, mode: 'insensitive' } },
              { role: { contains: query, mode: 'insensitive' } },
              { namespace: { contains: query, mode: 'insensitive' } },
              { disconnectReason: { contains: query, mode: 'insensitive' } }
            ]
          }
        : {})
    },
    orderBy: [{ disconnectedAt: 'asc' }, { connectedAt: 'desc' }],
    take: normalizeLimit(filters.limit, 30)
  });
  return rows.map(mapSocketSession);
};

export const listPresenceLeases = async (filters: PresenceLeaseFilters = {}) => {
  const query = trim(filters.query);
  const rows = await prisma.presenceLease.findMany({
    where: {
      ...(trim(filters.namespace) ? { namespace: normalizeNamespace(filters.namespace) } : {}),
      ...(filters.activeOnly !== undefined ? { status: filters.activeOnly ? 'ACTIVE' : undefined } : {}),
      ...(query
        ? {
            OR: [
              { socketId: { contains: query, mode: 'insensitive' } },
              { userId: { contains: query, mode: 'insensitive' } },
              { namespace: { contains: query, mode: 'insensitive' } }
            ]
          }
        : {})
    },
    orderBy: [{ releasedAt: 'asc' }, { lastSeenAt: 'desc' }],
    take: normalizeLimit(filters.limit, 30)
  });
  return rows.map(mapPresenceLease);
};

export const listEventDeliveries = async (filters: EventDeliveryFilters = {}) => {
  const query = trim(filters.query);
  const rows = await prisma.eventDelivery.findMany({
    where: {
      ...(trim(filters.namespace) ? { namespace: normalizeNamespace(filters.namespace) } : {}),
      ...(trim(filters.eventName) ? { eventName: { contains: trim(filters.eventName), mode: 'insensitive' } } : {}),
      ...(trim(filters.status) ? { status: trim(filters.status) } : {}),
      ...(query
        ? {
            OR: [
              { roomKey: { contains: query, mode: 'insensitive' } },
              { eventName: { contains: query, mode: 'insensitive' } },
              { triggeredBy: { contains: query, mode: 'insensitive' } }
            ]
          }
        : {})
    },
    orderBy: { occurredAt: 'desc' },
    take: normalizeLimit(filters.limit, 40)
  });
  return rows.map(mapDelivery);
};

export const listRealtimeIncidents = async (filters: IncidentFilters = {}) => {
  const rows = await prisma.realtimeIncident.findMany({
    where: {
      ...(trim(filters.status) ? { status: trim(filters.status) } : {}),
      ...(trim(filters.severity) ? { severity: trim(filters.severity) } : {})
    },
    orderBy: [{ status: 'asc' }, { lastSeenAt: 'desc' }],
    take: normalizeLimit(filters.limit, 30)
  });
  return rows.map(mapIncident);
};

export const listDeliveryReplayJobs = async (filters: ReplayJobFilters = {}) => {
  const rows = await prisma.deliveryReplayJob.findMany({
    where: {
      ...(trim(filters.status) ? { status: trim(filters.status) } : {})
    },
    orderBy: { createdAt: 'desc' },
    take: normalizeLimit(filters.limit, 30)
  });
  return rows.map(mapReplayJob);
};

export const replayEventDelivery = async (input: ReplayDeliveryInput) => {
  const deliveryId = trim(input.deliveryId);
  if (!deliveryId) throw new Error('Delivery id is required');

  const delivery = await prisma.eventDelivery.findUnique({ where: { id: deliveryId } });
  if (!delivery) throw new Error('Realtime delivery not found');

  const namespace = normalizeNamespace(delivery.namespace);
  const roomKey = trim(delivery.roomKey) || null;
  const payload = delivery.payload || null;

  const emitter = namespace === 'community' ? input.communityIo : input.io;
  if (!emitter) throw new Error('Realtime emitter is not available for replay');

  if (roomKey) emitter.to(roomKey).emit(delivery.eventName, payload);
  else emitter.emit(delivery.eventName, payload);

  const replay = await prisma.deliveryReplayJob.create({
    data: {
      deliveryId: delivery.id,
      namespace,
      roomKey,
      eventName: delivery.eventName,
      status: 'COMPLETED',
      payload: payload as any,
      result: {
        replayedAt: nowIso(),
        target: roomKey || 'namespace:broadcast'
      } as any,
      createdByStaffId: trim(input.createdByStaffId) || null,
      completedAt: new Date()
    }
  });

  await prisma.eventDelivery.update({
    where: { id: delivery.id },
    data: { replayedAt: new Date() }
  });

  recordRuntimeEventCounter({
    namespace,
    roomKey,
    eventName: delivery.eventName,
    targetCount: Number(delivery.targetCount || 0),
    payload,
    persisted: true
  });

  return {
    replay: mapReplayJob(replay),
    delivery: mapDelivery({ ...delivery, replayedAt: new Date() })
  };
};
