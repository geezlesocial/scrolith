import prisma from '../utils/prismaClient';

const LIVE_DIAGNOSTICS_SCOPE = 'live_diagnostics';
const MAX_REASON_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 320;
const MAX_DETAIL_KEYS = 12;
const MAX_DETAIL_STRING_LENGTH = 180;

export type LiveDiagnosticsThresholds = {
  viewerRetryCount: number;
  roundTripTimeMs: number;
  signalFailures: number;
  socketDisconnects: number;
  fallbackTransitions: number;
};

export type LiveDiagnosticsConfig = {
  enabled: boolean;
  sessionDiagnosticsAccess: boolean;
  retentionDays: number;
  maxEventsPerSession: number;
  alertThresholds: LiveDiagnosticsThresholds;
};

export type LiveDiagnosticsEvent = {
  id: string;
  at: string;
  source: 'client' | 'backend' | 'server';
  stage: string;
  severity: 'info' | 'warn' | 'error';
  sessionId?: string | null;
  userId?: string | null;
  socketId?: string | null;
  role?: string | null;
  signalKind?: string | null;
  transportMode?: string | null;
  retryCount?: number | null;
  roundTripTimeMs?: number | null;
  reason?: string | null;
  message?: string | null;
  details?: Record<string, any>;
};

export type LiveDiagnosticsSummary = {
  totalEvents: number;
  signalFailures: number;
  socketDisconnects: number;
  fallbackTransitions: number;
  peakRetryCount: number;
  latestTransportMode: string | null;
  latestRoundTripTimeMs: number | null;
  failureReasons: Array<{ reason: string; count: number }>;
  alerts: string[];
  lastEventAt: string | null;
};

const toBoolean = (value: unknown, fallback: boolean) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  return fallback;
};

const toNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
};

const toNullableNumber = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.round(parsed);
};

const truncateText = (value: unknown, maxLength: number) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
};

const isPlainObject = (value: any): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const nowIso = () => new Date().toISOString();

export const DEFAULT_LIVE_DIAGNOSTICS_CONFIG: LiveDiagnosticsConfig = {
  enabled: true,
  sessionDiagnosticsAccess: true,
  retentionDays: 14,
  maxEventsPerSession: 120,
  alertThresholds: {
    viewerRetryCount: 3,
    roundTripTimeMs: 1200,
    signalFailures: 3,
    socketDisconnects: 2,
    fallbackTransitions: 1
  }
};

export const normalizeLiveDiagnosticsConfig = (value: any): LiveDiagnosticsConfig => {
  const source = isPlainObject(value) ? value : {};
  const thresholds = isPlainObject(source.alertThresholds)
    ? source.alertThresholds
    : isPlainObject(source.alert_thresholds)
      ? source.alert_thresholds
      : {};

  return {
    enabled: toBoolean(source.enabled, DEFAULT_LIVE_DIAGNOSTICS_CONFIG.enabled),
    sessionDiagnosticsAccess: toBoolean(
      source.sessionDiagnosticsAccess ?? source.session_diagnostics_access,
      DEFAULT_LIVE_DIAGNOSTICS_CONFIG.sessionDiagnosticsAccess
    ),
    retentionDays: toNumber(
      source.retentionDays ?? source.retention_days,
      DEFAULT_LIVE_DIAGNOSTICS_CONFIG.retentionDays,
      1,
      90
    ),
    maxEventsPerSession: toNumber(
      source.maxEventsPerSession ?? source.max_events_per_session,
      DEFAULT_LIVE_DIAGNOSTICS_CONFIG.maxEventsPerSession,
      20,
      500
    ),
    alertThresholds: {
      viewerRetryCount: toNumber(
        thresholds.viewerRetryCount ?? thresholds.viewer_retry_count,
        DEFAULT_LIVE_DIAGNOSTICS_CONFIG.alertThresholds.viewerRetryCount,
        1,
        20
      ),
      roundTripTimeMs: toNumber(
        thresholds.roundTripTimeMs ?? thresholds.round_trip_time_ms,
        DEFAULT_LIVE_DIAGNOSTICS_CONFIG.alertThresholds.roundTripTimeMs,
        100,
        10000
      ),
      signalFailures: toNumber(
        thresholds.signalFailures ?? thresholds.signal_failures,
        DEFAULT_LIVE_DIAGNOSTICS_CONFIG.alertThresholds.signalFailures,
        1,
        50
      ),
      socketDisconnects: toNumber(
        thresholds.socketDisconnects ?? thresholds.socket_disconnects,
        DEFAULT_LIVE_DIAGNOSTICS_CONFIG.alertThresholds.socketDisconnects,
        1,
        50
      ),
      fallbackTransitions: toNumber(
        thresholds.fallbackTransitions ?? thresholds.fallback_transitions,
        DEFAULT_LIVE_DIAGNOSTICS_CONFIG.alertThresholds.fallbackTransitions,
        1,
        20
      )
    }
  };
};

