// C:\Projects\Scrolith-backend\src\middleware\auth.middleware.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../utils/prismaClient';
import { Role } from '@prisma/client';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
        role?: string;
      };
    }
  }
}

const parseCookies = (cookieHeader?: string): Record<string, string> => {
  const jar: Record<string, string> = {};
  if (!cookieHeader) return jar;
  cookieHeader.split(';').forEach((part) => {
    const [rawKey, ...rest] = part.trim().split('=');
    if (!rawKey) return;
    const key = rawKey.trim();
    const value = rest.join('=').trim();
    if (!key) return;
    try {
      jar[key] = decodeURIComponent(value);
    } catch {
      jar[key] = value;
    }
  });
  return jar;
};

const resolveAuthorizationHeader = (req: Request) => {
  let authHeader = req.headers.authorization as string | undefined;
  if (!authHeader) {
    const cookies = parseCookies(req.headers.cookie as string | undefined);
    const cookieToken = cookies['Scrolith_token'] || cookies['token'];
    if (cookieToken) {
      authHeader = `Bearer ${cookieToken}`;
    }
  }
  return authHeader;
};

const sendAuthFailure = (res: Response, status: number, error: string) => {
  res.status(status).json({ success: false, error });
};

const resolveAuthenticatedUser = async (req: Request) => {
  const authHeader = resolveAuthorizationHeader(req);
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, status: 401, error: 'No token provided', missingToken: true } as const;
  }

  const token = authHeader.split(' ')[1];
  const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret';

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    let user: any = null;
    try {
      user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, email: true, role: true, isActive: true }
      });
    } catch (e) {
      console.warn('[auth.middleware] Full user select failed. Falling back to minimal select.', (e as any)?.message || e);
      user = await prisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, email: true, role: true }
      });
    }
    if (!user) return { user: null, status: 401, error: 'User not found', missingToken: false } as const;
    if (user.isActive === false) {
      return { user: null, status: 403, error: 'Account is deactivated', missingToken: false } as const;
    }

    try {
      const staff = await prisma.staffUser.findUnique({
        where: { userId: user.id },
        include: {
          role: {
            select: { name: true, isActive: true }
          }
        }
      });
      if (staff) {
        if (staff.status !== 'ACTIVE') {
          return { user: null, status: 403, error: 'Staff account is not active', missingToken: false } as const;
        }
        if (!staff.role?.isActive) {
          return { user: null, status: 403, error: 'Assigned staff role is inactive', missingToken: false } as const;
        }
      }
    } catch (staffError) {
      const message = String((staffError as any)?.message || '');
      if (!message.toLowerCase().includes('staffuser')) {
        console.warn('[auth.middleware] Staff guardrail check failed:', message);
      }
    }

    return {
      user: { id: user.id, email: user.email, role: user.role } as Express.Request['user'],
      status: 200,
      error: null,
      missingToken: false
    } as const;
  } catch {
    return { user: null, status: 401, error: 'Invalid token', missingToken: false } as const;
  }
};

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const resolved = await resolveAuthenticatedUser(req);
    if (resolved.user) {
      req.user = resolved.user;
      next();
      return;
    }

    // Optional dev bypass (explicit opt-in only)
    if (process.env.ALLOW_DEV_AUTH_BYPASS === 'true') {
      const fullPath = `${req.baseUrl || ''}${req.path || ''}`;
      const explicitDevRole =
        (req.headers['x-dev-role'] as string | undefined) ||
        (req.query.role as string | undefined);
      const roleHint =
        explicitDevRole ||
        (fullPath.startsWith('/api/proposals/me') || fullPath.startsWith('/proposals/me') ? 'freelancer' :
          fullPath.startsWith('/api/proposals') || fullPath.startsWith('/proposals') ? 'client' :
          fullPath.startsWith('/api/freelancer') || fullPath.startsWith('/freelancer') ? 'freelancer' :
          fullPath.startsWith('/api/client') || fullPath.startsWith('/client') ? 'client' :
          fullPath.startsWith('/api/admin') || fullPath.startsWith('/admin') ? 'admin' : undefined);

      if (!explicitDevRole) {
        sendAuthFailure(res, resolved.status || 401, resolved.error || 'Authentication failed');
        return;
      }

      const normalizeRole = (value?: string) => {
        const v = (value || '').toString().toLowerCase();
        if (v.includes('admin')) return 'ADMIN';
        if (v.includes('freelancer') || v.includes('seller')) return 'FREELANCER';
        if (v.includes('client') || v.includes('employer') || v.includes('buyer')) return 'CLIENT';
        return 'FREELANCER';
      };

      const devUser: { id: string; email: string; role: Role } = {
        id: 'dev-user-id-123',
        email: 'dev@example.com',
        role: normalizeRole(roleHint)
      };
      try {
        await prisma.user.upsert({
          where: { id: devUser.id },
          update: { email: devUser.email, role: devUser.role, isActive: true },
          create: {
            id: devUser.id,
            email: devUser.email,
            role: devUser.role,
            isActive: true,
            isVerified: true
          }
        });
      } catch (error) {
        console.warn('Dev user upsert failed:', error);
      }

      req.user = devUser as unknown as Express.Request['user'];
      next();
      return;
    }

    // No token provided
    sendAuthFailure(res, resolved.status || 401, resolved.error || 'Authentication failed');
    return;
    
    /*
    // Production code (commented out for now):
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    
    const token = authHeader.split(' ')[1];
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as unknown as { id?: string; role?: string; exp?: number; iat?: number };
      
      // Check if user exists and is active
      const prismaClient = getPrisma();
      if (!prismaClient) {
        return res.status(500).json({ error: 'Database connection unavailable' });
      }
      
      const user = await prismaClient.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, email: true, role: true, isActive: true }
      });
      
      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }
      
      if (!user.isActive) {
        return res.status(403).json({ error: 'Account is deactivated' });
      }
      
      req.user = {
        id: user.id,
        email: user.email,
        role: user.role
      };
      next();
    } catch (error) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    */
    } catch (error) {
    console.error('Auth middleware error:', error);
    sendAuthFailure(res, 500, 'Authentication failed');
    return;
  }
};

export const optionalAuthMiddleware = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const resolved = await resolveAuthenticatedUser(req);
    if (resolved.user) {
      req.user = resolved.user;
    }
  } catch (error) {
    console.warn('[auth.middleware] Optional auth resolution failed:', error);
  }
  next();
};
