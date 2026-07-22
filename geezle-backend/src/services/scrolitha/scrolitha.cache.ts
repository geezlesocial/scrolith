import { runtimePolicy } from '../../config/runtimePolicy';

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry<any>>();
const minuteCounters = new Map<string, { windowStart: number; count: number }>();

const now = () => Date.now();

const cleanupExpired = () => {
  const ts = now();
  for (const [key, entry] of cache.entries()) {
    if (entry.expiresAt <= ts) {
      cache.delete(key);
    }
  }
};

export const scrolithaCache = {
  get<T>(key: string): T | null {
    const entry = cache.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= now()) {
      cache.delete(key);
      return null;
    }
    return entry.value as T;
  },
  set<T>(key: string, value: T, ttlMs: number) {
    cache.set(key, { value, expiresAt: now() + Math.max(250, ttlMs) });
  },
  /**
   * Atomic set-if-absent for single-process locks.
   * Returns true when this caller won the lock.
   */
  setIfAbsent<T>(key: string, value: T, ttlMs: number): boolean {
    const existing = this.get<T>(key);
    if (existing !== null && existing !== undefined) return false;
    cache.set(key, { value, expiresAt: now() + Math.max(250, ttlMs) });
    return true;
  },
  delete(key: string) {
    cache.delete(key);
  },
  invalidateByPrefix(prefix: string) {
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) cache.delete(key);
    }
  },
  cleanup: cleanupExpired
};

export const incrementMinuteCounter = (key: string, windowMs = 60_000) => {
  const ts = now();
  const existing = minuteCounters.get(key);
  if (!existing || ts - existing.windowStart >= windowMs) {
    const next = { windowStart: ts, count: 1 };
    minuteCounters.set(key, next);
    return next.count;
  }
  existing.count += 1;
  minuteCounters.set(key, existing);
  return existing.count;
};

export const clearMinuteCounter = (keyPrefix: string) => {
  for (const key of minuteCounters.keys()) {
    if (key.startsWith(keyPrefix)) minuteCounters.delete(key);
  }
};

export const scrolithaCacheCleanupInterval = runtimePolicy.backgroundWorkersEnabled
  ? setInterval(() => {
      scrolithaCache.cleanup();
      const ts = now();
      for (const [key, value] of minuteCounters.entries()) {
        if (ts - value.windowStart > 2 * 60_000) {
          minuteCounters.delete(key);
        }
      }
    }, 45_000)
  : null;

scrolithaCacheCleanupInterval?.unref?.();
