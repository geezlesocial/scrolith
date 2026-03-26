import express from 'express';
import { Prisma } from '@prisma/client';
import { normalizeRuntimeOptimizationConfig } from '../../services/runtimeOptimization.service';
import { requirePermission, resolveStaffContext } from '../../middleware/rbac.middleware';
import {
  createConfigSnapshot,
  createReleaseRollout,
  getConfigPayloadForScope,
  getConfigRollbackSummary,
  getConfigScopes,
  listConfigChanges,
  listConfigSnapshots,
  listReleaseRollouts,
  listRollbackRuns,
  rollbackConfigScope
} from '../../services/configSnapshot.service';

const router = express.Router();

const emitEvent = (req: express.Request, event: string, payload: Record<string, any>) => {
  const io = req.app.get('io');
  const communityIo = req.app.get('communityIo');
  io?.emit(event, payload);
  communityIo?.emit(event, payload);
};

const getStaffId = async (req: express.Request) => {
  const context = await resolveStaffContext(req);
  return context?.staffId || null;
};

const syncRuntimeSystemSettings = (req: express.Request, payload: any) => {
  req.app.set('runtime:systemSettings', payload);
  req.app.set('runtime:systemSettingsVersion', Date.now());
  req.app.set(
    'runtime:optimizationConfig',
    normalizeRuntimeOptimizationConfig((payload as any)?.optimization)
  );
};

const emitScopeSideEffects = (req: express.Request, scope: string, payload: any, action: string) => {
  if (scope === 'system.settings') {
    syncRuntimeSystemSettings(req, payload);
    emitEvent(req, 'settings:updated', { scope: 'system', settings: payload, action });
    return;
  }

  if (scope === 'platform.settings') {
    emitEvent(req, 'settings:updated', { scope: 'platform', settings: payload, action });
    return;
  }

  if (scope === 'homepage.guest') {
    emitEvent(req, 'homepage:guest_updated', {
      mode: action,
      updatedAt: new Date().toISOString(),
      state: payload,
      sections: Array.isArray(payload?.draft?.sections) ? payload.draft.sections : []
    });
    return;
  }

  if (scope === 'apps.distribution') {
    emitEvent(req, 'apps:config_updated', {
      action,
      config: payload,
      updatedAt: new Date().toISOString()
    });
  }
};

const handleError = (res: express.Response, error: unknown, fallbackMessage: string) => {
  if (error instanceof Error) {
    const message = error.message || fallbackMessage;
    if (message.toLowerCase().includes('not found')) {
      return res.status(404).json({ success: false, error: message, code: 'NOT_FOUND' });
    }
    if (message.toLowerCase().includes('required') || message.toLowerCase().includes('supported')) {
      return res.status(400).json({ success: false, error: message, code: 'VALIDATION_ERROR' });
    }
  }

  const prismaError = error as { code?: string } | null;
  if (error instanceof Prisma.PrismaClientKnownRequestError && prismaError?.code === 'P2002') {
    return res.status(409).json({ success: false, error: 'A record with that key already exists', code: 'CONFLICT' });
  }

  console.error('[config] request failed', error);
  return res.status(500).json({ success: false, error: fallbackMessage, code: 'ERR_INTERNAL' });
};

router.get('/summary', requirePermission('config.read'), async (_req, res) => {
  try {
    const summary = await getConfigRollbackSummary();
    return res.json({ success: true, data: summary });
  } catch (error) {
    return handleError(res, error, 'Failed to load config summary');
  }
});

router.get('/scopes', requirePermission('config.read'), async (_req, res) => {
  try {
    const scopes = await getConfigScopes();
    return res.json({ success: true, data: scopes });
  } catch (error) {
    return handleError(res, error, 'Failed to load config scopes');
  }
});

router.get('/current', requirePermission('config.read'), async (req, res) => {
  try {
    const data = await getConfigPayloadForScope(String(req.query.scope || ''));
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to load current config payload');
  }
});

router.get('/snapshots', requirePermission('config.read'), async (req, res) => {
  try {
    const rows = await listConfigSnapshots({
      scope: String(req.query.scope || ''),
      limit: Number(req.query.limit || 25)
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return handleError(res, error, 'Failed to load config snapshots');
  }
});

router.post('/snapshots', requirePermission('config.write'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const snapshot = await createConfigSnapshot(req.body || {}, staffId);
    emitEvent(req, 'config:snapshot_created', {
      action: 'snapshot_created',
      scope: snapshot.scope,
      key: snapshot.key,
      snapshotId: snapshot.id,
      version: snapshot.version
    });
    return res.status(201).json({ success: true, data: snapshot });
  } catch (error) {
    return handleError(res, error, 'Failed to create config snapshot');
  }
});

router.get('/changes', requirePermission('config.read'), async (req, res) => {
  try {
    const rows = await listConfigChanges({
      scope: String(req.query.scope || ''),
      limit: Number(req.query.limit || 25)
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return handleError(res, error, 'Failed to load config changes');
  }
});

router.get('/rollbacks', requirePermission('config.read'), async (req, res) => {
  try {
    const rows = await listRollbackRuns({
      scope: String(req.query.scope || ''),
      limit: Number(req.query.limit || 25)
    });
    return res.json({ success: true, data: rows });
  } catch (error) {
    return handleError(res, error, 'Failed to load rollback history');
  }
});

router.post('/rollback', requirePermission('config.rollback'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const actorUserId = req.user?.id || null;
    const result = await rollbackConfigScope(req.body || {}, staffId, actorUserId);
    emitScopeSideEffects(req, result.targetSnapshot.scope, result.appliedPayload, 'rollback');
    emitEvent(req, 'config:rollback_completed', {
      action: 'rollback_completed',
      scope: result.targetSnapshot.scope,
      key: result.targetSnapshot.key,
      rollbackRunId: result.rollbackRun.id,
      targetVersion: result.rollbackRun.targetVersion,
      afterVersion: result.afterSnapshot.version
    });
    return res.json({ success: true, data: result });
  } catch (error) {
    return handleError(res, error, 'Failed to rollback config scope');
  }
});

router.get('/releases', requirePermission('config.read'), async (req, res) => {
  try {
    const rows = await listReleaseRollouts(Number(req.query.limit || 25));
    return res.json({ success: true, data: rows });
  } catch (error) {
    return handleError(res, error, 'Failed to load release notes');
  }
});

router.post('/releases', requirePermission('config.write'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const release = await createReleaseRollout(req.body || {}, staffId);
    emitEvent(req, 'config:release_logged', {
      action: 'release_logged',
      scope: release.scope,
      key: release.key,
      releaseId: release.id,
      releaseKey: release.releaseKey
    });
    return res.status(201).json({ success: true, data: release });
  } catch (error) {
    return handleError(res, error, 'Failed to log release rollout');
  }
});

export default router;
