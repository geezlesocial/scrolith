import { DistributedRateLimitStore } from '../distributedRateLimitStore';
import { connectRedisClient } from '../../services/redis/entraRedis';

jest.mock('../../services/redis/entraRedis', () => ({
  connectRedisClient: jest.fn(),
  createRedisClient: jest.fn(() => ({
    eval: jest.fn().mockResolvedValue([1, 60_000]),
    decr: jest.fn().mockResolvedValue(0),
    del: jest.fn().mockResolvedValue(1),
    get: jest.fn().mockResolvedValue(null),
    pttl: jest.fn().mockResolvedValue(60_000),
    quit: jest.fn().mockResolvedValue('OK'),
  })),
}));

const connectMock = connectRedisClient as jest.MockedFunction<typeof connectRedisClient>;

describe('DistributedRateLimitStore startup containment', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  test('does not connect during route setup, leaving HTTP startup independent of Redis', async () => {
    const store = new DistributedRateLimitStore('rediss://synthetic.invalid:10000', 'test:', {
      failClosed: true,
      entraClientId: 'synthetic-client',
    });

    expect(() => store.init({ windowMs: 60_000 } as any)).not.toThrow();
    expect(connectMock).not.toHaveBeenCalled();
    expect(store.getRedisState()).toBe('idle');
    await store.shutdown();
  });

  test('contains DNS/refusal failures and fails protected requests closed without an unhandled rejection', async () => {
    const warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    connectMock.mockRejectedValueOnce(Object.assign(new Error('synthetic DNS failure'), { code: 'ENOTFOUND' }));
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on('unhandledRejection', onUnhandled);
    const store = new DistributedRateLimitStore('rediss://synthetic.invalid:10000', 'test:', {
      failClosed: true,
      entraClientId: 'synthetic-client',
    });
    store.init({ windowMs: 60_000 } as any);

    const result = await store.increment('synthetic-key');
    await new Promise((resolve) => setImmediate(resolve));

    expect(result.totalHits).toBe(Number.MAX_SAFE_INTEGER);
    expect(store.getRedisState()).toBe('unavailable');
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith('[rate-limit] Redis unavailable; protected requests denied', { reason: 'dns_unavailable' });
    expect(unhandled).toHaveLength(0);

    process.off('unhandledRejection', onUnhandled);
    await store.shutdown();
  });

  test('recovers after the bounded retry cooldown without creating duplicate connection attempts', async () => {
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now);
    connectMock.mockRejectedValueOnce(Object.assign(new Error('synthetic refusal'), { code: 'ECONNREFUSED' }));
    const store = new DistributedRateLimitStore('rediss://synthetic.invalid:10000', 'test:', {
      failClosed: true,
      entraClientId: 'synthetic-client',
    });
    store.init({ windowMs: 60_000 } as any);

    const denied = await store.increment('synthetic-key');
    expect(denied.totalHits).toBe(Number.MAX_SAFE_INTEGER);
    expect(connectMock).toHaveBeenCalledTimes(1);

    const stillDenied = await store.increment('synthetic-key');
    expect(stillDenied.totalHits).toBe(Number.MAX_SAFE_INTEGER);
    expect(connectMock).toHaveBeenCalledTimes(1);

    connectMock.mockResolvedValueOnce(jest.fn());
    jest.spyOn(Date, 'now').mockReturnValue(now + 1_001);
    const recovered = await store.increment('synthetic-key');

    expect(recovered.totalHits).toBe(1);
    expect(store.getRedisState()).toBe('ready');
    expect(connectMock).toHaveBeenCalledTimes(2);
    await store.shutdown();
  });

  test('does not throw when a protected limiter is initialized without a managed-identity client ID', () => {
    const store = new DistributedRateLimitStore('rediss://synthetic.invalid:10000', 'test:', { failClosed: true });
    expect(() => store.init({ windowMs: 60_000 } as any)).not.toThrow();
  });
});
