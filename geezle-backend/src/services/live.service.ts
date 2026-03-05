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

const LIVE_TABLE_NAMES = [
  'LiveConfig',
  'LiveSession',
  'LiveParticipant',
  'LiveInvite',
  'LiveGift',
  'LiveReactionCounter',
  'LiveReport'
];

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

const normalizeVisibility = (value: any, fallback = 'public') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['public', 'network', 'followers', 'private'].includes(normalized)) return normalized;
  return fallback;
};

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
