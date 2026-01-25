import request from 'supertest';
import app from '../../src/server';
import {
  TRANSFER_LIMIT_PER_MIN,
  CONVERSION_LIMIT_PER_DAY
} from '../../src/middleware/gcoinLimits';

jest.setTimeout(120000);

const agent = request(app as any);

describe('Gcoin Redis atomic limiter integration', () => {
  beforeAll(async () => {
    // seed a large balance for the dev user (admin bypass header required)
    await agent
      .post('/api/gcoin/admin/credit')
      .set('x-dev-role', 'admin')
      .send({ userId: 'dev-user-id-123', amount: 50000 })
      .expect(200);
  }, 30000);

  test('concurrent transfers respect per-minute limit', async () => {
    const concurrency = 20;
    const reqs = Array.from({ length: concurrency }).map((_, i) =>
      agent.post('/api/gcoin/transfer').send({ toEmail: 'dev@example.com', amount: 1, note: `itest-${i}` })
    );
    const results = await Promise.all(reqs.map(p => p.then(r => r).catch(e => ({ status: 500 }))));
    const success = results.filter(r => r && r.status === 200).length;
    // Under atomic limiter, successes must not exceed per-minute limit
    expect(success).toBeLessThanOrEqual(TRANSFER_LIMIT_PER_MIN);
  }, 60000);

  test('concurrent conversions respect per-day limit', async () => {
    const concurrency = 10;
    const reqs = Array.from({ length: concurrency }).map((_, i) =>
      agent.post('/api/gcoin/conversions').send({ amount: 1 })
    );
    const results = await Promise.all(reqs.map(p => p.then(r => r).catch(e => ({ status: 500 }))));
    const success = results.filter(r => r && r.status === 200).length;
    expect(success).toBeLessThanOrEqual(CONVERSION_LIMIT_PER_DAY);
  }, 60000);
});
