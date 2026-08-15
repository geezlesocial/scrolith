import express from 'express';
import { requirePermission } from '../../middleware/rbac.middleware';
import {
  auditDeviceApprovalWaiverAdminAction,
  DEVICE_APPROVAL_WAIVER_PERMISSION,
  findUserForDeviceApprovalWaiver,
  getDeviceApprovalWaiverSettings,
  getDeviceApprovalWaiverState,
  grantDeviceApprovalWaiver,
  revokeDeviceApprovalWaiver,
  setDeviceApprovalWaiverEnabled
} from '../../services/deviceApprovalWaiver.service';

const router = express.Router();

const emitWaiverEvent = (req: express.Request, action: string, userId?: string) => {
  const payload = { action, userId: userId || null, updatedAt: new Date().toISOString() };
  const io = req.app.get('io');
  const communityIo = req.app.get('communityIo');
  io?.emit('security:device_approval_waiver_updated', payload);
  communityIo?.emit('security:device_approval_waiver_updated', payload);
};

const adminId = (req: express.Request) => String(req.user?.id || '').trim();

const handleError = (res: express.Response, error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : '';
  if (message === 'User not found') return res.status(404).json({ success: false, error: message, code: 'NOT_FOUND' });
  if (message.toLowerCase().includes('waiver mode')) {
    return res.status(400).json({ success: false, error: message, code: 'VALIDATION_ERROR' });
  }
  if ((error as any)?.code === 'P2002') {
    return res.status(409).json({ success: false, error: 'An active waiver already exists for this user', code: 'CONFLICT' });
  }
  console.error('[device-approval-waiver] request failed', error);
  return res.status(500).json({ success: false, error: fallback, code: 'ERR_INTERNAL' });
};

router.get('/settings', requirePermission(DEVICE_APPROVAL_WAIVER_PERMISSION), async (_req, res) => {
  try {
    return res.json({ success: true, data: await getDeviceApprovalWaiverSettings() });
  } catch (error) {
    return handleError(res, error, 'Failed to load device approval waiver settings');
  }
});

router.patch('/settings', requirePermission(DEVICE_APPROVAL_WAIVER_PERMISSION), async (req, res) => {
  try {
    if (typeof req.body?.enabled !== 'boolean') {
      return res.status(400).json({ success: false, error: 'enabled must be a boolean', code: 'VALIDATION_ERROR' });
    }
    const settings = await setDeviceApprovalWaiverEnabled(req.body.enabled);
    await auditDeviceApprovalWaiverAdminAction(req, 'device_approval_waiver.settings_updated', DEVICE_APPROVAL_WAIVER_PERMISSION, {
      enabled: req.body.enabled
    });
    emitWaiverEvent(req, 'settings_updated');
    return res.json({ success: true, data: { enabled: Boolean((settings.data as any)?.enabled) } });
  } catch (error) {
    return handleError(res, error, 'Failed to update device approval waiver settings');
  }
});

// Exact email lookup is intentionally separate from /:userId to avoid fuzzy or partial matching.
router.get('/user', requirePermission(DEVICE_APPROVAL_WAIVER_PERMISSION), async (req, res) => {
  try {
    const user = await findUserForDeviceApprovalWaiver(req.query.email);
    if (!user) return res.status(404).json({ success: false, error: 'No exact user match found', code: 'NOT_FOUND' });
    return res.json({ success: true, data: await getDeviceApprovalWaiverState(user.id) });
  } catch (error) {
    return handleError(res, error, 'Failed to find user');
  }
});

router.get('/:userId/history', requirePermission(DEVICE_APPROVAL_WAIVER_PERMISSION), async (req, res) => {
  try {
    return res.json({ success: true, data: await getDeviceApprovalWaiverState(req.params.userId) });
  } catch (error) {
    return handleError(res, error, 'Failed to load waiver history');
  }
});

const grant = async (req: express.Request, res: express.Response) => {
  try {
    const actor = adminId(req);
    if (!actor) return res.status(403).json({ success: false, error: 'Admin identity required', code: 'FORBIDDEN' });
    const result = await grantDeviceApprovalWaiver(req.params.userId, req.body?.mode, actor);
    await auditDeviceApprovalWaiverAdminAction(req, 'device_approval_waiver.granted', req.params.userId, {
      mode: result.waiver.mode,
      status: result.waiver.status
    });
    emitWaiverEvent(req, 'waiver_granted', req.params.userId);
    return res.json({ success: true, data: await getDeviceApprovalWaiverState(req.params.userId) });
  } catch (error) {
    return handleError(res, error, 'Failed to grant device approval waiver');
  }
};

router.put('/:userId', requirePermission(DEVICE_APPROVAL_WAIVER_PERMISSION), grant);
router.patch('/:userId', requirePermission(DEVICE_APPROVAL_WAIVER_PERMISSION), grant);

router.delete('/:userId', requirePermission(DEVICE_APPROVAL_WAIVER_PERMISSION), async (req, res) => {
  try {
    const actor = adminId(req);
    if (!actor) return res.status(403).json({ success: false, error: 'Admin identity required', code: 'FORBIDDEN' });
    const result = await revokeDeviceApprovalWaiver(req.params.userId, actor);
    await auditDeviceApprovalWaiverAdminAction(req, 'device_approval_waiver.revoked', req.params.userId, {
      revoked: result.revoked
    });
    emitWaiverEvent(req, 'waiver_revoked', req.params.userId);
    return res.json({ success: true, data: result });
  } catch (error) {
    return handleError(res, error, 'Failed to revoke device approval waiver');
  }
});

export default router;
