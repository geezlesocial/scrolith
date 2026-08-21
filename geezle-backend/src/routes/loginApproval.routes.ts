import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import prisma from '../utils/prismaClient';
import {
  decideLoginApproval,
  getLoginApprovalStatus,
  listPendingLoginApprovals,
  listTrustedDevices,
  normalizeLoginDeviceMetadata,
  registerTrustedDevice,
  revokeTrustedDevice
} from '../services/loginApproval.service';

const router = express.Router();

router.post('/login-approvals/trusted-device', authMiddleware, async (req, res) => {
  try {
    const userId = String(req.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const metadata = normalizeLoginDeviceMetadata(req.body?.device);
    await registerTrustedDevice(userId, metadata);
    return res.json({ success: true, data: { registered: Boolean(metadata.deviceId) } });
  } catch (error) {
    console.error('[login-approvals] trusted device registration failed', error);
    return res.status(500).json({ success: false, error: 'Unable to register trusted device' });
  }
});

router.get('/login-approvals/pending', authMiddleware, async (req, res) => {
  try {
    const userId = String(req.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const pendingApprovals = await listPendingLoginApprovals(userId);
    return res.json({ success: true, data: { pendingApprovals } });
  } catch (error) {
    console.error('[login-approvals] pending failed', error);
    return res.status(500).json({ success: false, error: 'Unable to load login approvals' });
  }
});

router.get('/overview', authMiddleware, async (req, res) => {
  try {
    const userId = String(req.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const [devices, pendingApprovals, settings] = await Promise.all([
      listTrustedDevices(userId),
      listPendingLoginApprovals(userId),
      prisma.userSettings.findUnique({ where: { userId }, select: { loginAlerts: true, twoFactorEnabled: true } })
    ]);
    return res.json({
      success: true,
      data: {
        devices,
        pendingApprovals,
        preferences: {
          loginAlerts: settings?.loginAlerts ?? true,
          twoFactorEnabled: settings?.twoFactorEnabled ?? false
        }
      }
    });
  } catch (error) {
    console.error('[login-approvals] overview failed', error);
    return res.status(500).json({ success: false, error: 'Unable to load device security' });
  }
});

router.delete('/devices/:deviceId', authMiddleware, async (req, res) => {
  try {
    const userId = String(req.user?.id || '').trim();
    const deviceRecordId = String(req.params.deviceId || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    if (!deviceRecordId) return res.status(400).json({ success: false, error: 'Device id is required' });
    const result = await revokeTrustedDevice(userId, deviceRecordId);
    if (!result.count) return res.status(404).json({ success: false, error: 'Trusted device not found' });
    return res.json({ success: true, data: { revoked: true } });
  } catch (error) {
    console.error('[login-approvals] device revoke failed', error);
    return res.status(500).json({ success: false, error: 'Unable to revoke trusted device' });
  }
});

router.post('/login-approvals/:id/approve', authMiddleware, async (req, res) => {
  try {
    const userId = String(req.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const data = await decideLoginApproval(userId, String(req.params.id || ''), 'APPROVED');
    return res.json({ success: true, data });
  } catch (error: any) {
    const message = String(error?.message || 'Unable to approve login request');
    return res.status(message.includes('not found') ? 404 : 409).json({ success: false, error: message });
  }
});

router.post('/login-approvals/:id/reject', authMiddleware, async (req, res) => {
  try {
    const userId = String(req.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const data = await decideLoginApproval(userId, String(req.params.id || ''), 'REJECTED');
    return res.json({ success: true, data });
  } catch (error: any) {
    const message = String(error?.message || 'Unable to reject login request');
    return res.status(message.includes('not found') ? 404 : 409).json({ success: false, error: message });
  }
});

// The requesting device is not authenticated yet; the one-time token is the credential.
router.post('/login-approvals/:id/status', async (req, res) => {
  try {
    const approvalToken = String(req.body?.approvalToken || '').trim();
    if (!approvalToken) return res.status(400).json({ success: false, error: 'approvalToken is required' });
    const data = await getLoginApprovalStatus(String(req.params.id || ''), approvalToken);
    return res.json({ success: true, data });
  } catch {
    return res.status(401).json({ success: false, error: 'Login approval request is invalid', code: 'LOGIN_APPROVAL_INVALID' });
  }
});

export default router;
