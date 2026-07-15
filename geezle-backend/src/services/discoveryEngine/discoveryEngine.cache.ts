/**
 * Bounded in-process cache with generation versioning and in-flight dedupe.
 * No private cross-viewer reuse: keys must include viewerId.
 */

type Entry = { value: unknown; expiresAt: number; generation: number };

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();
const MAX_KEYS = 2_500;
let generation = 1;
let hits = 0;
let misses = 0;
let invalidations = 0;
let staleRejects = 0;

export const discoveryCache = {
  get generation() {
    return generation;
  },
  bumpGeneration(_reason?: string) {
    generation += 1;
    invalidations += 1;
    // Drop all entries on generation bump (safe; bounded size)
    store.clear();
  },
  get<T>(key: string): T | null {
    const hit = store.get(key);
    if (!hit) {
      misses += 1;
      return null;
    }
    if (hit.expiresAt <= Date.now()) {
      store.delete(key);
      misses += 1;
      return null;
    }
    if (hit.generation !== generation) {
      store.delete(key);
      staleRejects += 1;
      misses += 1;
      return null;
    }
    hits += 1;
    return hit.value as T;
  },
  set(key: string, value: unknown, ttlMs: number) {
    if (store.size >= MAX_KEYS) {
      const first = store.keys().next().value;
      if (first) store.delete(first);
    }
    store.set(key, {
      value,
      expiresAt: Date.now() + Math.max(1_000, ttlMs),
      generation
    });
  },
  delete(key: string) {
    store.delete(key);
  },
  invalidateByPrefix(prefix: string) {
    for (const key of Array.from(store.keys())) {
      if (key.startsWith(prefix)) store.delete(key);
    }
    invalidations += 1;
  },
  async getOrLoad<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
    const existing = discoveryCache.get<T>(key);
    if (existing !== null) return existing;
    const pending = inflight.get(key);
    if (pending) return pending as Promise<T>;
    const p = (async () => {
      try {
        const value = await loader();
        discoveryCache.set(key, value, ttlMs);
        return value;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);
    return p;
  },
  stats() {
    return {
      size: store.size,
      maxKeys: MAX_KEYS,
      generation,
      hits,
      misses,
      invalidations,
      staleRejects,
      inflight: inflight.size
    };
  }
};
