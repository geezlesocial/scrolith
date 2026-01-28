import request from 'supertest';
import app from '../server';

describe('/metrics authorization edge-cases', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  test('malformed Base64 in Basic auth results in 403 (forbidden)', async () => {
    process.env.METRICS_USERNAME = 'metrics-user';
    process.env.METRICS_PASSWORD = 'metrics-pass';

    // Provide a Basic prefix but a token that's not valid credential format
    const res = await request(app)
      .get('/metrics')
      .set('Authorization', 'Basic not-base64-at-all');

    // Server should treat this as an auth failure (403 Forbidden)
    expect(res.status).toBe(403);
  });

  test('IPv4-mapped IPv6 (::ffff:) is accepted when IPv4 allowlist matches', async () => {
    // allowlist an IPv4 address
    process.env.METRICS_ALLOW_IPS = '127.0.0.1';

    // Use X-Forwarded-For with IPv4-mapped IPv6 form
    const res = await request(app)
      .get('/metrics')
      .set('X-Forwarded-For', '::ffff:127.0.0.1');

    expect([200, 404]).toContain(res.status);
  });

  test('IPv4-mapped IPv6 inside CIDR is accepted (e.g., 192.168.0.0/16)', async () => {
    process.env.METRICS_ALLOW_IPS = '192.168.0.0/16';
    const res = await request(app)
      .get('/metrics')
      .set('X-Forwarded-For', '::ffff:192.168.1.42');
    expect([200, 404]).toContain(res.status);
  });

  test('Basic with empty token ("Basic ") returns 403', async () => {
    process.env.METRICS_USERNAME = 'metrics-user';
    process.env.METRICS_PASSWORD = 'metrics-pass';

    const res = await request(app)
      .get('/metrics')
      .set('Authorization', 'Basic ');
    expect([401, 403]).toContain(res.status);
  });

  test('Base64 that decodes to username-only (no colon) returns 403', async () => {
    process.env.METRICS_USERNAME = 'metrics-user';
    process.env.METRICS_PASSWORD = 'metrics-pass';

    const token = Buffer.from('useronly').toString('base64');
    const res = await request(app)
      .get('/metrics')
      .set('Authorization', `Basic ${token}`);
    expect(res.status).toBe(403);
  });

  test('Base64 that decodes to non-UTF8 bytes is handled safely (returns 403)', async () => {
    process.env.METRICS_USERNAME = 'metrics-user';
    process.env.METRICS_PASSWORD = 'metrics-pass';

    // Construct a base64 token from bytes that are invalid UTF-8 sequences
    const buf = Buffer.from([0xff, 0xfe, 0xff, 0xfe]);
    const token = buf.toString('base64');

    const res = await request(app)
      .get('/metrics')
      .set('Authorization', `Basic ${token}`);

    // Server should not crash and should treat this as invalid credentials
    expect(res.status).toBe(403);
  });
});
