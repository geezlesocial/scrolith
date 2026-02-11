import express from 'express';
import {
  deleteAdminScrolithaSkillController,
  getAdminScrolithaAnalyticsController,
  getAdminScrolithaAuditController,
  getAdminScrolithaConfigController,
  getAdminScrolithaSkillsController,
  getAdminScrolithaToolsController,
  postAdminScrolithaChatController,
  postAdminScrolithaExecuteController,
  postAdminScrolithaSkillController,
  putAdminScrolithaConfigController,
  putAdminScrolithaSkillController
} from '../../controllers/admin.scrolitha.controller';

const router = express.Router();

router.get('/config', getAdminScrolithaConfigController);
router.put('/config', putAdminScrolithaConfigController);
router.post('/chat', postAdminScrolithaChatController);
router.post('/execute', postAdminScrolithaExecuteController);
router.get('/skills', getAdminScrolithaSkillsController);
router.post('/skills', postAdminScrolithaSkillController);
router.put('/skills/:id', putAdminScrolithaSkillController);
router.delete('/skills/:id', deleteAdminScrolithaSkillController);
router.get('/audit', getAdminScrolithaAuditController);
router.get('/analytics', getAdminScrolithaAnalyticsController);
router.get('/tools', getAdminScrolithaToolsController);

export default router;
