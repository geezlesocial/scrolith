type ManagedIdempotencyEntry = {
  key: string;
  expiresAt: number;
};

const pendingRequestKeys = new Map<string, ManagedIdempotencyEntry>();
const DEFAULT_RETRY_WINDOW_MS = 30_000;

const sanitizeScopeSegment = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

const createRandomSegment = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {}
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const hashValue = (value: string) => {
  let hash = 0;
  const source = String(value || '');
  for (let index = 0; index < source.length; index += 1) {
    hash = (hash << 5) - hash + source.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

const cleanupExpiredEntries = () => {
  const now = Date.now();
  pendingRequestKeys.forEach((entry, scope) => {
    if (entry.expiresAt <= now) pendingRequestKeys.delete(scope);
  });
};

export const createActionFingerprint = (...parts: Array<string | number | boolean | null | undefined>) =>
  hashValue(parts.map((part) => String(part ?? '')).join('|'));

export const beginManagedIdempotentRequest = (scope: string, retryWindowMs = DEFAULT_RETRY_WINDOW_MS) => {
  cleanupExpiredEntries();
  const normalizedScope = sanitizeScopeSegment(scope);
  const now = Date.now();
  const existing = pendingRequestKeys.get(normalizedScope);
  const active = existing && existing.expiresAt > now ? existing : null;
  const key = active?.key || `${normalizedScope}:${createRandomSegment()}`;

  if (!active) {
    pendingRequestKeys.set(normalizedScope, {
      key,
      expiresAt: now + retryWindowMs
    });
  }

  return {
    headers: {
      'Idempotency-Key': key
    },
    complete: () => {
      pendingRequestKeys.delete(normalizedScope);
    },
    retain: () => {
      const current = pendingRequestKeys.get(normalizedScope);
      if (!current) {
        pendingRequestKeys.set(normalizedScope, {
          key,
          expiresAt: Date.now() + retryWindowMs
        });
        return;
      }
      current.expiresAt = Date.now() + retryWindowMs;
      pendingRequestKeys.set(normalizedScope, current);
    }
  };
};
