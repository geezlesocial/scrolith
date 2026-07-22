/**
 * Phase 32.2 — Admin notification defaults / policy locks (minimal controls).
 * Full operations dashboard deferred to Phase 32.4.
 */
import express from 'express';
import { requirePermission } from '../../middleware/rbac.middleware';
import { NotificationAdminDefaultsService } from '../../services/notificationCenter/adminDefaults.service';

const router = express.Router();

router.get(
  '/defaults',
  requirePermission('journeys.quiet_hours.read'),
  async (_req, res) => {
    try {
      const data = NotificationAdminDefaultsService.get();
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || 'Failed to load defaults' });
    }
  }
);

router.put(
  '/defaults',
  requirePermission('journeys.quiet_hours.write'),
  async (req, res) => {
    try {
      const actorId = (req as any).user?.id || null;
      const data = await NotificationAdminDefaultsService.update(req.body || {}, actorId);
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || 'Failed to update defaults' });
    }
  }
);

router.post(
  '/defaults/reset',
  requirePermission('journeys.quiet_hours.write'),
  async (req, res) => {
    try {
      const actorId = (req as any).user?.id || null;
      const data = NotificationAdminDefaultsService.resetToCodeDefaults(actorId);
      return res.json({ success: true, data });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || 'Failed to reset defaults' });
    }
  }
);

export default router;
