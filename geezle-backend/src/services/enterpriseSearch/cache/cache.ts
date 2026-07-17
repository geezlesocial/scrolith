/**
 * Enterprise Search in-process cache (Phase 9.4).
 * Viewer-scoped keys, versioned, bounded, no distributed cache.
 */
import { createHash } from 'crypto';
import {
  SEARCH_CACHE_MAX_ENTRIES,
  SEARCH_CACHE_QUERY_TTL_MS,
  SEARCH_CACHE_RETRIEVE_TTL_MS,
  SEARCH_CACHE_VERSION,
  SEARCH_MODEL_VERSION
} from '../contracts/constants';
import { recordSearchMetric } from '../observability/observability';

export type SearchCacheNamespace =
  | 'query'
  | 'retrieve'
  | 'normalize'
  | 'filter'
  | 'cursor'
  | 'explain'
  | 'coalesce';

type CacheEntry = {
  expiresAt: number;
  value: unknown;
  ns: SearchCacheNamespace;
  viewerKey: string;
  version: string;
  createdAt: number;
  hits: number;
};

const store = new Map<string, CacheEntry>();
let generation = 1;
let hits = 0;
let misses = 0;
let evictions = 0;
let sets = 0;

const DEFAULT_TTL: Record<SearchCacheNamespace, number> = {
  query: SEARCH_CACHE_QUERY_TTL_MS,
  retrieve: SEARCH_CACHE_RETRIEVE_TTL_MS,
  normalize: 120_000,
  filter: 60_000,
  cursor: 30_000,
  explain: 60_000,
  coalesce: 5_000
};

export const getSearchCacheGeneration = () => generation;

export const bumpSearchCacheGeneration = (reason = 'manual') => {
  generation += 1;
  recordSearchMetric('cache_generation_bump', 1);
  // Drop all on generation bump (version isolation)
  store.clear();
  recordSearchMetric('cache_invalidate_all', 1);
  return { generation, reason };
};

const viewerKeyOf = (viewerId?: string | null) => {
  const raw = String(viewerId || '').trim() || 'anon';
  return createHash('sha256').update(raw).digest('base64url').slice(0, 12);
};

export const buildSearchCacheKey = (parts: {
  viewerId?: string | null;
  op: string;
  query: string;
  domains?: string[];
  cursor?: string | null;
  extra?: string;
  ns?: SearchCacheNamespace;
}): string => {
  const ns = parts.ns || 'retrieve';
  const vk = viewerKeyOf(parts.viewerId);
  const raw = JSON.stringify({
    cv: SEARCH_CACHE_VERSION,
    sm: SEARCH_MODEL_VERSION,
    g: generation,
    ns,
    vk,
    op: parts.op,
    q: parts.query,
    d: parts.domains || [],
    c: parts.cursor || '',
    x: parts.extra || ''
  });
  return `${ns}:${vk}:${createHash('sha256').update(raw).digest('hex').slice(0, 32)}`;
};

const touchEvict = () => {
  while (store.size > SEARCH_CACHE_MAX_ENTRIES) {
    // Prefer expired, else oldest by createdAt
    let oldestKey: string | null = null;
    let oldestAt = Infinity;
    const now = Date.now();
    for (const [k, v] of store) {
      if (v.expiresAt <= now) {
        store.delete(k);
        evictions += 1;
        recordSearchMetric('cache_evict_expired', 1);
        continue;
      }
      if (v.createdAt < oldestAt) {
        oldestAt = v.createdAt;
        oldestKey = k;
      }
    }
    if (oldestKey && store.size > SEARCH_CACHE_MAX_ENTRIES) {
      store.delete(oldestKey);
      evictions += 1;
      recordSearchMetric('cache_evict_lru', 1);
    } else {
      break;
    }
  }
};

