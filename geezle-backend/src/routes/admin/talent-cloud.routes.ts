import express from 'express';
import { requirePermission } from '../../middleware/rbac.middleware';
import {
  createApiCredential,
  getTalentCloudSettings,
  getTalentCloudSummary,
  listApiCredentials,
  listIntegrationEndpoints,
  listTalentPools,
  listVendorRequirements,
  listWebhookDeliveries,
  retryWebhookDelivery,
  saveIntegrationEndpoint,
  savePrivateAccessRule,
  saveTalentPool,
  saveTalentPoolMember,
  saveVendorRequirement,
  updateTalentCloudSettings
} from '../../services/talentCloud.service';
import { recordGovernedAdminAction } from '../../services/enterpriseGovernance.service';

const router = express.Router();

const handleError = (res: express.Response, error: any, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const lower = String(message || '').toLowerCase();
  const status =
    lower.includes('not found') ? 404 :
    lower.includes('required') || lower.includes('invalid') ? 400 :
    500;
  if (status >= 500) console.error('[talent-cloud] request failed', error);
  return res.status(status).json({ success: false, error: message || fallback, code: status === 500 ? 'ERR_INTERNAL' : 'VALIDATION_ERROR' });
};

const emitEvent = (req: express.Request, event: string, payload: Record<string, any>) => {
  const io = req.app.get('io');
  io?.emit?.(event, payload);
};

router.get('/settings', requirePermission('talent_cloud.read'), async (_req, res) => {
  try {
    return res.json({ success: true, data: await getTalentCloudSettings() });
  } catch (error) {
    return handleError(res, error, 'Failed to load talent cloud settings');
  }
});

router.put('/settings', requirePermission('talent_cloud.manage'), async (req, res) => {
  try {
    const data = await updateTalentCloudSettings(req.body || {});
    await recordGovernedAdminAction(req, {
      moduleKey: 'talent_cloud',
      actionKey: 'settings_update',
      entityType: 'talent_cloud_settings',
      entityId: 'talent_cloud_phase4',
      message: 'Talent cloud settings updated',
      metadata: { settings: data }
    });
    emitEvent(req, 'talent-cloud:settings_updated', { settings: data });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to update talent cloud settings');
  }
});

router.get('/summary', requirePermission('talent_cloud.read'), async (_req, res) => {
  try {
    return res.json({ success: true, data: await getTalentCloudSummary() });
  } catch (error) {
    return handleError(res, error, 'Failed to load talent cloud summary');
  }
});

router.get('/pools', requirePermission('talent_cloud.read'), async (_req, res) => {
  try {
    return res.json({ success: true, data: await listTalentPools() });
  } catch (error) {
    return handleError(res, error, 'Failed to load talent pools');
  }
});

router.post('/pools', requirePermission('talent_cloud.manage'), async (req, res) => {
  try {
    const data = await saveTalentPool(req.body || {});
    await recordGovernedAdminAction(req, {
      moduleKey: 'talent_cloud',
      actionKey: 'pool_create',
      entityType: 'talent_pool',
      entityId: data.id,
      message: `Talent pool created: ${data.name}`,
      metadata: { pool: data }
    });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to create talent pool');
  }
});

