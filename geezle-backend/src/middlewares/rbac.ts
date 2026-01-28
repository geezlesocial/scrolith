import { Request, Response, NextFunction } from 'express';
import { UserRole } from './auth';

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
    if (!roles.includes(req.user.role)) return res.status(403).json({ success: false, error: { message: 'Forbidden' } });
    next();
  };
}

export default requireRole;
