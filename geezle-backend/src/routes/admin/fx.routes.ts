import express from 'express';
import {
  approveFxOverride,
  approveFxSnapshot,
  createFxOverride,
  getFxConfig,
  getFxHealth,
  listFxOverrides,
  listFxProviders,
  listFxSnapshots,
  notifyFxRuntimeUpdate,
  registerFxJobs,
  runFxSync,
  setFxSnapshotFrozen,
  updateFxConfig,
  updateFxProvider
} from '../../services/fx.service';

const router = express.Router();

const handleError = (res: express.Response, error: unknown, fallbackMessage: string) => {
  const message = error instanceof Error ? error.message || fallbackMessage : fallbackMessage;
  const normalized = message.toLowerCase();
  if (normalized.includes('not found')) {
    return res.status(404).json({ success: false, error: message, code: 'NOT_FOUND' });
  }
  if (
    normalized.includes('required') ||
    normalized.includes('invalid') ||
    normalized.includes('disabled') ||
    normalized.includes('must be')
  ) {
    return res.status(400).json({ success: false, error: message, code: 'VALIDATION_ERROR' });
  }
  console.error('[fx] request failed', error);
  return res.status(500).json({ success: false, error: fallbackMessage, code: 'ERR_INTERNAL' });
};

router.get('/config', async (_req, res) => {
  try {
    const config = await getFxConfig();
    return res.json({ success: true, data: config });
  } catch (error) {
    return handleError(res, error, 'Failed to load FX config');
  }
});

router.put('/config', async (req, res) => {
  try {
    const config = await updateFxConfig(req.body || {});
    await registerFxJobs(req.app);
    await notifyFxRuntimeUpdate(req.app, { fx: { action: 'config_updated' } });
    return res.json({ success: true, data: config });
  } catch (error) {
    return handleError(res, error, 'Failed to update FX config');
  }
});

router.get('/providers', async (_req, res) => {
  try {
    const providers = await listFxProviders();
    return res.json({ success: true, data: providers });
  } catch (error) {
    return handleError(res, error, 'Failed to load FX providers');
  }
});

router.put('/providers/:code', async (req, res) => {
  try {
    const provider = await updateFxProvider(req.params.code, req.body || {});
    return res.json({ success: true, data: provider });
  } catch (error) {
    return handleError(res, error, 'Failed to update FX provider');
  }
});

router.get('/health', async (_req, res) => {
  try {
    const health = await getFxHealth();
    return res.json({ success: true, data: health });
  } catch (error) {
    return handleError(res, error, 'Failed to load FX health');
  }
});

router.get('/snapshots', async (req, res) => {
  try {
    const snapshots = await listFxSnapshots({
      limit: Number(req.query.limit || 25),
      providerCode: String(req.query.providerCode || ''),
      baseCurrency: String(req.query.baseCurrency || '')
    });
    return res.json({ success: true, data: snapshots });
  } catch (error) {
    return handleError(res, error, 'Failed to load FX snapshots');
  }
});

router.post('/sync', async (req, res) => {
  try {
    const result = await runFxSync({
      providerCode: req.body?.providerCode,
      baseCurrency: req.body?.baseCurrency,
      requestedById: req.user?.id || null,
      triggerType: 'manual'
    });
    if (result.autoApproved) {
      await notifyFxRuntimeUpdate(req.app, {
        fx: {
          action: 'sync_auto_approved',
          providerCode: result.provider.code,
          snapshotId: result.snapshot.id
        }
      });
    }
    return res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    const job = error?.job || null;
    return res.status(500).json({
      success: false,
      error: error?.message || 'FX sync failed',
      code: 'ERR_INTERNAL',
      data: job
    });
  }
});

router.post('/snapshots/:id/approve', async (req, res) => {
  try {
    const freeze = Boolean(req.body?.freeze);
    const snapshot = await approveFxSnapshot(req.params.id, req.user?.id || null, freeze);
    await notifyFxRuntimeUpdate(req.app, {
      fx: {
        action: freeze ? 'snapshot_frozen' : 'snapshot_approved',
        snapshotId: snapshot.id,
        providerCode: snapshot.providerCode
      }
    });
    return res.json({ success: true, data: snapshot });
  } catch (error) {
    return handleError(res, error, 'Failed to approve FX snapshot');
  }
});

router.post('/snapshots/:id/freeze', async (req, res) => {
  try {
    const frozen = req.body?.frozen !== false;
    const snapshot = await setFxSnapshotFrozen(req.params.id, frozen, req.user?.id || null);
    await notifyFxRuntimeUpdate(req.app, {
      fx: {
        action: frozen ? 'snapshot_frozen' : 'snapshot_unfrozen',
        snapshotId: snapshot.id,
        providerCode: snapshot.providerCode
      }
    });
    return res.json({ success: true, data: snapshot });
  } catch (error) {
    return handleError(res, error, 'Failed to update FX snapshot freeze state');
  }
});

router.get('/overrides', async (req, res) => {
  try {
    const overrides = await listFxOverrides({
      limit: Number(req.query.limit || 25),
      status: String(req.query.status || '')
    });
    return res.json({ success: true, data: overrides });
  } catch (error) {
    return handleError(res, error, 'Failed to load FX overrides');
  }
});

router.post('/overrides', async (req, res) => {
  try {
    const override = await createFxOverride(req.body || {}, req.user?.id || null);
    if (String(override.status || '').toUpperCase() === 'APPROVED') {
      await notifyFxRuntimeUpdate(req.app, {
        fx: {
          action: 'override_created',
          overrideId: override.id
        }
      });
    }
    return res.status(201).json({ success: true, data: override });
  } catch (error) {
    return handleError(res, error, 'Failed to create FX override');
  }
});

router.post('/overrides/:id/approve', async (req, res) => {
  try {
    const override = await approveFxOverride(req.params.id, req.user?.id || null);
    await notifyFxRuntimeUpdate(req.app, {
      fx: {
        action: 'override_approved',
        overrideId: override.id
      }
    });
    return res.json({ success: true, data: override });
  } catch (error) {
    return handleError(res, error, 'Failed to approve FX override');
  }
});

export default router;
