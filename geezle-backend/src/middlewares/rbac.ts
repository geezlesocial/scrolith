import { Request, Response, NextFunction } from 'express';
import { UserRole } from './auth';

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    const role = String((req.user as any).role || '').toUpperCase() as UserRole;
    if (!roles.includes(role)) return res.status(403).json({ success: false, error: { message: 'Forbidden' } });
    return next();
  };
}

export default requireRole;
