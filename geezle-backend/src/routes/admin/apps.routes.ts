import express from 'express';
import {
  getAdminAppCampaigns,
  getAdminAppDistributionAnalytics,
  getAdminAppDistributionConfig,
  getAdminAppDistributionEvents,
  sendAdminAppCampaign,
  updateAdminAppDistributionConfig
} from '../../controllers/apps.controller';

const router = express.Router();

router.get('/config', getAdminAppDistributionConfig);
router.put('/config', updateAdminAppDistributionConfig);
router.get('/analytics', getAdminAppDistributionAnalytics);
router.get('/events', getAdminAppDistributionEvents);
router.get('/campaigns', getAdminAppCampaigns);
router.post('/campaigns/send', sendAdminAppCampaign);

export default router;

