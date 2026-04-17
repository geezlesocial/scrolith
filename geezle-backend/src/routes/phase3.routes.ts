import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  createEnterpriseWorkspace,
  getCreatorCommerceCampaigns,
  getGlobalLocalizationHub,
  getPayoutOrchestration,
  getPhase3Briefing,
  listEnterpriseWorkspaces
} from '../services/phase3.service';

const router = express.Router();

const handleError = (res: express.Response, error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const lower = message.toLowerCase();
  const status =
    lower.includes('not found') ? 404 :
    lower.includes('required') || lower.includes('invalid') ? 400 :
    lower.includes('auth') ? 401 :
    500;
  if (status >= 500) console.error('[phase3] request failed', error);
  return res.status(status).json({ success: false, error: message || fallback });
};

router.get('/briefing', authMiddleware, async (req, res) => {
  try {
    const data = await getPhase3Briefing(String(req.user?.id || ''), { role: req.user?.role });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to load Phase 3 briefing');
  }
});

router.get('/workspaces', authMiddleware, async (req, res) => {
  try {
    const data = await listEnterpriseWorkspaces(String(req.user?.id || ''), {
      role: req.user?.role,
      limit: req.query.limit
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to load enterprise workspaces');
  }
});

router.post('/workspaces', authMiddleware, async (req, res) => {
  try {
    const data = await createEnterpriseWorkspace(String(req.user?.id || ''), req.body || {});
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to create enterprise workspace');
  }
});

router.get('/creator-commerce/campaigns', authMiddleware, async (req, res) => {
  try {
    const data = await getCreatorCommerceCampaigns(String(req.user?.id || ''), {
      role: req.user?.role,
      limit: req.query.limit
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to load creator-commerce campaigns');
  }
});

router.get('/payouts/orchestration', authMiddleware, async (req, res) => {
  try {
    const data = await getPayoutOrchestration(String(req.user?.id || ''), {
      role: req.user?.role,
      limit: req.query.limit
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to load payout orchestration');
  }
});

router.get('/localization/global', authMiddleware, async (_req, res) => {
  try {
    const data = await getGlobalLocalizationHub();
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to load global localization hub');
  }
});

export default router;
