/**
 * Dedicated authentication rate limiters.
 * Production: no client-header bypasses.
 * Keys use IP + hashed email (never plaintext email in keys/logs).
 */

import rateLimit, { ipKeyGenerator, type Store } from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { isProductionRuntime } from '../utils/security/isProductionRuntime';
import { createSensitiveRateLimitStore } from './distributedRateLimitStore';
import { getTrustedClientIp } from '../utils/security/clientIdentity';

const hashIdentity = (value: string) =>
  createHash('sha256')
    .update(String(value || '').trim().toLowerCase())
    .digest('hex')
    .slice(0, 32);

const clientIp = (req: Request): string => {
  try {
    const rawIp = getTrustedClientIp(req);
    if (!rawIp) return 'unknown';
    return ipKeyGenerator(rawIp);
  } catch {
    return 'unknown';
  }
};

const rateLimitHandler = (req: Request, res: Response) => {
  const retryAfter = res.getHeader('Retry-After') || 60;
  res.setHeader('Retry-After', String(retryAfter));
  return res.status(429).json({
    success: false,
    error: 'Too many authentication attempts. Please try again later.',
    code: 'AUTH_RATE_LIMITED'
  });
};

const requestValue = (req: Request, names: string[]): string => {
  const body = (req.body || {}) as Record<string, unknown>;
  const query = (req.query || {}) as Record<string, unknown>;
  for (const name of names) {
    const value = body[name] ?? query[name];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
};

export const identifierHash = (value: string): string =>
  hashIdentity(value || 'none');

export const createIdentifierRateLimiter = (options: {
  prefix: string;
  windowMs: number;
  max: number;
  getIdentifier: (req: Request) => string;
  store?: Store;
}) => rateLimit({
  store: options.store || createSensitiveRateLimitStore(options.prefix),
  windowMs: options.windowMs,
  max: options.max,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => `${options.prefix}${identifierHash(options.getIdentifier(req))}`
});

const emailFromBody = (req: Request): string => {
  const raw = (req.body && (req.body.email || req.body.username || req.body.login)) || '';
  return String(raw).trim().toLowerCase();
};

/** Login: 10 / 15 min per IP; additional soft key includes email hash when present. */
export const loginRateLimiter = rateLimit({
  store: createSensitiveRateLimitStore('scrolith:ratelimit:auth:login:'),
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_LOGIN_RATE_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => {
    const email = emailFromBody(req);
    const emailPart = email ? `e:${hashIdentity(email)}` : 'e:none';
    return `auth:login:${clientIp(req)}:${emailPart}`;
  }
});

export const loginIdentifierRateLimiter = createIdentifierRateLimiter({
  prefix: 'scrolith:ratelimit:auth:login:identifier:',
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_LOGIN_RATE_MAX || 10),
  getIdentifier: (req) => emailFromBody(req)
});

/** Registration: 5 / hour per IP */
export const registerRateLimiter = rateLimit({
  store: createSensitiveRateLimitStore('scrolith:ratelimit:auth:register:'),
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.AUTH_REGISTER_RATE_MAX || 5),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => `auth:register:${clientIp(req)}`
});

export const registerIdentifierRateLimiter = createIdentifierRateLimiter({
  prefix: 'scrolith:ratelimit:auth:register:identifier:',
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.AUTH_REGISTER_RATE_MAX || 5),
  getIdentifier: (req) => requestValue(req, ['email', 'username', 'login'])
});

/** Admin / user 2FA verify: 10 / 15 min per IP + challenge token hash */
export const admin2faVerifyRateLimiter = rateLimit({
  store: createSensitiveRateLimitStore('scrolith:ratelimit:auth:2fa:'),
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_2FA_VERIFY_RATE_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => {
    const challenge = String(req.body?.challengeToken || req.body?.challenge_token || '').trim();
    const cPart = challenge ? hashIdentity(challenge) : 'none';
    return `auth:2fa:${clientIp(req)}:${cPart}`;
  }
});

export const admin2faIdentifierRateLimiter = createIdentifierRateLimiter({
  prefix: 'scrolith:ratelimit:auth:2fa:identifier:',
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_2FA_VERIFY_RATE_MAX || 10),
  getIdentifier: (req) => requestValue(req, ['challengeToken', 'challenge_token', 'userId', 'user_id'])
});

/** Password reset request: 5 / 15 min per IP */
export const forgotPasswordRateLimiter = rateLimit({
  store: createSensitiveRateLimitStore('scrolith:ratelimit:auth:forgot:'),
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_FORGOT_RATE_MAX || 5),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => {
    const email = emailFromBody(req);
    const emailPart = email ? hashIdentity(email) : 'none';
    return `auth:forgot:${clientIp(req)}:${emailPart}`;
  }
});

export const forgotPasswordIdentifierRateLimiter = createIdentifierRateLimiter({
  prefix: 'scrolith:ratelimit:auth:forgot:identifier:',
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_FORGOT_RATE_MAX || 5),
  getIdentifier: (req) => emailFromBody(req)
});

/** Password reset confirm: 10 / 15 min per IP */
export const resetPasswordRateLimiter = rateLimit({
  store: createSensitiveRateLimitStore('scrolith:ratelimit:auth:reset:'),
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RESET_RATE_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => `auth:reset:${clientIp(req)}`
});

export const resetPasswordIdentifierRateLimiter = createIdentifierRateLimiter({
  prefix: 'scrolith:ratelimit:auth:reset:identifier:',
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RESET_RATE_MAX || 10),
  getIdentifier: (req) => requestValue(req, ['token', 'resetToken', 'reset_token', 'challengeToken', 'challenge_token'])
});

/**
 * Reject production use of client security-bypass headers (defense in depth logging).
 * Does not alter response — only structured log for monitoring.
 */
export const rejectSecurityBypassHeadersMiddleware = (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  if (!isProductionRuntime()) {
    next();
    return;
  }
  const skip =
    req.headers['x-skip-ratelimit'] ||
    req.headers['x-dev-role'] ||
    req.headers['x-allow-dev-bypass'];
  if (skip) {
    try {
      console.warn(
        JSON.stringify({
          severity: 'WARNING',
          time: new Date().toISOString(),
          message: 'security.bypass_header_ignored',
          component: 'rateLimit',
          path: req.path,
          // never log header values (may contain role names)
          hasSkipHeader: Boolean(req.headers['x-skip-ratelimit']),
          hasDevRoleHeader: Boolean(req.headers['x-dev-role'])
        })
      );
    } catch {
      // noop
    }
  }
  next();
};
