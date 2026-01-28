import request from 'supertest';
import app from '../server';

describe('/metrics endpoint edge-cases', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('malformed-only allowlist entries are ignored and result in 403', async () => {
    process.env.METRICS_ALLOW_IPS = 'not-a-cidr,also-bad-entry';
    const res = await request(app).get('/metrics').set('X-Forwarded-For', '192.168.1.10');
    expect(res.status).toBe(403);
  });

  test('IPv6 exact allowlist entry grants access for ::1', async () => {
    process.env.METRICS_ALLOW_IPS = '::1';
    const res = await request(app).get('/metrics').set('X-Forwarded-For', '::1');
    expect([200, 404]).toContain(res.status);
  });

  test('IPv6 CIDR entries are ignored (unsupported) and result in 403 when no auth', async () => {
    // Server's CIDR matching only supports IPv4; using an IPv6 CIDR should not match
    process.env.METRICS_ALLOW_IPS = '::1/128';
    const res = await request(app).get('/metrics').set('X-Forwarded-For', '::1');
    expect(res.status).toBe(403);
  });
});
