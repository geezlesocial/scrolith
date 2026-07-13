/**
 * Phase 3A — processing queue abstraction.
 * Default: disabled. Optional in-process async for local/dev only.
 * Designed to swap to Cloud Tasks without changing call sites.
 */

export type MediaProcessingQueue = {
  enqueueImageProcessing: (fileId: string, processingVersion?: number) => Promise<void>;
};

export type MediaProcessingMode = 'disabled' | 'inline_async';

const parseMode = (): MediaProcessingMode => {
  const enabled = String(process.env.MEDIA_IMAGE_PROCESSING_ENABLED || 'false')
    .trim()
    .toLowerCase();
  const mode = String(process.env.MEDIA_PROCESSING_MODE || 'disabled')
    .trim()
    .toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(enabled) && mode === 'inline_async') {
    return 'inline_async';
  }
  return 'disabled';
};

const inflight = new Set<string>();
const pending = new Set<string>();
let active = 0;
const MAX_CONCURRENCY = Math.max(
  1,
  Math.min(2, Number(process.env.MEDIA_IMAGE_PROCESSING_CONCURRENCY || 1) || 1)
);

const dedupeKey = (fileId: string, version: number) => `${fileId}:${version}`;

type Processor = (fileId: string) => Promise<void>;

let processor: Processor | null = null;

/** Injected by mediaProcessing.service to avoid circular imports at load time */
export const registerImageProcessingHandler = (fn: Processor) => {
  processor = fn;
};

const runNext = () => {
  if (active >= MAX_CONCURRENCY) return;
  const next = pending.values().next();
  if (next.done) return;
  const key = next.value;
  pending.delete(key);
  const [fileId] = key.split(':');
  if (!fileId || !processor) return;
  if (inflight.has(key)) {
    runNext();
    return;
  }
  inflight.add(key);
  active += 1;
  Promise.resolve()
    .then(() => processor!(fileId))
    .catch((error) => {
      console.error('[media-processing] job failed', {
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

const disabledQueue: MediaProcessingQueue = {
  enqueueImageProcessing: async () => {
    // no-op
  }
};

const inlineAsyncQueue: MediaProcessingQueue = {
  enqueueImageProcessing: async (fileId: string, processingVersion = 0) => {
    const id = String(fileId || '').trim();
    if (!id) return;
    const key = dedupeKey(id, Number(processingVersion) || 0);
    if (inflight.has(key) || pending.has(key)) {
      return;
    }
    pending.add(key);
    console.info('[media-processing] queued', {
      fileIdPrefix: id.slice(0, 8),
      mode: 'inline_async'
    });
    // Never block caller
    setImmediate(() => runNext());
  }
};

export const getMediaProcessingMode = () => parseMode();

export const getMediaProcessingQueue = (): MediaProcessingQueue => {
  const mode = parseMode();
  if (mode === 'inline_async') return inlineAsyncQueue;
  return disabledQueue;
};

/** Test helpers */
export const __resetMediaProcessingQueueForTests = () => {
  inflight.clear();
  pending.clear();
  active = 0;
};

export const __getMediaProcessingQueueStatsForTests = () => ({
  inflight: inflight.size,
  pending: pending.size,
  active,
  mode: parseMode()
});
