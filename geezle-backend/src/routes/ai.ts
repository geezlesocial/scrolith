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
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware';
// Phase 33.0 — foundation endpoints (additive; legacy handlers preserved)
import scrolithaAiFoundationRoutes from './scrolithaAi.routes';

const router = express.Router();

// Health check (no auth)
router.get('/health', (_req, res) => {
  res.json({ success: true, service: 'ai', phase33: true });
});

router.get('/config', getAIConfig);
router.post('/answer', optionalAuthMiddleware, answerQuestion);
router.post('/guide', optionalAuthMiddleware, generateGuide);
router.post('/scrolitha-answer', optionalAuthMiddleware, answerQuestionWithScrolitha);
router.post('/scrolitha-guide', optionalAuthMiddleware, generateGuideWithScrolitha);
router.post('/support-chat', optionalAuthMiddleware, supportChat);
router.post('/post-enhance', authMiddleware, postEnhance);
router.post('/post-insight', authMiddleware, postInsight);

// Phase 33.0 foundation: /status, /preferences, /usage, /history, /summarize, /rewrite
router.use(scrolithaAiFoundationRoutes);

export default router;
