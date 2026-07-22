/**
 * Phase 33.0 — Admin Scrolitha AI platform controls.
 * Mounted at /api/admin/ai
 */
import express from 'express';
import { requirePermission } from '../../middleware/rbac.middleware';
import {
  adminAIOverview,
  adminAIProviders,
  adminAIPutProvider,
  adminAITestProvider,
  adminAIModels,
  adminAIPutModel,
  adminAIPrompts,
  adminAICreatePrompt,
  adminAIUpdatePrompt,
  adminAIPublishPrompt,
  adminAIRollbackPrompt,
  adminAIUsage,
  adminAIHealth,
  adminAIAudit,
  adminAIFeatureFlags
} from '../../controllers/scrolithaAi.admin.controller';

const router = express.Router();
const read = requirePermission('journeys.read');
const manage = requirePermission('journeys.templates.manage');

router.get('/overview', read, adminAIOverview);
router.get('/providers', read, adminAIProviders);
router.put('/providers/:provider', manage, adminAIPutProvider);
router.post('/providers/:provider/test', manage, adminAITestProvider);

router.get('/models', read, adminAIModels);
router.put('/models/:modelId', manage, adminAIPutModel);

router.get('/prompts', read, adminAIPrompts);
router.post('/prompts', manage, adminAICreatePrompt);
router.put('/prompts/:promptId', manage, adminAIUpdatePrompt);
router.post('/prompts/:promptId/publish', manage, adminAIPublishPrompt);
router.post('/prompts/:promptId/rollback', manage, adminAIRollbackPrompt);

router.get('/usage', read, adminAIUsage);
router.get('/health', read, adminAIHealth);
router.get('/audit', read, adminAIAudit);
router.get('/feature-flags', read, adminAIFeatureFlags);
router.put('/feature-flags', manage, adminAIFeatureFlags);
router.put('/feature-flags/:flag', manage, adminAIFeatureFlags);

export default router;
