import express from 'express';
import {
  getDemoAccountsOverview,
  runDemoAutomationCycle,
  seedDemoAccounts,
  setDemoAccountAutomationState,
  updateDemoAutomationConfig
} from '../../services/systemDemoAccounts.service';

const router = express.Router();

router.get('/overview', async (_req, res) => {
  try {
    const data = await getDemoAccountsOverview();
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load demo account overview' });
  }
});

router.post('/seed', async (req, res) => {
  try {
    const actorId = String((req as any)?.user?.id || '').trim() || null;
    const count = Number(req.body?.count || 50);
    const data = await seedDemoAccounts({ count, updatedById: actorId });
    return res.json({ success: true, data, message: 'Demo accounts seeded successfully' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to seed demo accounts' });
  }
});

router.put('/config', async (req, res) => {
  try {
    const actorId = String((req as any)?.user?.id || '').trim() || null;
    const patch = {
      enabled: req.body?.enabled,
      aiEnabled: req.body?.aiEnabled,
      cadenceMinutes: req.body?.cadenceMinutes,
      maxPostsPerRun: req.body?.maxPostsPerRun,
      maxLikesPerRun: req.body?.maxLikesPerRun
    };
    const data = await updateDemoAutomationConfig(patch as any, actorId);
    return res.json({ success: true, data, message: 'Demo automation config updated' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to update demo automation config' });
  }
});

router.post('/accounts/:id/toggle', async (req, res) => {
  try {
    const actorId = String((req as any)?.user?.id || '').trim() || null;
    const accountId = String(req.params.id || '').trim();
    const enabled = Boolean(req.body?.enabled);
    const data = await setDemoAccountAutomationState(accountId, enabled, actorId);
    return res.json({ success: true, data, message: `Automation ${enabled ? 'enabled' : 'disabled'} for account` });
  } catch (error: any) {
    const message = String(error?.message || 'Failed to toggle account automation');
    const status = /not managed/i.test(message) ? 404 : 500;
    return res.status(status).json({ success: false, error: message });
  }
});

router.post('/run-once', async (_req, res) => {
  try {
    const data = await runDemoAutomationCycle();
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to run demo automation cycle' });
  }
});

export default router;

