import type { LiveRealtimeConfig, LiveRealtimeIceServer } from '../../services/live';

const DEFAULT_STUN_URLS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun2.l.google.com:19302',
  'stun:stun.cloudflare.com:3478',
  'stun:global.stun.twilio.com:3478'
];

const sanitizeIceUrl = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  if (normalized.startsWith('stun:') || normalized.startsWith('stuns:')) {
    return raw.split('?')[0].trim() || null;
  }
  if (normalized.startsWith('turn:') || normalized.startsWith('turns:')) {
    return raw;
  }
  return null;
};

export const DEFAULT_LIVE_REALTIME_CONFIG: LiveRealtimeConfig = {
  signalMode: 'socket-webrtc',
  iceServers: [{ urls: [...DEFAULT_STUN_URLS] }],
  iceTransportPolicy: 'all',
  relayConfigured: false,
  relayRecommended: true,
  connectionTimeoutMs: 14_000,
  viewerRetryIntervalMs: 5_000,
  viewerRetryLimit: 5,
  diagnosticsEnabled: true
};

const normalizeIceServer = (entry: LiveRealtimeIceServer | null | undefined): LiveRealtimeIceServer | null => {
  if (!entry) return null;
  const urls = Array.from(
    new Set(
      (Array.isArray(entry.urls) ? entry.urls : [entry.urls])
        .map((value) => sanitizeIceUrl(value))
        .filter((value): value is string => Boolean(value))
    )
  );
  if (!urls.length) return null;
  return {
    urls,
    username: String(entry.username || '').trim() || undefined,
    credential: String(entry.credential || '').trim() || undefined
  };
};

export const normalizeLiveRealtimeConfig = (
  input: Partial<LiveRealtimeConfig> | null | undefined
): LiveRealtimeConfig => {
  const source = input && typeof input === 'object' ? input : {};
  const iceServers = Array.isArray(source.iceServers)
    ? source.iceServers
        .map((entry) => normalizeIceServer(entry))
        .filter((entry): entry is LiveRealtimeIceServer => Boolean(entry))
    : [];
  return {
    signalMode: 'socket-webrtc',
    iceServers: iceServers.length ? iceServers : DEFAULT_LIVE_REALTIME_CONFIG.iceServers,
    iceTransportPolicy: source.iceTransportPolicy === 'relay' ? 'relay' : 'all',
    relayConfigured: Boolean(source.relayConfigured),
    relayRecommended:
      typeof source.relayRecommended === 'boolean'
        ? source.relayRecommended
        : !Boolean(source.relayConfigured),
    connectionTimeoutMs: Math.max(6_000, Math.min(45_000, Number(source.connectionTimeoutMs || 14_000))),
    viewerRetryIntervalMs: Math.max(2_500, Math.min(15_000, Number(source.viewerRetryIntervalMs || 5_000))),
    viewerRetryLimit: Math.max(1, Math.min(10, Number(source.viewerRetryLimit || 5))),
    diagnosticsEnabled: source.diagnosticsEnabled !== false
  };
};

export const toLiveRtcConfiguration = (config: LiveRealtimeConfig): RTCConfiguration => ({
  iceServers: config.iceServers.map((server) => ({
    urls: server.urls,
    username: server.username || undefined,
    credential: server.credential || undefined
  })),
  iceTransportPolicy: config.iceTransportPolicy,
  iceCandidatePoolSize: config.relayConfigured ? 10 : 6,
  bundlePolicy: 'balanced'
});

export const getCandidateTypeLabel = (candidateType: string | null | undefined) => {
  const normalized = String(candidateType || '').trim().toLowerCase();
  if (!normalized) return 'Unknown';
  if (normalized === 'relay') return 'TURN relay';
  if (normalized === 'srflx') return 'Server reflexive';
  if (normalized === 'host') return 'Local host';
  if (normalized === 'prflx') return 'Peer reflexive';
  return normalized.toUpperCase();
};

export const getTransportModeLabel = (mode: string | null | undefined) => {
  const normalized = String(mode || '').trim().toLowerCase();
  if (normalized === 'webrtc-relay') return 'Relay protected';
  if (normalized === 'webrtc-direct') return 'Direct WebRTC';
  if (normalized === 'hls-fallback') return 'Playback fallback';
  return 'Negotiating';
};
