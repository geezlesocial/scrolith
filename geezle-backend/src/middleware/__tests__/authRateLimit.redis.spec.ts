import { createSensitiveRateLimitStore } from '../distributedRateLimitStore';

describe('sensitive authentication rate-limit store', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  test('fails closed when the Redis configuration is unavailable', async () => {
    delete process.env.REDIS_URL;
    delete process.env.REDIS;
    const store = createSensitiveRateLimitStore('test:auth:');
    store.init({ windowMs: 15 * 60 * 1000 } as any);
    const result = await store.increment('synthetic-ip-and-hash');
    expect(result.totalHits).toBe(Number.MAX_SAFE_INTEGER);
    expect(result.resetTime.getTime()).toBeGreaterThan(Date.now());
    await store.shutdown?.();
  });
});
