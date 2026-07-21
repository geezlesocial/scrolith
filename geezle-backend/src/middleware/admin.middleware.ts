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

  // Align with rbac isAdminRole: admin, superadmin, super_admin, platform_admin, etc.
  const role = (user.role || '').toString().toLowerCase().replace(/[\s-]+/g, '_');
  const isPlatformAdmin =
    role === 'admin' ||
    role === 'superadmin' ||
    role === 'super_admin' ||
    role.includes('admin');

  if (isPlatformAdmin) {
    return next();
  }

  return prisma.staffUser
    .findUnique({
      where: { userId: String(user.id || '') },
      include: {
        role: {
          select: {
            isActive: true,
            name: true,
            rolePermissions: { select: { permission: { select: { key: true } } } }
          }
        }
      }
    })
    .then((staff) => {
      if (!staff || staff.status !== 'ACTIVE' || !staff.role?.isActive) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      // Staff with Admin/Owner role name always allowed for admin dashboard surface.
      const roleName = String(staff.role?.name || '').toLowerCase();
      if (roleName.includes('admin') || roleName === 'owner') {
        return next();
      }
      // Any active staff role with at least one permission can enter admin shell;
      // individual routes still enforce requirePermission where configured.
      const permCount = Array.isArray(staff.role?.rolePermissions)
        ? staff.role.rolePermissions.length
        : 0;
      if (permCount > 0) {
        return next();
      }
      return res.status(403).json({ error: 'Admin access required' });
    })
    .catch((error) => {
      console.error('Admin middleware staff lookup failed', error);
      return res.status(500).json({ error: 'Failed to validate admin access' });
    });
};

