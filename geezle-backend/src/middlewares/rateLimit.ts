import rateLimit from 'express-rate-limit';

export const createRateLimiter = (opts?: any) =>
  rateLimit(
    Object.assign(
      {
        windowMs: 60 * 1000,
        max: 60,
      },
      opts || {}
    )
  );

export default createRateLimiter;
