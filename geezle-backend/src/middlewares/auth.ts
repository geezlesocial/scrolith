import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';

export type UserRole = 'ADMIN' | 'CLIENT' | 'FREELANCER';

export interface AuthUser {
  id: string;
  role: UserRole;
  email?: string;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization as string | undefined;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });

  const token = header.replace('Bearer ', '');
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as AuthUser;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ success: false, error: { message: 'Invalid token' } });
  }
}

export default requireAuth;
