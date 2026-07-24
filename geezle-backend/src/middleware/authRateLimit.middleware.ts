/**
 * Dedicated authentication rate limiters.
 * Production: no client-header bypasses.
 * Keys use IP + hashed email (never plaintext email in keys/logs).
 */

import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import type { Request, Response, NextFunction } from 'express';
import { createHash } from 'crypto';
import { isProductionRuntime } from '../utils/security/isProductionRuntime';

const hashIdentity = (value: string) =>
  createHash('sha256')
    .update(String(value || '').trim().toLowerCase())
    .digest('hex')
    .slice(0, 32);

const clientIp = (req: Request): string => {
  try {
    const conn = req.connection as unknown as { remoteAddress?: string } | undefined;
    const rawIp = (req.ip || (conn && conn.remoteAddress) || '').toString();
    if (!rawIp) return 'unknown';
    return ipKeyGenerator(rawIp);
  } catch {
    return 'unknown';
  }
};

const emailFromBody = (req: Request): string => {
  const raw = (req.body && (req.body.email || req.body.username || req.body.login)) || '';
  return String(raw).trim().toLowerCase();
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

/** Login: 10 / 15 min per IP; additional soft key includes email hash when present. */
export const loginRateLimiter = rateLimit({
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

/** Registration: 5 / hour per IP */
export const registerRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.AUTH_REGISTER_RATE_MAX || 5),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => `auth:register:${clientIp(req)}`
});

/** Admin / user 2FA verify: 10 / 15 min per IP + challenge token hash */
export const admin2faVerifyRateLimiter = rateLimit({
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

/** Password reset request: 5 / 15 min per IP */
export const forgotPasswordRateLimiter = rateLimit({
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

/** Password reset confirm: 10 / 15 min per IP */
export const resetPasswordRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RESET_RATE_MAX || 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
  keyGenerator: (req) => `auth:reset:${clientIp(req)}`
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
