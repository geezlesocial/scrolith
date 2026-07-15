import express from 'express';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware';
import {
  discoveryRecommendController,
  discoveryFeedbackController,
  discoveryRolloutController,
  discoveryMetricsController
} from '../controllers/discoveryEngine.controller';

const router = express.Router();

/** Unified recommendations — auth optional (anonymous gets generic/empty when master off). */
router.get('/recommend', optionalAuthMiddleware, discoveryRecommendController);
router.post('/recommend', optionalAuthMiddleware, discoveryRecommendController);

/** Feedback / impressions require auth */
router.post('/feedback', authMiddleware, discoveryFeedbackController);

/** Staff-only ops */
router.get('/rollout', authMiddleware, discoveryRolloutController);
router.get('/metrics', authMiddleware, discoveryMetricsController);

export default router;
