import express from 'express';
import { requirePermission, resolveStaffContext } from '../../middleware/rbac.middleware';
import {
  createUserPermissionOverride,
  deactivatePolicyRule,
  deactivateUserPermissionOverride,
  getPolicyCatalog,
  getPolicySummary,
  getUserPermissionOverrides,
  listPolicyRules,
  savePolicyRule,
  updateUserPermissionOverride
} from '../../services/policy.service';
import { recordGovernedAdminAction } from '../../services/enterpriseGovernance.service';

const router = express.Router();

const asBoolean = (value: unknown) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return undefined;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return undefined;
};

const emitPolicyUpdated = (req: express.Request, payload: Record<string, any>) => {
  const io = req.app.get('io');
  const communityIo = req.app.get('communityIo');
  io?.emit('policy:updated', payload);
  communityIo?.emit('policy:updated', payload);
};

const emitUserPermissionsUpdated = (req: express.Request, payload: Record<string, any>) => {
  const io = req.app.get('io');
  const communityIo = req.app.get('communityIo');
  io?.emit('permissions:user_updated', payload);
  communityIo?.emit('permissions:user_updated', payload);
};

const getStaffId = async (req: express.Request) => {
  const context = await resolveStaffContext(req);
  return context?.staffId || null;
};

const handlePolicyError = (res: express.Response, error: unknown, fallbackMessage: string) => {
  if (error instanceof Error) {
    const message = error.message || fallbackMessage;
    if (message.toLowerCase().includes('not found')) {
      return res.status(404).json({ success: false, error: message, code: 'NOT_FOUND' });
    }
    if (message.toLowerCase().includes('required')) {
      return res.status(400).json({ success: false, error: message, code: 'VALIDATION_ERROR' });
    }
  }
  const knownError = error as { code?: string } | null;
  if (knownError?.code === 'P2002') {
    return res.status(409).json({ success: false, error: 'A record with that key already exists', code: 'CONFLICT' });
  }
  console.error('[policies] request failed', error);
  return res.status(500).json({ success: false, error: fallbackMessage, code: 'ERR_INTERNAL' });
};

router.get('/summary', requirePermission('policies.read'), async (_req, res) => {
  try {
    const summary = await getPolicySummary();
    return res.json({ success: true, data: summary });
  } catch (error) {
    return handlePolicyError(res, error, 'Failed to load policy summary');
  }
});

router.get('/catalog', requirePermission('policies.read'), async (_req, res) => {
  try {
    const catalog = await getPolicyCatalog();
    return res.json({ success: true, data: catalog });
  } catch (error) {
    return handlePolicyError(res, error, 'Failed to load policy catalog');
  }
});

router.get('/rules', requirePermission('policies.read'), async (req, res) => {
  try {
    const rules = await listPolicyRules({
      namespaceKey: String(req.query.namespaceKey || ''),
      resourceKey: String(req.query.resourceKey || ''),
      permissionKey: String(req.query.permissionKey || ''),
      query: String(req.query.query || ''),
      activeOnly: asBoolean(req.query.activeOnly)
    });
    return res.json({ success: true, data: rules });
  } catch (error) {
    return handlePolicyError(res, error, 'Failed to load policy rules');
  }
});

router.post('/rules', requirePermission('policies.rules.create'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const rule = await savePolicyRule(req.body || {}, staffId);
    await recordGovernedAdminAction(req, {
      moduleKey: 'policies',
      actionKey: 'rule_create',
      entityType: 'policy_rule',
      entityId: rule.id,
      message: `Policy rule created: ${rule.permissionKey}`,
      metadata: { rule }
    });
    emitPolicyUpdated(req, {
      action: 'rule_created',
      ruleId: rule.id,
      namespaceKey: rule.namespaceKey,
      resourceKey: rule.resourceKey,
      permissionKey: rule.permissionKey
    });
    return res.status(201).json({ success: true, data: rule });
  } catch (error) {
    return handlePolicyError(res, error, 'Failed to create policy rule');
  }
});

