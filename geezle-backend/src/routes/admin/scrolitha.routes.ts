import express from 'express';
import {
  getAdminScrolithaChatRecordsController,
  getAdminScrolithaLearningInsightsController,
  deleteAdminScrolithaPostInsightsController,
  deleteAdminScrolithaSkillController,
  getAdminScrolithaAnalyticsController,
  getAdminScrolithaAuditController,
  getAdminScrolithaHealthController,
  getAdminScrolithaModelsController,
  getAdminScrolithaConfigController,
  getAdminScrolithaLogsController,
  getAdminScrolithaSettingsController,
  getAdminScrolithaSkillsController,
  getAdminScrolithaToolsController,
  postAdminScrolithaKnowledgeReindexController,
  postAdminScrolithaPoliciesUpdateController,
  postAdminScrolithaRegenerateInsightsController,
  postAdminScrolithaChatController,
  postAdminScrolithaExecuteController,
  postAdminScrolithaSkillController,
  putAdminScrolithaConfigController,
  putAdminScrolithaSettingsController,
  putAdminScrolithaSkillController
} from '../../controllers/admin.scrolitha.controller';

const router = express.Router();

router.get('/config', getAdminScrolithaConfigController);
router.put('/config', putAdminScrolithaConfigController);
router.get('/settings', getAdminScrolithaSettingsController);
router.put('/settings', putAdminScrolithaSettingsController);
router.get('/health', getAdminScrolithaHealthController);
router.get('/models', getAdminScrolithaModelsController);
router.post('/chat', postAdminScrolithaChatController);
router.post('/execute', postAdminScrolithaExecuteController);
router.get('/skills', getAdminScrolithaSkillsController);
router.post('/skills', postAdminScrolithaSkillController);
router.put('/skills/:id', putAdminScrolithaSkillController);
router.delete('/skills/:id', deleteAdminScrolithaSkillController);
router.get('/audit', getAdminScrolithaAuditController);
router.get('/logs', getAdminScrolithaLogsController);
router.get('/analytics', getAdminScrolithaAnalyticsController);
router.get('/tools', getAdminScrolithaToolsController);
router.get('/chat-records', getAdminScrolithaChatRecordsController);
router.get('/learning-insights', getAdminScrolithaLearningInsightsController);
router.post('/post-ai/regenerate-insights', postAdminScrolithaRegenerateInsightsController);
router.delete('/post-ai/insights', deleteAdminScrolithaPostInsightsController);
router.post('/knowledge/reindex', postAdminScrolithaKnowledgeReindexController);
router.post('/policies/update', postAdminScrolithaPoliciesUpdateController);

export default router;
