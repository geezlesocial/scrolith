import prisma from '../utils/prismaClient';

export type MessengerVoiceConfig = {
  id: string;
  enabledVoiceCalls: boolean;
  enabledConferenceCalls: boolean;
  enabledVideoCalls: boolean;
  enabledVoiceNotes: boolean;
  maxParticipants: number;
  maxVoiceNoteDurationSeconds: number;
  blockedUserIds: string[];
  updatedById?: string | null;
  createdAt: Date;
  updatedAt: Date;
  _schemaMissing?: boolean;
};

export const MAX_MESSENGER_VOICE_PARTICIPANTS = 20;

const MESSENGER_VOICE_TABLE_NAMES = [
  'MessengerVoiceConfig',
  'VoiceCall',
  'VoiceCallParticipant',
  'VoiceNote'
];

const DEFAULT_CONFIG: Omit<MessengerVoiceConfig, 'createdAt' | 'updatedAt'> = {
  id: 'default',
  enabledVoiceCalls: true,
  enabledConferenceCalls: true,
  enabledVideoCalls: true,
  enabledVoiceNotes: true,
  maxParticipants: MAX_MESSENGER_VOICE_PARTICIPANTS,
  maxVoiceNoteDurationSeconds: 180,
  blockedUserIds: [],
  updatedById: null
};

const toBool = (value: any, fallback: boolean) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value > 0;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalized);
};

const toInt = (value: any, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.trunc(parsed);
};

const toStringArray = (value: any): string[] => {
  if (!value) return [];
  const source = Array.isArray(value)
    ? value
    : String(value)
        .split(/[\n,\s]+/g)
        .map((entry) => entry.trim())
        .filter(Boolean);
  return Array.from(new Set(source.map((entry) => String(entry || '').trim()).filter(Boolean)));
};

const clamp = (value: number, min: number, max: number) => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

export const isMessengerVoiceSchemaMissingError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '');
  if (code === 'P2022' && (message.includes('MessengerVoiceConfig') || message.includes('enabledVideoCalls'))) {
    return true;
  }
  if (code !== 'P2021') return false;
  return MESSENGER_VOICE_TABLE_NAMES.some((tableName) => message.includes(tableName));
};

export const getMessengerVoiceConfigFallback = (): MessengerVoiceConfig => ({
  ...DEFAULT_CONFIG,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  _schemaMissing: true
});

export const sanitizeMessengerVoiceConfigInput = (input: any) => {
  const payload = input && typeof input === 'object' ? input : {};
  return {
    enabledVoiceCalls: toBool(payload.enabledVoiceCalls ?? payload.enableVoiceCalls, DEFAULT_CONFIG.enabledVoiceCalls),
    enabledConferenceCalls: toBool(
      payload.enabledConferenceCalls ?? payload.enableConferenceCalls,
      DEFAULT_CONFIG.enabledConferenceCalls
    ),
    enabledVideoCalls: toBool(
      payload.enabledVideoCalls ?? payload.enableVideoCalls,
      DEFAULT_CONFIG.enabledVideoCalls
    ),
    enabledVoiceNotes: toBool(payload.enabledVoiceNotes ?? payload.enableVoiceNotes, DEFAULT_CONFIG.enabledVoiceNotes),
    maxParticipants: clamp(
      toInt(payload.maxParticipants ?? payload.maxConferenceParticipants, DEFAULT_CONFIG.maxParticipants),
      2,
      MAX_MESSENGER_VOICE_PARTICIPANTS
    ),
    maxVoiceNoteDurationSeconds: clamp(
      toInt(
        payload.maxVoiceNoteDurationSeconds ?? payload.maxVoiceNoteDuration ?? payload.maxVoiceNoteDurationSec,
        DEFAULT_CONFIG.maxVoiceNoteDurationSeconds
      ),
      5,
      900
    ),
    blockedUserIds: toStringArray(payload.blockedUserIds ?? payload.blockedUsers)
  };
};

export const getOrCreateMessengerVoiceConfig = async (): Promise<MessengerVoiceConfig> => {
  try {
    const config = await (prisma as any).messengerVoiceConfig.upsert({
      where: { id: 'default' },
      update: {},
      create: { ...DEFAULT_CONFIG }
    });
    return config as MessengerVoiceConfig;
  } catch (error: any) {
    if (isMessengerVoiceSchemaMissingError(error)) {
      console.warn('[messenger-voice] schema missing, serving fallback config');
      return getMessengerVoiceConfigFallback();
    }
    throw error;
  }
};

export const updateMessengerVoiceConfig = async (
  input: any,
  actorUserId?: string | null
): Promise<MessengerVoiceConfig> => {
  const sanitized = sanitizeMessengerVoiceConfigInput(input);
  try {
    const config = await (prisma as any).messengerVoiceConfig.upsert({
      where: { id: 'default' },
      update: {
        ...sanitized,
        updatedById: actorUserId || null
      },
      create: {
        id: 'default',
        ...DEFAULT_CONFIG,
        ...sanitized,
        updatedById: actorUserId || null
      }
    });
    return config as MessengerVoiceConfig;
  } catch (error: any) {
    if (isMessengerVoiceSchemaMissingError(error)) {
      const fallback = getMessengerVoiceConfigFallback();
      return {
        ...fallback,
        ...sanitized,
        updatedById: actorUserId || null
      };
    }
    throw error;
  }
};

export const isVoiceBlockedForUser = (config: MessengerVoiceConfig | null | undefined, userId: string) => {
  const blocked = Array.isArray(config?.blockedUserIds) ? config?.blockedUserIds : [];
  return blocked.includes(String(userId || '').trim());
};
