import Redis from 'ioredis';
import { ManagedIdentityCredential } from '@azure/identity';

const DEFAULT_AUDIENCE = 'https://redis.azure.com/.default';
const REFRESH_BEFORE_MS = 3 * 60_000;
const MAX_RECONNECT_ATTEMPTS = 3;
const REDIS_CONNECT_TIMEOUT_MS = 2_000;
const REDIS_COMMAND_TIMEOUT_MS = 2_500;

export class RedisUnavailableError extends Error {
  readonly code = 'REDIS_UNAVAILABLE';
  constructor(reason = 'Redis is unavailable') {
    super(reason);
    this.name = 'RedisUnavailableError';
  }
}

type ManagedIdentityToken = { access_token: string; expires_in: number };

async function acquireToken(credential: ManagedIdentityCredential): Promise<ManagedIdentityToken> {
  const token = await credential.getToken(DEFAULT_AUDIENCE);
  if (!token?.token || !Number.isFinite(token.expiresOnTimestamp)) {
    throw new Error('Managed identity token response invalid');
  }
  return {
    access_token: token.token,
    expires_in: Math.max(30, Math.floor((token.expiresOnTimestamp - Date.now()) / 1000))
  };
}

export type EntraRedisConfig = {
  clientId: string;
  username?: string;
  audience?: string;
};

export type RedisClientConfig = {
  clientId?: string;
  requireManagedIdentity?: boolean;
};

export type RedisLifecycleState = 'idle' | 'connecting' | 'ready' | 'unavailable' | 'closed';
const lifecycleStates = new WeakMap<Redis, RedisLifecycleState>();

export const getRedisClientState = (redis: Redis): RedisLifecycleState => lifecycleStates.get(redis) || 'idle';

const connectTransport = async (redis: Redis): Promise<void> => {
  const status = String((redis as Redis & { status?: string }).status || '');
  if (status === 'ready') return;
  if (status === 'connecting') {
    await new Promise<void>((resolve, reject) => {
      const onReady = () => { cleanup(); resolve(); };
      const onError = (error: unknown) => { cleanup(); reject(error); };
      const onEnd = () => { cleanup(); reject(new Error('Redis connection ended before ready')); };
      const timer = setTimeout(() => { cleanup(); reject(new Error('Redis connection readiness timeout')); }, REDIS_CONNECT_TIMEOUT_MS);
      timer.unref?.();
      const cleanup = () => {
        clearTimeout(timer);
        redis.off('ready', onReady);
        redis.off('error', onError);
        redis.off('end', onEnd);
      };
      redis.once('ready', onReady);
      redis.once('error', onError);
      redis.once('end', onEnd);
    });
    return;
  }
  await redis.connect();
};

const retryDelay = (attempt: number) => {
  if (attempt > MAX_RECONNECT_ATTEMPTS) return null;
  return Math.min(1_000, 100 * 2 ** Math.max(0, attempt - 1)) + Math.floor(Math.random() * 100);
};

/** Single application Redis client factory with bounded queues/reconnects. */
export function createRedisClient(url: string, config: RedisClientConfig = {}): Redis {
  const clientId = String(config.clientId || '').trim();
  if (config.requireManagedIdentity && !clientId) {
    throw new RedisUnavailableError('Redis managed identity configuration is missing');
  }
  const redis = new Redis(url, {
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
    connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    commandTimeout: REDIS_COMMAND_TIMEOUT_MS,
    retryStrategy: retryDelay,
    autoResubscribe: false,
    autoResendUnfulfilledCommands: false
  });
  lifecycleStates.set(redis, 'idle');
  // Attach before connect: DNS/refusal events must never be unhandled.
  redis.on('error', () => lifecycleStates.set(redis, 'unavailable'));
  redis.on('end', () => lifecycleStates.set(redis, 'closed'));
  redis.on('close', () => lifecycleStates.set(redis, 'unavailable'));
  redis.on('reconnecting', () => undefined);
  return redis;
}

export async function connectRedisClient(redis: Redis, config: EntraRedisConfig | undefined, requireManagedIdentity = false): Promise<() => void> {
  if (config?.clientId) return connectWithManagedIdentity(redis, config);
  if (requireManagedIdentity) throw new RedisUnavailableError('Redis managed identity configuration is missing');
  lifecycleStates.set(redis, 'connecting');
  try {
    await connectTransport(redis);
    lifecycleStates.set(redis, 'ready');
  } catch {
    lifecycleStates.set(redis, 'unavailable');
    throw new RedisUnavailableError('Redis connection failed');
  }
  return () => undefined;
}

/**
 * Authenticates an ioredis connection with the staging user-assigned managed
 * identity. Tokens are held in memory only and refreshed before expiry.
 */
export async function connectWithManagedIdentity(redis: Redis, config: EntraRedisConfig): Promise<() => void> {
  lifecycleStates.set(redis, 'connecting');
  redis.on?.('error', () => lifecycleStates.set(redis, 'unavailable'));
  redis.on?.('end', () => lifecycleStates.set(redis, 'closed'));
  redis.on?.('close', () => lifecycleStates.set(redis, 'unavailable'));
  redis.on?.('reconnecting', () => undefined);
  const username = String(config.username || config.clientId).trim();
  if (!username) throw new Error('Redis Entra username is required');
  const credential = new ManagedIdentityCredential(config.clientId);
  const token = await acquireToken(credential);
  // Azure Managed Redis accepts the Redis resource token as the password.
  // The audience is fixed by the provider contract; keep the option explicit
  // so callers cannot silently select an unrelated resource.
  if ((config.audience || DEFAULT_AUDIENCE) !== DEFAULT_AUDIENCE) throw new Error('Unsupported Redis Entra audience');
  redis.options.username = username;
  redis.options.password = token.access_token;
  try {
    await connectTransport(redis);
    lifecycleStates.set(redis, 'ready');
  } catch {
    lifecycleStates.set(redis, 'unavailable');
    throw new RedisUnavailableError('Redis authentication or connection failed');
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const schedule = (expiresInSeconds: number) => {
    const jitter = Math.floor(Math.random() * 30_000);
    const delay = Math.max(30_000, expiresInSeconds * 1000 - REFRESH_BEFORE_MS - jitter);
    timer = setTimeout(async () => {
      if (stopped) return;
      try {
        const next = await acquireToken(credential);
        await redis.auth(username, next.access_token);
        lifecycleStates.set(redis, 'ready');
        schedule(next.expires_in);
      } catch {
        lifecycleStates.set(redis, 'unavailable');
        schedule(Math.min(60, Math.max(30, expiresInSeconds / 2)));
      }
    }, delay);
    timer.unref?.();
  };
  schedule(token.expires_in);
  return () => { stopped = true; if (timer) clearTimeout(timer); };
}
