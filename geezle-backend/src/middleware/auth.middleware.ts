// C:\Projects\geezle-backend\src\middleware\auth.middleware.ts
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

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // For development: bypass auth check
    // Development: Create mock user
    const fullPath = `${req.baseUrl || ''}${req.path || ''}`;
    const roleHint =
      (req.headers['x-dev-role'] as string | undefined) ||
      (req.query.role as string | undefined) ||
      (fullPath.startsWith('/api/proposals/me') || fullPath.startsWith('/proposals/me') ? 'freelancer' :
        fullPath.startsWith('/api/proposals') || fullPath.startsWith('/proposals') ? 'client' :
        fullPath.startsWith('/api/freelancer') || fullPath.startsWith('/freelancer') ? 'freelancer' :
        fullPath.startsWith('/api/client') || fullPath.startsWith('/client') ? 'client' :
        fullPath.startsWith('/api/admin') || fullPath.startsWith('/admin') ? 'admin' : undefined);

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
    res.status(500).json({ error: 'Authentication failed' });
  }
};