export const getLiveDiagnosticsConfig = async (): Promise<LiveDiagnosticsConfig> => {
  try {
    const record = await prisma.appSetting.findUnique({
      where: { scope: LIVE_DIAGNOSTICS_SCOPE }
    });
    return normalizeLiveDiagnosticsConfig(record?.data);
  } catch (error) {
    console.warn('[live] Failed to load diagnostics config, using defaults.', error);
    return { ...DEFAULT_LIVE_DIAGNOSTICS_CONFIG };
  }
};

export const updateLiveDiagnosticsConfig = async (input: any): Promise<LiveDiagnosticsConfig> => {
  const config = normalizeLiveDiagnosticsConfig(input);
  await prisma.appSetting.upsert({
    where: { scope: LIVE_DIAGNOSTICS_SCOPE },
    create: { scope: LIVE_DIAGNOSTICS_SCOPE, data: config as any },
    update: { data: config as any }
  });
  return config;
};

const normalizeIsoDate = (value: unknown) => {
  const date = new Date(String(value || ''));
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const sanitizeDetails = (input: Record<string, any>) => {
  const excluded = new Set([
    'channel',
    'sessionId',
    'liveStage',
    'stage',
    'source',
    'severity',
    'reason',
    'message',
    'currentRoundTripTimeMs',
    'roundTripTimeMs',
    'retryCount',
    'transportMode',
    'signalKind',
    'signal',
    'sdp'
  ]);
  const details: Record<string, any> = {};
  for (const [key, rawValue] of Object.entries(input || {})) {
    if (excluded.has(key) || Object.keys(details).length >= MAX_DETAIL_KEYS) continue;
    if (rawValue === undefined || rawValue === null) continue;
    if (typeof rawValue === 'string') {
      const value = rawValue.trim();
      if (!value) continue;
      details[key] = value.slice(0, MAX_DETAIL_STRING_LENGTH);
      continue;
    }
    if (typeof rawValue === 'number') {
      if (!Number.isFinite(rawValue)) continue;
      details[key] = Math.round(rawValue * 100) / 100;
      continue;
    }
    if (typeof rawValue === 'boolean') {
      details[key] = rawValue;
      continue;
    }
    if (Array.isArray(rawValue)) {
      const compact = rawValue
        .filter((entry) => ['string', 'number', 'boolean'].includes(typeof entry))
        .slice(0, 6)
        .map((entry) => (typeof entry === 'string' ? entry.slice(0, 80) : entry));
      if (compact.length) details[key] = compact;
    }
  }
  return Object.keys(details).length ? details : undefined;
};

const inferSeverity = (stage: string, explicitSeverity?: unknown) => {
  const normalized = String(explicitSeverity || '').trim().toLowerCase();
  if (normalized === 'info' || normalized === 'warn' || normalized === 'error') {
    return normalized as 'info' | 'warn' | 'error';
  }
  if (/(error|failed|failure)/i.test(stage)) return 'error';
  if (/(fallback|retry|disconnect|skipped|timeout)/i.test(stage)) return 'warn';
  return 'info';
};

export const normalizeLiveDiagnosticsEvent = (input: any): LiveDiagnosticsEvent | null => {
  const source = String(input?.source || '').trim().toLowerCase();
  const normalizedSource: 'client' | 'backend' | 'server' =
    source === 'backend' || source === 'server' ? (source as 'backend' | 'server') : 'client';
  const stage = truncateText(input?.liveStage ?? input?.stage ?? input?.event, 120) || 'unknown';
  const severity = inferSeverity(stage, input?.severity);
  const transportMode = truncateText(input?.transportMode ?? input?.transport_mode, 40);
  const reason =
    truncateText(input?.reason ?? input?.code ?? input?.errorCode, MAX_REASON_LENGTH) ||
    (severity === 'error' ? truncateText(stage, MAX_REASON_LENGTH) : null);
  const message = truncateText(input?.message, MAX_MESSAGE_LENGTH);
  const details = sanitizeDetails({
    ...(isPlainObject(input) ? input : {}),
    ...(isPlainObject(input?.details) ? input.details : {})
  });

  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    at: normalizeIsoDate(input?.at ?? input?.timestamp ?? input?.emittedAt) || nowIso(),
    source: normalizedSource,
    stage,
    severity,
    sessionId: truncateText(input?.sessionId, 80),
    userId: truncateText(input?.userId ?? input?.fromUserId, 80),
    socketId: truncateText(input?.socketId ?? input?.fromSocketId, 80),
    role: truncateText(input?.role, 40),
    signalKind: truncateText(input?.signalKind ?? input?.signal?.kind, 40),
    transportMode,
    retryCount: toNullableNumber(input?.retryCount ?? input?.retry_count),
    roundTripTimeMs: toNullableNumber(
      input?.roundTripTimeMs ?? input?.round_trip_time_ms ?? input?.currentRoundTripTimeMs
    ),
    reason,
    message,
    details
  };
};

