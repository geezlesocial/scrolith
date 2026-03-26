import express from 'express';
import { requirePermission, resolveStaffContext } from '../../middleware/rbac.middleware';
import {
  deactivateFeatureRule,
  getFeatureControlSummary,
  listFeatureAudiences,
  listFeatureExposures,
  listFeatureFlagAudit,
  listFeatureFlags,
  listFeatureRules,
  resolveFeatureFlagContext,
  saveFeatureAudience,
  saveFeatureFlag,
  saveFeatureRule,
  toggleFeatureKillSwitch
} from '../../services/featureFlag.service';

const router = express.Router();

const asBoolean = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
};

const getStaffId = async (req: express.Request) => {
  const context = await resolveStaffContext(req);
  return context?.staffId || null;
};

const emitFeatureFlagsUpdated = (req: express.Request, payload: Record<string, any>) => {
  const io = req.app.get('io');
  const communityIo = req.app.get('communityIo');
  io?.emit('feature_flags:updated', payload);
  communityIo?.emit('feature_flags:updated', payload);
};

const emitKillSwitchToggled = (req: express.Request, payload: Record<string, any>) => {
  const io = req.app.get('io');
  const communityIo = req.app.get('communityIo');
  io?.emit('feature_flags:kill_switch_toggled', payload);
  communityIo?.emit('feature_flags:kill_switch_toggled', payload);
};

const handleFeatureFlagError = (res: express.Response, error: unknown, fallbackMessage: string) => {
  if (error instanceof Error) {
    const message = error.message || fallbackMessage;
    if (message.toLowerCase().includes('not found')) {
      return res.status(404).json({ success: false, error: message, code: 'NOT_FOUND' });
    }
    if (message.toLowerCase().includes('required')) {
      return res.status(400).json({ success: false, error: message, code: 'VALIDATION_ERROR' });
    }
  }
  const prismaError = error as { code?: string } | null;
  if (prismaError?.code === 'P2002') {
    return res.status(409).json({ success: false, error: 'A record with that key already exists', code: 'CONFLICT' });
  }
  console.error('[feature-control] request failed', error);
  return res.status(500).json({ success: false, error: fallbackMessage, code: 'ERR_INTERNAL' });
};

router.get('/summary', requirePermission('feature_flags.read'), async (_req, res) => {
  try {
    const summary = await getFeatureControlSummary();
    return res.json({ success: true, data: summary });
  } catch (error) {
    return handleFeatureFlagError(res, error, 'Failed to load feature control summary');
  }
});

router.get('/flags', requirePermission('feature_flags.read'), async (req, res) => {
  try {
    const flags = await listFeatureFlags({
      query: String(req.query.query || ''),
      category: String(req.query.category || ''),
      activeOnly: asBoolean(req.query.activeOnly),
      killSwitch: asBoolean(req.query.killSwitch)
    });
    return res.json({ success: true, data: flags });
  } catch (error) {
    return handleFeatureFlagError(res, error, 'Failed to load feature flags');
  }
});

router.post('/flags', requirePermission('feature_flags.write'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const flag = await saveFeatureFlag(req.body || {}, staffId);
    emitFeatureFlagsUpdated(req, {
      action: 'flag_created',
      flagId: flag.id,
      flagKey: flag.key,
      category: flag.category
    });
    return res.status(201).json({ success: true, data: flag });
  } catch (error) {
    return handleFeatureFlagError(res, error, 'Failed to create feature flag');
  }
});

router.put('/flags/:id', requirePermission('feature_flags.write'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const flag = await saveFeatureFlag({ ...(req.body || {}), id: req.params.id }, staffId);
    emitFeatureFlagsUpdated(req, {
      action: 'flag_updated',
      flagId: flag.id,
      flagKey: flag.key,
      category: flag.category
    });
    return res.json({ success: true, data: flag });
  } catch (error) {
    return handleFeatureFlagError(res, error, 'Failed to update feature flag');
  }
});

router.post('/flags/:id/kill-switch', requirePermission('feature_flags.kill_switch'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const enabled = asBoolean(req.body?.enabled);
    const flag = await toggleFeatureKillSwitch(req.params.id, enabled === true, staffId);
    emitKillSwitchToggled(req, {
      action: flag.killSwitch ? 'kill_switch_enabled' : 'kill_switch_disabled',
      flagId: flag.id,
      flagKey: flag.key
    });
    return res.json({ success: true, data: flag });
  } catch (error) {
    return handleFeatureFlagError(res, error, 'Failed to toggle kill switch');
  }
});

