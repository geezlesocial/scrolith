import { NextFunction, Request, Response } from 'express';
import { getOrCreateDeveloperUserFromAuth, loadDeveloperUserFromAuth } from '../services/developerPlatform.service';

type DeveloperUserRecord = {
  id: string;
  developerEmail?: string | null;
  developerUsername?: string | null;
  userId?: string | null;
  linkStatus?: string | null;
  linkedAt?: Date | string | null;
  lastSyncedAt?: Date | string | null;
  syncSnapshot?: any;
};

declare global {
  namespace Express {
    interface Request {
      developerUser?: DeveloperUserRecord;
      developerOwnerUserId?: string;
    }
  }
}

const notLinked = (res: Response) =>
  res.status(403).json({
    success: false,
    error: 'Please connect your Scrolith account to access Developer APIs.',
    code: 'DEV_NOT_LINKED'
  });

export const requireDeveloperProfile = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'Authentication required.' });
      return;
    }
    const profile = await getOrCreateDeveloperUserFromAuth({
      id: req.user.id,
      email: req.user.email,
      role: req.user.role
    });
    req.developerUser = profile;
    return next();
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Failed to resolve developer profile.' });
    return;
  }
};

export const requireLinkedDeveloper = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    if (!req.user?.id) {
      res.status(401).json({ success: false, error: 'Authentication required.' });
      return;
    }

    const developerUser = await loadDeveloperUserFromAuth({
      id: req.user.id,
      email: req.user.email,
      role: req.user.role
    });

    if (!developerUser) {
      notLinked(res);
      return;
    }
    if (developerUser.linkStatus === 'SUSPENDED') {
      res.status(403).json({
        success: false,
        error: 'Developer account is suspended.',
        code: 'DEV_SUSPENDED'
      });
      return;
    }
    if (developerUser.linkStatus !== 'LINKED' || !developerUser.userId) {
      notLinked(res);
      return;
    }

    req.developerUser = developerUser;
    req.developerOwnerUserId = developerUser.userId;
    return next();
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Failed to verify developer link status.' });
    return;
  }
};
