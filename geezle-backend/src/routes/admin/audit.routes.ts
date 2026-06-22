import express from 'express';
import { requirePermission } from '../../middleware/rbac.middleware';
import { getAdminAuditSummary, listAdminAuditEvents } from '../../services/adminAudit.service';

const router = express.Router();

router.get('/summary', requirePermission('audit.read'), async (_req, res) => {
  try {
    const data = await getAdminAuditSummary();
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[audit] summary failed', error);
    return res.status(500).json({ success: false, error: 'Failed to load audit summary', code: 'ERR_INTERNAL' });
  }
});

router.get('/events', requirePermission('audit.read'), async (req, res) => {
  try {
    const data = await listAdminAuditEvents({
      actor: String(req.query.actor || ''),
      entityType: String(req.query.entityType || ''),
      moduleKey: String(req.query.moduleKey || ''),
      severity: String(req.query.severity || ''),
      status: String(req.query.status || ''),
      dateFrom: String(req.query.dateFrom || ''),
      dateTo: String(req.query.dateTo || ''),
      limit: Number(req.query.limit || 100)
    });
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[audit] events failed', error);
    return res.status(500).json({ success: false, error: 'Failed to load audit events', code: 'ERR_INTERNAL' });
  }
});

export default router;
