/**
 * Phase 33.0 — User Scrolitha AI routes.
 * Mounted at /api/ai (additive; preserves legacy /api/ai/* handlers).
 */
import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  aiStatus,
  aiGetPreferences,
  aiPatchPreferences,
  aiResetPreferences,
  aiUsage,
  aiHistory,
  aiDeleteHistory,
  aiSummarize,
  aiRewrite
} from '../controllers/scrolithaAi.controller';

const router = express.Router();

// Status available authenticated (shows flags + consent)
router.get('/status', authMiddleware, aiStatus);
router.get('/preferences', authMiddleware, aiGetPreferences);
router.patch('/preferences', authMiddleware, aiPatchPreferences);
router.post('/preferences/reset', authMiddleware, aiResetPreferences);
router.get('/usage', authMiddleware, aiUsage);
router.get('/history', authMiddleware, aiHistory);
router.delete('/history', authMiddleware, aiDeleteHistory);

// Foundation capabilities (flag + consent gated inside execute)
router.post('/summarize', authMiddleware, aiSummarize);
router.post('/rewrite', authMiddleware, aiRewrite);

export default router;
