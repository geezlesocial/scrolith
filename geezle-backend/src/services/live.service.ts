import prisma from '../utils/prismaClient';

export type LiveConfig = {
  id: string;
  enabled: boolean;
  enableConference: boolean;
  maxParticipants: number;
  maxGuests: number;
  enableGifts: boolean;
  minGiftGcoin: number;
  maxGiftGcoin: number;
  enableRecording: boolean;
  defaultVisibility: string;
  rateLimitReactionsPerMinute: number;
  rateLimitChatPerMinute: number;
  updatedById?: string | null;
  createdAt: Date;
  updatedAt: Date;
  _schemaMissing?: boolean;
};

export type LiveRealtimeIceServer = {
  urls: string[];
  username?: string | null;
  credential?: string | null;
};

export type LiveRealtimeConfig = {
  signalMode: 'socket-webrtc';
  iceServers: LiveRealtimeIceServer[];
  iceTransportPolicy: 'all' | 'relay';
  relayConfigured: boolean;
  relayRecommended: boolean;
  connectionTimeoutMs: number;
  viewerRetryIntervalMs: number;
  viewerRetryLimit: number;
  diagnosticsEnabled: boolean;
};

export type LiveExperienceConfig = {
  enableReactions: boolean;
  enableShare: boolean;
  enableRepost: boolean;
  enableDashQuickAction: boolean;
  enableGiftShoutouts: boolean;
  showFeaturedRailInScrollFeed: boolean;
  showFeaturedRailInCommunityHome: boolean;
  showFeaturedRailInMemberHome: boolean;
  enableStandbyRecovery: boolean;
  keepViewerLayoutStable: boolean;
  enableSafetyNotice: boolean;
  safetyNoticeDelayMinutes: number;
  safetyNoticeRepeatMinutes: number;
  safetyNoticeVisibleSeconds: number;
  safetyNoticeText: string;
};

const LIVE_TABLE_NAMES = [
  'LiveConfig',
  'LiveSession',
  'LiveParticipant',
  'LiveInvite',
  'LiveGift',
  'LiveReactionCounter',
  'LiveReport'
];

const LIVE_EXPERIENCE_SCOPE = 'live_experience';

const DEFAULT_CONFIG: Omit<LiveConfig, 'createdAt' | 'updatedAt'> = {
  id: 'default',
  enabled: true,
  enableConference: true,
  maxParticipants: 20,
  maxGuests: 6,
  enableGifts: true,
  minGiftGcoin: 1,
  maxGiftGcoin: 50000,
  enableRecording: true,
  defaultVisibility: 'public',
  rateLimitReactionsPerMinute: 80,
  rateLimitChatPerMinute: 40,
  updatedById: null
};

const DEFAULT_STUN_URLS = [
  'stun:stun.l.google.com:19302',
  'stun:stun1.l.google.com:19302',
  'stun:stun2.l.google.com:19302',
  'stun:stun.cloudflare.com:3478',
  'stun:global.stun.twilio.com:3478'
];

const DEFAULT_EXPERIENCE_CONFIG: LiveExperienceConfig = {
  enableReactions: true,
  enableShare: true,
  enableRepost: true,
  enableDashQuickAction: true,
  enableGiftShoutouts: true,
  showFeaturedRailInScrollFeed: true,
  showFeaturedRailInCommunityHome: true,
  showFeaturedRailInMemberHome: true,
  enableStandbyRecovery: true,
  keepViewerLayoutStable: true,
  enableSafetyNotice: true,
  safetyNoticeDelayMinutes: 15,
  safetyNoticeRepeatMinutes: 15,
  safetyNoticeVisibleSeconds: 15,
  safetyNoticeText:
    'Warning: Illegal activity, nudity/explicit content, and illegal product promotion are prohibited. All livestreams must follow Scrolith Terms and Community Guidelines.'
};

const clamp = (value: number, min: number, max: number) => {
  if (!Number.isFinite(value)) return min;
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const toInt = (value: any, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
};

const toBool = (value: any, fallback: boolean) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalized);
};

