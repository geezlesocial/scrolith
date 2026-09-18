import type { Request } from 'express';

/**
 * Returns the client identity already resolved by Express' configured proxy
 * semantics. Security-sensitive callers must not parse forwarded headers
 * themselves because those headers may contain client-supplied prefixes.
 */
export const getTrustedClientIp = (req: Request): string => {
  const expressIp = String(req.ip || '').trim();
  if (expressIp) return expressIp;

  const socketIp = String(req.socket?.remoteAddress || '').trim();
  return socketIp;
};
