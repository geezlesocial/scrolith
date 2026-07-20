/**
 * Phase 25B — Redact secrets and tokens from auth/OAuth logs.
 */

const SENSITIVE_QUERY_KEYS = new Set([
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'code',
  'client_secret',
  'password',
  'authorization',
  'auth',
  'jwt',
  'session',
  'state'
]);

const JWT_LIKE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
const BEARER = /Bearer\s+[A-Za-z0-9._\-]+/gi;

export const redactSensitiveQuery = (input: unknown): string => {
  const raw = String(input || '');
  if (!raw) return '';

  try {
    // Absolute URL
    if (/^https?:\/\//i.test(raw) || raw.startsWith('/') || raw.includes('?')) {
      const asUrl = raw.startsWith('http') ? new URL(raw) : new URL(raw, 'https://redact.local');
      for (const key of [...asUrl.searchParams.keys()]) {
        if (SENSITIVE_QUERY_KEYS.has(key.toLowerCase())) {
          asUrl.searchParams.set(key, '[REDACTED]');
        }
      }
      if (/^https?:\/\//i.test(raw)) {
        return asUrl.toString();
      }
      return `${asUrl.pathname}${asUrl.search}${asUrl.hash}`;
    }
  } catch {
    // fall through to regex redaction
  }

  return raw
    .replace(JWT_LIKE, '[REDACTED_JWT]')
    .replace(BEARER, 'Bearer [REDACTED]')
    .replace(/([?&](?:token|access_token|refresh_token|id_token|code|client_secret)=)([^&#\s]+)/gi, '$1[REDACTED]');
};

export const redactAuthLogMessage = (message: unknown): string => {
  const text = String(message ?? '');
  return redactSensitiveQuery(text)
    .replace(JWT_LIKE, '[REDACTED_JWT]')
    .replace(BEARER, 'Bearer [REDACTED]');
};

export const safeOAuthLog = (
  level: 'info' | 'warn' | 'error',
  event: string,
  details: Record<string, unknown> = {}
) => {
  const payload: Record<string, unknown> = { event };
  for (const [key, value] of Object.entries(details)) {
    const lower = key.toLowerCase();
    if (
      SENSITIVE_QUERY_KEYS.has(lower) ||
      lower.includes('secret') ||
      lower.includes('password') ||
      lower.includes('token')
    ) {
      payload[key] = value ? '[REDACTED]' : value;
      continue;
    }
    if (typeof value === 'string') {
      payload[key] = redactAuthLogMessage(value);
    } else {
      payload[key] = value;
    }
  }

  const line = `[oauth] ${JSON.stringify(payload)}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
};
