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
  private connectionPromise: Promise<void> | undefined;
  private state: 'idle' | 'connecting' | 'ready' | 'unavailable' | 'closed' = 'idle';
  private lastFailureAt = 0;
  private stopRedisAuth: (() => void) | undefined;
  private windowMs = 60_000;

  constructor(redisUrl: string, prefix = 'scrolith:ratelimit:', options: { failClosed?: boolean; entraClientId?: string } = {}) {
    // Configuration errors must be reported on the protected request path, not
    // thrown during route/module setup before the HTTP server binds.
    this.redis = createRedisClient(redisUrl, { clientId: options.entraClientId, requireManagedIdentity: false });
    this.prefix = prefix;
    this.failClosed = options.failClosed ?? false;
    this.entraClientId = options.entraClientId;
  }

  private readonly entraClientId?: string;

  init(options: Options) {
    this.windowMs = Number(options.windowMs || this.windowMs);
    this.fallback.init?.(options);
    // express-rate-limit calls init while routes are being registered. Keep
    // Redis connection establishment lazy so a DNS/refusal failure cannot
    // create an unhandled rejection before HTTP startup.
  }

  getRedisState(): 'idle' | 'connecting' | 'ready' | 'unavailable' | 'closed' {
    return this.state;
  }

  private retryCooldownMs(): number {
    const configured = Number(process.env.REDIS_RATE_LIMIT_RETRY_COOLDOWN_MS || 1_000);
    return Number.isFinite(configured) ? Math.min(30_000, Math.max(250, configured)) : 1_000;
  }

  private failureCategory(error: unknown): string {
    const code = typeof (error as { code?: unknown })?.code === 'string' ? String((error as { code: string }).code) : '';
    const message = String((error as { message?: unknown })?.message || '').toLowerCase();
    if (code === 'ENOTFOUND' || message.includes('enotfound')) return 'dns_unavailable';
    if (code === 'ECONNREFUSED' || message.includes('refused')) return 'connection_refused';
    if (code === 'ETIMEDOUT' || message.includes('timeout')) return 'timeout';
    if (message.includes('noauth') || message.includes('authentication')) return 'authentication_failed';
    return 'redis_unavailable';
  }

  private async ensureReady(): Promise<void> {
    if (this.state === 'ready') return;
    if (this.state === 'closed') throw new Error('Redis rate-limit store is closed');

    const now = Date.now();
    if (this.state === 'unavailable' && now - this.lastFailureAt < this.retryCooldownMs()) {
      throw new Error('Redis rate-limit store unavailable');
    }
    if (this.connectionPromise) return this.connectionPromise;

    this.state = 'connecting';
    const username = String(process.env.REDIS_ENTRA_OBJECT_ID || '').trim() || undefined;
    const attempt = (async () => {
      try {
        const stop = this.entraClientId
          ? await connectRedisClient(this.redis, { clientId: this.entraClientId, username }, this.failClosed)
          : await connectRedisClient(this.redis, undefined, this.failClosed);
        if (this.state === 'closed') {
          stop?.();
          throw new Error('Redis rate-limit store is closed');
        }
        this.stopRedisAuth = stop;
        this.state = 'ready';
        this.lastFailureAt = 0;
      } catch (error) {
        this.state = 'unavailable';
        this.lastFailureAt = Date.now();
        console.warn('[rate-limit] Redis unavailable; protected requests denied', { reason: this.failureCategory(error) });
        throw error;
      } finally {
        this.connectionPromise = undefined;
      }
    })();

    this.connectionPromise = attempt;
    // A caller normally awaits this promise, but this terminal handler also
    // prevents process-level unhandled-rejection handling from seeing a
    // failed readiness attempt during concurrent request/startup transitions.
    void attempt.catch(() => undefined);
    return attempt;
  }

  async increment(key: string): Promise<IncrementResponse> {
    const redisKey = `${this.prefix}${key}`;
    try {
      await this.ensureReady();
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
    this.state = 'closed';
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
