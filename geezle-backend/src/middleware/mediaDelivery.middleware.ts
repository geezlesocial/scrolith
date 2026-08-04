import type { Request, Response } from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { createHash } from 'crypto';

const toBool = (value: unknown, fallback = false) => {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const toPositiveInt = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

export const isMediaContentReadRequest = (req: Pick<Request, 'method' | 'path' | 'originalUrl' | 'baseUrl'>) => {
  const method = String(req.method || '').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return false;
  const originalUrl = String(req.originalUrl || '').toLowerCase();
  const mountedPath = `${String(req.baseUrl || '')}${String(req.path || '')}`.toLowerCase();
  const path = String(req.path || '').toLowerCase();
  return (
    originalUrl.startsWith('/api/files/content/') ||
    mountedPath.startsWith('/api/files/content/') ||
    path.startsWith('/api/files/content/') ||
    path.startsWith('/files/content/') ||
    path.startsWith('/content/')
  );
};

const mediaRateLimitWindowMs = toPositiveInt(
  process.env.MEDIA_DELIVERY_RATE_LIMIT_WINDOW_MS,
  15 * 60 * 1000,
  60_000,
  60 * 60 * 1000
);
const mediaRateLimitMaxAnonymous = toPositiveInt(
  process.env.MEDIA_DELIVERY_RATE_LIMIT_MAX_ANON,
  6_000,
  500,
  100_000
);
const mediaRateLimitMaxAuthenticated = toPositiveInt(
  process.env.MEDIA_DELIVERY_RATE_LIMIT_MAX_AUTH,
  12_000,
  mediaRateLimitMaxAnonymous,
  200_000
);
const skipSuccessfulMedia = toBool(process.env.MEDIA_DELIVERY_RATE_LIMIT_SKIP_SUCCESS, true);

const keyFromIp = (req: Request) => {
  const conn = req.connection as unknown as { remoteAddress?: string } | undefined;
  const rawIp = (req.ip || (conn && conn.remoteAddress) || '').toString();
  return rawIp ? ipKeyGenerator(rawIp) : 'unknown';
};

export const createMediaDeliveryRateLimiter = () =>
  rateLimit({
    windowMs: mediaRateLimitWindowMs,
    max: (req) => {
      const auth = String(req.headers.authorization || '').trim();
      return auth ? mediaRateLimitMaxAuthenticated : mediaRateLimitMaxAnonymous;
    },
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skipSuccessfulRequests: skipSuccessfulMedia,
    skip: (req) => {
      if (!isMediaContentReadRequest(req)) return true;
      return String(req.method || '').toUpperCase() === 'HEAD';
    },
    keyGenerator: (req) => {
      const auth = String(req.headers.authorization || '').trim();
      if (auth) {
        const hash = createHash('sha256').update(auth).digest('hex').slice(0, 24);
        return `media-auth:${hash}`;
      }
      return `media-ip:${keyFromIp(req)}`;
    },
    handler: (_req: Request, res: Response) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      if (!res.getHeader('Retry-After')) {
        res.setHeader('Retry-After', String(Math.ceil(mediaRateLimitWindowMs / 1000)));
      }
      res.status(429).json({
        success: false,
        error: 'Too many media requests. Please retry after the cooldown window.'
      });
    }
  });