router.get('/flags/:id/audiences', requirePermission('feature_flags.read'), async (req, res) => {
  try {
    const audiences = await listFeatureAudiences(req.params.id);
    return res.json({ success: true, data: audiences });
  } catch (error) {
    return handleFeatureFlagError(res, error, 'Failed to load feature audiences');
  }
});

router.post('/flags/:id/audiences', requirePermission('feature_flags.write'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const audience = await saveFeatureAudience(req.params.id, req.body || {}, staffId);
    emitFeatureFlagsUpdated(req, {
      action: 'audience_saved',
      flagId: req.params.id,
      audienceId: audience.id,
      audienceKey: audience.key
    });
    return res.status(201).json({ success: true, data: audience });
  } catch (error) {
    return handleFeatureFlagError(res, error, 'Failed to save feature audience');
  }
});

router.put('/audiences/:id', requirePermission('feature_flags.write'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const flagId = String(req.body?.flagId || '').trim();
    if (!flagId) {
      return res.status(400).json({ success: false, error: 'flagId is required', code: 'VALIDATION_ERROR' });
    }
    const audience = await saveFeatureAudience(flagId, { ...(req.body || {}), id: req.params.id }, staffId);
    emitFeatureFlagsUpdated(req, {
      action: 'audience_updated',
      flagId,
      audienceId: audience.id,
      audienceKey: audience.key
    });
    return res.json({ success: true, data: audience });
  } catch (error) {
    return handleFeatureFlagError(res, error, 'Failed to update feature audience');
  }
});

router.get('/flags/:id/rules', requirePermission('feature_flags.read'), async (req, res) => {
  try {
    const rules = await listFeatureRules(req.params.id);
    return res.json({ success: true, data: rules });
  } catch (error) {
    return handleFeatureFlagError(res, error, 'Failed to load feature rules');
  }
});

router.post('/flags/:id/rules', requirePermission('feature_flags.write'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const rule = await saveFeatureRule(req.params.id, req.body || {}, staffId);
    emitFeatureFlagsUpdated(req, {
      action: 'rule_saved',
      flagId: req.params.id,
      ruleId: rule.id,
      audienceId: rule.audienceId
    });
    return res.status(201).json({ success: true, data: rule });
  } catch (error) {
    return handleFeatureFlagError(res, error, 'Failed to save feature rule');
  }
});

router.put('/rules/:id', requirePermission('feature_flags.write'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const flagId = String(req.body?.flagId || '').trim();
    if (!flagId) {
      return res.status(400).json({ success: false, error: 'flagId is required', code: 'VALIDATION_ERROR' });
    }
    const rule = await saveFeatureRule(flagId, { ...(req.body || {}), id: req.params.id }, staffId);
    emitFeatureFlagsUpdated(req, {
      action: 'rule_updated',
      flagId,
      ruleId: rule.id,
      audienceId: rule.audienceId
    });
    return res.json({ success: true, data: rule });
  } catch (error) {
    return handleFeatureFlagError(res, error, 'Failed to update feature rule');
  }
});

router.delete('/rules/:id', requirePermission('feature_flags.write'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const rule = await deactivateFeatureRule(req.params.id, staffId);
    emitFeatureFlagsUpdated(req, {
      action: 'rule_deactivated',
      flagId: rule.flagId,
      ruleId: rule.id
    });
    return res.json({ success: true, data: rule });
  } catch (error) {
    return handleFeatureFlagError(res, error, 'Failed to deactivate feature rule');
  }
});

router.get('/audit', requirePermission('feature_flags.audit.read'), async (req, res) => {
  try {
    const entries = await listFeatureFlagAudit({
      flagId: String(req.query.flagId || ''),
      limit: Number(req.query.limit || 25)
    });
    return res.json({ success: true, data: entries });
  } catch (error) {
    return handleFeatureFlagError(res, error, 'Failed to load feature flag audit log');
  }
});

router.get('/exposures', requirePermission('feature_flags.audit.read'), async (req, res) => {
  try {
    const entries = await listFeatureExposures({
      flagId: String(req.query.flagId || ''),
      userId: String(req.query.userId || ''),
      sessionKey: String(req.query.sessionKey || ''),
      limit: Number(req.query.limit || 25)
    });
    return res.json({ success: true, data: entries });
  } catch (error) {
    return handleFeatureFlagError(res, error, 'Failed to load feature flag exposures');
  }
});

router.post('/resolve', requirePermission('feature_flags.audit.read'), async (req, res) => {
  try {
    const result = await resolveFeatureFlagContext(req.body || {});
    return res.json({ success: true, data: result });
  } catch (error) {
    return handleFeatureFlagError(res, error, 'Failed to resolve feature flag context');
  }
});

export default router;
