import { Request, Response, NextFunction } from 'express';
import prisma from '../utils/prismaClient';

export const adminMiddleware = (req: Request, res: Response, next: NextFunction) => {
  console.log(`Admin middleware: ${req.method} ${req.path}`);

  // Get user from request (added by authMiddleware)
  const user = req.user;

  // Optional dev bypass (explicit opt-in only)
  if (process.env.ALLOW_DEV_ADMIN_BYPASS === 'true') {
    console.log('Admin bypass enabled via ALLOW_DEV_ADMIN_BYPASS');
    return next();
  }

  // Production: Check user role
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const role = (user.role || '').toString().toLowerCase();
  if (role !== 'admin' && role !== 'superadmin') {
    return prisma.staffUser
      .findUnique({
        where: { userId: String(user.id || '') },
        include: { role: { select: { isActive: true } } }
      })
      .then((staff) => {
        if (!staff || staff.status !== 'ACTIVE' || !staff.role?.isActive) {
          return res.status(403).json({ error: 'Admin access required' });
        }
        return next();
      })
      .catch((error) => {
        console.error('Admin middleware staff lookup failed', error);
        return res.status(500).json({ error: 'Failed to validate admin access' });
      });
  }

  next();
};

