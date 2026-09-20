import { handleBasicHealth, isBasicHealthPath } from '../middleware/basicHealth';
import { DistributedRateLimitStore } from '../middleware/distributedRateLimitStore';

const createResponse = () => {
  const res: any = {};
  res.setHeader = jest.fn();
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  return res;
};

describe('basic health and Redis-backed limiter degradation', () => {
  test('basic health remains available and minimal while Redis limiter is unavailable', () => {
    const res = createResponse();
    handleBasicHealth({ method: 'GET' } as any, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ status: 'OK' });
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('database');
  });

  test('only the exact basic health endpoint is exempted from the global limiter', () => {
    expect(isBasicHealthPath({ method: 'GET', originalUrl: '/api/health' })).toBe(true);
    expect(isBasicHealthPath({ method: 'HEAD', originalUrl: '/api/health?probe=1' })).toBe(true);
    expect(isBasicHealthPath({ method: 'GET', originalUrl: '/api/health/details' })).toBe(false);
    expect(isBasicHealthPath({ method: 'GET', originalUrl: '/api/auth/health' })).toBe(false);
  });

  test('a normal protected limiter remains fail-closed while Redis is unavailable', async () => {
    const store = new DistributedRateLimitStore('redis://127.0.0.1:6399', 'test:protected:', { failClosed: true });
    store.init({ windowMs: 60_000 } as any);
    const response = await store.increment('synthetic-key');

    expect(response.totalHits).toBe(Number.MAX_SAFE_INTEGER);
    await store.shutdown?.();
  });
});