const sanitizeNoticeText = (value: any, fallback: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return fallback;
  return normalized.slice(0, 500);
};

const normalizeVisibility = (value: any, fallback = 'public') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['public', 'network', 'followers', 'private'].includes(normalized)) return normalized;
  return fallback;
};

const toStringList = (value: any) =>
  Array.from(
    new Set(
      String(value || '')
        .split(/[,\n]+/g)
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
    )
  );

const sanitizeIceUrl = (value: any) => {
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

const normalizeIceServerEntry = (entry: any): LiveRealtimeIceServer | null => {
  if (!entry || typeof entry !== 'object') return null;
  const rawUrls = Array.isArray(entry.urls) ? entry.urls : [entry.urls];
  const urls: string[] = Array.from(
    new Set(
      rawUrls
        .map((value) => sanitizeIceUrl(value))
        .filter((value): value is string => Boolean(value))
    )
  );
  if (!urls.length) return null;
  const normalized: LiveRealtimeIceServer = { urls };
  const username = String(entry.username || '').trim();
  const credential = String(entry.credential || '').trim();
  if (username) normalized.username = username;
  if (credential) normalized.credential = credential;
  return normalized;
};

const parseIceServersFromEnv = (): LiveRealtimeIceServer[] => {
  const jsonValue = String(process.env.LIVE_RTC_ICE_SERVERS_JSON || '').trim();
  if (jsonValue) {
    try {
      const parsed = JSON.parse(jsonValue);
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      const normalized = rows
        .map((entry) => normalizeIceServerEntry(entry))
        .filter((entry): entry is LiveRealtimeIceServer => Boolean(entry));
      if (normalized.length) return normalized;
    } catch (error) {
      console.warn('[live] Failed to parse LIVE_RTC_ICE_SERVERS_JSON, falling back to discrete ICE env vars.', error);
    }
  }

  const stunUrls = toStringList(process.env.LIVE_RTC_STUN_URLS || DEFAULT_STUN_URLS.join(','))
    .map((value) => sanitizeIceUrl(value))
    .filter((value): value is string => Boolean(value));
  const turnUrls = toStringList(process.env.LIVE_RTC_TURN_URLS || '')
    .map((value) => sanitizeIceUrl(value))
    .filter((value): value is string => Boolean(value));
  const turnUsername = String(process.env.LIVE_RTC_TURN_USERNAME || '').trim();
  const turnCredential = String(process.env.LIVE_RTC_TURN_CREDENTIAL || '').trim();

  const iceServers: LiveRealtimeIceServer[] = [];
  if (stunUrls.length) {
    iceServers.push({ urls: stunUrls });
  }
  if (turnUrls.length) {
    const turnServer: LiveRealtimeIceServer = { urls: turnUrls };
    if (turnUsername) turnServer.username = turnUsername;
    if (turnCredential) turnServer.credential = turnCredential;
    iceServers.push(turnServer);
  }

  return iceServers.length ? iceServers : [{ urls: [...DEFAULT_STUN_URLS] }];
};

const hasRelayServer = (iceServers: LiveRealtimeIceServer[]) =>
  iceServers.some((server) =>
    server.urls.some((url) => {
      const normalized = String(url || '').trim().toLowerCase();
      return normalized.startsWith('turn:') || normalized.startsWith('turns:');
    })
  );

export const isLiveSchemaMissingError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  if (code !== 'P2021') return false;
  const message = String(error?.message || '');
  return LIVE_TABLE_NAMES.some((tableName) => message.includes(tableName));
};

export const getLiveConfigFallback = (): LiveConfig => ({
  ...DEFAULT_CONFIG,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  _schemaMissing: true
});

export const getDefaultLiveExperienceConfig = (): LiveExperienceConfig => ({
  ...DEFAULT_EXPERIENCE_CONFIG
});

