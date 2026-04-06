import prisma from '../utils/prismaClient';

export type ScrollConfig = {
  id: string;
  enabled: boolean;
  maxDurationSeconds: number;
  aiLabelRequired: boolean;
  autoModeration: boolean;
  monetizationEnabled: boolean;
  defaultVisibility: string;
  impressionThresholdSeconds: number;
  headlinePreviewCharacters: number;
  descriptionPreviewCharacters: number;
  allowedFilterPresets: string[];
  updatedById?: string | null;
  createdAt: Date;
  updatedAt: Date;
  _schemaMissing?: boolean;
};

const SCROLL_TABLE_NAMES = [
  'ScrollConfig',
  'ScrollVideo',
  'ScrollSeries',
  'ScrollSeriesItem',
  'ScrollTag',
  'ScrollEngagement',
  'ScrollHidden',
  'ScrollFeedback',
  'ScrollReport',
  'ScrollPostingRestriction'
];

const DEFAULT_CONFIG: Omit<ScrollConfig, 'createdAt' | 'updatedAt'> = {
  id: 'default',
  enabled: true,
  maxDurationSeconds: 90,
  aiLabelRequired: false,
  autoModeration: false,
  monetizationEnabled: true,
  defaultVisibility: 'public',
  impressionThresholdSeconds: 2,
  headlinePreviewCharacters: 72,
  descriptionPreviewCharacters: 120,
  allowedFilterPresets: ['none', 'vibrant', 'cinematic', 'bw', 'sepia', 'warm'],
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

const clamp = (value: number, min: number, max: number) => {
  if (value < min) return min;
  if (value > max) return max;
  return value;
};

const normalizeVisibility = (value: any, fallback = 'public') => {
  const normalized = String(value || '').trim().toLowerCase();
  if (['public', 'network', 'followers', 'private'].includes(normalized)) return normalized;
  return fallback;
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

export const isScrollSchemaMissingError = (error: any) => {
  const code = String(error?.code || '').toUpperCase();
  if (code !== 'P2021') return false;
  const message = String(error?.message || '');
  return SCROLL_TABLE_NAMES.some((tableName) => message.includes(tableName));
};

export const getScrollConfigFallback = (): ScrollConfig => ({
  ...DEFAULT_CONFIG,
  createdAt: new Date(0),
  updatedAt: new Date(0),
  _schemaMissing: true
});

export const sanitizeScrollConfigInput = (input: any) => {
  const payload = input && typeof input === 'object' ? input : {};
  return {
    enabled: toBool(payload.enabled, DEFAULT_CONFIG.enabled),
    maxDurationSeconds: clamp(
      toInt(payload.maxDurationSeconds ?? payload.maxDuration, DEFAULT_CONFIG.maxDurationSeconds),
      5,
      600
    ),
    aiLabelRequired: toBool(payload.aiLabelRequired, DEFAULT_CONFIG.aiLabelRequired),
    autoModeration: toBool(payload.autoModeration, DEFAULT_CONFIG.autoModeration),
    monetizationEnabled: toBool(payload.monetizationEnabled, DEFAULT_CONFIG.monetizationEnabled),
    defaultVisibility: normalizeVisibility(payload.defaultVisibility, DEFAULT_CONFIG.defaultVisibility),
    impressionThresholdSeconds: clamp(
      toInt(payload.impressionThresholdSeconds ?? payload.impressionThreshold, DEFAULT_CONFIG.impressionThresholdSeconds),
      1,
      15
    ),
    headlinePreviewCharacters: clamp(
      toInt(payload.headlinePreviewCharacters ?? payload.headlinePreviewLimit, DEFAULT_CONFIG.headlinePreviewCharacters),
      40,
      220
    ),
    descriptionPreviewCharacters: clamp(
      toInt(
        payload.descriptionPreviewCharacters ?? payload.descriptionPreviewLimit,
        DEFAULT_CONFIG.descriptionPreviewCharacters
      ),
      60,
      480
    ),
    allowedFilterPresets: toStringArray(payload.allowedFilterPresets ?? payload.filters)
  };
};

export const getOrCreateScrollConfig = async (): Promise<ScrollConfig> => {
  try {
    const config = await (prisma as any).scrollConfig.upsert({
      where: { id: 'default' },
      update: {},
      create: { ...DEFAULT_CONFIG }
    });
    return config as ScrollConfig;
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      console.warn('[scroll] schema missing, serving fallback config');
      return getScrollConfigFallback();
    }
    throw error;
  }
};

export const updateScrollConfig = async (input: any, actorUserId?: string | null): Promise<ScrollConfig> => {
  const sanitized = sanitizeScrollConfigInput(input);
  try {
    const config = await (prisma as any).scrollConfig.upsert({
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
    return config as ScrollConfig;
  } catch (error: any) {
    if (isScrollSchemaMissingError(error)) {
      const fallback = getScrollConfigFallback();
      return {
        ...fallback,
        ...sanitized,
        updatedById: actorUserId || null
      };
    }
    throw error;
  }
};
