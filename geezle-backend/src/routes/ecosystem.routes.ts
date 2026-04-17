import express from 'express';
import { adminMiddleware } from '../middleware/admin.middleware';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireDeveloperProfile, requireLinkedDeveloper } from '../middleware/developer.middleware';
import {
  createDeveloperWebhook,
  deleteDeveloperWebhook,
  getAdminEcosystemOverview,
  getDeveloperEcosystemDashboard,
  getPhase4Briefing,
  getPublicEcosystemManifest,
  listDeveloperWebhooks,
  listDeveloperWidgets,
  testDeveloperWebhook,
  upsertDeveloperWidget
} from '../services/phase4.service';

const router = express.Router();

const actorFromRequest = (req: express.Request) => ({
  id: String(req.user?.id || ''),
  email: req.user?.email,
  role: req.user?.role
});

const handleError = (res: express.Response, error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const lower = message.toLowerCase();
  const status =
    lower.includes('not found') ? 404 :
    lower.includes('required') || lower.includes('valid') || lower.includes('https') ? 400 :
    lower.includes('auth') ? 401 :
    500;
  if (status >= 500) console.error('[ecosystem] request failed', error);
  return res.status(status).json({ success: false, error: message || fallback });
};

router.get('/public/apis', async (_req, res) => {
  try {
    const data = await getPublicEcosystemManifest();
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to load public API manifest');
  }
});

router.get('/phase4/briefing', authMiddleware, async (req, res) => {
  try {
    const data = await getPhase4Briefing(actorFromRequest(req));
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to load Phase 4 briefing');
  }
});

router.get('/developer/dashboard', authMiddleware, requireDeveloperProfile, async (req, res) => {
  try {
    const data = await getDeveloperEcosystemDashboard(actorFromRequest(req));
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to load developer dashboard');
  }
});

router.get('/developer/webhooks', authMiddleware, requireLinkedDeveloper, async (req, res) => {
  try {
    const data = await listDeveloperWebhooks(String(req.developerUser?.id || ''));
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to list webhooks');
  }
});

router.post('/developer/webhooks', authMiddleware, requireLinkedDeveloper, async (req, res) => {
  try {
    const data = await createDeveloperWebhook(actorFromRequest(req), String(req.developerUser?.id || ''), req.body || {});
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to create webhook');
  }
});

router.post('/developer/webhooks/:id/test', authMiddleware, requireLinkedDeveloper, async (req, res) => {
  try {
    const data = await testDeveloperWebhook(actorFromRequest(req), String(req.developerUser?.id || ''), req.params.id);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to test webhook');
  }
});

router.delete('/developer/webhooks/:id', authMiddleware, requireLinkedDeveloper, async (req, res) => {
  try {
    const data = await deleteDeveloperWebhook(actorFromRequest(req), String(req.developerUser?.id || ''), req.params.id);
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to delete webhook');
  }
});

router.get('/developer/widgets', authMiddleware, requireLinkedDeveloper, async (req, res) => {
  try {
    const data = await listDeveloperWidgets(String(req.developerUser?.id || ''));
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to list widgets');
  }
});

router.post('/developer/widgets', authMiddleware, requireLinkedDeveloper, async (req, res) => {
  try {
    const data = await upsertDeveloperWidget(actorFromRequest(req), String(req.developerUser?.id || ''), req.body || {});
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to save widget');
  }
});

router.get('/admin/overview', authMiddleware, adminMiddleware, async (_req, res) => {
  try {
    const data = await getAdminEcosystemOverview();
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to load ecosystem admin overview');
  }
});

export default router;
