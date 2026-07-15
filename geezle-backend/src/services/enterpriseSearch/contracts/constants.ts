/**
 * Enterprise Search constants (Phase 9.2–9.4).
 */

export const SEARCH_MODEL_VERSION = 'enterprise-search-v9.4.0';

/** Cache schema/version for invalidation on deploy */
export const SEARCH_CACHE_VERSION = 'sc-v9.4';

export const SEARCH_CURSOR_VERSION = 1 as const;

/** Default cursor TTL: 30 minutes */
export const SEARCH_CURSOR_TTL_MS = 30 * 60 * 1000;

/** Max cursor TTL: 2 hours */
export const SEARCH_CURSOR_MAX_TTL_MS = 2 * 60 * 60 * 1000;

export const SEARCH_QUERY_MAX_LEN = 200;
export const SEARCH_SUGGEST_QUERY_MAX_LEN = 100;
export const SEARCH_DEFAULT_LIMIT = 20;
export const SEARCH_MAX_LIMIT = 50;
export const SEARCH_SUGGEST_DEFAULT_LIMIT = 8;
export const SEARCH_SUGGEST_MAX_LIMIT = 12;

/** Soft Discovery rank budget (ms) */
export const SEARCH_DISCOVERY_SOFT_TIMEOUT_MS = 250;

/** Hard Discovery rank budget (ms) */
export const SEARCH_DISCOVERY_HARD_TIMEOUT_MS = 500;

/** Discovery handoff retries on timeout/transient error */
export const SEARCH_DISCOVERY_RETRY_COUNT = 1;

/** Delay between Discovery retries (ms) */
export const SEARCH_DISCOVERY_RETRY_DELAY_MS = 40;

/** Query response cache TTL (ms) */
export const SEARCH_CACHE_QUERY_TTL_MS = 25_000;

/** Retrieval candidate cache TTL (ms) */
export const SEARCH_CACHE_RETRIEVE_TTL_MS = 20_000;

/** Explanation fragment cache TTL (ms) */
export const SEARCH_CACHE_EXPLAIN_TTL_MS = 60_000;

/** Max in-process cache entries (all namespaces) */
export const SEARCH_CACHE_MAX_ENTRIES = 800;

/** Feedback rate limits per viewer */
export const SEARCH_FEEDBACK_RATE_WINDOW_MS = 60_000;
export const SEARCH_FEEDBACK_RATE_MAX = 90;
export const SEARCH_FEEDBACK_IMPRESSION_RATE_MAX = 120;

/** Feedback dedupe window */
export const SEARCH_FEEDBACK_DEDUPE_TTL_MS = 15_000;

/** Per-adapter retrieval timeout (ms) */
export const SEARCH_ADAPTER_TIMEOUT_MS = 400;

/** Overall retrieval budget across adapters (ms) */
export const SEARCH_RETRIEVAL_BUDGET_MS = 1_200;

/** Retrieval window before rank/page (global candidate cap) */
export const SEARCH_RETRIEVAL_WINDOW = 80;

/** Max candidates per domain adapter */
export const SEARCH_PER_DOMAIN_MAX = 24;

/** Absolute max candidates after merge */
export const SEARCH_CANDIDATE_HARD_CAP = 120;

/** Query normalize cache size */
export const SEARCH_NORMALIZE_CACHE_MAX = 256;

/** Supported retrieval domains (reserved: event, course, project) */
export const SUPPORTED_SEARCH_DOMAINS = [
  'person',
  'company',
  'page',
  'post',
  'job',
  'freelancer',
  'service',
  'product',
  'marketplace_listing',
  'community',
  'group',
  'discussion'
] as const;

/** @deprecated — kept for docs; conditional now supported */
export const CONDITIONAL_SEARCH_DOMAINS = [] as const;

export const RESERVED_SEARCH_DOMAINS = ['event', 'course', 'project'] as const;

export const ALL_SEARCH_DOMAINS = [...SUPPORTED_SEARCH_DOMAINS, ...RESERVED_SEARCH_DOMAINS] as const;
