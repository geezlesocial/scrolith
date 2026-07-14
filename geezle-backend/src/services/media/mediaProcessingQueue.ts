/**
 * Phase 3A/3B.2/3B.4 — processing queue abstraction.
 * Default: disabled. Optional in-process async for local/dev only.
 * Production path: cloud_tasks → Cloud Tasks → dedicated media worker.
 * Designed so filesController / enqueue facade call sites stay stable.
 */

import {
  createMediaCloudTasksClient,
  type MediaCloudTasksClient
} from './mediaCloudTasks.client';

export type MediaJobKind = 'image_variants' | 'video_metadata';

export type MediaJob = {
  fileId: string;
  kind: MediaJobKind;
  processingVersion?: number;
};

export type MediaProcessingQueue = {
  /** Generic enqueue — preferred for new code and Cloud Tasks mapping. */
  enqueue: (job: MediaJob) => Promise<void>;
  /** Backward-compatible image helper */
  enqueueImageProcessing: (fileId: string, processingVersion?: number) => Promise<void>;
  /** Phase 3B.2 video metadata helper */
  enqueueVideoProcessing: (fileId: string, processingVersion?: number) => Promise<void>;
};

export type MediaProcessingMode = 'disabled' | 'inline_async' | 'cloud_tasks';

const truthy = (v: unknown) =>
  ['1', 'true', 'yes', 'on'].includes(String(v ?? '').trim().toLowerCase());

/** Raw env mode string (does not collapse flags). */
export const getRawMediaProcessingMode = (
  env: NodeJS.ProcessEnv = process.env
): string =>
  String(env.MEDIA_PROCESSING_MODE || 'disabled')
    .trim()
    .toLowerCase();

/**
 * True when this process is the dedicated media worker (executes processors).
 * API Cloud Run must leave this unset/false so it never runs ffmpeg.
 */
export const isMediaWorkerService = (env: NodeJS.ProcessEnv = process.env): boolean =>
  truthy(env.MEDIA_WORKER_SERVICE);

const parseMode = (): MediaProcessingMode => {
  const mode = getRawMediaProcessingMode();
  if (mode === 'cloud_tasks') return 'cloud_tasks';
  if (mode !== 'inline_async') return 'disabled';

  const imageOn = truthy(process.env.MEDIA_IMAGE_PROCESSING_ENABLED);
  const videoOn = truthy(process.env.MEDIA_VIDEO_PROCESSING_ENABLED);
  // Mode is only "active" when at least one processor is enabled (preserves 3A tests).
  if (imageOn || videoOn) return 'inline_async';
  return 'disabled';
};

/** Enqueue gate for image jobs: flag + active queue mode. */
export const isMediaImageProcessingEnabled = () => {
  if (!truthy(process.env.MEDIA_IMAGE_PROCESSING_ENABLED)) return false;
  const mode = getRawMediaProcessingMode();
  return mode === 'inline_async' || mode === 'cloud_tasks';
};

/** Enqueue gate for video jobs: flag + active queue mode. */
export const isMediaVideoProcessingEnabled = () => {
  if (!truthy(process.env.MEDIA_VIDEO_PROCESSING_ENABLED)) return false;
  const mode = getRawMediaProcessingMode();
  return mode === 'inline_async' || mode === 'cloud_tasks';
};

/**
 * Processor execution gate (ffprobe/ffmpeg/Sharp).
 * - inline_async: local/dev API may execute
 * - media worker service: dedicated Cloud Run executes
 * - cloud_tasks on API: enqueue only — never execute
 */
export const isMediaVideoExecutionAllowed = () => {
  if (!truthy(process.env.MEDIA_VIDEO_PROCESSING_ENABLED)) return false;
  if (isMediaWorkerService()) return true;
  return getRawMediaProcessingMode() === 'inline_async';
};

export const isMediaImageExecutionAllowed = () => {
  if (!truthy(process.env.MEDIA_IMAGE_PROCESSING_ENABLED)) return false;
  if (isMediaWorkerService()) return true;
  return getRawMediaProcessingMode() === 'inline_async';
};

/** True only when inline in-process handlers should be registered. */
export const isInlineAsyncExecutionMode = () => getRawMediaProcessingMode() === 'inline_async';

const inflight = new Set<string>();
const pending = new Set<string>();
let active = 0;
const MAX_CONCURRENCY = Math.max(
  1,
  Math.min(2, Number(process.env.MEDIA_IMAGE_PROCESSING_CONCURRENCY || 1) || 1)
);

const dedupeKey = (kind: MediaJobKind, fileId: string, version: number) =>
  `${kind}:${fileId}:${version}`;

type Processor = (fileId: string) => Promise<void>;

let imageProcessor: Processor | null = null;
let videoProcessor: Processor | null = null;

/** Injected Cloud Tasks client for tests / custom wiring */
let injectedCloudTasksClient: MediaCloudTasksClient | null | undefined = undefined;

/** Injected by mediaProcessing.service to avoid circular imports at load time */
export const registerImageProcessingHandler = (fn: Processor) => {
  imageProcessor = fn;
};

/** Injected by mediaVideoProcessing.service */
export const registerVideoProcessingHandler = (fn: Processor) => {
  videoProcessor = fn;
};

/**
 * Test/prod injection for Cloud Tasks client.
 * Pass null to force "unconfigured"; undefined clears injection (use factory).
 */
export const setMediaCloudTasksClientForTests = (
  client: MediaCloudTasksClient | null | undefined
) => {
  injectedCloudTasksClient = client;
};

