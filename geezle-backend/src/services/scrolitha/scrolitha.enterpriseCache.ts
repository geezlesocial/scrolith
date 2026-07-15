/**
 * Namespaced enterprise cache — distributed-ready.
 * In-process by default. Pluggable DistributedCacheAdapter for Redis/Memorystore later.
 */
import { createHash } from 'crypto';
import { scrolithaCache } from './scrolitha.cache';

export type CacheNamespace =
  | 'graph'
  | 'session'
  | 'prompt'
  | 'llm'
  | 'entity'
  | 'recommendation'
  | 'workflow'
  | 'analytics'
  | 'search'
  | 'action_cards'
  | 'governance'
  | 'streaming';

export type CacheInvalidationScope =
  | { type: 'key'; ns: CacheNamespace; key: string }
  | { type: 'namespace'; ns: CacheNamespace }
  | { type: 'entity'; entityType: string; entityId: string }
  | { type: 'post'; postId: string }
  | { type: 'user'; userId: string }
  | { type: 'pattern'; ns: CacheNamespace; pattern: string };

export interface CacheAdapter {
  get<T>(fullKey: string): T | null | Promise<T | null>;
  set<T>(fullKey: string, value: T, ttlMs: number): void | Promise<void>;
  delete(fullKey: string): void | Promise<void>;
  /** Optional pattern delete for distributed backends */
  deleteByPrefix?(prefix: string): void | Promise<void>;
  readonly adapterName: string;
  readonly distributed: boolean;
}

export interface DistributedCacheAdapter extends CacheAdapter {
  readonly distributed: true;
  ping?(): Promise<boolean>;
  close?(): Promise<void>;
}

const NS_PREFIX: Record<CacheNamespace, string> = {
  graph: 'scrolitha:ns:graph:',
  session: 'scrolitha:ns:session:',
  prompt: 'scrolitha:ns:prompt:',
  llm: 'scrolitha:ns:llm:',
  entity: 'scrolitha:ns:entity:',
  recommendation: 'scrolitha:ns:reco:',
  workflow: 'scrolitha:ns:workflow:',
  analytics: 'scrolitha:ns:analytics:',
  search: 'scrolitha:ns:search:',
  action_cards: 'scrolitha:ns:cards:',
  governance: 'scrolitha:ns:gov:',
  streaming: 'scrolitha:ns:stream:'
};

const DEFAULT_TTL: Record<CacheNamespace, number> = {
  graph: 45_000,
  session: 30 * 60_000,
  prompt: 60_000,
  llm: 90_000,
  entity: 60_000,
  recommendation: 120_000,
  workflow: 60_000,
  analytics: 10 * 60_000,
  search: 45_000,
  action_cards: 90_000,
  governance: 15 * 60_000,
  streaming: 5 * 60_000
};

const stats = {
  hits: 0,
  misses: 0,
  sets: 0,
  invalidations: 0,
  byNs: {} as Record<string, { hits: number; misses: number; sets: number; invalidations: number }>
};

// Track keys per namespace for in-process invalidation by prefix/pattern
const keyIndex = new Map<CacheNamespace, Set<string>>();

const bump = (ns: CacheNamespace, field: 'hits' | 'misses' | 'sets' | 'invalidations') => {
  stats[field] += 1;
  if (!stats.byNs[ns]) stats.byNs[ns] = { hits: 0, misses: 0, sets: 0, invalidations: 0 };
  stats.byNs[ns][field] += 1;
};

export const hashCacheKey = (parts: Array<string | number | null | undefined>) =>
  createHash('sha256')
    .update(parts.map((p) => String(p ?? '')).join('|'))
    .digest('hex')
    .slice(0, 40);

const fullKey = (ns: CacheNamespace, key: string) => `${NS_PREFIX[ns]}${key}`;

class InProcessCacheAdapter implements CacheAdapter {
  readonly adapterName = 'in_process';
  readonly distributed = false;

  get<T>(key: string): T | null {
    return scrolithaCache.get<T>(key);
  }

  set<T>(key: string, value: T, ttlMs: number): void {
    scrolithaCache.set(key, value, ttlMs);
  }

  delete(key: string): void {
    scrolithaCache.delete(key);
  }

  deleteByPrefix(prefix: string): void {
    // scrolithaCache supports invalidateByPrefix
    scrolithaCache.invalidateByPrefix(prefix);
  }
}

let cacheAdapter: CacheAdapter = new InProcessCacheAdapter();

export const setCacheAdapter = (adapter: CacheAdapter) => {
  cacheAdapter = adapter;
};

export const getCacheAdapter = () => cacheAdapter;

export const getCacheAdapterStatus = () => ({
  adapterName: cacheAdapter.adapterName,
  distributed: cacheAdapter.distributed,
  namespaces: Object.keys(NS_PREFIX),
  note: cacheAdapter.distributed
    ? 'Distributed cache adapter active.'
    : 'In-process cache (default). Cross-instance cache coherence requires distributed adapter + infra approval.'
});

const indexKey = (ns: CacheNamespace, key: string) => {
  if (!keyIndex.has(ns)) keyIndex.set(ns, new Set());
  keyIndex.get(ns)!.add(key);
};

