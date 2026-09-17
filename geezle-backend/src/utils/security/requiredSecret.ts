/**
 * Resolves a security secret without allowing development fallbacks in a
 * production runtime. Callers must provide an explicit development fallback
 * only when the feature is intentionally usable outside production.
 */
export const requiredSecret = (name: string, developmentFallback?: string): string => {
  const value = String(process.env[name] || '').trim();
  const production = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production'
    || Boolean(process.env.K_SERVICE);

  if (value) return value;
  if (!production && developmentFallback) return developmentFallback;
  throw new Error(`Missing required security secret: ${name}`);
};

export const jwtSecret = (): string => requiredSecret('JWT_SECRET', 'dev_jwt_secret');
