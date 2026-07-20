/**
 * Phase 25B — Production-safe frontend origin + internal redirect helpers.
 *
 * Never silently send production OAuth users to localhost.
 */

const PRODUCTION_DEFAULT_ORIGIN = 'https://scrolith.com';
const DEV_DEFAULT_ORIGIN = 'http://localhost:3000';

const ALLOWED_PRODUCTION_ORIGINS = new Set([
  'https://scrolith.com',
  'https://www.scrolith.com'
]);

const ALLOWED_DEV_ORIGINS = new Set([
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173'
]);

export const isProductionRuntime = (): boolean => {
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') return true;
  // Cloud Run always sets K_SERVICE
  if (String(process.env.K_SERVICE || '').trim()) return true;
  return false;
};

const stripTrailingSlash = (value: string) => value.replace(/\/+$/, '');

/**
 * Validate and normalize an absolute frontend origin.
 * Returns null when invalid / not allowlisted.
 */
export const validateAllowedFrontendOrigin = (raw: unknown): string | null => {
  const input = String(raw || '').trim();
  if (!input) return null;
  if (input.includes('\0') || /[\r\n\t]/.test(input)) return null;

  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return null;
  }

  // Origins only — reject path/query injection in configured values.
  if (parsed.username || parsed.password) return null;
  if (parsed.search || parsed.hash) return null;
  if (parsed.pathname && parsed.pathname !== '/') return null;

  const protocol = parsed.protocol.toLowerCase();
  const host = parsed.hostname.toLowerCase();
  if (!host) return null;

  const origin = `${protocol}//${host}${parsed.port ? `:${parsed.port}` : ''}`;
  const normalized = stripTrailingSlash(origin);

  if (isProductionRuntime()) {
    if (protocol !== 'https:') return null;
    if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local')) return null;
    // Allow exact production allowlist + intentional Cloud Run preview frontends.
    if (ALLOWED_PRODUCTION_ORIGINS.has(normalized)) return normalized;
    if (host.endsWith('.a.run.app') && host.includes('scrolith-frontend')) return normalized;
    if (host.endsWith('.scrolith.com')) return normalized;
    return null;
  }

  if (ALLOWED_DEV_ORIGINS.has(normalized)) return normalized;
  if (protocol === 'http:' && (host === 'localhost' || host === '127.0.0.1')) {
    return normalized;
  }
  if (protocol === 'https:' && (ALLOWED_PRODUCTION_ORIGINS.has(normalized) || host.endsWith('.scrolith.com'))) {
    return normalized;
  }
  return null;
};

const firstConfiguredOrigin = (): string | null => {
  const candidates = [
    process.env.FRONTEND_ORIGIN,
    process.env.FRONTEND_URL,
    process.env.CLIENT_URL,
    process.env.PUBLIC_APP_URL,
    process.env.PLATFORM_URL,
    process.env.APP_URL,
    process.env.WEB_URL,
    process.env.SITE_URL
  ];
  for (const candidate of candidates) {
    const validated = validateAllowedFrontendOrigin(candidate);
    if (validated) return validated;
  }
  return null;
};

/**
 * Canonical frontend origin for OAuth completion redirects.
 *
 * Production:
 * - Prefer explicit env
 * - Never fall back to localhost
 * - If misconfigured, use https://scrolith.com and emit a critical log
 *   (fail-safe for user sessions; operators must still set FRONTEND_ORIGIN)
 *
 * Development:
 * - Prefer env, else http://localhost:3000
 */
export const getFrontendOrigin = (): string => {
  const configured = firstConfiguredOrigin();
  if (configured) return configured;

  if (isProductionRuntime()) {
    // Critical: previous bug fell back to localhost and leaked users off-site.
    // eslint-disable-next-line no-console
    console.error(
      '[oauth] FRONTEND_ORIGIN/FRONTEND_URL missing or invalid in production; using https://scrolith.com. Set FRONTEND_ORIGIN on Cloud Run.'
    );
    return PRODUCTION_DEFAULT_ORIGIN;
  }

  return DEV_DEFAULT_ORIGIN;
};

