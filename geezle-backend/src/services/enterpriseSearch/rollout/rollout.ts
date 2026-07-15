/**
 * Enterprise Search rollout — all flags DEFAULT OFF.
 * Does not modify Discovery or Scrolitha flags.
 */

export type EnterpriseSearchRolloutFlags = {
  master: boolean;
  unified: boolean;
  typed: boolean;
  suggest: boolean;
  history: boolean;
  publicApi: boolean;
  discoveryRank: boolean;
  diagnostics: boolean;
};

const parseBool = (value: unknown, fallback: boolean): boolean => {
  if (value === undefined || value === null || value === '') return fallback;
  const n = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(n)) return true;
  if (['0', 'false', 'no', 'off'].includes(n)) return false;
  return fallback;
};

/** Safe defaults: every surface OFF */
export const DEFAULT_ENTERPRISE_SEARCH_FLAGS: EnterpriseSearchRolloutFlags = {
  master: false,
  unified: false,
  typed: false,
  suggest: false,
  history: false,
  publicApi: false,
  discoveryRank: false,
  diagnostics: false
};

const ENV_KEYS: Record<keyof EnterpriseSearchRolloutFlags, string> = {
  master: 'ENTERPRISE_SEARCH_MASTER',
  unified: 'ENTERPRISE_SEARCH_UNIFIED',
  typed: 'ENTERPRISE_SEARCH_TYPED',
  suggest: 'ENTERPRISE_SEARCH_SUGGEST',
  history: 'ENTERPRISE_SEARCH_HISTORY',
  publicApi: 'ENTERPRISE_SEARCH_PUBLIC',
  discoveryRank: 'ENTERPRISE_SEARCH_DISCOVERY_RANK',
  diagnostics: 'ENTERPRISE_SEARCH_DIAGNOSTICS'
};

let cache: EnterpriseSearchRolloutFlags | null = null;
let cacheAt = 0;
const CACHE_MS = 5_000;

export const invalidateEnterpriseSearchRolloutCache = () => {
  cache = null;
  cacheAt = 0;
};

export const resolveEnterpriseSearchRolloutFlags = (
  env: NodeJS.ProcessEnv = process.env
): EnterpriseSearchRolloutFlags => {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_MS && env === process.env) return cache;

  const master = parseBool(env[ENV_KEYS.master], false);
  const flags: EnterpriseSearchRolloutFlags = {
    master,
    // Sub-flags only effective when master is on (except diagnostics readable)
    unified: master && parseBool(env[ENV_KEYS.unified], false),
    typed: master && parseBool(env[ENV_KEYS.typed], false),
    suggest: master && parseBool(env[ENV_KEYS.suggest], false),
    history: master && parseBool(env[ENV_KEYS.history], false),
    publicApi: master && parseBool(env[ENV_KEYS.publicApi], false),
    discoveryRank: master && parseBool(env[ENV_KEYS.discoveryRank], false),
    diagnostics: parseBool(env[ENV_KEYS.diagnostics], false)
  };

  if (env === process.env) {
    cache = flags;
    cacheAt = now;
  }
  return flags;
};

export const isEnterpriseSearchEnabled = (
  flags: EnterpriseSearchRolloutFlags = resolveEnterpriseSearchRolloutFlags()
): boolean => flags.master;

export const getEnterpriseSearchRolloutSummary = () => {
  const flags = resolveEnterpriseSearchRolloutFlags();
  return {
    service: 'enterprise-search',
    defaultsOff: true,
    flags,
    envKeys: ENV_KEYS
  };
};