export const sanitizeLiveExperienceConfigInput = (
  input: any,
  fallback: LiveExperienceConfig = DEFAULT_EXPERIENCE_CONFIG
): LiveExperienceConfig => {
  const payload = input && typeof input === 'object' ? input : {};
  return {
    enableReactions: toBool(payload.enableReactions, fallback.enableReactions),
    enableShare: toBool(payload.enableShare, fallback.enableShare),
    enableRepost: toBool(payload.enableRepost, fallback.enableRepost),
    enableDashQuickAction: toBool(payload.enableDashQuickAction, fallback.enableDashQuickAction),
    enableGiftShoutouts: toBool(payload.enableGiftShoutouts, fallback.enableGiftShoutouts),
    showFeaturedRailInScrollFeed: toBool(
      payload.showFeaturedRailInScrollFeed,
      fallback.showFeaturedRailInScrollFeed
    ),
    showFeaturedRailInCommunityHome: toBool(
      payload.showFeaturedRailInCommunityHome,
      fallback.showFeaturedRailInCommunityHome
    ),
    showFeaturedRailInMemberHome: toBool(
      payload.showFeaturedRailInMemberHome,
      fallback.showFeaturedRailInMemberHome
    ),
    enableStandbyRecovery: toBool(payload.enableStandbyRecovery, fallback.enableStandbyRecovery),
    keepViewerLayoutStable: toBool(payload.keepViewerLayoutStable, fallback.keepViewerLayoutStable),
    enableSafetyNotice: toBool(payload.enableSafetyNotice, fallback.enableSafetyNotice),
    safetyNoticeDelayMinutes: clamp(
      toInt(payload.safetyNoticeDelayMinutes, fallback.safetyNoticeDelayMinutes),
      0,
      240
    ),
    safetyNoticeRepeatMinutes: clamp(
      toInt(payload.safetyNoticeRepeatMinutes, fallback.safetyNoticeRepeatMinutes),
      1,
      240
    ),
    safetyNoticeVisibleSeconds: clamp(
      toInt(payload.safetyNoticeVisibleSeconds, fallback.safetyNoticeVisibleSeconds),
      3,
      120
    ),
    safetyNoticeText: sanitizeNoticeText(payload.safetyNoticeText, fallback.safetyNoticeText)
  };
};

export const sanitizeLiveConfigInput = (input: any) => {
  const payload = input && typeof input === 'object' ? input : {};
  return {
    enabled: toBool(payload.enabled, DEFAULT_CONFIG.enabled),
    enableConference: toBool(payload.enableConference, DEFAULT_CONFIG.enableConference),
    maxParticipants: clamp(
      toInt(payload.maxParticipants ?? payload.max_participants, DEFAULT_CONFIG.maxParticipants),
      2,
      20
    ),
    maxGuests: clamp(toInt(payload.maxGuests ?? payload.max_guests, DEFAULT_CONFIG.maxGuests), 1, 20),
    enableGifts: toBool(payload.enableGifts, DEFAULT_CONFIG.enableGifts),
    minGiftGcoin: clamp(toInt(payload.minGiftGcoin, DEFAULT_CONFIG.minGiftGcoin), 1, 1_000_000),
    maxGiftGcoin: clamp(toInt(payload.maxGiftGcoin, DEFAULT_CONFIG.maxGiftGcoin), 1, 5_000_000),
    enableRecording: toBool(payload.enableRecording, DEFAULT_CONFIG.enableRecording),
    defaultVisibility: normalizeVisibility(payload.defaultVisibility, DEFAULT_CONFIG.defaultVisibility),
    rateLimitReactionsPerMinute: clamp(
      toInt(payload.rateLimitReactionsPerMinute, DEFAULT_CONFIG.rateLimitReactionsPerMinute),
      10,
      500
    ),
    rateLimitChatPerMinute: clamp(
      toInt(payload.rateLimitChatPerMinute, DEFAULT_CONFIG.rateLimitChatPerMinute),
      5,
      400
    )
  };
};

