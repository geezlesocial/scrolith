import Redis from 'ioredis';
import { MemoryStore, type ClientRateLimitInfo, type IncrementResponse, type Options, type Store } from 'express-rate-limit';

/**
 * Redis-backed hit counter for multi-replica deployments. The bounded memory
 * store is used only as a temporary safety fallback if Redis is unavailable;
 * callers can observe the warning and recover distributed enforcement when it
 * returns.
 */
export class DistributedRateLimitStore implements Store {
  readonly localKeys = false;
  private readonly redis: Redis;
  private readonly fallback = new MemoryStore();
  readonly prefix: string;
  private windowMs = 60_000;

  constructor(redisUrl: string, prefix = 'scrolith:ratelimit:') {
    this.redis = new Redis(redisUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 2_000,
      retryStrategy: () => null
    });
    this.prefix = prefix;
  }

  init(options: Options) {
    this.windowMs = Number(options.windowMs || this.windowMs);
    this.fallback.init?.(options);
    void this.redis.connect().catch(() => undefined);
  }

  async increment(key: string): Promise<IncrementResponse> {
    const redisKey = `${this.prefix}${key}`;
    try {
      const result = await this.redis.multi()
        .incr(redisKey)
        .pexpire(redisKey, this.windowMs)
        .pttl(redisKey)
        .exec();
      const totalHits = Number(result?.[0]?.[1] || 0);
      const ttl = Number(result?.[2]?.[1] || this.windowMs);
      if (!Number.isFinite(totalHits) || totalHits <= 0) throw new Error('Invalid Redis rate-limit response');
      return { totalHits, resetTime: new Date(Date.now() + Math.max(1_000, ttl)) };
    } catch (error) {
      console.warn('[rate-limit] Redis unavailable; using local fallback:', String((error as any)?.message || error).slice(0, 160));
      return this.fallback.increment(key);
    }
  }

  async decrement(key: string) {
    try {
      await this.redis.decr(`${this.prefix}${key}`);
    } catch {
      await this.fallback.decrement(key);
    }
  }

  async resetKey(key: string) {
    try {
      await this.redis.del(`${this.prefix}${key}`);
    } catch {
      await this.fallback.resetKey(key);
    }
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    try {
      const raw = await this.redis.get(`${this.prefix}${key}`);
      if (!raw) return undefined;
      const ttl = await this.redis.pttl(`${this.prefix}${key}`);
      return { totalHits: Number(raw), resetTime: new Date(Date.now() + Math.max(1_000, ttl)) };
    } catch {
      return this.fallback.get?.(key);
    }
  }

  async shutdown() {
    await this.redis.quit().catch(() => undefined);
    await this.fallback.shutdown?.();
  }
}

export const createDistributedRateLimitStore = (): DistributedRateLimitStore | undefined => {
  const url = String(process.env.REDIS_URL || process.env.REDIS || '').trim();
  return url ? new DistributedRateLimitStore(url) : undefined;
};
