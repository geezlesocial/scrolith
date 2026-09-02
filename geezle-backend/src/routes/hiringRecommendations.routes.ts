import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  getHiringRecommendationController,
  postHiringRecommendationClickController,
  postHiringRecommendationDismissController,
  postHiringRecommendationImpressionController,
  postHiringRecommendationSnoozeController
} from '../controllers/hiringRecommendation.controller';

const router = express.Router();
router.use(authMiddleware);
router.get('/', getHiringRecommendationController);
router.post('/impression', postHiringRecommendationImpressionController);
router.post('/dismiss', postHiringRecommendationDismissController);
router.post('/snooze', postHiringRecommendationSnoozeController);
router.post('/click', postHiringRecommendationClickController);

export default router;
