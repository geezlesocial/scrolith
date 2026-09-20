import Redis from 'ioredis';
import { connectWithManagedIdentity } from '../services/redis/entraRedis';
import { DistributedRateLimitStore } from '../middleware/distributedRateLimitStore';
import { createRedisSessionStore } from '../services/scrolitha/scrolitha.sessionStore';

const localCiRedis = process.env.REDIS_TEST_MODE === 'local';
const required = localCiRedis ? ['REDIS_URL'] : ['REDIS_URL', 'REDIS_ENTRA_CLIENT_ID', 'REDIS_ENTRA_OBJECT_ID'];
for (const name of required) if (!process.env[name]) throw new Error(`${name} is required for Redis runtime tests`);

describe('staging Redis runtime contract', () => {
  const prefix = `runtime-test:${process.pid}:`;
  let redis: Redis;
  let stopAuth: (() => void) | undefined;

  beforeAll(async () => {
    redis = new Redis(process.env.REDIS_URL!, { lazyConnect: true, enableOfflineQueue: false, retryStrategy: () => null });
    stopAuth = localCiRedis
      ? await (async () => {
          await redis.connect();
          return () => undefined;
        })()
      : await connectWithManagedIdentity(redis, {
          clientId: process.env.REDIS_ENTRA_CLIENT_ID!,
          username: process.env.REDIS_ENTRA_OBJECT_ID!
        });
  });

  afterAll(async () => {
    stopAuth?.();
    await redis.quit().catch(() => undefined);
  });

  test('authenticates and executes synthetic commands over TLS', async () => {
    const key = `${prefix}command`;
    await expect(redis.ping()).resolves.toBe('PONG');
    await redis.set(key, 'synthetic', 'PX', 30_000);
    await expect(redis.get(key)).resolves.toBe('synthetic');
    await expect(redis.pttl(key)).resolves.toBeGreaterThan(0);
    const limiterResult = await redis.eval(
      [
        'local hits = redis.call("INCR", KEYS[1])',
        'if hits == 1 then',
        '  redis.call("PEXPIRE", KEYS[1], ARGV[1])',
        'end',
        'local ttl = redis.call("PTTL", KEYS[1])',
        'return { hits, ttl }'
      ].join('\n'),
      1,
      `${prefix}script`,
      '30_000'
    ) as [number | string, number | string];
    expect(Number(limiterResult[0])).toBe(1);
    expect(Number(limiterResult[1])).toBeGreaterThan(0);
    await redis.del(`${prefix}script`);
    await redis.del(key);
  });

  test('distributed limiter shares bounded TTL state and fails closed', async () => {
    const storeA = new DistributedRateLimitStore(process.env.REDIS_URL!, `${prefix}limit:`, {
      failClosed: true,
      entraClientId: localCiRedis ? undefined : process.env.REDIS_ENTRA_CLIENT_ID
    });
    const storeB = new DistributedRateLimitStore(process.env.REDIS_URL!, `${prefix}limit:`, {
      failClosed: true,
      entraClientId: localCiRedis ? undefined : process.env.REDIS_ENTRA_CLIENT_ID
    });
    storeA.init({ windowMs: 30_000 } as any);
    storeB.init({ windowMs: 30_000 } as any);
    const first = await storeA.increment('same-user');
    expect(first.totalHits).toBe(1);
    expect(first.resetTime.getTime()).toBeGreaterThan(Date.now());
    const second = await storeB.increment('same-user');
    expect(second.totalHits).toBe(2);
    await storeA.shutdown();
    await storeB.shutdown();
  });

  test('Redis-backed session keys isolate users and active accounts', async () => {
    const store = createRedisSessionStore({
      mode: 'redis',
      connectionUrl: process.env.REDIS_URL!,
      keyPrefix: `${prefix}session:`
    });
    const a = { sessionKey: 'a', userId: 'user-a', turns: [], dismissedSuggestionKeys: [], createdAt: Date.now(), updatedAt: Date.now() };
    const b = { ...a, sessionKey: 'b', userId: 'user-b' };
    await store.set(a, 30_000);
    await store.set(b, 30_000);
    await expect(store.get('a')).resolves.toMatchObject({ userId: 'user-a' });
    await expect(store.get('b')).resolves.toMatchObject({ userId: 'user-b' });
    await store.delete('a');
    await expect(store.get('a')).resolves.toBeNull();
    await store.close();
  });
});
