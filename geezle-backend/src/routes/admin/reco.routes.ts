import express from 'express';
import {
  createAdminRecoRuleController,
  deleteAdminRecoRuleController,
  getAdminRecoAnalyticsController,
  getAdminRecoAuditController,
  getAdminRecoConfigController,
  listAdminRecoRulesController,
  updateAdminRecoConfigController,
  updateAdminRecoRuleController
} from '../../controllers/admin.reco.controller';

const router = express.Router();

router.get('/config', getAdminRecoConfigController);
router.put('/config', updateAdminRecoConfigController);
router.get('/rules', listAdminRecoRulesController);
router.post('/rules', createAdminRecoRuleController);
router.put('/rules/:id', updateAdminRecoRuleController);
router.delete('/rules/:id', deleteAdminRecoRuleController);
router.get('/audit', getAdminRecoAuditController);
router.get('/analytics', getAdminRecoAnalyticsController);

export default router;
