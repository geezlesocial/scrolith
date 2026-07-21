/**
 * When General Settings → Enforce KYC is enabled, block sensitive writes for unverified users.
 * Soft-reads JWT when present; never forces authentication on public routes.
 * Admins always bypass. Fail-open if settings cannot be read.
 */
import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prismaClient';
import { getSystemControls, isAdminRole, isKycSatisfied } from '../services/systemControls.service';

const SENSITIVE_PREFIXES = [
  '/api/gigs',
  '/api/jobs',
  '/api/wallet/withdraw',
  '/api/wallet/withdrawals',
  '/api/gcoin/withdraw',
  '/api/gcoin/conversions',
  '/api/marketplace/listings',
  '/api/contracts',
  '/api/proposals'
];

const isSensitiveWrite = (req: Request): boolean => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(req.method || '').toUpperCase())) {
    return false;
  }
  const fullPath = `${req.baseUrl || ''}${req.path || ''}`;
  return SENSITIVE_PREFIXES.some((p) => fullPath.startsWith(p));
};

const softUserFromJwt = (req: Request): { id?: string; role?: string } | null => {
  if (req.user?.id) return { id: req.user.id, role: String(req.user.role || '') };
  try {
    const authHeader = req.headers.authorization;
    const token =
      authHeader && authHeader.startsWith('Bearer ')
        ? authHeader.slice(7).trim()
        : null;
    if (!token) return null;
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev_jwt_secret') as {
      id?: string;
      role?: string;
    };
    return { id: decoded?.id, role: decoded?.role };
  } catch {
    return null;
  }
};

export const kycEnforceMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!isSensitiveWrite(req)) return next();
    const soft = softUserFromJwt(req);
    const userId = soft?.id;
    if (!userId) return next(); // unauthenticated — route auth will handle

    const controls = await getSystemControls();
    if (!controls.kycEnforced) return next();

    if (isAdminRole(soft?.role)) return next();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { kycStatus: true, isVerified: true, role: true }
    });
    if (user && isAdminRole(String(user.role))) return next();
    if (user && isKycSatisfied(user)) return next();

    return res.status(403).json({
      success: false,
      code: 'KYC_REQUIRED',
      error: 'Identity verification (KYC) is required before performing this action.',
      kycEnforced: true
    });
  } catch {
    return next();
  }
};

export default kycEnforceMiddleware;
