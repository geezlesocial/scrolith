import express from 'express';
import { adminMiddleware } from '../middleware/admin.middleware';
import { authMiddleware } from '../middleware/auth.middleware';
import createRateLimiter from '../middlewares/rateLimit';
import {
  getIntelligenceFeedbackMetricsController,
  submitIntelligenceFeedbackController
} from '../controllers/intelligenceFeedback.controller';

const router = express.Router();

const feedbackHttpLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 240,
  standardHeaders: true,
  legacyHeaders: false
});

router.use(authMiddleware);
router.post('/events', feedbackHttpLimiter, submitIntelligenceFeedbackController);
router.get('/metrics', adminMiddleware, getIntelligenceFeedbackMetricsController);

export default router;
