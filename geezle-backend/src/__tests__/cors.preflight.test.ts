import request from 'supertest';
import cors from 'cors';
import express from 'express';
import { createCorsOptions } from '../config/cors';

describe('production CORS preflight', () => {
  const app = express();
  const corsOptions = createCorsOptions({
    ...process.env,
    NODE_ENV: 'production',
    FRONTEND_URL: '',
    CORS_ALLOWED_ORIGINS: ''
  });

  app.use(cors(corsOptions));
  app.options('*', cors(corsOptions));
  app.post('/api/auth/login', (_req, res) => res.json({ ok: true }));

  const preflight = (origin: string) =>
    request(app)
      .options('/api/auth/login')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,authorization');

  test('allows production public origins', async () => {
    for (const origin of ['https://scrolith.com', 'https://www.scrolith.com']) {
      const response = await preflight(origin);

      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe(origin);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    }
  });

  test('allows the temporary frontend canary origin', async () => {
    const origin = 'https://auth-logout-fix---scrolith-frontend-ui2ik4yg6q-uc.a.run.app';
    const response = await preflight(origin);

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  test('allows an exact messaging release candidate origin from CORS_ALLOWED_ORIGINS', async () => {
    const origin = 'https://messaging-322ab66d---scrolith-frontend-25ysnpjdda-as.a.run.app';
    const scopedApp = express();
    const scopedCorsOptions = createCorsOptions({
      ...process.env,
      NODE_ENV: 'production',
      FRONTEND_URL: '',
      CORS_ALLOWED_ORIGINS: origin
    });

    scopedApp.use(cors(scopedCorsOptions));
    scopedApp.options('*', cors(scopedCorsOptions));
    scopedApp.post('/api/auth/login', (_req, res) => res.json({ ok: true }));

    const response = await request(scopedApp)
      .options('/api/auth/login')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,authorization');

    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe(origin);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-methods']).toContain('POST');
    expect(response.headers['access-control-allow-headers']).toContain('content-type');
  });

  test('unknown origins do not crash preflight handling', async () => {
    const response = await preflight('https://not-allowed.example.com');

    expect(response.status).not.toBe(500);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
