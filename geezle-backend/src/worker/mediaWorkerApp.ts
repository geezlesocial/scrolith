/**
 * Phase 3B.4.2 — dedicated media worker HTTP app.
 *
 * Routes:
 *   GET  /healthz              — liveness
 *   GET  /readyz               — readiness (binaries + optional DB)
 *   POST /internal/media/jobs  — Cloud Tasks job handler (OIDC)
 *
 * Does not mount product APIs. Processors invoked directly (no re-enqueue).
 */

import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import type { MediaJobKind } from '../services/media/mediaProcessingQueue';
import { verifyMediaWorkerBearerToken } from './mediaWorkerOidc';

export type MediaJobPayload = {
  fileId: string;
  kind: MediaJobKind;
  processingVersion?: number;
  enqueuedAt?: string;
};

export type VideoJobRunner = (
  fileId: string,
  opts?: { expectedVersion?: number }
) => Promise<{ status: string; errorCode?: string | null; durationMs?: number }>;

export type ImageJobRunner = (
  fileId: string
) => Promise<{ status: string; errorCode?: string | null; durationMs?: number }>;

export type MediaWorkerDeps = {
  runVideoJob?: VideoJobRunner;
  runImageJob?: ImageJobRunner;
  isFfprobeAvailable?: () => Promise<boolean>;
  isFfmpegAvailable?: () => Promise<boolean>;
  checkDatabase?: () => Promise<boolean>;
  /** Override env for tests */
  env?: NodeJS.ProcessEnv;
  /** When true (default), load real processors lazily on first job. */
  useDefaultProcessors?: boolean;
};

const TERMINAL_OK = new Set([
  'READY',
  'PARTIAL',
  'FAILED',
  'SKIPPED',
  'BUSY',
  'DISABLED'
]);

const logSafe = (event: string, payload: Record<string, unknown>) => {
  console.info(`[media-worker] ${event}`, payload);
};

const parseJobBody = (body: unknown): MediaJobPayload | null => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const b = body as Record<string, unknown>;
  const fileId = String(b.fileId || '').trim();
  const kindRaw = String(b.kind || '').trim();
  const kind: MediaJobKind | null =
    kindRaw === 'video_metadata'
      ? 'video_metadata'
      : kindRaw === 'image_variants'
        ? 'image_variants'
        : null;
  if (!fileId || !kind) return null;
  return {
    fileId,
    kind,
    processingVersion:
      b.processingVersion === undefined || b.processingVersion === null
        ? undefined
        : Number(b.processingVersion),
    enqueuedAt: b.enqueuedAt != null ? String(b.enqueuedAt) : undefined
  };
};

const loadDefaultVideoRunner = (): VideoJobRunner => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { processVideoMetadata } =
    require('../services/media/mediaVideoProcessing.service') as typeof import('../services/media/mediaVideoProcessing.service');
  return (fileId, opts) => processVideoMetadata(fileId, opts);
};

const loadDefaultImageRunner = (): ImageJobRunner => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { processImageFile } =
    require('../services/media/mediaProcessing.service') as typeof import('../services/media/mediaProcessing.service');
  return async (fileId) => processImageFile(fileId);
};

const loadDefaultBinaryChecks = () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const probe =
    require('../services/media/mediaVideoProbe.service') as typeof import('../services/media/mediaVideoProbe.service');
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const poster =
    require('../services/media/mediaVideoPoster.service') as typeof import('../services/media/mediaVideoPoster.service');
  return {
    isFfprobeAvailable: () => probe.isFfprobeAvailable(),
    isFfmpegAvailable: () => poster.isFfmpegAvailable()
  };
};

const loadDefaultDbCheck = (): (() => Promise<boolean>) => {
  return async () => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const prisma =
        require('../utils/prismaClient').default as {
          $queryRaw: (q: TemplateStringsArray) => Promise<unknown>;
        };
      await prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  };
};

