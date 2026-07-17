import { NextFunction, Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { createSecurityAlert } from '../services/securityAlert.service';
import { writeAdminAuditEvent } from '../services/adminAudit.service';
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

const SENSITIVE_PERMISSION_PREFIXES = ['approvals.', 'audit.', 'settings.', 'security.alerts.'];
const SENSITIVE_PERMISSION_KEYS = new Set(['payouts.release', 'invoices.approve', 'rbac.roles.update', 'rbac.roles.delete']);

const isSensitivePermission = (permissionKey: string) =>
  SENSITIVE_PERMISSION_KEYS.has(permissionKey) || SENSITIVE_PERMISSION_PREFIXES.some((prefix) => permissionKey.startsWith(prefix));

const safeWriteDeniedDecision = async (req: Request, permissionKey: string, reason: string, context?: StaffContext | null) => {
  try {
    const actorUserId = String(req.user?.id || '').trim() || null;
    const actorStaffId = context?.staffId || null;
    const actorRole = String(req.user?.role || context?.roleName || '').trim() || null;

    await prisma.permissionDecisionLog.create({
      data: {
        permissionKey,
        subjectUserId: actorUserId,
        staffUserId: actorStaffId,
        resourceType: 'admin_route',
        resourceId: req.originalUrl || req.path || null,
        decision: 'DENY',
        source: reason,
        context: {
          method: req.method,
          path: req.originalUrl || req.path,
          role: actorRole,
          staffStatus: context?.status || null,
          roleActive: context?.roleActive ?? null
        }
      }
    });

    await writeAdminAuditEvent({
      actorUserId,
      actorStaffId,
      actorRole,
      moduleKey: 'rbac',
      actionKey: permissionKey,
      entityType: 'admin_route',
      entityId: req.originalUrl || req.path || null,
      severity: isSensitivePermission(permissionKey) ? 'critical' : 'warning',
      status: 'denied',
      message: reason,
      ipAddress: String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || null,
      userAgent: String(req.headers['user-agent'] || '').trim() || null,
      metadata: {
        method: req.method,
        path: req.originalUrl || req.path
      }
    });

    if (isSensitivePermission(permissionKey) || context?.status === 'SUSPENDED' || context?.status === 'INACTIVE') {
      await createSecurityAlert({
        code: 'RBAC_DENIED_ACTION',
        severity: isSensitivePermission(permissionKey) ? 'high' : 'medium',
        title: 'Blocked governed admin action',
        message: `${reason} (${permissionKey})`,
        source: 'rbac.middleware',
        actorUserId,
        actorStaffId,
        entityType: 'admin_route',
        entityId: req.originalUrl || req.path || null,
        metadata: {
          method: req.method,
          path: req.originalUrl || req.path,
          permissionKey,
          staffStatus: context?.status || null
        }
      });
    }
  } catch (error) {
    console.warn('[rbac] failed to persist denied decision', error);
  }
};

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

      if (!context.staffId) {
        await safeWriteDeniedDecision(req, permissionKey, 'Missing staff profile', context);
        return forbidden(res);
      }
      if (context.status !== 'ACTIVE') {
        await safeWriteDeniedDecision(req, permissionKey, 'Staff account is not active', context);
        return forbidden(res, 'Staff account is not active');
      }
      if (!context.roleActive) {
        await safeWriteDeniedDecision(req, permissionKey, 'Assigned role is inactive', context);
        return forbidden(res, 'Assigned role is inactive');
      }
      if (!context.permissions.has(permissionKey)) {
        await safeWriteDeniedDecision(req, permissionKey, `Missing permission: ${permissionKey}`, context);
        return forbidden(res, `Missing permission: ${permissionKey}`);
      }

      return next();
    } catch (error) {
      console.error('[rbac] requirePermission error', error);
      return res.status(500).json({ success: false, error: 'Failed to validate permission', code: 'ERR_INTERNAL' });
    }
  };
};

/** Allow access if staff has any of the listed permissions (or is admin). */
export const requireAnyPermission = (...permissionKeys: string[]) => {
  const keys = permissionKeys.map((k) => String(k || '').trim()).filter(Boolean);
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.user?.id) return unauthorized(res);

      const context = await resolveStaffContext(req);
      if (!context) return forbidden(res);
      if (context.isAdmin) return next();

      if (!context.staffId) {
        await safeWriteDeniedDecision(req, keys[0] || 'unknown', 'Missing staff profile', context);
        return forbidden(res);
      }
      if (context.status !== 'ACTIVE') {
        await safeWriteDeniedDecision(req, keys[0] || 'unknown', 'Staff account is not active', context);
        return forbidden(res, 'Staff account is not active');
      }
      if (!context.roleActive) {
        await safeWriteDeniedDecision(req, keys[0] || 'unknown', 'Assigned role is inactive', context);
        return forbidden(res, 'Assigned role is inactive');
      }
      const allowed = keys.some((key) => context.permissions.has(key));
      if (!allowed) {
        await safeWriteDeniedDecision(
          req,
          keys.join('|'),
          `Missing permission: one of ${keys.join(', ')}`,
          context
        );
        return forbidden(res, `Missing permission: one of ${keys.join(', ')}`);
      }

      return next();
    } catch (error) {
      console.error('[rbac] requireAnyPermission error', error);
      return res.status(500).json({ success: false, error: 'Failed to validate permission', code: 'ERR_INTERNAL' });
    }
  };
};
