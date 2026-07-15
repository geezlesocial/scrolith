/**
 * Feature rollout framework — independently toggle Scrolitha capabilities via config/env.
 * No code deploys required to enable/disable individual features.
 */
import { ensureScrolithaConfig } from './scrolitha.policy';
import { enterpriseCache } from './scrolitha.enterpriseCache';

export type ScrolithaCapability =
  | 'master'
  | 'contextualIntelligence'
  | 'aiReplies'
  | 'proactiveSuggestions'
  | 'actionCards'
  | 'deepSearch'
  | 'recommendationEngine'
  | 'osSurface'
  | 'diagnostics'
  | 'moderationAssist'
  | 'intelligenceAsk'
  | 'eventIntelligence'
  | 'governance'
  | 'streaming'
  | 'persistentMemory'
  | 'personalization'
  | 'trustVerification'
  | 'learningLoop';

export type ScrolithaRolloutFlags = Record<ScrolithaCapability, boolean>;

/**
 * Safe-by-default rollout: user-facing AI is OFF until explicitly enabled
 * via env (SCROLITHA_ROLLOUT_*) or ScrolithaConfig.metadata.rollout.
 * diagnostics remains ON so staff health/diagnostics endpoints work when
 * permission-gated (admin/moderator); master-off still does not block diagnostics.
 */
const DEFAULT_FLAGS: ScrolithaRolloutFlags = {
  master: false,
  contextualIntelligence: false,
  aiReplies: false,
  proactiveSuggestions: false,
  actionCards: false,
  deepSearch: false,
  recommendationEngine: false,
  osSurface: false,
  diagnostics: true,
  moderationAssist: false,
  intelligenceAsk: false,
  eventIntelligence: false,
  governance: false,
  streaming: false,
  persistentMemory: false,
  personalization: false,
  trustVerification: false,
  learningLoop: false
};

const ENV_MAP: Partial<Record<ScrolithaCapability, string>> = {
  master: 'SCROLITHA_ROLLOUT_MASTER',
  contextualIntelligence: 'SCROLITHA_ROLLOUT_CONTEXTUAL',
  aiReplies: 'SCROLITHA_ROLLOUT_AI_REPLIES',
  proactiveSuggestions: 'SCROLITHA_ROLLOUT_PROACTIVE',
  actionCards: 'SCROLITHA_ROLLOUT_ACTION_CARDS',
  deepSearch: 'SCROLITHA_ROLLOUT_DEEP_SEARCH',
  recommendationEngine: 'SCROLITHA_ROLLOUT_RECOMMENDATIONS',
  osSurface: 'SCROLITHA_ROLLOUT_OS_SURFACE',
  diagnostics: 'SCROLITHA_ROLLOUT_DIAGNOSTICS',
  moderationAssist: 'SCROLITHA_ROLLOUT_MODERATION',
  intelligenceAsk: 'SCROLITHA_ROLLOUT_INTELLIGENCE',
  eventIntelligence: 'SCROLITHA_ROLLOUT_EVENTS',
  governance: 'SCROLITHA_ROLLOUT_GOVERNANCE',
  streaming: 'SCROLITHA_ROLLOUT_STREAMING',
  persistentMemory: 'SCROLITHA_ROLLOUT_MEMORY',
  personalization: 'SCROLITHA_ROLLOUT_PERSONALIZATION',
  trustVerification: 'SCROLITHA_ROLLOUT_TRUST',
  learningLoop: 'SCROLITHA_ROLLOUT_LEARNING'
};

const asBool = (value: unknown, fallback: boolean) => {
  if (typeof value === 'boolean') return value;
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(raw)) return false;
  return fallback;
};

const readEnvFlag = (cap: ScrolithaCapability, fallback: boolean) => {
  const envKey = ENV_MAP[cap];
  if (!envKey) return fallback;
  return asBool(process.env[envKey], fallback);
};

/**
 * Resolve rollout flags from:
 * 1) env overrides (highest)
 * 2) ScrolithaConfig.metadata.rollout / featureFlags
 * 3) defaults (user-facing OFF; diagnostics ON)
 * Master=false disables all user-facing AI capabilities (diagnostics may stay on for admins).
 */