export const getSearchCache = <T>(key: string): T | null => {
  const hit = store.get(key);
  if (!hit) {
    misses += 1;
    recordSearchMetric('cache_miss', 1);
    return null;
  }
  if (hit.version !== SEARCH_CACHE_VERSION || hit.expiresAt < Date.now()) {
    store.delete(key);
    misses += 1;
    recordSearchMetric('cache_expired', 1);
    return null;
  }
  hit.hits += 1;
  hits += 1;
  recordSearchMetric('cache_hit', 1);
  recordSearchMetric(`cache_hit_${hit.ns}`, 1);
  // LRU refresh
  store.delete(key);
  store.set(key, hit);
  return hit.value as T;
};

export const setSearchCache = (
  key: string,
  value: unknown,
  ttlMs?: number,
  meta?: { ns?: SearchCacheNamespace; viewerId?: string | null }
) => {
  const ns = meta?.ns || (key.split(':')[0] as SearchCacheNamespace) || 'retrieve';
  const ttl = Math.max(500, ttlMs ?? DEFAULT_TTL[ns] ?? 20_000);
  const entry: CacheEntry = {
    expiresAt: Date.now() + ttl,
    value,
    ns,
    viewerKey: viewerKeyOf(meta?.viewerId),
    version: SEARCH_CACHE_VERSION,
    createdAt: Date.now(),
    hits: 0
  };
  store.set(key, entry);
  sets += 1;
  recordSearchMetric('cache_set', 1);
  recordSearchMetric(`cache_set_${ns}`, 1);
  touchEvict();
};

/** Invalidate by namespace and/or viewer */
export const invalidateSearchCache = (opts?: {
  viewerId?: string | null;
  ns?: SearchCacheNamespace | SearchCacheNamespace[];
  prefix?: string;
  reason?: string;
}) => {
  const vk = opts?.viewerId !== undefined ? viewerKeyOf(opts.viewerId) : null;
  const nsSet = opts?.ns
    ? new Set(Array.isArray(opts.ns) ? opts.ns : [opts.ns])
    : null;
  let removed = 0;
  for (const [k, v] of store) {
    if (opts?.prefix && !k.startsWith(opts.prefix)) continue;
    if (vk && v.viewerKey !== vk) continue;
    if (nsSet && !nsSet.has(v.ns)) continue;
    store.delete(k);
    removed += 1;
  }
  if (removed) recordSearchMetric('cache_invalidate', removed);
  return { removed, reason: opts?.reason || 'invalidate', generation };
};

export const invalidateSearchCacheForViewer = (viewerId: string | null | undefined, reason = 'viewer') =>
  invalidateSearchCache({ viewerId: viewerId || null, reason });

export const clearSearchCacheForTests = () => {
  store.clear();
  hits = 0;
  misses = 0;
  evictions = 0;
  sets = 0;
  generation = 1;
};

export const getSearchCacheStats = () => {
  const total = hits + misses;
  return {
    generation,
    version: SEARCH_CACHE_VERSION,
    size: store.size,
    maxEntries: SEARCH_CACHE_MAX_ENTRIES,
    hits,
    misses,
    sets,
    evictions,
    hitRatio: total ? hits / total : 0,
    missRatio: total ? misses / total : 0,
    at: new Date().toISOString()
  };
};

/** In-flight coalesce: reuse same promise for identical keys */
const inflight = new Map<string, Promise<unknown>>();

export const coalesceSearchRequest = async <T>(key: string, factory: () => Promise<T>): Promise<T> => {
  const existing = inflight.get(key);
  if (existing) {
    recordSearchMetric('cache_coalesce_hit', 1);
    return existing as Promise<T>;
  }
  const p = factory().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, p);
  return p;
};

/** Optional warming hook — register preload fns (no-op until scheduled) */
type WarmFn = () => Promise<void> | void;
const warmers: WarmFn[] = [];

export const registerSearchCacheWarmer = (fn: WarmFn) => {
  warmers.push(fn);
};

export const runSearchCacheWarmers = async () => {
  for (const fn of warmers.slice(0, 10)) {
    try {
      await fn();
    } catch {
      recordSearchMetric('cache_warm_error', 1);
    }
  }
};
