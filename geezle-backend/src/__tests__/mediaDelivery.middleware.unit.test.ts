import express from 'express';
import request from 'supertest';

const loadMiddleware = () => {
  jest.resetModules();
  return require('../middleware/mediaDelivery.middleware') as typeof import('../middleware/mediaDelivery.middleware');
};

describe('media delivery middleware', () => {
  const prevEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...prevEnv };
    jest.resetModules();
  });

  test('matches only GET and HEAD file-content reads', () => {
    const { isMediaContentReadRequest } = loadMiddleware();
    expect(
      isMediaContentReadRequest({
        method: 'GET',
        originalUrl: '/api/files/content/file-id',
        baseUrl: '',
        path: '/api/files/content/file-id'
      } as any)
    ).toBe(true);
    expect(
      isMediaContentReadRequest({
        method: 'HEAD',
        originalUrl: '/api/files/content/file-id?w=32',
        baseUrl: '/api',
        path: '/files/content/file-id'
      } as any)
    ).toBe(true);
    expect(
      isMediaContentReadRequest({
        method: 'POST',
        originalUrl: '/api/files/content/file-id',
        baseUrl: '/api',
        path: '/files/content/file-id'
      } as any)
    ).toBe(false);
    expect(
      isMediaContentReadRequest({
        method: 'GET',
        originalUrl: '/api/files/contented/file-id',
        baseUrl: '/api',
        path: '/files/contented/file-id'
      } as any)
    ).toBe(false);
  });

  test('successful GET and HEAD media reads do not consume the restrictive media quota', async () => {
    process.env.MEDIA_DELIVERY_RATE_LIMIT_MAX_ANON = '2';
    const { createMediaDeliveryRateLimiter } = loadMiddleware();
    const app = express();
    app.use('/api/files/content', createMediaDeliveryRateLimiter());
    app.get('/api/files/content/:id', (_req, res) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.type('image/png').send(Buffer.from('ok'));
    });

    for (let i = 0; i < 5; i += 1) {
      const response = await request(app).get('/api/files/content/avatar.png');
      expect(response.status).toBe(200);
      expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
    }

    const head = await request(app).head('/api/files/content/avatar.png');
    expect(head.status).toBe(200);
  });

  test('abusive failing media traffic receives 429 with Retry-After and CORP headers', async () => {
    process.env.MEDIA_DELIVERY_RATE_LIMIT_MAX_ANON = '500';
    process.env.MEDIA_DELIVERY_RATE_LIMIT_SKIP_SUCCESS = 'true';
    const { createMediaDeliveryRateLimiter } = loadMiddleware();
    const app = express();
    app.use('/api/files/content', createMediaDeliveryRateLimiter());
    app.get('/api/files/content/:id', (_req, res) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      res.status(404).json({ success: false, error: 'File not found' });
    });

    for (let i = 0; i < 500; i += 1) {
      expect((await request(app).get('/api/files/content/missing-a.png')).status).toBe(404);
    }
    const limited = await request(app).get('/api/files/content/missing-a.png');
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBeTruthy();
    expect(limited.headers['cross-origin-resource-policy']).toBe('cross-origin');
  }, 30_000);
});
