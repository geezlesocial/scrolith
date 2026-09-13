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
import {
  discoveryStatus,
  postFeedScores,
  getRecos,
  getDashboardRecos,
  postRecoFeedback,
  postRecommendationEvent,
  postSearchAssist,
  getMemory,
  patchMemory,
  deleteMemory,
  exportMemory,
  postLearningSignal,
  postNotificationReco
} from '../controllers/scrolithaDiscovery.controller';
import {
  getCopilotStatus,
  postCopilot,
  getSkills,
  postSkillRun,
  postIntent,
  postOrchestrate,
  getAllowlist,
  putAllowlist
} from '../controllers/scrolithaCopilot.controller';

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

// Phase 33.2 — Intelligent feed, recommendations, memory, search assist
router.get('/discovery/status', authMiddleware, discoveryStatus);
router.post('/discovery/feed-scores', authMiddleware, postFeedScores);
router.get('/discovery/recommendations', authMiddleware, getRecos);
router.get('/discovery/dashboard', authMiddleware, getDashboardRecos);
router.post('/discovery/feedback', authMiddleware, postRecoFeedback);
router.post('/discovery/events', authMiddleware, postRecommendationEvent);
router.post('/discovery/search-assist', authMiddleware, postSearchAssist);
router.get('/discovery/memory', authMiddleware, getMemory);
router.patch('/discovery/memory', authMiddleware, patchMemory);
router.delete('/discovery/memory', authMiddleware, deleteMemory);
router.get('/discovery/memory/export', authMiddleware, exportMemory);
router.post('/discovery/signals', authMiddleware, postLearningSignal);
router.post('/discovery/notifications', authMiddleware, postNotificationReco);

// Phase 33.3 — Platform Copilot, skills, native intent, tool orchestration
router.get('/copilot/status', authMiddleware, getCopilotStatus);
router.post('/copilot', authMiddleware, postCopilot);
router.get('/skills', authMiddleware, getSkills);
router.post('/skills/run', authMiddleware, postSkillRun);
router.post('/intent', authMiddleware, postIntent);
router.post('/orchestrate', authMiddleware, postOrchestrate);
router.get('/beta-allowlist', authMiddleware, getAllowlist);
router.put('/beta-allowlist', authMiddleware, putAllowlist);

export default router;
