import express from 'express';
import {
  getAdminHiringRecommendationAnalyticsController,
  getAdminHiringRecommendationConfigController,
  resetAdminHiringRecommendationConfigController,
  setAdminHiringRecommendationEnabledController,
  updateAdminHiringRecommendationConfigController
} from '../../controllers/admin.hiringRecommendation.controller';

const router = express.Router();
router.get('/', getAdminHiringRecommendationConfigController);
router.get('/analytics', getAdminHiringRecommendationAnalyticsController);
router.put('/', updateAdminHiringRecommendationConfigController);
router.post('/reset', resetAdminHiringRecommendationConfigController);
router.post('/:state', setAdminHiringRecommendationEnabledController);

export default router;
