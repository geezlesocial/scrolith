import express from 'express';
import { requirePermission } from '../../middleware/rbac.middleware';
import { getPrismaConnectionState } from '../../utils/prismaClient';
import { getObservabilitySnapshot } from '../../utils/observability/metricsRegistry';

const router = express.Router();

router.get('/summary', requirePermission('realtime.read'), async (_req, res) => {
  try {
    const snapshot = await getObservabilitySnapshot();
    return res.json({
      success: true,
      data: {
        ...snapshot,
        status: getPrismaConnectionState() === 'degraded' ? 'DEGRADED' : 'OK'
      }
    });
  } catch (error) {
    console.error('[observability] summary failed', error);
    return res.status(500).json({ success: false, error: 'Failed to load observability summary' });
  }
});

export default router;
