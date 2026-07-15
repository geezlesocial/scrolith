/**
 * Enterprise Search v2 routes — additive; flags default OFF.
 * Mounted at /api/search/v2
 */
import express from 'express';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware';
import {
  enterpriseSearchFeedbackController,
  enterpriseSearchHealthController,
  enterpriseSearchMetricsController,
  enterpriseSearchQueryController,
  enterpriseSearchRolloutController,
  enterpriseSearchSuggestController
} from '../controllers/enterpriseSearch.controller';

const router = express.Router();

router.get('/health', enterpriseSearchHealthController);
router.get('/rollout', enterpriseSearchRolloutController);
router.get('/metrics', enterpriseSearchMetricsController);

router.get('/query', optionalAuthMiddleware, enterpriseSearchQueryController);
router.post('/query', optionalAuthMiddleware, enterpriseSearchQueryController);

router.get('/suggest', optionalAuthMiddleware, enterpriseSearchSuggestController);

router.post('/feedback', authMiddleware, enterpriseSearchFeedbackController);

export default router;
