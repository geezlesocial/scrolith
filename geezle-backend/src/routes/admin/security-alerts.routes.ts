import express from 'express';
import { requirePermission, resolveStaffContext } from '../../middleware/rbac.middleware';
import {
  getSecurityAlertSummary,
  listSecurityAlerts,
  updateSecurityAlertStatus
} from '../../services/securityAlert.service';
import { recordGovernedAdminAction } from '../../services/enterpriseGovernance.service';

const router = express.Router();

const getStaffId = async (req: express.Request) => {
  const context = await resolveStaffContext(req);
  return context?.staffId || null;
};

router.get('/summary', requirePermission('security.alerts.read'), async (_req, res) => {
  try {
    const data = await getSecurityAlertSummary();
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[security-alerts] summary failed', error);
    return res.status(500).json({ success: false, error: 'Failed to load security alert summary', code: 'ERR_INTERNAL' });
  }
});

router.get('/', requirePermission('security.alerts.read'), async (req, res) => {
  try {
    const data = await listSecurityAlerts({
      status: String(req.query.status || ''),
      severity: String(req.query.severity || ''),
      limit: Number(req.query.limit || 50)
    });
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[security-alerts] list failed', error);
    return res.status(500).json({ success: false, error: 'Failed to load security alerts', code: 'ERR_INTERNAL' });
  }
});

const applyStatus = (status: 'acknowledged' | 'resolved' | 'dismissed') =>
  async (req: express.Request, res: express.Response) => {
    try {
      const staffId = await getStaffId(req);
      const data = await updateSecurityAlertStatus(req.params.id, status, staffId);
      await recordGovernedAdminAction(req, {
        moduleKey: 'security',
        actionKey: `alert_${status}`,
        entityType: 'security_alert',
        entityId: data.id,
        message: `Security alert ${status}: ${data.title}`,
        metadata: { alert: data }
      });
      return res.json({ success: true, data });
    } catch (error: any) {
      console.error(`[security-alerts] ${status} failed`, error);
      return res.status(400).json({
        success: false,
        error: error?.message || `Failed to ${status} security alert`,
        code: 'VALIDATION_ERROR'
      });
    }
  };

router.post('/:id/acknowledge', requirePermission('security.alerts.manage'), applyStatus('acknowledged'));
router.post('/:id/resolve', requirePermission('security.alerts.manage'), applyStatus('resolved'));
router.post('/:id/dismiss', requirePermission('security.alerts.manage'), applyStatus('dismissed'));

export default router;
