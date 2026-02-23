import express from 'express';
import {
  deleteAdminAppCampaign,
  getAdminAppCampaigns,
  getAdminAppDistributionAnalytics,
  getAdminAppDistributionConfig,
  getAdminAppDistributionEvents,
  resendAdminAppCampaign,
  sendAdminAppCampaign,
  updateAdminAppCampaign,
  updateAdminAppDistributionConfig
} from '../../controllers/apps.controller';

const router = express.Router();

router.get('/config', getAdminAppDistributionConfig);
router.put('/config', updateAdminAppDistributionConfig);
router.get('/analytics', getAdminAppDistributionAnalytics);
router.get('/events', getAdminAppDistributionEvents);
router.get('/campaigns', getAdminAppCampaigns);
router.post('/campaigns/send', sendAdminAppCampaign);
router.put('/campaigns/:id', updateAdminAppCampaign);
router.delete('/campaigns/:id', deleteAdminAppCampaign);
router.post('/campaigns/:id/resend', resendAdminAppCampaign);

export default router;
