import express from 'express';
import { getAIConfig, answerQuestion, generateGuide } from '../controllers/aiController';

const router = express.Router();

// Health check (no auth)
router.get('/health', (_req, res) => {
  res.json({ success: true, service: 'ai' });
});

router.get('/config', getAIConfig);
router.post('/answer', answerQuestion);
router.post('/guide', generateGuide);

export default router;
