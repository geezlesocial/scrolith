// C:\Projects\geezle-backend\src\middleware\admin.middleware.ts
import { Request, Response, NextFunction } from 'express';

export const adminMiddleware = (req: Request, res: Response, next: NextFunction) => {
  console.log(`Admin middleware: ${req.method} ${req.path}`);
  
  // Get user from request (added by authMiddleware)
  const user = req.user;
  
  // Development: Allow all requests
  if (process.env.NODE_ENV === 'development') {
    console.log('Development mode: Bypassing admin check');
    return next();
  }
  
  // Production: Check user role
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  const role = (user.role || '').toString().toLowerCase();
  if (role !== 'admin' && role !== 'superadmin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  next();
};