router.put('/pools/:id', requirePermission('talent_cloud.manage'), async (req, res) => {
  try {
    const data = await saveTalentPool(req.body || {}, req.params.id);
    await recordGovernedAdminAction(req, {
      moduleKey: 'talent_cloud',
      actionKey: 'pool_update',
      entityType: 'talent_pool',
      entityId: data.id,
      message: `Talent pool updated: ${data.name}`,
      metadata: { pool: data }
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to update talent pool');
  }
});

router.post('/pool-members', requirePermission('talent_cloud.manage'), async (req, res) => {
  try {
    const data = await saveTalentPoolMember({
      ...req.body,
      invitedByStaffId: req.staffContext?.staffId || req.body?.invitedByStaffId || null
    });
    await recordGovernedAdminAction(req, {
      moduleKey: 'talent_cloud',
      actionKey: 'member_upsert',
      entityType: 'talent_pool_member',
      entityId: data.id,
      message: 'Talent pool membership updated',
      metadata: { member: data }
    });
    emitEvent(req, 'talent-cloud:membership_updated', { poolId: data.poolId, userId: data.userId, status: data.status });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to update talent pool membership');
  }
});

router.post('/access-rules', requirePermission('talent_cloud.manage'), async (req, res) => {
  try {
    const data = await savePrivateAccessRule(req.body || {});
    await recordGovernedAdminAction(req, {
      moduleKey: 'talent_cloud',
      actionKey: 'access_rule_upsert',
      entityType: 'private_opportunity_access',
      entityId: data.id,
      message: 'Private opportunity access rule saved',
      metadata: { accessRule: data }
    });
    emitEvent(req, 'talent-cloud:access_updated', { entityType: data.entityType, entityId: data.entityId, poolId: data.poolId });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to save access rule');
  }
});

router.get('/vendor-requirements', requirePermission('talent_cloud.read'), async (_req, res) => {
  try {
    return res.json({ success: true, data: await listVendorRequirements() });
  } catch (error) {
    return handleError(res, error, 'Failed to load vendor requirements');
  }
});

router.post('/vendor-requirements', requirePermission('talent_cloud.manage'), async (req, res) => {
  try {
    const data = await saveVendorRequirement(req.body || {});
    await recordGovernedAdminAction(req, {
      moduleKey: 'talent_cloud',
      actionKey: 'vendor_requirement_create',
      entityType: 'vendor_requirement',
      entityId: data.id,
      message: `Vendor requirement created: ${data.code}`,
      metadata: { vendorRequirement: data }
    });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to create vendor requirement');
  }
});

router.put('/vendor-requirements/:id', requirePermission('talent_cloud.manage'), async (req, res) => {
  try {
    const data = await saveVendorRequirement(req.body || {}, req.params.id);
    await recordGovernedAdminAction(req, {
      moduleKey: 'talent_cloud',
      actionKey: 'vendor_requirement_update',
      entityType: 'vendor_requirement',
      entityId: data.id,
      message: `Vendor requirement updated: ${data.code}`,
      metadata: { vendorRequirement: data }
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to update vendor requirement');
  }
});

router.get('/integrations', requirePermission('integrations.read'), async (_req, res) => {
  try {
    return res.json({ success: true, data: await listIntegrationEndpoints() });
  } catch (error) {
    return handleError(res, error, 'Failed to load integrations');
  }
});

router.post('/integrations', requirePermission('integrations.manage'), async (req, res) => {
  try {
    const data = await saveIntegrationEndpoint(req.body || {});
    await recordGovernedAdminAction(req, {
      moduleKey: 'integrations',
      actionKey: 'integration_create',
      entityType: 'integration_endpoint',
      entityId: data.id,
      message: `Integration endpoint created: ${data.name}`,
      metadata: { integration: { ...data, secretPlain: undefined } }
    });
    emitEvent(req, 'integrations:webhook_updated', { endpointId: data.id, status: data.status });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to create integration endpoint');
  }
});

router.put('/integrations/:id', requirePermission('integrations.manage'), async (req, res) => {
  try {
    const data = await saveIntegrationEndpoint(req.body || {}, req.params.id);
    await recordGovernedAdminAction(req, {
      moduleKey: 'integrations',
      actionKey: 'integration_update',
      entityType: 'integration_endpoint',
      entityId: data.id,
      message: `Integration endpoint updated: ${data.name}`,
      metadata: { integration: { ...data, secretPlain: undefined } }
    });
    emitEvent(req, 'integrations:webhook_updated', { endpointId: data.id, status: data.status });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to update integration endpoint');
  }
});

router.get('/webhook-deliveries', requirePermission('webhooks.read'), async (_req, res) => {
  try {
    return res.json({ success: true, data: await listWebhookDeliveries() });
  } catch (error) {
    return handleError(res, error, 'Failed to load webhook deliveries');
  }
});

router.post('/webhook-deliveries/:id/retry', requirePermission('webhooks.manage'), async (req, res) => {
  try {
    const data = await retryWebhookDelivery(req.params.id);
    await recordGovernedAdminAction(req, {
      moduleKey: 'integrations',
      actionKey: 'webhook_retry',
      entityType: 'webhook_delivery',
      entityId: data.id,
      message: 'Webhook delivery retry queued',
      metadata: { webhookDelivery: data }
    });
    emitEvent(req, 'integrations:webhook_updated', { deliveryId: data.id, status: data.status, attempts: data.attempts });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to retry webhook delivery');
  }
});

router.get('/api-keys', requirePermission('api_keys.read'), async (_req, res) => {
  try {
    return res.json({ success: true, data: await listApiCredentials() });
  } catch (error) {
    return handleError(res, error, 'Failed to load API credentials');
  }
});

router.post('/api-keys', requirePermission('api_keys.manage'), async (req, res) => {
  try {
    const data = await createApiCredential(req.body || {});
    const record = data?.record || data;
    await recordGovernedAdminAction(req, {
      moduleKey: 'integrations',
      actionKey: 'api_key_create',
      entityType: 'api_credential',
      entityId: record.id,
      message: `API credential created: ${record.name}`,
      metadata: { apiCredential: { ...record, plainKey: undefined } }
    });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to create API credential');
  }
});

export default router;
