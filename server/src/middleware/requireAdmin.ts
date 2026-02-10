import { Request, Response, NextFunction } from 'express';

export const requireAdmin = (req: Request & { user?: { id: string | null; role: string } }, res: Response, next: NextFunction) => {
  const role = (req.user?.role || '').toString().toLowerCase();
  if (role === 'admin' || role === 'super_admin' || role === 'superadmin') return next();
  return res.status(403).json({ success: false, error: 'Admin access required' });
};
