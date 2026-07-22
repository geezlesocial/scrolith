/**
 * Phase 33.0 + 33.1 — User Scrolitha AI routes.
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
import {
  assistantStatus,
  assistantChat,
  assistantRewrite,
  assistantComposer,
  assistantTranslate,
  assistantDraft,
  assistantSearchSuggest,
  assistantNotificationAssist,
  listConvos,
  createConvo,
  getConvo,
  patchConvo,
  deleteConvo,
  clearConvos,
  exportConvos,
  listPrompts,
  usePrompt,
  postFeedback
} from '../controllers/scrolithaAssistant.controller';

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

// Phase 33.1 — Assistant & productivity
router.get('/assistant/status', authMiddleware, assistantStatus);
router.post('/assistant/chat', authMiddleware, assistantChat);
router.post('/assistant/rewrite', authMiddleware, assistantRewrite);
router.post('/assistant/composer', authMiddleware, assistantComposer);
router.post('/assistant/translate', authMiddleware, assistantTranslate);
router.post('/assistant/draft', authMiddleware, assistantDraft);
router.post('/assistant/search-suggest', authMiddleware, assistantSearchSuggest);
router.post('/assistant/notifications', authMiddleware, assistantNotificationAssist);

router.get('/assistant/conversations', authMiddleware, listConvos);
router.post('/assistant/conversations', authMiddleware, createConvo);
router.get('/assistant/conversations/:id', authMiddleware, getConvo);
router.patch('/assistant/conversations/:id', authMiddleware, patchConvo);
router.delete('/assistant/conversations/:id', authMiddleware, deleteConvo);
router.delete('/assistant/conversations', authMiddleware, clearConvos);
router.get('/assistant/export', authMiddleware, exportConvos);

router.get('/assistant/prompts', authMiddleware, listPrompts);
router.post('/assistant/prompts/:id/use', authMiddleware, usePrompt);

router.post('/assistant/feedback', authMiddleware, postFeedback);

export default router;
