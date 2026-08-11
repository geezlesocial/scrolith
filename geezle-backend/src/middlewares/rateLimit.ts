import rateLimit from 'express-rate-limit';

export const createRateLimiter = (opts?: any) =>
  rateLimit(
    Object.assign(
      {
        windowMs: 60 * 1000,
        max: 60,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        skip: (req: any) => req?.method === 'OPTIONS',
      },
      opts || {}
    )
  );

export default createRateLimiter;
