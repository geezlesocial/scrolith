import type Redis from 'ioredis';
import { MemoryStore, type ClientRateLimitInfo, type IncrementResponse, type Options, type Store } from 'express-rate-limit';
import { connectRedisClient, createRedisClient } from '../services/redis/entraRedis';

/**
 * Redis-backed hit counter for multi-replica deployments. Protected runtimes
 * fail closed; only local development may use the bounded memory fallback.
 */
export class DistributedRateLimitStore implements Store {
  readonly localKeys = false;
  private readonly redis: Redis;
  private readonly fallback = new MemoryStore();
  readonly prefix: string;
  private readonly failClosed: boolean;
  private readyPromise: Promise<unknown> = Promise.resolve();
  private stopRedisAuth: (() => void) | undefined;
  private windowMs = 60_000;

  constructor(redisUrl: string, prefix = 'scrolith:ratelimit:', options: { failClosed?: boolean; entraClientId?: string } = {}) {
    this.redis = createRedisClient(redisUrl, { clientId: options.entraClientId, requireManagedIdentity: options.failClosed ?? false });
    this.prefix = prefix;
    this.failClosed = options.failClosed ?? false;
    this.entraClientId = options.entraClientId;
  }

  private readonly entraClientId?: string;

  init(options: Options) {
    this.windowMs = Number(options.windowMs || this.windowMs);
    this.fallback.init?.(options);
    const username = String(process.env.REDIS_ENTRA_OBJECT_ID || '').trim() || undefined;
    this.readyPromise = this.entraClientId
      ? connectRedisClient(this.redis, { clientId: this.entraClientId, username }, this.failClosed).then((stop) => { this.stopRedisAuth = stop; })
      : connectRedisClient(this.redis, undefined, this.failClosed);
  }

  async increment(key: string): Promise<IncrementResponse> {
    const redisKey = `${this.prefix}${key}`;
    try {
      await this.readyPromise;
      const result = await this.redis.eval(
        'local hits = redis.call("INCR", KEYS[1]); if hits == 1 then redis.call("PEXPIRE", KEYS[1], ARGV[1]); end; return { hits, redis.call("PTTL", KEYS[1]) };',
        1,
        redisKey,
        String(this.windowMs)
      ) as [number | string, number | string];
      const totalHits = Number(result?.[0] || 0);
      const ttl = Number(result?.[1] || this.windowMs);
      if (!Number.isFinite(totalHits) || totalHits <= 0) throw new Error('Invalid Redis rate-limit response');
      return { totalHits, resetTime: new Date(Date.now() + Math.max(1_000, ttl)) };
    } catch (error) {
      console.warn('[rate-limit] Redis unavailable; applying protected fallback:', String((error as any)?.message || error).slice(0, 160));
      if (this.failClosed) {
        return { totalHits: Number.MAX_SAFE_INTEGER, resetTime: new Date(Date.now() + this.windowMs) };
      }
      return this.fallback.increment(key);
    }
  }

  async decrement(key: string) {
    try {
      await this.redis.decr(`${this.prefix}${key}`);
    } catch {
      if (!this.failClosed) await this.fallback.decrement(key);
    }
  }

  async resetKey(key: string) {
    try {
      await this.redis.del(`${this.prefix}${key}`);
    } catch {
      if (!this.failClosed) await this.fallback.resetKey(key);
    }
  }

  async get(key: string): Promise<ClientRateLimitInfo | undefined> {
    try {
      const raw = await this.redis.get(`${this.prefix}${key}`);
      if (!raw) return undefined;
      const ttl = await this.redis.pttl(`${this.prefix}${key}`);
      return { totalHits: Number(raw), resetTime: new Date(Date.now() + Math.max(1_000, ttl)) };
    } catch {
      return this.failClosed ? undefined : this.fallback.get?.(key);
    }
  }

  async shutdown() {
    this.stopRedisAuth?.();
    await this.redis.quit().catch(() => undefined);
    await this.fallback.shutdown?.();
  }
}

class FailClosedRateLimitStore implements Store {
  readonly localKeys = false;
  private windowMs = 60_000;

  init(options: Options) {
    this.windowMs = Number(options.windowMs || this.windowMs);
  }

  async increment(_key: string): Promise<IncrementResponse> {
    return { totalHits: Number.MAX_SAFE_INTEGER, resetTime: new Date(Date.now() + this.windowMs) };
  }

  async decrement(_key: string) {}
  async resetKey(_key: string) {}
  async get(_key: string): Promise<ClientRateLimitInfo | undefined> { return undefined; }
  async shutdown() {}
}

export const createDistributedRateLimitStore = (prefix = 'scrolith:ratelimit:'): DistributedRateLimitStore | undefined => {
  const url = String(process.env.REDIS_URL || process.env.REDIS || '').trim();
  if (!url) return undefined;
  const runtime = String(process.env.NODE_ENV || '').toLowerCase();
  const failClosed = ['production', 'staging'].includes(runtime) || String(process.env.REDIS_RATE_LIMIT_FAIL_CLOSED || '').toLowerCase() === 'true';
  const entraClientId = String(process.env.REDIS_ENTRA_CLIENT_ID || '').trim() || undefined;
  return new DistributedRateLimitStore(url, prefix, { failClosed, entraClientId });
};

/** Sensitive authentication controls must never fall back to per-process memory. */
export const createSensitiveRateLimitStore = (prefix: string): Store => {
  return createDistributedRateLimitStore(prefix) || new FailClosedRateLimitStore();
};
