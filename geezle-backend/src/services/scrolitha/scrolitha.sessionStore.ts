/**
 * Session store abstraction — distributed-ready.
 * Default: in-process. Future Redis/Memorystore via setSessionStoreAdapter / configureSessionStore.
 * Business logic never imports Redis clients directly.
 */
import { enterpriseCache } from './scrolitha.enterpriseCache';
import Redis from 'ioredis';
import { connectWithManagedIdentity } from '../redis/entraRedis';

export type SessionTurn = {
  role: 'user' | 'assistant' | 'system';
  text: string;
  at: number;
  surface?: string;
  entityType?: string;
  entityId?: string;
  classification?: string | null;
  sources?: string[];
  confidenceBand?: string | null;
};

export type SessionRecord = {
  sessionKey: string;
  userId: string;
  turns: SessionTurn[];
  lastSurface?: string;
  dismissedSuggestionKeys: string[];
  createdAt: number;
  updatedAt: number;
};

export type SessionStoreCapabilities = {
  distributed: boolean;
  supportsTtl: boolean;
  supportsAtomicGetSet: boolean;
  supportsCrossInstance: boolean;
};

/**
 * Core session store contract used by business logic.
 */
export interface SessionStore {
  get(sessionKey: string): SessionRecord | null | Promise<SessionRecord | null>;
  set(record: SessionRecord, ttlMs?: number): void | Promise<void>;
  delete(sessionKey: string): void | Promise<void>;
  readonly adapterName: string;
  readonly capabilities?: SessionStoreCapabilities;
}

/**
 * Extended contract for distributed adapters (Redis, etc.).
 * Implement this when wiring real infrastructure — no business logic changes required.
 */
export interface DistributedSessionStore extends SessionStore {
  readonly capabilities: SessionStoreCapabilities & {
    distributed: true;
    supportsCrossInstance: true;
  };
  /** Optional multi-get for batch hydration */
  getMany?(sessionKeys: string[]): Promise<Array<SessionRecord | null>>;
  /** Optional health probe */
  ping?(): Promise<boolean>;
  /** Optional graceful shutdown */
  close?(): Promise<void>;
}

export type SessionStoreConfig = {
  /** in_process (default) | distributed_placeholder | custom */
  mode: 'in_process' | 'redis' | 'distributed_placeholder' | 'custom';
  /** Future: redis URL / memorystore host — ignored until infra approved */
  connectionUrl?: string | null;
  defaultTtlMs?: number;
  keyPrefix?: string;
};

const DEFAULT_TTL_MS = 30 * 60_000;

class InProcessSessionStore implements SessionStore {
  readonly adapterName = 'in_process';
  readonly capabilities: SessionStoreCapabilities = {
    distributed: false,
    supportsTtl: true,
    supportsAtomicGetSet: true,
    supportsCrossInstance: false
  };

  get(sessionKey: string): SessionRecord | null {
    return enterpriseCache.get<SessionRecord>('session', sessionKey);
  }

  set(record: SessionRecord, ttlMs = DEFAULT_TTL_MS): void {
    enterpriseCache.set('session', record.sessionKey, record, ttlMs);
  }

  delete(sessionKey: string): void {
    enterpriseCache.delete('session', sessionKey);
  }
}

/**
 * Placeholder distributed adapter — documents the contract without requiring Redis.
 * Reads/writes still use in-process storage until SCROLITHA_SESSION_STORE=redis is provisioned.
 * When real Redis is approved, replace internals only.
 */
class DistributedSessionStorePlaceholder implements DistributedSessionStore {
  readonly adapterName = 'distributed_placeholder';
  readonly capabilities = {
    distributed: true as const,
    supportsTtl: true,
    supportsAtomicGetSet: true,
    supportsCrossInstance: true as const
  };

  private readonly inner = new InProcessSessionStore();
  private readonly prefix: string;

  constructor(private readonly config: SessionStoreConfig) {
    this.prefix = String(config.keyPrefix || 'scrolitha:sess:');
  }

  private key(sessionKey: string) {
    return `${this.prefix}${sessionKey}`;
  }

  get(sessionKey: string): SessionRecord | null {
    // Placeholder: same storage; real Redis adapter would GET this.key(sessionKey)
    return this.inner.get(this.key(sessionKey).replace(this.prefix, '')) || this.inner.get(sessionKey);
  }

  set(record: SessionRecord, ttlMs?: number): void {
    this.inner.set(record, ttlMs ?? this.config.defaultTtlMs ?? DEFAULT_TTL_MS);
  }

  delete(sessionKey: string): void {
    this.inner.delete(sessionKey);
  }

  async getMany(sessionKeys: string[]): Promise<Array<SessionRecord | null>> {
    return sessionKeys.map((k) => this.get(k));
  }

  async ping(): Promise<boolean> {
    return true; // placeholder healthy; real adapter pings Redis
  }

  async close(): Promise<void> {
    // no-op for placeholder
  }
}

class RedisSessionStore implements DistributedSessionStore {
  readonly adapterName = 'redis';
  readonly capabilities = {
    distributed: true as const,
    supportsTtl: true,
    supportsAtomicGetSet: true,
    supportsCrossInstance: true as const
  };

