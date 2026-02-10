import { NextFunction, Request, Response } from 'express';
import { ensureRbacSeeded, getStaffContext, StaffContext } from '../services/rbac.service';

declare global {
  namespace Express {
    interface Request {
      staffContext?: StaffContext;
    }
  }
}

const unauthorized = (res: Response) =>
  res.status(401).json({ success: false, error: 'Unauthorized', code: 'UNAUTHORIZED' });

const forbidden = (res: Response, message = 'Forbidden') =>
  res.status(403).json({ success: false, error: message, code: 'FORBIDDEN' });

export const resolveStaffContext = async (req: Request): Promise<StaffContext | null> => {
  if (!req.user?.id) return null;
  if (req.staffContext) return req.staffContext;

  await ensureRbacSeeded();
  const context = await getStaffContext(req.user.id, req.user.role);
  req.staffContext = context;
  return context;
};

export const staffOnlyMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.user?.id) return unauthorized(res);

    const context = await resolveStaffContext(req);
    if (!context) return forbidden(res);

    if (context.isAdmin) return next();
    if (!context.staffId) return forbidden(res);
    if (context.status !== 'ACTIVE') return forbidden(res, 'Staff account is not active');
    if (!context.roleActive) return forbidden(res, 'Assigned role is inactive');

    return next();
  } catch (error) {
    console.error('[rbac] staffOnlyMiddleware error', error);
    return res.status(500).json({ success: false, error: 'Failed to validate staff access', code: 'ERR_INTERNAL' });
  }
};

export const requirePermission = (permissionKey: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.id) return unauthorized(res);

      const context = await resolveStaffContext(req);
      if (!context) return forbidden(res);
      if (context.isAdmin) return next();

      if (!context.staffId) return forbidden(res);
      if (context.status !== 'ACTIVE') return forbidden(res, 'Staff account is not active');
      if (!context.roleActive) return forbidden(res, 'Assigned role is inactive');
      if (!context.permissions.has(permissionKey)) {
        return forbidden(res, `Missing permission: ${permissionKey}`);
      }

      return next();
    } catch (error) {
      console.error('[rbac] requirePermission error', error);
      return res.status(500).json({ success: false, error: 'Failed to validate permission', code: 'ERR_INTERNAL' });
    }
  };
};