const getDiagnosticsBucket = (metadata: any) => {
  if (isPlainObject(metadata?.diagnostics)) {
    return metadata.diagnostics as Record<string, any>;
  }
  return {};
};

const isEventWithinRetention = (event: LiveDiagnosticsEvent, retentionDays: number) => {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const timestamp = new Date(String(event?.at || '')).getTime();
  if (!Number.isFinite(timestamp)) return true;
  return timestamp >= cutoff;
};

export const getLiveDiagnosticsEvents = (
  metadata: any,
  config: LiveDiagnosticsConfig = DEFAULT_LIVE_DIAGNOSTICS_CONFIG
): LiveDiagnosticsEvent[] => {
  const diagnostics = getDiagnosticsBucket(metadata);
  const rawEvents = Array.isArray(diagnostics.events) ? diagnostics.events : [];
  const normalized = rawEvents
    .map((entry) => normalizeLiveDiagnosticsEvent(entry))
    .filter((entry): entry is LiveDiagnosticsEvent => Boolean(entry))
    .filter((entry) => isEventWithinRetention(entry, config.retentionDays));
  const maxEvents = Math.max(1, config.maxEventsPerSession);
  return normalized.slice(-maxEvents);
};

const collectFailureReasons = (events: LiveDiagnosticsEvent[]) => {
  const counts = new Map<string, number>();
  events.forEach((event) => {
    if (event.severity === 'info') return;
    const reason =
      truncateText(event.reason, MAX_REASON_LENGTH) ||
      truncateText(event.message, MAX_REASON_LENGTH) ||
      truncateText(event.stage, MAX_REASON_LENGTH);
    if (!reason) return;
    counts.set(reason, Number(counts.get(reason) || 0) + 1);
  });
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([reason, count]) => ({ reason, count }));
};

