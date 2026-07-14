/**
 * Phase 3A/3B.2 — processing queue abstraction.
 * Default: disabled. Optional in-process async for local/dev only.
 * Designed to swap to Cloud Tasks without changing call sites.
 */

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

export type MediaProcessingMode = 'disabled' | 'inline_async';

const parseMode = (): MediaProcessingMode => {
  const mode = String(process.env.MEDIA_PROCESSING_MODE || 'disabled')
    .trim()
    .toLowerCase();
  if (mode !== 'inline_async') return 'disabled';

  const imageOn = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.MEDIA_IMAGE_PROCESSING_ENABLED || 'false')
      .trim()
      .toLowerCase()
  );
  const videoOn = ['1', 'true', 'yes', 'on'].includes(
    String(process.env.MEDIA_VIDEO_PROCESSING_ENABLED || 'false')
      .trim()
      .toLowerCase()
  );
  // Mode is only "active" when at least one processor is enabled (preserves 3A tests).
  if (imageOn || videoOn) return 'inline_async';
  return 'disabled';
};

export const isMediaImageProcessingEnabled = () => {
  const enabled = String(process.env.MEDIA_IMAGE_PROCESSING_ENABLED || 'false')
    .trim()
    .toLowerCase();
  return (
    ['1', 'true', 'yes', 'on'].includes(enabled) &&
    String(process.env.MEDIA_PROCESSING_MODE || 'disabled')
      .trim()
      .toLowerCase() === 'inline_async'
  );
};

export const isMediaVideoProcessingEnabled = () => {
  const enabled = String(process.env.MEDIA_VIDEO_PROCESSING_ENABLED || 'false')
    .trim()
    .toLowerCase();
  return (
    ['1', 'true', 'yes', 'on'].includes(enabled) &&
    String(process.env.MEDIA_PROCESSING_MODE || 'disabled')
      .trim()
      .toLowerCase() === 'inline_async'
  );
};

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

/** Injected by mediaProcessing.service to avoid circular imports at load time */
export const registerImageProcessingHandler = (fn: Processor) => {
  imageProcessor = fn;
};

/** Injected by mediaVideoProcessing.service */
export const registerVideoProcessingHandler = (fn: Processor) => {
  videoProcessor = fn;
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
  const versionStr = parts[parts.length - 1];
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

const enqueueJob = async (job: MediaJob) => {
  const id = String(job.fileId || '').trim();
  if (!id) return;
  const kind = job.kind === 'video_metadata' ? 'video_metadata' : 'image_variants';
  if (kind === 'image_variants' && !isMediaImageProcessingEnabled()) return;
  if (kind === 'video_metadata' && !isMediaVideoProcessingEnabled()) return;
  if (parseMode() !== 'inline_async') return;

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

const disabledQueue: MediaProcessingQueue = {
  enqueue: async () => {},
  enqueueImageProcessing: async () => {},
  enqueueVideoProcessing: async () => {}
};

const inlineAsyncQueue: MediaProcessingQueue = {
  enqueue: enqueueJob,
  enqueueImageProcessing: async (fileId: string, processingVersion = 0) => {
    await enqueueJob({
      fileId,
      kind: 'image_variants',
      processingVersion
    });
  },
  enqueueVideoProcessing: async (fileId: string, processingVersion = 0) => {
    await enqueueJob({
      fileId,
      kind: 'video_metadata',
      processingVersion
    });
  }
};

export const getMediaProcessingMode = () => parseMode();

export const getMediaProcessingQueue = (): MediaProcessingQueue => {
  // Prefer raw mode so per-kind flags can still gate inside enqueue when only one processor is on.
  const modeRaw = String(process.env.MEDIA_PROCESSING_MODE || 'disabled')
    .trim()
    .toLowerCase();
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
};

export const __getMediaProcessingQueueStatsForTests = () => ({
  inflight: inflight.size,
  pending: pending.size,
  active,
  mode: parseMode()
});
