import { Request, Response, NextFunction } from 'express';

// Development middleware that bypasses auth for development
export const devAuthMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('⚠️  Development mode: Bypassing authentication');
    // Mock user for development
    const devUser = { id: 'dev-user-1', email: 'dev@example.com', role: 'admin' };
    req.user = devUser as unknown as Express.Request['user'];
    return next();
  }
  
  // In production, require real auth
  next(new Error('Authentication required in production'));
};

// Development admin middleware
export const devAdminMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (process.env.NODE_ENV === 'development') {
    console.log('⚠️  Development mode: Bypassing admin check');
    return next();
  }
  
  // In production, require admin role
  const user = req.user;
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};