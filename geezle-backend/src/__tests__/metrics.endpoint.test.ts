import request from 'supertest';
import app from '../server';

describe('/metrics endpoint security', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('requires Basic auth when METRICS_USERNAME/PASSWORD set', async () => {
    process.env.METRICS_USERNAME = 'metrics-user';
    process.env.METRICS_PASSWORD = 'metrics-pass';

    const resNoAuth = await request(app).get('/metrics');
    expect(resNoAuth.status).toBe(401);
    expect(resNoAuth.headers['www-authenticate']).toBeDefined();

    const resWrong = await request(app)
      .get('/metrics')
      .set('Authorization', 'Basic ' + Buffer.from('metrics-user:wrong').toString('base64'));
    expect(resWrong.status).toBe(403);

    const resOk = await request(app)
      .get('/metrics')
      .set('Authorization', 'Basic ' + Buffer.from('metrics-user:metrics-pass').toString('base64'));
    expect([200, 404]).toContain(resOk.status); // 200 when prom-client present, 404 if metrics disabled
    if (resOk.status === 200) {
      expect(resOk.text).toContain('gcoin_recompute_runs_total');
    }
  });

  test('accepts requests from allowlisted CIDR via X-Forwarded-For', async () => {
    // enable allowlist using a CIDR range that includes 192.168.1.5
    process.env.METRICS_ALLOW_IPS = '192.168.0.0/16';

    const resAllowed = await request(app)
      .get('/metrics')
      .set('X-Forwarded-For', '192.168.1.5');
    expect([200, 404]).toContain(resAllowed.status);

    const resDenied = await request(app)
      .get('/metrics')
      .set('X-Forwarded-For', '10.0.0.5');
    expect(resDenied.status).toBe(403);
  });

  test('allowlist entry for exact IP works', async () => {
    process.env.METRICS_ALLOW_IPS = '127.0.0.1/32';
    const res = await request(app).get('/metrics').set('X-Forwarded-For', '127.0.0.1');
    expect([200, 404]).toContain(res.status);
  });
});
