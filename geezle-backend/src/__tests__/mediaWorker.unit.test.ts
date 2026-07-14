/**
 * Phase 3B.4.2 — media worker HTTP + OIDC unit tests.
 */

import request from 'supertest';
import {
  createMediaWorkerApp
} from '../worker/mediaWorkerApp';
import {
  setMediaWorkerOidcVerifierForTests,
  isMediaWorkerOidcBypassEnabled,
  getMediaWorkerOidcAudience,
  verifyMediaWorkerBearerToken
} from '../worker/mediaWorkerOidc';

describe('mediaWorkerOidc', () => {
  afterEach(() => {
    setMediaWorkerOidcVerifierForTests(undefined);
  });

  test('audience falls back to MEDIA_WORKER_URL', () => {
    expect(
      getMediaWorkerOidcAudience({
        MEDIA_WORKER_URL: 'https://worker.example.run.app/'
      } as any)
    ).toBe('https://worker.example.run.app');
  });

  test('OIDC bypass allowed outside production', () => {
    expect(
      isMediaWorkerOidcBypassEnabled({
        MEDIA_WORKER_OIDC_DISABLE: 'true',
        NODE_ENV: 'test'
      } as any)
    ).toBe(true);
  });

  test('OIDC bypass blocked in production without insecure allow', () => {
    expect(
      isMediaWorkerOidcBypassEnabled({
        MEDIA_WORKER_OIDC_DISABLE: 'true',
        NODE_ENV: 'production'
      } as any)
    ).toBe(false);
  });

  test('verify rejects missing bearer', async () => {
    setMediaWorkerOidcVerifierForTests(async () => ({ email: 'a@b.c' }));
    const result = await verifyMediaWorkerBearerToken(undefined, {
      MEDIA_WORKER_OIDC_AUDIENCE: 'https://worker.example',
      NODE_ENV: 'test'
    } as any);
    expect(result.ok).toBe(false);
    if (result.ok === false) expect(result.reason).toBe('MISSING_BEARER');
  });

  test('verify accepts valid token via injected verifier', async () => {
    setMediaWorkerOidcVerifierForTests(async (token, aud) => {
      if (token === 'good' && aud === 'https://aud') {
        return { email: 'tasks@proj.iam.gserviceaccount.com' };
      }
      return null;
    });
    const result = await verifyMediaWorkerBearerToken('Bearer good', {
      MEDIA_WORKER_OIDC_AUDIENCE: 'https://aud',
      NODE_ENV: 'test'
    } as any);
    expect(result.ok).toBe(true);
  });
});

