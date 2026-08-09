import { Request, Response } from 'express';
import {
  approveLoginAttempt,
  ensureTrustedDevice,
  extractDeviceMetadata,
  getApprovalStatus,
  listPendingApprovals,
  listTrustedDevices,
  rejectLoginAttempt,
  revokeTrustedDevice
} from '../services/deviceSecurity.service';
import prisma from '../utils/prismaClient';

const currentUserId = (req: Request) => String(req.user?.id || '').trim();

const getOrCreateSettings = async (userId: string) =>
  prisma.userSettings.upsert({
    where: { userId },
    update: {},
    create: { userId }
  });

export const getDeviceSecurityOverview = async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const [settings, devices, pendingApprovals] = await Promise.all([
    getOrCreateSettings(userId),
    listTrustedDevices(userId),
    listPendingApprovals(userId)
  ]);
  return res.json({
    success: true,
    data: {
      preferences: {
        loginAlerts: settings.loginAlerts,
        twoFactorEnabled: settings.twoFactorEnabled
      },
      devices,
      pendingApprovals
    }
  });
};

export const updateDeviceSecurityPreferences = async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const patch: Record<string, unknown> = {};
  if (typeof req.body?.loginAlerts === 'boolean') patch.loginAlerts = req.body.loginAlerts;
  if (typeof req.body?.login_alerts === 'boolean') patch.loginAlerts = req.body.login_alerts;
  if (Object.keys(patch).length === 0) {
    return res.status(400).json({ success: false, error: 'No supported preference changes were provided' });
  }
  const settings = await prisma.userSettings.upsert({
    where: { userId },
    update: patch,
    create: { userId, ...patch }
  });
  return res.json({
    success: true,
    data: {
      preferences: {
        loginAlerts: settings.loginAlerts,
        twoFactorEnabled: settings.twoFactorEnabled
      }
    }
  });
};

export const registerTrustedDeviceController = async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const device = extractDeviceMetadata(req);
  if (!device) {
    return res.status(400).json({ success: false, error: 'Device identity is required' });
  }
  const trusted = await ensureTrustedDevice(userId, device, req);
  return res.status(201).json({ success: true, data: { device: trusted } });
};

export const revokeTrustedDeviceController = async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const deviceId = String(req.params.deviceId || req.params.id || '').trim();
  if (!deviceId) return res.status(400).json({ success: false, error: 'Device id is required' });
  const result = await revokeTrustedDevice(userId, deviceId);
  if (!result?.count) return res.status(404).json({ success: false, error: 'Trusted device not found' });
  return res.json({ success: true, data: { revoked: true } });
};

export const listPendingLoginApprovalsController = async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  return res.json({ success: true, data: { pendingApprovals: await listPendingApprovals(userId) } });
};

export const approveLoginApprovalController = async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const attemptId = String(req.params.attemptId || '').trim();
  const approved = await approveLoginAttempt(userId, attemptId);
  if (!approved) return res.status(404).json({ success: false, error: 'Pending approval not found' });
  return res.json({ success: true, data: { status: 'APPROVED' } });
};

export const rejectLoginApprovalController = async (req: Request, res: Response) => {
  const userId = currentUserId(req);
  if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
  const attemptId = String(req.params.attemptId || '').trim();
  const rejected = await rejectLoginAttempt(userId, attemptId);
  if (!rejected) return res.status(404).json({ success: false, error: 'Pending approval not found' });
  return res.json({ success: true, data: { status: 'REJECTED' } });
};

export const getLoginApprovalStatusController = async (req: Request, res: Response) => {
  const attemptId = String(req.params.attemptId || '').trim();
  const approvalToken = String(req.query.approvalToken || req.query.approval_token || '').trim();
  if (!attemptId || !approvalToken) {
    return res.status(400).json({ success: false, error: 'Approval attempt and token are required' });
  }
  const status = await getApprovalStatus(attemptId, approvalToken);
  if (!status) return res.status(404).json({ success: false, error: 'Login approval not found' });
  return res.json({ success: true, data: status });
};