const resolveCloudTasksClient = (): MediaCloudTasksClient | null => {
  if (injectedCloudTasksClient !== undefined) {
    return injectedCloudTasksClient;
  }
  return createMediaCloudTasksClient();
};

const runNext = () => {
  if (active >= MAX_CONCURRENCY) return;
  const next = pending.values().next();
  if (next.done) return;
  const key = next.value;
  pending.delete(key);

  // key format: kind:fileId:version
  const parts = String(key).split(':');
  const kind = parts[0] as MediaJobKind;
  // fileId may contain colons in theory (cuid usually does not) — rejoin middle
  const fileId = parts.slice(1, -1).join(':');
  if (!fileId) {
    runNext();
    return;
  }

  const processor = kind === 'video_metadata' ? videoProcessor : imageProcessor;
  if (!processor) {
    runNext();
    return;
  }
  if (inflight.has(key)) {
    runNext();
    return;
  }

  inflight.add(key);
  active += 1;
  Promise.resolve()
    .then(() => processor(fileId))
    .catch((error) => {
      console.error('[media-processing] job failed', {
        kind,
        fileIdPrefix: String(fileId).slice(0, 8),
        error: String((error as any)?.message || error)
      });
    })
    .finally(() => {
      inflight.delete(key);
      active = Math.max(0, active - 1);
      runNext();
    });
};

const enqueueInlineJob = async (job: MediaJob) => {
  const id = String(job.fileId || '').trim();
  if (!id) return;
  const kind = job.kind === 'video_metadata' ? 'video_metadata' : 'image_variants';
  if (kind === 'image_variants' && !isMediaImageProcessingEnabled()) return;
  if (kind === 'video_metadata' && !isMediaVideoProcessingEnabled()) return;
  if (getRawMediaProcessingMode() !== 'inline_async') return;

  const key = dedupeKey(kind, id, Number(job.processingVersion) || 0);
  if (inflight.has(key) || pending.has(key)) {
    return;
  }
  pending.add(key);
  console.info('[media-processing] queued', {
    kind,
    fileIdPrefix: id.slice(0, 8),
    mode: 'inline_async'
  });
  setImmediate(() => runNext());
};

const enqueueCloudTasksJob = async (job: MediaJob) => {
  const id = String(job.fileId || '').trim();
  if (!id) return;
  const kind = job.kind === 'video_metadata' ? 'video_metadata' : 'image_variants';
  if (kind === 'image_variants' && !isMediaImageProcessingEnabled()) return;
  if (kind === 'video_metadata' && !isMediaVideoProcessingEnabled()) return;
  if (getRawMediaProcessingMode() !== 'cloud_tasks') return;

  const client = resolveCloudTasksClient();
  if (!client) {
    console.error('[media-processing] cloud_tasks not configured (enqueue skipped)', {
      kind,
      fileIdPrefix: id.slice(0, 8)
    });
    return;
  }

  const processingVersion = Math.max(0, Number(job.processingVersion) || 0);
  const result = await client.createMediaTask({
    fileId: id,
    kind,
    processingVersion,
    enqueuedAt: new Date().toISOString()
  });

  if (result.ok === false) {
    console.error('[media-processing] cloud_tasks enqueue failed', {
      kind,
      fileIdPrefix: id.slice(0, 8),
      errorCode: result.errorCode,
      error: result.message
    });
    return;
  }

  console.info('[media-processing] queued', {
    kind,
    fileIdPrefix: id.slice(0, 8),
    mode: 'cloud_tasks',
    alreadyExists: Boolean(result.alreadyExists)
  });
};

const disabledQueue: MediaProcessingQueue = {
  enqueue: async () => {},
  enqueueImageProcessing: async () => {},
  enqueueVideoProcessing: async () => {}
};

const inlineAsyncQueue: MediaProcessingQueue = {
  enqueue: enqueueInlineJob,
  enqueueImageProcessing: async (fileId: string, processingVersion = 0) => {
    await enqueueInlineJob({
      fileId,
      kind: 'image_variants',
      processingVersion
    });
  },
  enqueueVideoProcessing: async (fileId: string, processingVersion = 0) => {
    await enqueueInlineJob({
      fileId,
      kind: 'video_metadata',
      processingVersion
    });
  }
};

const cloudTasksQueue: MediaProcessingQueue = {
  enqueue: enqueueCloudTasksJob,
  enqueueImageProcessing: async (fileId: string, processingVersion = 0) => {
    await enqueueCloudTasksJob({
      fileId,
      kind: 'image_variants',
      processingVersion
    });
  },
  enqueueVideoProcessing: async (fileId: string, processingVersion = 0) => {
    await enqueueCloudTasksJob({
      fileId,
      kind: 'video_metadata',
      processingVersion
    });
  }
};

export const getMediaProcessingMode = () => parseMode();

export const getMediaProcessingQueue = (): MediaProcessingQueue => {
  // Prefer raw mode so per-kind flags can still gate inside enqueue when only one processor is on.
  const modeRaw = getRawMediaProcessingMode();
  if (modeRaw === 'cloud_tasks') return cloudTasksQueue;
  if (modeRaw === 'inline_async') return inlineAsyncQueue;
  return disabledQueue;
};

/** Test helpers */
export const __resetMediaProcessingQueueForTests = () => {
  inflight.clear();
  pending.clear();
  active = 0;
  imageProcessor = null;
  videoProcessor = null;
  injectedCloudTasksClient = undefined;
};

export const __getMediaProcessingQueueStatsForTests = () => ({
  inflight: inflight.size,
  pending: pending.size,
  active,
  mode: parseMode()
});