describe('mediaWorkerApp', () => {
  afterEach(() => {
    setMediaWorkerOidcVerifierForTests(undefined);
  });

  const buildApp = (overrides: Parameters<typeof createMediaWorkerApp>[0] = {}) => {
    setMediaWorkerOidcVerifierForTests(async (token) =>
      token === 'valid-token' ? { email: 'sa@example.com' } : null
    );
    return createMediaWorkerApp({
      useDefaultProcessors: false,
      env: {
        NODE_ENV: 'test',
        MEDIA_WORKER_OIDC_AUDIENCE: 'https://worker.test'
      } as any,
      isFfprobeAvailable: async () => true,
      isFfmpegAvailable: async () => true,
      checkDatabase: async () => true,
      runVideoJob: async () => ({ status: 'READY', durationMs: 12 }),
      runImageJob: async () => ({ status: 'READY', durationMs: 5 }),
      ...overrides
    });
  };

  test('GET /healthz is public and ok', async () => {
    const app = buildApp();
    const res = await request(app).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.service).toBe('scrolith-media-worker');
  });

  test('GET /readyz 200 when binaries + db ready', async () => {
    const app = buildApp();
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      ok: true,
      ffprobe: true,
      ffmpeg: true,
      database: true
    });
  });

  test('GET /readyz 503 when ffmpeg missing', async () => {
    const app = buildApp({
      isFfmpegAvailable: async () => false
    });
    const res = await request(app).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body.ok).toBe(false);
    expect(res.body.ffmpeg).toBe(false);
  });

  test('POST /internal/media/jobs rejects without auth', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/internal/media/jobs')
      .send({ fileId: 'f1', kind: 'video_metadata' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('MISSING_BEARER');
  });

  test('POST /internal/media/jobs rejects invalid token', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/internal/media/jobs')
      .set('Authorization', 'Bearer bad-token')
      .send({ fileId: 'f1', kind: 'video_metadata' });
    expect(res.status).toBe(401);
  });

  test('POST /internal/media/jobs 400 on bad payload', async () => {
    const app = buildApp();
    const res = await request(app)
      .post('/internal/media/jobs')
      .set('Authorization', 'Bearer valid-token')
      .send({ fileId: 'f1', kind: 'unknown' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_JOB_PAYLOAD');
  });

  test('POST /internal/media/jobs runs video job and returns 200', async () => {
    const runVideoJob = jest.fn(async (fileId: string, opts?: { expectedVersion?: number }) => {
      expect(fileId).toBe('file-xyz');
      expect(opts?.expectedVersion).toBe(2);
      return { status: 'READY' as const, durationMs: 40 };
    });
    const app = buildApp({ runVideoJob });
    const res = await request(app)
      .post('/internal/media/jobs')
      .set('Authorization', 'Bearer valid-token')
      .set('X-CloudTasks-TaskRetryCount', '0')
      .send({
        fileId: 'file-xyz',
        kind: 'video_metadata',
        processingVersion: 2
      });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('READY');
    expect(runVideoJob).toHaveBeenCalledTimes(1);
  });

  test('business FAILED still returns 200 (no infinite Tasks retry)', async () => {
    const app = buildApp({
      runVideoJob: async () => ({
        status: 'FAILED',
        errorCode: 'VIDEO_CORRUPT',
        durationMs: 3
      })
    });
    const res = await request(app)
      .post('/internal/media/jobs')
      .set('Authorization', 'Bearer valid-token')
      .send({ fileId: 'badvid', kind: 'video_metadata' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('FAILED');
    expect(res.body.errorCode).toBe('VIDEO_CORRUPT');
  });

  test('PARTIAL and SKIPPED return 200', async () => {
    for (const status of ['PARTIAL', 'SKIPPED', 'BUSY', 'DISABLED'] as const) {
      const app = buildApp({
        runVideoJob: async () => ({ status, durationMs: 1 })
      });
      const res = await request(app)
        .post('/internal/media/jobs')
        .set('Authorization', 'Bearer valid-token')
        .send({ fileId: 'f', kind: 'video_metadata' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe(status);
    }
  });

  test('runner throw → 500 for Tasks retry', async () => {
    const app = buildApp({
      runVideoJob: async () => {
        throw new Error('boom');
      }
    });
    const res = await request(app)
      .post('/internal/media/jobs')
      .set('Authorization', 'Bearer valid-token')
      .send({ fileId: 'f', kind: 'video_metadata' });
    expect(res.status).toBe(500);
    expect(res.body.error).toBe('JOB_EXECUTION_FAILED');
  });

  test('image_variants path works', async () => {
    const runImageJob = jest.fn(async () => ({ status: 'READY' as const, durationMs: 2 }));
    const app = buildApp({ runImageJob });
    const res = await request(app)
      .post('/internal/media/jobs')
      .set('Authorization', 'Bearer valid-token')
      .send({ fileId: 'img1', kind: 'image_variants' });
    expect(res.status).toBe(200);
    expect(runImageJob).toHaveBeenCalledWith('img1');
  });

  test('unknown routes 404', async () => {
    const app = buildApp();
    const res = await request(app).get('/api/files/content/x');
    expect(res.status).toBe(404);
  });

  test('OIDC bypass mode accepts jobs without bearer in non-prod', async () => {
    setMediaWorkerOidcVerifierForTests(undefined);
    const runVideoJob = jest.fn(async () => ({ status: 'READY' as const }));
    const app = createMediaWorkerApp({
      useDefaultProcessors: false,
      env: {
        NODE_ENV: 'test',
        MEDIA_WORKER_OIDC_DISABLE: 'true'
      } as any,
      isFfprobeAvailable: async () => true,
      isFfmpegAvailable: async () => true,
      checkDatabase: async () => true,
      runVideoJob
    });
    const res = await request(app)
      .post('/internal/media/jobs')
      .send({ fileId: 'f1', kind: 'video_metadata' });
    expect(res.status).toBe(200);
    expect(runVideoJob).toHaveBeenCalled();
  });
});
