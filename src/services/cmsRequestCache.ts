export type RequestFailureKind =
  | 'abort'
  | 'network-rejection'
  | 'http-error'
  | 'timeout'
  | 'unknown';

export const classifyRequestFailure = (error: unknown): RequestFailureKind => {
  const value = error as { name?: string; code?: string; message?: string; status?: number } | null;
  const name = String(value?.name || '').toLowerCase();
  const code = String(value?.code || '').toLowerCase();
  const message = String(value?.message || error || '').toLowerCase();

  if (name === 'aborterror' || code === 'abort_err') return 'abort';
  if (code === 'econnaborted' || message.includes('timeout')) return 'timeout';
  if (Number(value?.status || 0) > 0) return 'http-error';
  if (name === 'typeerror' && message.includes('failed to fetch')) return 'network-rejection';
  if (message.includes('network error')) return 'network-rejection';
  return 'unknown';
};

type CacheEntry<T> = {
  value?: T;
  expiresAt: number;
  retryAfterUntil: number;
  inFlight?: Promise<T>;
};

export type RequestCacheOptions = {
  ttlMs?: number;
  staleTtlMs?: number;
  cooldownMs?: number;
  onError?: (error: unknown, kind: RequestFailureKind) => void;
};

export class RequestCache<T = unknown> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  get(
    key: string,
    loader: () => Promise<T>,
    fallback: () => T,
    options: RequestCacheOptions = {}
  ): Promise<T> {
    const now = Date.now();
    const existing = this.entries.get(key);
    const ttlMs = options.ttlMs ?? 5 * 60 * 1000;
    const staleTtlMs = options.staleTtlMs ?? 10 * 60 * 1000;
    const cooldownMs = options.cooldownMs ?? 30 * 1000;

    if (existing?.value !== undefined && existing.expiresAt > now) {
      return Promise.resolve(existing.value);
    }
    if (existing?.inFlight) return existing.inFlight;
    if (existing?.retryAfterUntil && existing.retryAfterUntil > now) {
      return Promise.resolve(existing.value !== undefined ? existing.value : fallback());
    }

    const request = Promise.resolve()
      .then(loader)
      .then((value) => {
        const latest = this.entries.get(key);
        if (latest?.inFlight !== request) return value;
        this.entries.set(key, {
          value,
          expiresAt: Date.now() + ttlMs,
          retryAfterUntil: 0
        });
        return value;
      })
      .catch((error) => {
        const kind = classifyRequestFailure(error);
        options.onError?.(error, kind);
        const latest = this.entries.get(key);
        if (latest?.inFlight !== request) return fallback();
        const previous = this.entries.get(key);
        const value = previous?.value;
        this.entries.set(key, {
          value,
          expiresAt: value !== undefined ? Date.now() + staleTtlMs : 0,
          retryAfterUntil: Date.now() + cooldownMs
        });
        return value !== undefined ? value : fallback();
      })
      .finally(() => {
        const latest = this.entries.get(key);
        if (latest?.inFlight === request) {
          delete latest.inFlight;
          this.entries.set(key, latest);
        }
      });

    this.entries.set(key, {
      ...(existing || { expiresAt: 0, retryAfterUntil: 0 }),
      inFlight: request
    });
    return request;
  }

  invalidate(key: string) {
    this.entries.delete(key);
  }

  reset() {
    this.entries.clear();
  }

  snapshot() {
    return Array.from(this.entries.entries()).map(([key, entry]) => ({
      key,
      hasValue: entry.value !== undefined,
      hasInFlight: Boolean(entry.inFlight),
      expiresAt: entry.expiresAt,
      retryAfterUntil: entry.retryAfterUntil
    }));
  }
}
