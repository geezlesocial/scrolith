import express from 'express';
import {
  getAIConfig,
  answerQuestion,
  answerQuestionWithScrolitha,
  generateGuide,
  generateGuideWithScrolitha,
  postEnhance,
  postInsight,
  supportChat
} from '../controllers/aiController';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// Health check (no auth)
router.get('/health', (_req, res) => {
  res.json({ success: true, service: 'ai' });
});

router.get('/config', getAIConfig);
router.post('/answer', answerQuestion);
router.post('/guide', generateGuide);
router.post('/scrolitha-answer', answerQuestionWithScrolitha);
router.post('/scrolitha-guide', generateGuideWithScrolitha);
router.post('/support-chat', supportChat);
router.post('/post-enhance', authMiddleware, postEnhance);
router.post('/post-insight', authMiddleware, postInsight);

export default router;
