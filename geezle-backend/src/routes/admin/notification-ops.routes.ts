/**
 * Phase 32.4 — Admin Notification Operations API
 * Mounted at /api/admin/notifications
 */
import express from 'express';
import { requirePermission } from '../../middleware/rbac.middleware';
import {
  opsOverview,
  opsDelivery,
  opsLive,
  opsAudit,
  opsDeviceHealth,
  opsQueueHealth,
  opsListRetries,
  opsEnqueueRetries,
  opsRetryOne,
  opsRetryBatch,
  opsCancelRetry,
  opsListFailures,
  opsListTemplates,
  opsGetTemplate,
  opsCreateTemplate,
  opsUpdateTemplate,
  opsPublishTemplate,
  opsRollbackTemplate,
  opsPreviewTemplate,
  opsTemplateHistory,
  opsListCampaigns,
  opsGetCampaign,
  opsCreateCampaign,
  opsUpdateCampaign,
  opsConfirmEmergency,
  opsSendCampaign,
  opsCancelCampaign,
  opsPreviewCampaign,
  opsGetFlags,
  opsPutFlags,
  opsGetRetention,
  opsPutRetention,
  opsGetSettings,
  opsPutSettings,
  opsListEngagementRules,
  opsCreateEngagementRule,
  opsUpdateEngagementRule,
  opsGetEngagementState,
  opsPutEngagementState,
  opsGetEngagementStats,
  opsPreviewEngagementRule
} from '../../controllers/notificationOps.controller';
import notificationDefaultsRoutes from './notification-defaults.routes';

const router = express.Router();
const read = requirePermission('journeys.read');
const manage = requirePermission('journeys.templates.manage');
const runManage = requirePermission('journeys.runs.manage');

// Phase 32.2 defaults (nested under same /notifications mount)
router.use(notificationDefaultsRoutes);

// Overview & analytics
router.get('/ops/overview', read, opsOverview);
router.get('/ops/delivery', read, opsDelivery);
router.get('/ops/live', read, opsLive);
router.get('/ops/audit', read, opsAudit);
router.get('/ops/devices', read, opsDeviceHealth);
router.get('/ops/queue', read, opsQueueHealth);

// Retry / failures
router.get('/ops/retries', read, opsListRetries);
router.post('/ops/retries/enqueue', runManage, opsEnqueueRetries);
router.post('/ops/retries/batch', runManage, opsRetryBatch);
router.post('/ops/retries/:id/retry', runManage, opsRetryOne);
router.post('/ops/retries/:id/cancel', runManage, opsCancelRetry);
router.get('/ops/failures', read, opsListFailures);

// Templates
router.get('/ops/templates', read, opsListTemplates);
router.get('/ops/templates/history/:key', read, opsTemplateHistory);
router.get('/ops/templates/:id', read, opsGetTemplate);
router.post('/ops/templates', manage, opsCreateTemplate);
router.patch('/ops/templates/:id', manage, opsUpdateTemplate);
router.post('/ops/templates/:id/publish', manage, opsPublishTemplate);
router.post('/ops/templates/:id/rollback', manage, opsRollbackTemplate);
router.post('/ops/templates/:id/preview', read, opsPreviewTemplate);

// Campaigns
router.get('/ops/campaigns', read, opsListCampaigns);
router.get('/ops/campaigns/:id', read, opsGetCampaign);
router.post('/ops/campaigns', runManage, opsCreateCampaign);
router.patch('/ops/campaigns/:id', runManage, opsUpdateCampaign);
router.post('/ops/campaigns/:id/confirm', runManage, opsConfirmEmergency);
router.post('/ops/campaigns/:id/send', runManage, opsSendCampaign);
router.post('/ops/campaigns/:id/cancel', runManage, opsCancelCampaign);
router.get('/ops/campaigns/:id/preview', read, opsPreviewCampaign);

// Feature flags, retention, settings
router.get('/ops/feature-flags', read, opsGetFlags);
router.put('/ops/feature-flags', manage, opsPutFlags);
router.get('/ops/retention', read, opsGetRetention);
router.put('/ops/retention', manage, opsPutRetention);
router.get('/ops/settings', read, opsGetSettings);
router.put('/ops/settings', manage, opsPutSettings);

// Phase 1 engagement milestone automation
router.get('/ops/engagement-automations/rules', read, opsListEngagementRules);
router.post('/ops/engagement-automations/rules', manage, opsCreateEngagementRule);
router.patch('/ops/engagement-automations/rules/:id', manage, opsUpdateEngagementRule);
router.get('/ops/engagement-automations/state', read, opsGetEngagementState);
router.put('/ops/engagement-automations/state', manage, opsPutEngagementState);
router.get('/ops/engagement-automations/stats', read, opsGetEngagementStats);
router.post('/ops/engagement-automations/preview', manage, opsPreviewEngagementRule);

export default router;
