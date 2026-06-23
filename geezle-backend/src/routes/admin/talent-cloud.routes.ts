import express from 'express';
import { requirePermission } from '../../middleware/rbac.middleware';
import {
  createApiCredential,
  getTalentCloudSettings,
  getTalentCloudSummary,
  listApiCredentials,
  listPrivateAccessRules,
  listInboundConnectors,
  listIntegrationEndpoints,
  listTalentPools,
  listVendorRequirements,
  listWebhookDeliveries,
  seedTalentCloudDemoExamples,
  retryWebhookDelivery,
  saveInboundConnector,
  saveIntegrationEndpoint,
  savePrivateAccessRule,
  saveTalentPool,
  saveTalentPoolMember,
  saveVendorRequirement,
  updatePrivateAccessRule,
  updateTalentCloudSettings,
  publishIntegrationEvent
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

router.post('/seed-examples', requirePermission('talent_cloud.manage'), async (req, res) => {
  try {
    const data = await seedTalentCloudDemoExamples();
    await recordGovernedAdminAction(req, {
      moduleKey: 'talent_cloud',
      actionKey: 'seed_examples',
      entityType: 'talent_cloud_seed',
      entityId: 'talent_cloud_demo_examples',
      message: 'Private Talent Cloud demo examples seeded',
      metadata: { seeded: true }
    });
    emitEvent(req, 'talent-cloud:seeded', {
      pools: Array.isArray(data?.pools) ? data.pools.length : 0,
      requirements: Array.isArray(data?.requirements) ? data.requirements.length : 0
    });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to seed talent cloud demo examples');
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
    await publishIntegrationEvent('talent_cloud.pool.created', {
      poolId: data.id,
      name: data.name,
      slug: data.slug,
      visibility: data.visibility,
      isActive: data.isActive
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
    await publishIntegrationEvent('talent_cloud.pool.updated', {
      poolId: data.id,
      name: data.name,
      slug: data.slug,
      visibility: data.visibility,
      isActive: data.isActive
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
    await publishIntegrationEvent('talent_cloud.member.updated', {
      memberId: data.id,
      poolId: data.poolId,
      userId: data.userId,
      membershipType: data.membershipType,
      status: data.status
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
    await publishIntegrationEvent('talent_cloud.access_rule.updated', {
      accessRuleId: data.id,
      entityType: data.entityType,
      entityId: data.entityId,
      poolId: data.poolId,
      visibilityScope: data.visibilityScope
    });
    emitEvent(req, 'talent-cloud:access_updated', { entityType: data.entityType, entityId: data.entityId, poolId: data.poolId });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to save access rule');
  }
});

router.get('/access-rules', requirePermission('talent_cloud.read'), async (_req, res) => {
  try {
    return res.json({ success: true, data: await listPrivateAccessRules() });
  } catch (error) {
    return handleError(res, error, 'Failed to load access rules');
  }
});

router.put('/access-rules/:id', requirePermission('talent_cloud.manage'), async (req, res) => {
  try {
    const data = await updatePrivateAccessRule(req.params.id, req.body || {});
    await recordGovernedAdminAction(req, {
      moduleKey: 'talent_cloud',
      actionKey: 'access_rule_update',
      entityType: 'private_opportunity_access',
      entityId: data.id,
      message: 'Private opportunity access rule updated',
      metadata: { accessRule: data }
    });
    await publishIntegrationEvent('talent_cloud.access_rule.updated', {
      accessRuleId: data.id,
      entityType: data.entityType,
      entityId: data.entityId,
      poolId: data.poolId,
      visibilityScope: data.visibilityScope
    });
    emitEvent(req, 'talent-cloud:access_updated', { entityType: data.entityType, entityId: data.entityId, poolId: data.poolId });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to update access rule');
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
    await publishIntegrationEvent('talent_cloud.vendor_requirement.created', {
      requirementId: data.id,
      code: data.code,
      name: data.name,
      isActive: data.isActive
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
    await publishIntegrationEvent('talent_cloud.vendor_requirement.updated', {
      requirementId: data.id,
      code: data.code,
      name: data.name,
      isActive: data.isActive
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

router.get('/connectors', requirePermission('integrations.read'), async (_req, res) => {
  try {
    return res.json({ success: true, data: await listInboundConnectors() });
  } catch (error) {
    return handleError(res, error, 'Failed to load inbound connectors');
  }
});

router.post('/connectors', requirePermission('integrations.manage'), async (req, res) => {
  try {
    const data = await saveInboundConnector(req.body || {});
    await recordGovernedAdminAction(req, {
      moduleKey: 'integrations',
      actionKey: 'connector_create',
      entityType: 'integration_connector',
      entityId: data.id,
      message: `Inbound connector created: ${data.name}`,
      metadata: { connector: { ...data, sharedSecretPlain: undefined, apiKeyPlain: undefined } }
    });
    emitEvent(req, 'integrations:connector_updated', { connectorId: data.id, status: data.status });
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to create inbound connector');
  }
});

router.put('/connectors/:id', requirePermission('integrations.manage'), async (req, res) => {
  try {
    const data = await saveInboundConnector(req.body || {}, req.params.id);
    await recordGovernedAdminAction(req, {
      moduleKey: 'integrations',
      actionKey: 'connector_update',
      entityType: 'integration_connector',
      entityId: data.id,
      message: `Inbound connector updated: ${data.name}`,
      metadata: { connector: { ...data, sharedSecretPlain: undefined, apiKeyPlain: undefined } }
    });
    emitEvent(req, 'integrations:connector_updated', { connectorId: data.id, status: data.status });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to update inbound connector');
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