/**
 * Provider callback base (API origin). Never user-controlled.
 */
export const getApiPublicOrigin = (reqHostFallback?: string): string => {
  const candidates = [
    process.env.BACKEND_URL,
    process.env.API_BASE_URL,
    process.env.PUBLIC_API_URL
  ];
  for (const candidate of candidates) {
    const raw = String(candidate || '').trim();
    if (!raw) continue;
    try {
      const parsed = new URL(raw);
      if (isProductionRuntime() && parsed.protocol !== 'https:') continue;
      return stripTrailingSlash(`${parsed.protocol}//${parsed.host}`);
    } catch {
      // continue
    }
  }

  if (isProductionRuntime()) {
    return 'https://api.scrolith.com';
  }

  const fallback = String(reqHostFallback || '').trim();
  if (fallback) return stripTrailingSlash(fallback);
  return 'http://localhost:5000';
};

/**
 * Build absolute provider OAuth callback URL registered with Google/LinkedIn.
 */
export const getProviderOAuthCallbackUrl = (
  provider: string,
  reqDerivedBase?: string
): string => {
  const key = String(provider || '').toLowerCase();
  const envByProvider: Record<string, string | undefined> = {
    google: process.env.GOOGLE_OAUTH_CALLBACK_URL,
    linkedin: process.env.LINKEDIN_OAUTH_CALLBACK_URL,
    facebook: process.env.FACEBOOK_OAUTH_CALLBACK_URL,
    twitter: process.env.TWITTER_OAUTH_CALLBACK_URL
  };
  const fromEnv = String(envByProvider[key] || process.env.OAUTH_PROVIDER_CALLBACK_BASE || '').trim();
  if (fromEnv) {
    try {
      const parsed = new URL(fromEnv);
      if (isProductionRuntime() && parsed.protocol !== 'https:') {
        // ignore invalid
      } else if (parsed.pathname.includes('/callback') || fromEnv.includes('/oauth/')) {
        return stripTrailingSlash(fromEnv.split('?')[0]);
      }
    } catch {
      // fall through
    }
  }

  const base = getApiPublicOrigin(reqDerivedBase);
  return `${base}/api/auth/oauth/${key}/callback`;
};

const AUTH_CALLBACK_LOOP_PREFIXES = [
  '/auth/oauth/callback',
  '/api/auth/oauth/'
];

/**
 * Allow only internal relative application paths for post-auth navigation.
 * Rejects open redirects, schemes, protocol-relative URLs, control chars.
 */
export const sanitizeInternalRedirect = (value?: unknown, fallback = '/'): string => {
  const raw = String(value || '').trim();
  if (!raw) return fallback;

  // Decode once for common encodings but re-validate.
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  decoded = decoded.trim();

  if (!decoded) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(decoded)) return fallback;

  // Must be a single-root relative path.
  if (!decoded.startsWith('/')) return fallback;
  if (decoded.startsWith('//')) return fallback;
  if (decoded.startsWith('/\\')) return fallback;

  // Reject scheme-like payloads: /http:..., javascript:, data:
  const lower = decoded.toLowerCase();
  if (
    lower.includes('javascript:') ||
    lower.includes('data:') ||
    lower.includes('vbscript:') ||
    /^\/[a-z][a-z0-9+.-]*:/i.test(decoded)
  ) {
    return fallback;
  }

  // Reject backslash tricks and encoded dots used in open redirects.
  if (decoded.includes('\\')) return fallback;
  if (/%2f%2f/i.test(raw) || /%5c/i.test(raw)) return fallback;

  // Avoid auth callback loops.
  for (const prefix of AUTH_CALLBACK_LOOP_PREFIXES) {
    if (lower === prefix || lower.startsWith(`${prefix}?`) || lower.startsWith(`${prefix}/`)) {
      return fallback;
    }
  }

  // Cap length to reduce abuse.
  if (decoded.length > 512) return fallback;

  return decoded;
};

/** @deprecated Use sanitizeInternalRedirect */
export const sanitizeRedirect = sanitizeInternalRedirect;