export const getLiveRealtimeConfig = (): LiveRealtimeConfig => {
  const iceServers = parseIceServersFromEnv();
  const relayConfigured = hasRelayServer(iceServers);
  const defaultTransportPolicy = relayConfigured ? 'relay' : 'all';
  const requestedTransportPolicy = String(process.env.LIVE_RTC_TRANSPORT_POLICY || defaultTransportPolicy)
    .trim()
    .toLowerCase();
  return {
    signalMode: 'socket-webrtc',
    iceServers,
    iceTransportPolicy: relayConfigured && requestedTransportPolicy === 'relay' ? 'relay' : 'all',
    relayConfigured,
    relayRecommended: !relayConfigured,
    connectionTimeoutMs: clamp(toInt(process.env.LIVE_RTC_CONNECTION_TIMEOUT_MS, 14_000), 6_000, 45_000),
    viewerRetryIntervalMs: clamp(toInt(process.env.LIVE_RTC_VIEWER_RETRY_INTERVAL_MS, 5_000), 2_500, 15_000),
    viewerRetryLimit: clamp(toInt(process.env.LIVE_RTC_VIEWER_RETRY_LIMIT, 5), 1, 10),
    diagnosticsEnabled: toBool(process.env.LIVE_RTC_DIAGNOSTICS_ENABLED, true)
  };
};

export const getLiveExperienceConfig = async (): Promise<LiveExperienceConfig> => {
  try {
    const setting = await prisma.appSetting.findUnique({
      where: { scope: LIVE_EXPERIENCE_SCOPE }
    });
    const data = setting?.data && typeof setting.data === 'object' ? setting.data : {};
    return sanitizeLiveExperienceConfigInput(data, DEFAULT_EXPERIENCE_CONFIG);
  } catch (error) {
    console.warn('[live] Failed to load experience config, using defaults.', error);
    return getDefaultLiveExperienceConfig();
  }
};

export const updateLiveExperienceConfig = async (input: any): Promise<LiveExperienceConfig> => {
  const current = await getLiveExperienceConfig();
  const next = sanitizeLiveExperienceConfigInput(input, current);
  try {
    await prisma.appSetting.upsert({
      where: { scope: LIVE_EXPERIENCE_SCOPE },
      update: {
        data: next as any
      },
      create: {
        scope: LIVE_EXPERIENCE_SCOPE,
        data: next as any
      }
    });
    return next;
  } catch (error) {
    console.warn('[live] Failed to persist experience config, returning in-memory payload.', error);
    return next;
  }
};

export const getOrCreateLiveConfig = async (): Promise<LiveConfig> => {
  try {
    const config = await (prisma as any).liveConfig.upsert({
      where: { id: 'default' },
      update: {},
      create: { ...DEFAULT_CONFIG }
    });
    return config as LiveConfig;
  } catch (error: any) {
    if (isLiveSchemaMissingError(error)) {
      console.warn('[live] schema missing, serving fallback config');
      return getLiveConfigFallback();
    }
    throw error;
  }
};

export const updateLiveConfig = async (input: any, actorUserId?: string | null): Promise<LiveConfig> => {
  const sanitized = sanitizeLiveConfigInput(input);
  const corrected = {
    ...sanitized,
    maxGiftGcoin: Math.max(sanitized.maxGiftGcoin, sanitized.minGiftGcoin)
  };
  try {
    const config = await (prisma as any).liveConfig.upsert({
      where: { id: 'default' },
      update: {
        ...corrected,
        updatedById: actorUserId || null
      },
      create: {
        id: 'default',
        ...DEFAULT_CONFIG,
        ...corrected,
        updatedById: actorUserId || null
      }
    });
    return config as LiveConfig;
  } catch (error: any) {
    if (isLiveSchemaMissingError(error)) {
      return {
        ...getLiveConfigFallback(),
        ...corrected,
        updatedById: actorUserId || null
      };
    }
    throw error;
  }
};

export const resolveLiveParticipantLimit = (config?: Partial<LiveConfig> | null) =>
  clamp(Number(config?.maxParticipants || DEFAULT_CONFIG.maxParticipants), 2, 20);