  private readonly redis: Redis;
  private readonly prefix: string;

  constructor(private readonly config: SessionStoreConfig) {
    if (!config.connectionUrl) throw new Error('SCROLITHA_SESSION_REDIS_URL is required for Redis sessions');
    this.prefix = String(config.keyPrefix || 'scrolitha:sess:');
    this.redis = new Redis(config.connectionUrl, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      connectTimeout: 2_000,
      retryStrategy: () => null
    });
  }

  private key(sessionKey: string) { return `${this.prefix}${sessionKey}`; }

  private async ready() {
    if (this.redis.status === 'wait') {
      const clientId = String(process.env.REDIS_ENTRA_CLIENT_ID || '').trim();
      const username = String(process.env.REDIS_ENTRA_OBJECT_ID || '').trim() || undefined;
      if (clientId) await connectWithManagedIdentity(this.redis, { clientId, username });
      else await this.redis.connect();
    }
  }

  async get(sessionKey: string): Promise<SessionRecord | null> {
    await this.ready();
    const raw = await this.redis.get(this.key(sessionKey));
    if (!raw) return null;
    try { return JSON.parse(raw) as SessionRecord; }
    catch { await this.delete(sessionKey); return null; }
  }

  async set(record: SessionRecord, ttlMs = DEFAULT_TTL_MS): Promise<void> {
    await this.ready();
    await this.redis.set(this.key(record.sessionKey), JSON.stringify(record), 'PX', Math.max(1_000, ttlMs));
  }

  async delete(sessionKey: string): Promise<void> {
    await this.ready();
    await this.redis.del(this.key(sessionKey));
  }

  async ping(): Promise<boolean> {
    await this.ready();
    return (await this.redis.ping()) === 'PONG';
  }

  async close(): Promise<void> { await this.redis.quit().catch(() => undefined); }
}

let activeStore: SessionStore = new InProcessSessionStore();
let activeConfig: SessionStoreConfig = { mode: 'in_process' };

/** Swap adapter later (e.g. Redis) without changing call sites. */
export const setSessionStoreAdapter = (store: SessionStore) => {
  activeStore = store;
};

export const getSessionStoreAdapter = () => activeStore;

export const getSessionStoreConfig = () => ({ ...activeConfig });

/**
 * Configure session store from env/config without business rewrites.
 * SCROLITHA_SESSION_STORE=in_process|distributed_placeholder
 */
export const configureSessionStore = (config?: Partial<SessionStoreConfig>) => {
  const mode = (config?.mode ||
    String(process.env.SCROLITHA_SESSION_STORE || 'in_process').toLowerCase()) as SessionStoreConfig['mode'];
  activeConfig = {
    mode: mode === 'redis' || mode === 'distributed_placeholder' || mode === 'custom' ? mode : 'in_process',
    connectionUrl: config?.connectionUrl ?? process.env.SCROLITHA_SESSION_REDIS_URL ?? null,
    defaultTtlMs: config?.defaultTtlMs ?? DEFAULT_TTL_MS,
    keyPrefix: config?.keyPrefix ?? 'scrolitha:sess:'
  };

  if (activeConfig.mode === 'redis') {
    activeStore = new RedisSessionStore(activeConfig);
  } else if (activeConfig.mode === 'distributed_placeholder') {
    // Still no infra dependency — ready for drop-in Redis implementation.
    activeStore = new DistributedSessionStorePlaceholder(activeConfig);
  } else if (activeConfig.mode === 'custom' && config && (config as any).adapter) {
    activeStore = (config as any).adapter as SessionStore;
  } else {
    activeStore = new InProcessSessionStore();
  }
  return getSessionStoreStatus();
};

export const getSessionStoreStatus = () => ({
  adapterName: activeStore.adapterName,
  mode: activeConfig.mode,
  capabilities: activeStore.capabilities || {
    distributed: false,
    supportsTtl: true,
    supportsAtomicGetSet: false,
    supportsCrossInstance: false
  },
  connectionConfigured: Boolean(activeConfig.connectionUrl),
  note:
    activeConfig.mode === 'in_process'
      ? 'In-process session store (default). Multi-instance consistency requires distributed adapter + infra approval.'
      : activeConfig.mode === 'distributed_placeholder'
        ? 'Distributed session contract active (placeholder). Wire Redis without changing business logic when approved.'
        : 'Custom session adapter.'
});

export const sessionStore = {
  get: (sessionKey: string) => activeStore.get(sessionKey),
  set: (record: SessionRecord, ttlMs?: number) => activeStore.set(record, ttlMs),
  delete: (sessionKey: string) => activeStore.delete(sessionKey),
  adapterName: () => activeStore.adapterName,
  capabilities: () => activeStore.capabilities
};

export const createInProcessSessionStore = () => new InProcessSessionStore();
export const createRedisSessionStore = (config: SessionStoreConfig) => new RedisSessionStore(config);
export const createDistributedSessionStorePlaceholder = (config?: Partial<SessionStoreConfig>) =>
  new DistributedSessionStorePlaceholder({ mode: 'distributed_placeholder', ...config });

// Initialize from env once at module load (safe default).
try {
  configureSessionStore();
} catch {
  activeStore = new InProcessSessionStore();
}
