/**
 * Enterprise AI performance helpers: batching, cancellation, prefetch, stale guards.
 */
import { createHash } from 'crypto';
import { fuseContext, type PageContextHint, type FusedContextPackage } from './scrolitha.contextFusion';
import { enterpriseCache, hashCacheKey } from './scrolitha.enterpriseCache';

type PendingBatch = {
  keys: Set<string>;
  timer: ReturnType<typeof setTimeout> | null;
  resolvers: Array<() => void>;
};

const batches = new Map<string, PendingBatch>();
const inflight = new Map<string, Promise<unknown>>();
const abortControllers = new Map<string, AbortController>();

export type RequestHandle = {
  requestId: string;
  signal: AbortSignal;
  isStale: () => boolean;
  cancel: (reason?: string) => void;
};

export const createRequestHandle = (parts: string[]): RequestHandle => {
  const requestId = createHash('sha256').update(parts.join('|') + '|' + Date.now()).digest('hex').slice(0, 20);
  const controller = new AbortController();
  abortControllers.set(requestId, controller);
  let stale = false;
  return {
    requestId,
    signal: controller.signal,
    isStale: () => stale || controller.signal.aborted,
    cancel: (reason = 'cancelled') => {
      stale = true;
      try {
        controller.abort(reason);
      } catch {
        // ignore
      }
      abortControllers.delete(requestId);
    }
  };
};

export const cancelRequest = (requestId: string, reason = 'cancelled') => {
  const c = abortControllers.get(requestId);
  if (!c) return false;
  try {
    c.abort(reason);
  } catch {
    // ignore
  }
  abortControllers.delete(requestId);
  return true;
};

/** Coalesce identical context-prep work within a short window. */
export const batchPrefetchContext = async (input: {
  viewerUserId: string;
  page?: PageContextHint;
  sessionKey?: string;
  question?: string;
  waitMs?: number;
}): Promise<FusedContextPackage> => {
  const key = hashCacheKey([
    'prefetch',
    input.viewerUserId,
    input.page?.route || '',
    input.page?.entityId || '',
    input.page?.postId || '',
    input.sessionKey || '',
    String(input.question || '').slice(0, 40)
  ]);

  const existing = enterpriseCache.get<FusedContextPackage>('prompt', `ready:${key}`);
  if (existing) return existing;

  if (inflight.has(key)) {
    return inflight.get(key) as Promise<FusedContextPackage>;
  }

  const waitMs = Math.max(0, Math.min(50, Number(input.waitMs) || 16));
  const promise = new Promise<FusedContextPackage>((resolve, reject) => {
    let batch = batches.get(key);
    if (!batch) {
      batch = { keys: new Set([key]), timer: null, resolvers: [] };
      batches.set(key, batch);
      batch.timer = setTimeout(() => {
        batches.delete(key);
        void fuseContext({
          viewerUserId: input.viewerUserId,
          page: input.page,
          sessionKey: input.sessionKey,
          question: input.question,
          includeSearch: true
        })
          .then((fused) => {
            enterpriseCache.set('prompt', `ready:${key}`, fused, 20_000);
            for (const r of batch!.resolvers) r();
            resolve(fused);
          })
          .catch(reject);
      }, waitMs);
      batch.timer.unref?.();
    }
    batch.resolvers.push(() => {
      const ready = enterpriseCache.get<FusedContextPackage>('prompt', `ready:${key}`);
      if (ready) resolve(ready);
    });
  });

  inflight.set(key, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(key);
  }
};

export const speculativePrepareContext = (input: {
  viewerUserId: string;
  page?: PageContextHint;
  sessionKey?: string;
}) => {
  // Fire-and-forget background prep
  setImmediate(() => {
    void batchPrefetchContext(input).catch(() => undefined);
  });
};

export const withTimeout = async <T>(promise: Promise<T>, ms: number, label = 'operation'): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
        timer.unref?.();
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};
