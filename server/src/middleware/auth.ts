import { Request, Response, NextFunction } from 'express';

// Lightweight dev auth middleware used only for dashboard-scoped routes.
// It extracts a user id from `x-user-id` header or a Bearer token and attaches
// `req.user = { id, role }`. This intentionally does NOT replace real auth.
export const devAuth = (req: Request & { user?: { id: string | null; role: string } }, res: Response, next: NextFunction) => {
  const hdr = (req.headers['x-user-id'] as string) || '';
  let userId = hdr;

  const auth = (req.headers.authorization || '') as string;
  if (!userId && auth.startsWith('Bearer ')) {
    userId = auth.slice(7);
  }

  // fallback to query for convenient testing
  if (!userId && (req.query.userId as string)) userId = req.query.userId as string;

  if (!userId) {
    // Do not block; attach anonymous placeholder so controllers can decide.
    req.user = { id: null, role: 'guest' };
    return next();
  }
  req.user = { id: userId, role: 'user' };
  return next();
};