export const createMediaWorkerApp = (deps: MediaWorkerDeps = {}): Express => {
  const app = express();
  const env = deps.env || process.env;
  const useDefaults = deps.useDefaultProcessors !== false;

  let videoRunner = deps.runVideoJob;
  let imageRunner = deps.runImageJob;
  let ffprobeCheck = deps.isFfprobeAvailable;
  let ffmpegCheck = deps.isFfmpegAvailable;
  let dbCheck = deps.checkDatabase;

  const ensureVideoRunner = (): VideoJobRunner => {
    if (!videoRunner && useDefaults) {
      videoRunner = loadDefaultVideoRunner();
    }
    if (!videoRunner) {
      throw new Error('VIDEO_RUNNER_UNAVAILABLE');
    }
    return videoRunner;
  };

  const ensureImageRunner = (): ImageJobRunner => {
    if (!imageRunner && useDefaults) {
      imageRunner = loadDefaultImageRunner();
    }
    if (!imageRunner) {
      throw new Error('IMAGE_RUNNER_UNAVAILABLE');
    }
    return imageRunner;
  };

  const ensureBinaryChecks = () => {
    if ((!ffprobeCheck || !ffmpegCheck) && useDefaults) {
      const bins = loadDefaultBinaryChecks();
      ffprobeCheck = ffprobeCheck || bins.isFfprobeAvailable;
      ffmpegCheck = ffmpegCheck || bins.isFfmpegAvailable;
    }
  };

  const ensureDbCheck = () => {
    if (!dbCheck && useDefaults) {
      dbCheck = loadDefaultDbCheck();
    }
  };

  app.disable('x-powered-by');
  app.use(express.json({ limit: '64kb' }));

  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).json({
      ok: true,
      service: 'scrolith-media-worker',
      ts: new Date().toISOString()
    });
  });

  app.get('/readyz', async (_req: Request, res: Response) => {
    ensureBinaryChecks();
    ensureDbCheck();

    const requireDb = !['0', 'false', 'no', 'off'].includes(
      String(env.MEDIA_WORKER_READY_REQUIRE_DB || 'true')
        .trim()
        .toLowerCase()
    );

    let ffprobe = false;
    let ffmpeg = false;
    let database: boolean | null = null;

    try {
      ffprobe = ffprobeCheck ? await ffprobeCheck() : false;
    } catch {
      ffprobe = false;
    }
    try {
      ffmpeg = ffmpegCheck ? await ffmpegCheck() : false;
    } catch {
      ffmpeg = false;
    }
    if (requireDb) {
      try {
        database = dbCheck ? await dbCheck() : false;
      } catch {
        database = false;
      }
    }

    const ready = ffprobe && ffmpeg && (requireDb ? database === true : true);
    res.status(ready ? 200 : 503).json({
      ok: ready,
      service: 'scrolith-media-worker',
      ffprobe,
      ffmpeg,
      database: requireDb ? database : 'skipped',
      ts: new Date().toISOString()
    });
  });

  const requireOidc = async (req: Request, res: Response, next: NextFunction) => {
    const auth = await verifyMediaWorkerBearerToken(req.header('authorization') || undefined, env);
    if (auth.ok === false) {
      logSafe('auth_rejected', { reason: auth.reason });
      res.status(401).json({ ok: false, error: auth.reason });
      return;
    }
    (req as any).mediaWorkerIdentity = auth.identity;
    next();
  };

  app.post('/internal/media/jobs', requireOidc, async (req: Request, res: Response) => {
    const started = Date.now();
    const job = parseJobBody(req.body);
    if (!job) {
      res.status(400).json({ ok: false, error: 'INVALID_JOB_PAYLOAD' });
      return;
    }

    const fileIdPrefix = job.fileId.slice(0, 8);
    logSafe('job_received', {
      kind: job.kind,
      fileIdPrefix,
      processingVersion: job.processingVersion ?? null,
      retryCount: req.header('x-cloudtasks-taskretrycount') || null
    });

    try {
      if (job.kind === 'video_metadata') {
        const runner = ensureVideoRunner();
        const outcome = await runner(job.fileId, {
          expectedVersion:
            job.processingVersion !== undefined && Number.isFinite(job.processingVersion)
              ? Number(job.processingVersion)
              : undefined
        });
        const status = String(outcome?.status || 'FAILED');
        const httpStatus = TERMINAL_OK.has(status) ? 200 : 500;
        logSafe('job_complete', {
          kind: job.kind,
          fileIdPrefix,
          status,
          errorCode: outcome?.errorCode || null,
          durationMs: outcome?.durationMs ?? Date.now() - started
        });
        res.status(httpStatus).json({
          ok: httpStatus === 200,
          kind: job.kind,
          fileIdPrefix,
          status,
          errorCode: outcome?.errorCode || null,
          durationMs: outcome?.durationMs ?? Date.now() - started
        });
        return;
      }

      // image_variants — supported for future worker image path; gated by runner flags inside processor.
      const runner = ensureImageRunner();
      const outcome = await runner(job.fileId);
      const status = String(outcome?.status || 'FAILED');
      const httpStatus = TERMINAL_OK.has(status) ? 200 : 500;
      logSafe('job_complete', {
        kind: job.kind,
        fileIdPrefix,
        status,
        errorCode: outcome?.errorCode || null,
        durationMs: outcome?.durationMs ?? Date.now() - started
      });
      res.status(httpStatus).json({
        ok: httpStatus === 200,
        kind: job.kind,
        fileIdPrefix,
        status,
        errorCode: outcome?.errorCode || null,
        durationMs: outcome?.durationMs ?? Date.now() - started
      });
    } catch (error: any) {
      logSafe('job_error', {
        kind: job.kind,
        fileIdPrefix,
        error: String(error?.message || error).slice(0, 200),
        durationMs: Date.now() - started
      });
      res.status(500).json({
        ok: false,
        kind: job.kind,
        fileIdPrefix,
        error: 'JOB_EXECUTION_FAILED'
      });
    }
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ ok: false, error: 'NOT_FOUND' });
  });

  return app;
};