const unindexKey = (ns: CacheNamespace, key: string) => {
  keyIndex.get(ns)?.delete(key);
};

export const enterpriseCache = {
  get<T>(ns: CacheNamespace, key: string): T | null {
    const value = cacheAdapter.get<T>(fullKey(ns, key));
    // Support async adapters that return Promise — treat unresolved as miss for sync callers
    if (value && typeof (value as any).then === 'function') {
      bump(ns, 'misses');
      return null;
    }
    if (value === null || value === undefined) {
      bump(ns, 'misses');
      return null;
    }
    bump(ns, 'hits');
    return value as T;
  },
  set<T>(ns: CacheNamespace, key: string, value: T, ttlMs?: number) {
    bump(ns, 'sets');
    indexKey(ns, key);
    cacheAdapter.set(fullKey(ns, key), value, ttlMs ?? DEFAULT_TTL[ns]);
  },
  delete(ns: CacheNamespace, key: string) {
    unindexKey(ns, key);
    bump(ns, 'invalidations');
    cacheAdapter.delete(fullKey(ns, key));
  },
  getOrSet<T>(ns: CacheNamespace, key: string, factory: () => T, ttlMs?: number): T {
    const existing = this.get<T>(ns, key);
    if (existing !== null && existing !== undefined) return existing;
    const created = factory();
    this.set(ns, key, created, ttlMs);
    return created;
  },
  async getOrSetAsync<T>(
    ns: CacheNamespace,
    key: string,
    factory: () => Promise<T>,
    ttlMs?: number
  ): Promise<{ value: T; cacheHit: boolean }> {
    const existing = this.get<T>(ns, key);
    if (existing !== null && existing !== undefined) {
      return { value: existing, cacheHit: true };
    }
    const created = await factory();
    this.set(ns, key, created, ttlMs);
    return { value: created, cacheHit: false };
  },
  /**
   * Cache invalidation contracts — safe to call from events without knowing storage backend.
   */
  invalidate(scope: CacheInvalidationScope): { invalidated: number; scope: CacheInvalidationScope } {
    let invalidated = 0;
    if (scope.type === 'key') {
      this.delete(scope.ns, scope.key);
      invalidated = 1;
    } else if (scope.type === 'namespace') {
      const keys = Array.from(keyIndex.get(scope.ns) || []);
      for (const k of keys) {
        this.delete(scope.ns, k);
        invalidated += 1;
      }
      if (cacheAdapter.deleteByPrefix) {
        cacheAdapter.deleteByPrefix(NS_PREFIX[scope.ns]);
      }
    } else if (scope.type === 'entity') {
      const marker = `entity:${scope.entityType}:${scope.entityId}`;
      for (const ns of Object.keys(NS_PREFIX) as CacheNamespace[]) {
        const keys = Array.from(keyIndex.get(ns) || []);
        for (const k of keys) {
          if (k.includes(marker) || k.includes(scope.entityId)) {
            this.delete(ns, k);
            invalidated += 1;
          }
        }
      }
      // Also set invalidation marker for readers that check it
      this.set('graph', `invalidate:entity:${scope.entityType}:${scope.entityId}`, Date.now(), 120_000);
    } else if (scope.type === 'post') {
      for (const ns of ['graph', 'prompt', 'llm', 'workflow', 'search', 'recommendation'] as CacheNamespace[]) {
        const keys = Array.from(keyIndex.get(ns) || []);
        for (const k of keys) {
          // Do not drop the invalidation marker itself when matching postId substrings.
          if (k.startsWith('invalidate:')) continue;
          if (k.includes(scope.postId)) {
            this.delete(ns, k);
            invalidated += 1;
          }
        }
      }
      this.set('graph', `invalidate:${scope.postId}`, Date.now(), 120_000);
      invalidated += 1;
    } else if (scope.type === 'user') {
      for (const ns of Object.keys(NS_PREFIX) as CacheNamespace[]) {
        const keys = Array.from(keyIndex.get(ns) || []);
        for (const k of keys) {
          if (k.includes(scope.userId)) {
            this.delete(ns, k);
            invalidated += 1;
          }
        }
      }
    } else if (scope.type === 'pattern') {
      const keys = Array.from(keyIndex.get(scope.ns) || []);
      for (const k of keys) {
        if (k.includes(scope.pattern)) {
          this.delete(scope.ns, k);
          invalidated += 1;
        }
      }
    }
    return { invalidated, scope };
  },
  isInvalidated(ns: CacheNamespace, markerKey: string): boolean {
    return Boolean(this.get(ns, markerKey));
  },
  stats() {
    const hitRate =
      stats.hits + stats.misses > 0 ? stats.hits / (stats.hits + stats.misses) : 0;
    return {
      hits: stats.hits,
      misses: stats.misses,
      sets: stats.sets,
      invalidations: stats.invalidations,
      hitRate: Number(hitRate.toFixed(4)),
      byNamespace: { ...stats.byNs },
      adapter: getCacheAdapterStatus()
    };
  },
  resetStats() {
    stats.hits = 0;
    stats.misses = 0;
    stats.sets = 0;
    stats.invalidations = 0;
    stats.byNs = {};
  },
  namespaces: () => Object.keys(NS_PREFIX) as CacheNamespace[]
};
