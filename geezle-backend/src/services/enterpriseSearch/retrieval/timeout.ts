/**
 * Adapter timeout + soft cancellation helpers (no sync blocking).
 */

export class AdapterTimeoutError extends Error {
  constructor(domain: string, ms: number) {
    super(`adapter_timeout:${domain}:${ms}ms`);
    this.name = 'AdapterTimeoutError';
  }
}

export const withTimeout = async <T>(
  promise: Promise<T>,
  ms: number,
  label = 'op'
): Promise<T> => {
  const budget = Math.max(50, Math.min(10_000, Math.trunc(ms) || 400));
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new AdapterTimeoutError(label, budget)), budget);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/** Parallel map with per-task timeout; failures become fallback values */
export const parallelMapBounded = async <T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  opts: { timeoutMs: number; label?: (item: T) => string; onError: (item: T, err: unknown) => R }
): Promise<R[]> => {
  return Promise.all(
    items.map(async (item, index) => {
      try {
        return await withTimeout(fn(item, index), opts.timeoutMs, opts.label?.(item) || String(index));
      } catch (err) {
        return opts.onError(item, err);
      }
    })
  );
};
