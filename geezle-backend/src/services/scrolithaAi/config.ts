/**
 * Phase 33.0 — Feature flags, kill switch, provider allowlist (privacy-first defaults).
 */
import prisma from '../../utils/prismaClient';
import {
  DEFAULT_AI_FEATURE_FLAGS,
  type AIFeatureFlags,
  type AIProviderId
} from './types';

const FLAG_KEY = 'scrolitha_ai_feature_flags';
const PROVIDER_KEY = 'scrolitha_ai_provider_config';

let flagsCache: AIFeatureFlags = { ...DEFAULT_AI_FEATURE_FLAGS };
let flagsLoadedAt = 0;
const FLAGS_TTL_MS = 15_000;

const isMissing = (err: any) =>
  err?.code === 'P2021' || err instanceof TypeError || /does not exist/i.test(String(err?.message || ''));

export type ProviderConfigState = {
  OLLAMA: { enabled: boolean; model?: string; timeoutMs?: number };
  GEMINI: { enabled: boolean; model?: string; timeoutMs?: number };
  OPENAI: { enabled: boolean; model?: string; timeoutMs?: number };
  MOCK: { enabled: boolean };
  /** Emergency: no real provider calls */
  emergencyShutdown: boolean;
};

const DEFAULT_PROVIDER_CONFIG: ProviderConfigState = {
  OLLAMA: { enabled: true, model: process.env.SCROLITHA_OLLAMA_MODEL || 'qwen3:14b', timeoutMs: 30_000 },
  GEMINI: { enabled: false, model: process.env.SCROLITHA_GEMINI_MODEL || 'gemini-pro', timeoutMs: 30_000 },
  OPENAI: { enabled: false, model: process.env.OPENAI_MODEL || 'gpt-4o-mini', timeoutMs: 30_000 },
  MOCK: { enabled: true },
  emergencyShutdown: false
};

let providerCache: ProviderConfigState = { ...DEFAULT_PROVIDER_CONFIG };
let providerLoadedAt = 0;

function mergeFlags(raw: unknown): AIFeatureFlags {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    ...DEFAULT_AI_FEATURE_FLAGS,
    ...Object.fromEntries(
      Object.keys(DEFAULT_AI_FEATURE_FLAGS).map((k) => [
        k,
        src[k] !== undefined ? Boolean(src[k]) : (DEFAULT_AI_FEATURE_FLAGS as any)[k]
      ])
    )
  } as AIFeatureFlags;
}

export async function loadAIFeatureFlags(force = false): Promise<AIFeatureFlags> {
  if (!force && Date.now() - flagsLoadedAt < FLAGS_TTL_MS) return flagsCache;
  try {
    const row = await (prisma as any).aIFeatureFlag?.findUnique?.({ where: { key: FLAG_KEY } });
    if (row?.value) {
      flagsCache = mergeFlags(row.value);
    } else {
      flagsCache = { ...DEFAULT_AI_FEATURE_FLAGS };
    }
  } catch (err) {
    if (!isMissing(err)) {
      /* keep defaults */
    }
    flagsCache = { ...DEFAULT_AI_FEATURE_FLAGS };
  }
  // Env hard overrides for Phase 33.0 safety
  if (process.env.SCROLITHA_AI_KILL_SWITCH === '1' || process.env.SCROLITHA_AI_KILL_SWITCH === 'true') {
    flagsCache = { ...flagsCache, killSwitch: true };
  }
  if (process.env.SCROLITHA_AI_ENABLE_PROVIDER_CALLS !== '1' && process.env.SCROLITHA_AI_ENABLE_PROVIDER_CALLS !== 'true') {
    // Production hard rule: provider calls off unless explicitly enabled in non-prod
    if (process.env.NODE_ENV === 'production' || process.env.SCROLITHA_AI_FORCE_NO_PROVIDER === '1') {
      flagsCache = { ...flagsCache, enableProviderCalls: false };
    }
  }
  flagsLoadedAt = Date.now();
  return flagsCache;
}

export function getAIFeatureFlagsSync(): AIFeatureFlags {
  return flagsCache;
}

export async function setAIFeatureFlags(
  partial: Partial<AIFeatureFlags>,
  updatedBy?: string
): Promise<AIFeatureFlags> {
  const current = await loadAIFeatureFlags(true);
  const next = { ...current, ...partial };
  // Never allow enableProviderCalls true in production via admin without env
  if (process.env.NODE_ENV === 'production' && process.env.SCROLITHA_AI_ALLOW_PROD_PROVIDER !== '1') {
    next.enableProviderCalls = false;
  }
  flagsCache = next;
  flagsLoadedAt = Date.now();
  try {
    await (prisma as any).aIFeatureFlag?.upsert?.({
      where: { key: FLAG_KEY },
      create: { key: FLAG_KEY, value: next, updatedBy: updatedBy || null },
      update: { value: next, version: { increment: 1 }, updatedBy: updatedBy || null }
    });
  } catch (err) {
    if (!isMissing(err)) {
      /* memory only */
    }
  }
  return next;
}

export async function loadProviderConfig(force = false): Promise<ProviderConfigState> {
  if (!force && Date.now() - providerLoadedAt < FLAGS_TTL_MS) return providerCache;
  try {
    const row = await (prisma as any).aIProviderConfiguration?.findUnique?.({
      where: { provider: 'GLOBAL' }
    });
    if (row?.config) {
      providerCache = { ...DEFAULT_PROVIDER_CONFIG, ...(row.config as object) } as ProviderConfigState;
    } else {
      providerCache = { ...DEFAULT_PROVIDER_CONFIG };
    }
  } catch {
    providerCache = { ...DEFAULT_PROVIDER_CONFIG };
  }
  providerLoadedAt = Date.now();
  return providerCache;
}

export async function setProviderConfig(
  partial: Partial<ProviderConfigState>,
  updatedBy?: string
): Promise<ProviderConfigState> {
  const current = await loadProviderConfig(true);
  const next = { ...current, ...partial };
  providerCache = next;
  providerLoadedAt = Date.now();
  try {
    await (prisma as any).aIProviderConfiguration?.upsert?.({
      where: { provider: 'GLOBAL' },
      create: {
        provider: 'GLOBAL',
        enabled: !next.emergencyShutdown,
        config: next,
        updatedBy: updatedBy || null
      },
      update: {
        enabled: !next.emergencyShutdown,
        config: next,
        updatedBy: updatedBy || null
      }
    });
  } catch {
    /* memory */
  }
  return next;
}

export function isProviderEnabled(id: AIProviderId, cfg: ProviderConfigState): boolean {
  if (cfg.emergencyShutdown && id !== 'MOCK') return false;
  if (id === 'DISABLED') return false;
  if (id === 'MOCK') return cfg.MOCK?.enabled !== false;
  if (id === 'OLLAMA') return cfg.OLLAMA?.enabled !== false;
  if (id === 'GEMINI') return Boolean(cfg.GEMINI?.enabled);
  if (id === 'OPENAI') return Boolean(cfg.OPENAI?.enabled);
  return false;
}

export default {
  loadAIFeatureFlags,
  setAIFeatureFlags,
  getAIFeatureFlagsSync,
  loadProviderConfig,
  setProviderConfig,
  isProviderEnabled
};
