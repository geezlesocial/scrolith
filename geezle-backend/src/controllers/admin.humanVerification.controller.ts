import { Request, Response } from 'express';
import { HumanVerificationService } from '../services/humanVerification';

export const getHumanVerificationSettings = async (_req: Request, res: Response) => {
  try {
    const settings = await HumanVerificationService.getSettings();
    return res.json({ success: true, data: settings });
  } catch (error: any) {
    console.error('[admin.hv] get settings', error?.message);
    return res.status(500).json({ success: false, error: 'Failed to load human verification settings' });
  }
};

export const updateHumanVerificationSettings = async (req: Request, res: Response) => {
  try {
    const actor = {
      id: (req as any)?.user?.id,
      email: (req as any)?.user?.email
    };
    const settings = await HumanVerificationService.updateSettings(req.body || {}, actor);
    return res.json({ success: true, data: settings });
  } catch (error: any) {
    console.error('[admin.hv] update settings', error?.message);
    return res.status(500).json({ success: false, error: 'Failed to update human verification settings' });
  }
};

export const getHumanVerificationAnalytics = async (req: Request, res: Response) => {
  try {
    const rangeDays = Number(req.query?.days || req.query?.rangeDays || 30);
    const data = await HumanVerificationService.getAnalytics(rangeDays);
    return res.json({ success: true, data });
  } catch (error: any) {
    console.error('[admin.hv] analytics', error?.message);
    return res.status(500).json({ success: false, error: 'Failed to load analytics' });
  }
};

export const getHumanVerificationAuditLogs = async (req: Request, res: Response) => {
  try {
    const limit = Number(req.query?.limit || 50);
    const data = await HumanVerificationService.listAuditLogs(limit);
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: 'Failed to load audit logs' });
  }
};
