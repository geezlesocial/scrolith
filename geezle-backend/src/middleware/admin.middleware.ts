// C:\Projects\Scrolith-backend\src\middleware\admin.middleware.ts
import { Request, Response, NextFunction } from 'express';

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
    return res.status(403).json({ error: 'Admin access required' });
  }
  
  next();
};

