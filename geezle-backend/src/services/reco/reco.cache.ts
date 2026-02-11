type CacheValue<T> = {
  expiresAt: number;
  payload: T;
};

class RecoCacheStore {
  private store = new Map<string, CacheValue<any>>();

  get<T>(key: string): T | null {
    const current = this.store.get(key);
    if (!current) return null;
    if (current.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return current.payload as T;
  }

  set<T>(key: string, payload: T, ttlMs = 60_000): void {
    this.store.set(key, {
      expiresAt: Date.now() + Math.max(1_000, ttlMs),
      payload
    });
  }

  invalidateByPrefix(prefix: string): number {
    let removed = 0;
    for (const key of this.store.keys()) {
      if (!key.startsWith(prefix)) continue;
      this.store.delete(key);
      removed += 1;
    }
    return removed;
  }

  invalidateAll(): number {
    const size = this.store.size;
    this.store.clear();
    return size;
  }

  size(): number {
    return this.store.size;
  }
}

export const recoCache = new RecoCacheStore();

export const buildRecoCacheKey = (params: {
  viewerId: string;
  surface: string;
  entityType: string;
  limit: number;
  query?: string;
}) =>
  `reco:${params.viewerId}:${params.surface}:${params.entityType}:${params.limit}:${String(params.query || '').trim().toLowerCase()}`;

