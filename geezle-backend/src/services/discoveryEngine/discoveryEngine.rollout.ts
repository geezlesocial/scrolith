/**
 * Safe-by-default rollout for discovery engine.
 * User-facing discovery recommendations stay OFF until explicitly enabled.
 */
export type DiscoveryRolloutFlags = {
  master: boolean;
  memberHome: boolean;
  discoveryPage: boolean;
  sidebar: boolean;
  jobs: boolean;
  marketplace: boolean;
  communities: boolean;
  whoToFollow: boolean;
  feedback: boolean;
  impressions: boolean;
  scrolithaAssist: boolean;
  diagnostics: boolean;
};

const DEFAULT_FLAGS: DiscoveryRolloutFlags = {
  master: false,
  memberHome: false,
  discoveryPage: false,
  sidebar: false,
  jobs: false,
  marketplace: false,
  communities: false,
  whoToFollow: false,
  feedback: true,
  impressions: true,
  scrolithaAssist: false,
  diagnostics: true
};

const ENV_MAP: Partial<Record<keyof DiscoveryRolloutFlags, string>> = {
  master: 'DISCOVERY_ENGINE_MASTER',
  memberHome: 'DISCOVERY_ENGINE_MEMBER_HOME',
  discoveryPage: 'DISCOVERY_ENGINE_PAGE',
  sidebar: 'DISCOVERY_ENGINE_SIDEBAR',
  jobs: 'DISCOVERY_ENGINE_JOBS',
  marketplace: 'DISCOVERY_ENGINE_MARKETPLACE',
  communities: 'DISCOVERY_ENGINE_COMMUNITIES',
  whoToFollow: 'DISCOVERY_ENGINE_WHO_TO_FOLLOW',
  feedback: 'DISCOVERY_ENGINE_FEEDBACK',
  impressions: 'DISCOVERY_ENGINE_IMPRESSIONS',
  scrolithaAssist: 'DISCOVERY_ENGINE_SCROLITHA',
  diagnostics: 'DISCOVERY_ENGINE_DIAGNOSTICS'
};

const asBool = (value: unknown, fallback: boolean) => {
  if (typeof value === 'boolean') return value;
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(raw)) return false;
  return fallback;
};

let cached: { at: number; flags: DiscoveryRolloutFlags } | null = null;
const CACHE_MS = 10_000;

export const resolveDiscoveryRolloutFlags = (): DiscoveryRolloutFlags => {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.flags;

  const flags = { ...DEFAULT_FLAGS };
  for (const key of Object.keys(DEFAULT_FLAGS) as (keyof DiscoveryRolloutFlags)[]) {
    const envKey = ENV_MAP[key];
    flags[key] = envKey ? asBool(process.env[envKey], DEFAULT_FLAGS[key]) : DEFAULT_FLAGS[key];
  }
  if (!flags.master) {
    for (const key of Object.keys(flags) as (keyof DiscoveryRolloutFlags)[]) {
      if (key === 'master' || key === 'diagnostics' || key === 'feedback' || key === 'impressions') continue;
      flags[key] = false;
    }
  }
  cached = { at: now, flags };
  return flags;
};

export const invalidateDiscoveryRolloutCache = () => {
  cached = null;
};

export const isDiscoverySurfaceEnabled = (surface: string): boolean => {
  const flags = resolveDiscoveryRolloutFlags();
  if (!flags.master) return false;
  const s = String(surface || '').toLowerCase();
  if (s === 'member_home') return flags.memberHome;
  if (s === 'discovery' || s === 'global' || s === 'search_suggest' || s === 'onboarding') return flags.discoveryPage;
  if (s === 'sidebar') return flags.sidebar;
  if (s === 'jobs') return flags.jobs;
  if (s === 'marketplace') return flags.marketplace;
  if (s === 'communities') return flags.communities;
  if (s === 'who_to_follow') return flags.whoToFollow;
  return false;
};

export const getDiscoveryRolloutSummary = () => ({
  flags: resolveDiscoveryRolloutFlags(),
  defaults: DEFAULT_FLAGS,
  note: 'User-facing discovery recommendations default OFF. Enable via DISCOVERY_ENGINE_* env vars.'
});
