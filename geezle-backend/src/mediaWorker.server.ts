/**
 * Phase 3B.4.2 — Cloud Run entrypoint for the dedicated media worker.
 *
 * Sets MEDIA_WORKER_SERVICE so processors may execute (ffmpeg/ffprobe present in image).
 * Does not run Prisma migrations (API owns schema apply).
 * Does not mount product routes.
 */

import 'dotenv/config';
import http from 'http';
import { createMediaWorkerApp } from './worker/mediaWorkerApp';

// Mark this process as the media worker before any processor imports resolve flags.
process.env.MEDIA_WORKER_SERVICE = process.env.MEDIA_WORKER_SERVICE || 'true';

const port = Math.max(
  1,
  Math.min(65535, Number(process.env.PORT || process.env.MEDIA_WORKER_PORT || 8080) || 8080)
);

const app = createMediaWorkerApp();
const server = http.createServer(app);

server.listen(port, () => {
  console.info('[media-worker] listening', {
    port,
    service: 'scrolith-media-worker',
    workerService: true,
    nodeEnv: process.env.NODE_ENV || 'development'
  });
});

const shutdown = (signal: string) => {
  console.info('[media-worker] shutdown', { signal });
  server.close(() => {
    process.exit(0);
  });
  // Force exit if close hangs (in-flight ffmpeg).
  setTimeout(() => process.exit(0), 25_000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