export const buildLiveDiagnosticsSummary = (
  metadata: any,
  config: LiveDiagnosticsConfig = DEFAULT_LIVE_DIAGNOSTICS_CONFIG
): LiveDiagnosticsSummary | null => {
  const events = getLiveDiagnosticsEvents(metadata, config);
  if (!events.length) {
    return {
      totalEvents: 0,
      signalFailures: 0,
      socketDisconnects: 0,
      fallbackTransitions: 0,
      peakRetryCount: 0,
      latestTransportMode: null,
      latestRoundTripTimeMs: null,
      failureReasons: [],
      alerts: [],
      lastEventAt: null
    };
  }

  const signalFailures = events.filter(
    (event) => event.severity === 'error' && /(signal|offer|answer|candidate)/i.test(event.stage)
  ).length;
  const socketDisconnects = events.filter((event) => /socket:disconnect/i.test(event.stage)).length;
  const fallbackTransitions = events.filter(
    (event) => event.transportMode === 'hls-fallback' || /fallback/i.test(event.stage)
  ).length;
  const peakRetryCount = events.reduce((max, event) => Math.max(max, Number(event.retryCount || 0)), 0);
  const latestTransportEvent = [...events]
    .reverse()
    .find((event) => String(event.transportMode || '').trim());
  const latestRttEvent = [...events]
    .reverse()
    .find((event) => Number.isFinite(Number(event.roundTripTimeMs)));
  const latestTransportMode = latestTransportEvent?.transportMode || null;
  const latestRoundTripTimeMs =
    latestRttEvent && Number.isFinite(Number(latestRttEvent.roundTripTimeMs))
      ? Number(latestRttEvent.roundTripTimeMs)
      : null;

  const alerts: string[] = [];
  if (peakRetryCount >= config.alertThresholds.viewerRetryCount) alerts.push('High viewer retry rate');
  if ((latestRoundTripTimeMs || 0) >= config.alertThresholds.roundTripTimeMs) alerts.push('High round-trip latency');
  if (signalFailures >= config.alertThresholds.signalFailures) alerts.push('Signal failures rising');
  if (socketDisconnects >= config.alertThresholds.socketDisconnects) alerts.push('Socket disconnects rising');
  if (fallbackTransitions >= config.alertThresholds.fallbackTransitions) alerts.push('Fallback transport engaged');

  return {
    totalEvents: events.length,
    signalFailures,
    socketDisconnects,
    fallbackTransitions,
    peakRetryCount,
    latestTransportMode,
    latestRoundTripTimeMs,
    failureReasons: collectFailureReasons(events),
    alerts,
    lastEventAt: events[events.length - 1]?.at || null
  };
};

export const appendLiveDiagnosticsEvent = async (
  sessionId: string,
  input: any,
  config?: LiveDiagnosticsConfig
) => {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) return null;

  const diagnosticsConfig = config || (await getLiveDiagnosticsConfig());
  if (!diagnosticsConfig.enabled) return null;

  const event = normalizeLiveDiagnosticsEvent({
    ...(isPlainObject(input) ? input : {}),
    sessionId: normalizedSessionId
  });
  if (!event) return null;

  const session = await (prisma as any).liveSession.findUnique({
    where: { id: normalizedSessionId },
    select: {
      id: true,
      metadata: true
    }
  });
  if (!session) return null;

  const metadata = isPlainObject(session.metadata) ? { ...(session.metadata as Record<string, any>) } : {};
  const existingEvents = getLiveDiagnosticsEvents(metadata, diagnosticsConfig);
  const nextEvents = [...existingEvents, event].slice(-diagnosticsConfig.maxEventsPerSession);

  await (prisma as any).liveSession.update({
    where: { id: normalizedSessionId },
    data: {
      metadata: {
        ...metadata,
        diagnostics: {
          version: 1,
          updatedAt: nowIso(),
          lastStage: event.stage,
          events: nextEvents
        }
      }
    }
  });

  return event;
};