export const resolveScrolithaRolloutFlags = async (): Promise<ScrolithaRolloutFlags> => {
  const cacheKey = 'rollout:flags:v1';
  const cached = enterpriseCache.get<ScrolithaRolloutFlags>('analytics', cacheKey);
  if (cached) return cached;

  let fromConfig: Partial<ScrolithaRolloutFlags> = {};
  try {
    const config = await ensureScrolithaConfig('user');
    const meta = (config?.metadata && typeof config.metadata === 'object' ? config.metadata : {}) as Record<
      string,
      any
    >;
    const rollout =
      (meta.rollout && typeof meta.rollout === 'object' && !Array.isArray(meta.rollout) && meta.rollout) ||
      (meta.featureFlags && typeof meta.featureFlags === 'object' && !Array.isArray(meta.featureFlags) && meta.featureFlags) ||
      (meta.scrolithaRollout && typeof meta.scrolithaRollout === 'object' && meta.scrolithaRollout) ||
      {};

    // Also honor contextualPostIntelligence.enabled as contextual + replies
    const contextual = meta.contextualPostIntelligence || meta.contextual_post_intelligence;
    if (contextual && typeof contextual === 'object') {
      if (contextual.enabled === false) {
        fromConfig.contextualIntelligence = false;
        fromConfig.aiReplies = false;
      }
      if (contextual.proactiveSuggestions === false) {
        fromConfig.proactiveSuggestions = false;
      }
    }
    if (config?.enabled === false) {
      fromConfig.master = false;
    }

    for (const key of Object.keys(DEFAULT_FLAGS) as ScrolithaCapability[]) {
      if (rollout[key] !== undefined) {
        fromConfig[key] = asBool(rollout[key], DEFAULT_FLAGS[key]);
      }
    }
  } catch {
    // config unavailable — defaults
  }

  const flags = { ...DEFAULT_FLAGS };
  for (const key of Object.keys(DEFAULT_FLAGS) as ScrolithaCapability[]) {
    const base = fromConfig[key] !== undefined ? Boolean(fromConfig[key]) : DEFAULT_FLAGS[key];
    flags[key] = readEnvFlag(key, base);
  }

  // Master kill switch
  if (!flags.master) {
    for (const key of Object.keys(flags) as ScrolithaCapability[]) {
      if (key === 'master' || key === 'diagnostics') continue;
      flags[key] = false;
    }
  }

  enterpriseCache.set('analytics', cacheKey, flags, 15_000);
  return flags;
};

export const isCapabilityEnabled = async (cap: ScrolithaCapability): Promise<boolean> => {
  const flags = await resolveScrolithaRolloutFlags();
  if (!flags.master && cap !== 'diagnostics' && cap !== 'master') return false;
  return Boolean(flags[cap]);
};

export const assertCapabilityEnabled = async (cap: ScrolithaCapability, label?: string) => {
  const ok = await isCapabilityEnabled(cap);
  if (!ok) {
    const name = label || cap;
    const err = new Error(`${name} is currently disabled by rollout configuration`);
    (err as any).statusCode = 403;
    (err as any).code = 'SCROLITHA_CAPABILITY_DISABLED';
    (err as any).capability = cap;
    throw err;
  }
};

export const getRolloutSummary = async () => {
  const flags = await resolveScrolithaRolloutFlags();
  return {
    flags,
    sources: {
      configMetadataKeys: ['metadata.rollout', 'metadata.featureFlags', 'metadata.scrolithaRollout'],
      envPrefix: 'SCROLITHA_ROLLOUT_*',
      masterEnv: 'SCROLITHA_ROLLOUT_MASTER'
    },
    rollback: {
      disableAll: 'Set SCROLITHA_ROLLOUT_MASTER=false or ScrolithaConfig.enabled=false / metadata.rollout.master=false',
      disableOsOnly: 'SCROLITHA_ROLLOUT_OS_SURFACE=false',
      disableRepliesOnly: 'SCROLITHA_ROLLOUT_AI_REPLIES=false',
      disableSearchOnly: 'SCROLITHA_ROLLOUT_DEEP_SEARCH=false',
      note: 'Disabling Scrolitha capabilities does not affect messaging, posts, comments, feeds, notifications, communities, moderation, jobs, or services core paths.'
    }
  };
};

/** Clear cached flags after admin config updates */
export const invalidateRolloutCache = () => {
  enterpriseCache.delete('analytics', 'rollout:flags:v1');
};
