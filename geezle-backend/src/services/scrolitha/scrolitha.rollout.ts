/**
 * Feature rollout framework — independently toggle Scrolitha capabilities via config/env.
 * Supports public master kill-switch plus internal-only allowlist without public rollout.
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
  | 'learningLoop'
  /** Phase 20.7: official messaging assistant DM surface */
  | 'messagingAssistant';

export type ScrolithaRolloutFlags = Record<ScrolithaCapability, boolean>;

/** Minimal actor shape for access decisions (request actors + system actors). */
export type ScrolithaAccessActor = {
  id?: string | null;
  role?: string | null;
  email?: string | null;
  isAdmin?: boolean;
};

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
  learningLoop: false,
  messagingAssistant: false
};

/**
 * Capabilities enabled for approved internal actors when master is still false.
 * eventIntelligence stays off by default (higher blast radius).
 */
const INTERNAL_CAPABILITY_DEFAULTS: ScrolithaRolloutFlags = {
  master: true,
  contextualIntelligence: true,
  aiReplies: true,
  proactiveSuggestions: true,
  actionCards: true,
  deepSearch: true,
  recommendationEngine: true,
  osSurface: true,
  diagnostics: true,
  moderationAssist: true,
  intelligenceAsk: true,
  eventIntelligence: false,
  governance: true,
  streaming: true,
  persistentMemory: true,
  personalization: true,
  trustVerification: true,
  learningLoop: true,
  messagingAssistant: true
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
  learningLoop: 'SCROLITHA_ROLLOUT_LEARNING',
  messagingAssistant: 'SCROLITHA_ROLLOUT_MESSAGING_ASSISTANT'
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

export const isInternalRolloutEnabled = () => asBool(process.env.SCROLITHA_INTERNAL_ROLLOUT, false);

export const getInternalAllowlist = (): { ids: string[]; emails: string[] } => {
  const raw = String(process.env.SCROLITHA_INTERNAL_ALLOWLIST || '').trim();
  const ids: string[] = [];
  const emails: string[] = [];
  if (!raw) return { ids, emails };
  for (const part of raw.split(/[,;\n\r\t ]+/)) {
    const token = String(part || '').trim();
    if (!token) continue;
    if (token.includes('@')) emails.push(token.toLowerCase());
    else ids.push(token);
  }
  return { ids, emails };
};

export const isSystemScrolithaActor = (actor?: ScrolithaAccessActor | null) =>
  String(actor?.id || '').startsWith('scrolitha-system:');

const roleLooksStaff = (actor?: ScrolithaAccessActor | null) => {
  const role = String(actor?.role || '').toLowerCase();
  return Boolean(actor?.isAdmin) || role.includes('admin') || role.includes('moderator');
};

/**
 * Internal allowlist: admins/moderators (default) + explicit user IDs/emails.
 * Does nothing when SCROLITHA_INTERNAL_ROLLOUT is false.
 */
export const isInternalScrolithaActor = (actor?: ScrolithaAccessActor | null): boolean => {
  if (!isInternalRolloutEnabled()) return false;
  if (!actor) return false;
  if (isSystemScrolithaActor(actor)) return true;

  const allowStaff = asBool(process.env.SCROLITHA_INTERNAL_ALLOW_ADMINS, true);
  if (allowStaff && roleLooksStaff(actor)) return true;

  const { ids, emails } = getInternalAllowlist();
  const id = String(actor.id || '').trim();
  if (id && ids.includes(id)) return true;
  const email = String(actor.email || '').trim().toLowerCase();
  if (email && emails.includes(email)) return true;
  return false;
};

/**
 * User-facing Scrolitha access (chat, rewrite, coach, OS, intelligence, etc.).
 * - Public: SCROLITHA_ROLLOUT_MASTER=true
 * - Internal only: master false + SCROLITHA_INTERNAL_ROLLOUT + allowlist/staff
 */
export const isScrolithaUserFacingAccessAllowed = async (
  actor?: ScrolithaAccessActor | null
): Promise<boolean> => {
  const flags = await resolveScrolithaRolloutFlags();
  if (flags.master) return true;
  return isInternalScrolithaActor(actor);
};

export const assertScrolithaAccess = async (
  actor?: ScrolithaAccessActor | null,
  label = 'Scrolitha'
) => {
  const ok = await isScrolithaUserFacingAccessAllowed(actor);
  if (!ok) {
    const err = new Error(`${label} is currently unavailable for this account`);
    (err as any).statusCode = 403;
    (err as any).code = 'SCROLITHA_ACCESS_DENIED';
    throw err;
  }
};

/**
 * Resolve rollout flags from:
 * 1) env overrides (highest)
 * 2) ScrolithaConfig.metadata.rollout / featureFlags
 * 3) defaults (user-facing OFF; diagnostics ON)
 * Master=false disables all user-facing AI capabilities (diagnostics may stay on for admins).
 * Note: internal allowlist is applied at isCapabilityEnabled / assertScrolithaAccess — not here.
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

  // Master kill switch (global public)
  if (!flags.master) {
    for (const key of Object.keys(flags) as ScrolithaCapability[]) {
      if (key === 'master' || key === 'diagnostics') continue;
      flags[key] = false;
    }
  }

  enterpriseCache.set('analytics', cacheKey, flags, 15_000);
  return flags;
};

const resolveInternalCapability = (cap: ScrolithaCapability): boolean => {
  // Allow env overrides for internal mode too: SCROLITHA_ROLLOUT_* when set
  const envKey = ENV_MAP[cap];
  if (envKey && String(process.env[envKey] ?? '').trim() !== '') {
    return asBool(process.env[envKey], INTERNAL_CAPABILITY_DEFAULTS[cap]);
  }
  return Boolean(INTERNAL_CAPABILITY_DEFAULTS[cap]);
};

export const isCapabilityEnabled = async (
  cap: ScrolithaCapability,
  actor?: ScrolithaAccessActor | null
): Promise<boolean> => {
  const flags = await resolveScrolithaRolloutFlags();

  // Diagnostics remain operational for staff tooling when configured.
  if (cap === 'diagnostics') return Boolean(flags.diagnostics);

  if (flags.master) {
    if (cap === 'master') return true;
    return Boolean(flags[cap]);
  }

  // Internal-only path: master stays false for public; approved actors get internal caps.
  if (isInternalScrolithaActor(actor)) {
    if (cap === 'master') return true;
    return resolveInternalCapability(cap);
  }

  return false;
};

export const assertCapabilityEnabled = async (
  cap: ScrolithaCapability,
  label?: string,
  actor?: ScrolithaAccessActor | null
) => {
  const ok = await isCapabilityEnabled(cap, actor);
  if (!ok) {
    const name = label || cap;
    const err = new Error(`${name} is currently disabled by rollout configuration`);
    (err as any).statusCode = 403;
    (err as any).code = 'SCROLITHA_CAPABILITY_DISABLED';
    (err as any).capability = cap;
    throw err;
  }
};

export const getRolloutSummary = async (actor?: ScrolithaAccessActor | null) => {
  const flags = await resolveScrolithaRolloutFlags();
  const internalEnabled = isInternalRolloutEnabled();
  const allowlist = getInternalAllowlist();
  const actorAllowed = actor ? isInternalScrolithaActor(actor) : false;
  return {
    flags,
    access: {
      publicMaster: Boolean(flags.master),
      internalRollout: internalEnabled,
      actorInternalAllowed: actorAllowed,
      allowAdmins: asBool(process.env.SCROLITHA_INTERNAL_ALLOW_ADMINS, true),
      allowlistCounts: {
        ids: allowlist.ids.length,
        emails: allowlist.emails.length
      },
      // never echo full allowlist emails/ids in public-ish responses when unauthenticated
      mode: flags.master ? 'public' : internalEnabled ? 'internal' : 'dark'
    },
    sources: {
      configMetadataKeys: ['metadata.rollout', 'metadata.featureFlags', 'metadata.scrolithaRollout'],
      envPrefix: 'SCROLITHA_ROLLOUT_*',
      masterEnv: 'SCROLITHA_ROLLOUT_MASTER',
      internalEnv: 'SCROLITHA_INTERNAL_ROLLOUT',
      allowlistEnv: 'SCROLITHA_INTERNAL_ALLOWLIST',
      allowAdminsEnv: 'SCROLITHA_INTERNAL_ALLOW_ADMINS'
    },
    rollback: {
      disableAll:
        'Set SCROLITHA_ROLLOUT_MASTER=false and SCROLITHA_INTERNAL_ROLLOUT=false (or clear SCROLITHA_INTERNAL_ALLOWLIST / set SCROLITHA_INTERNAL_ALLOW_ADMINS=false)',
      disableInternalOnly: 'Set SCROLITHA_INTERNAL_ROLLOUT=false',
      disablePublicOnly: 'Set SCROLITHA_ROLLOUT_MASTER=false',
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