router.put('/rules/:id', requirePermission('policies.rules.update'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const rule = await savePolicyRule({ ...(req.body || {}), id: req.params.id }, staffId);
    await recordGovernedAdminAction(req, {
      moduleKey: 'policies',
      actionKey: 'rule_update',
      entityType: 'policy_rule',
      entityId: rule.id,
      message: `Policy rule updated: ${rule.permissionKey}`,
      metadata: { rule }
    });
    emitPolicyUpdated(req, {
      action: 'rule_updated',
      ruleId: rule.id,
      namespaceKey: rule.namespaceKey,
      resourceKey: rule.resourceKey,
      permissionKey: rule.permissionKey
    });
    return res.json({ success: true, data: rule });
  } catch (error) {
    return handlePolicyError(res, error, 'Failed to update policy rule');
  }
});

router.delete('/rules/:id', requirePermission('policies.rules.delete'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const rule = await deactivatePolicyRule(req.params.id, staffId);
    await recordGovernedAdminAction(req, {
      moduleKey: 'policies',
      actionKey: 'rule_deactivate',
      entityType: 'policy_rule',
      entityId: rule.id,
      message: `Policy rule deactivated: ${rule.permissionKey}`,
      metadata: { rule }
    });
    emitPolicyUpdated(req, {
      action: 'rule_deactivated',
      ruleId: rule.id,
      namespaceKey: rule.namespaceKey,
      resourceKey: rule.resourceKey,
      permissionKey: rule.permissionKey
    });
    return res.json({ success: true, data: rule });
  } catch (error) {
    return handlePolicyError(res, error, 'Failed to deactivate policy rule');
  }
});

router.get('/overrides', requirePermission('policies.overrides.read'), async (req, res) => {
  try {
    const identifier = String(req.query.identifier || '').trim();
    if (!identifier) {
      return res.status(400).json({ success: false, error: 'identifier is required', code: 'VALIDATION_ERROR' });
    }
    const data = await getUserPermissionOverrides(identifier);
    return res.json({ success: true, data });
  } catch (error) {
    return handlePolicyError(res, error, 'Failed to load user permission overrides');
  }
});

router.post('/overrides', requirePermission('policies.overrides.manage'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const override = await createUserPermissionOverride(req.body || {}, staffId);
    await recordGovernedAdminAction(req, {
      moduleKey: 'policies',
      actionKey: 'override_create',
      entityType: 'permission_override',
      entityId: override.id,
      message: `Permission override created: ${override.permissionKey}`,
      metadata: { override }
    });
    emitUserPermissionsUpdated(req, {
      action: 'override_created',
      userId: override.userId,
      permissionKey: override.permissionKey,
      overrideId: override.id
    });
    return res.status(201).json({ success: true, data: override });
  } catch (error) {
    return handlePolicyError(res, error, 'Failed to create user permission override');
  }
});

router.put('/overrides/:id', requirePermission('policies.overrides.manage'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const override = await updateUserPermissionOverride(req.params.id, req.body || {}, staffId);
    await recordGovernedAdminAction(req, {
      moduleKey: 'policies',
      actionKey: 'override_update',
      entityType: 'permission_override',
      entityId: override.id,
      message: `Permission override updated: ${override.permissionKey}`,
      metadata: { override }
    });
    emitUserPermissionsUpdated(req, {
      action: 'override_updated',
      userId: override.userId,
      permissionKey: override.permissionKey,
      overrideId: override.id
    });
    return res.json({ success: true, data: override });
  } catch (error) {
    return handlePolicyError(res, error, 'Failed to update user permission override');
  }
});

router.delete('/overrides/:id', requirePermission('policies.overrides.manage'), async (req, res) => {
  try {
    const staffId = await getStaffId(req);
    const override = await deactivateUserPermissionOverride(req.params.id, staffId);
    await recordGovernedAdminAction(req, {
      moduleKey: 'policies',
      actionKey: 'override_deactivate',
      entityType: 'permission_override',
      entityId: override.id,
      message: `Permission override deactivated: ${override.permissionKey}`,
      metadata: { override }
    });
    emitUserPermissionsUpdated(req, {
      action: 'override_deactivated',
      userId: override.userId,
      permissionKey: override.permissionKey,
      overrideId: override.id
    });
    return res.json({ success: true, data: override });
  } catch (error) {
    return handlePolicyError(res, error, 'Failed to deactivate user permission override');
  }
});

export default router;
