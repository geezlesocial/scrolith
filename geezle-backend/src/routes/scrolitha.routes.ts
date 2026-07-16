import express from 'express';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware';
import {
  scrolithaChatController,
  scrolithaContextualAskController,
  scrolithaContextualRetryController,
  scrolithaContextualStatusController,
  scrolithaContextualSuggestionsController,
  scrolithaExecuteController,
  scrolithaFeedbackController,
  scrolithaHistoryController,
  scrolithaAnalyticsController,
  scrolithaDeepSearchController,
  scrolithaDiagnosticsController,
  scrolithaHealthController,
  scrolithaIntelligenceAskController,
  scrolithaIntelligenceDismissController,
  scrolithaIntelligenceSessionController,
  scrolithaKnowledgeController,
  scrolithaModerationAssistController,
  scrolithaNetworkStatusController,
  scrolithaOsAskController,
  scrolithaOsBootstrapController,
  scrolithaOsCancelController,
  scrolithaPlatformIdentityController,
  scrolithaRolloutController,
  scrolithaRecordsController,
  scrolithaSkillsListController,
  scrolithaWidgetConfigController,
  scrolithaWorkOsPlanController,
  scrolithaPrivacyGetController,
  scrolithaPrivacyUpdateController,
  scrolithaMemorySummaryController,
  scrolithaMemoryClearController,
  scrolithaLearningSignalController,
  scrolithaTrustAssessController,
  scrolithaLearningSnapshotController
} from '../controllers/scrolitha.controller';
import {
  scrolithaCommentSuggestionsController,
  scrolithaGigImproveController,
  scrolithaHashtagsController,
  scrolithaJobImproveController,
  scrolithaProposalDraftController,
  scrolithaRewriteController,
  scrolithaToxicityCheckController
} from '../modules/scrolitha/admin/scrolitha.tasks.controller';

const router = express.Router();

// Optional auth so approved internal accounts can receive enabled=true; others stay dark.
router.get('/widget-config', optionalAuthMiddleware, scrolithaWidgetConfigController);
router.get('/platform-identity', scrolithaPlatformIdentityController);

router.use(authMiddleware);

router.post('/chat', scrolithaChatController);
router.post('/execute', scrolithaExecuteController);
router.post('/work-os/plan', scrolithaWorkOsPlanController);
router.post('/rewrite', scrolithaRewriteController);
router.post('/hashtags', scrolithaHashtagsController);
router.post('/comment-suggestions', scrolithaCommentSuggestionsController);
router.post('/proposal-draft', scrolithaProposalDraftController);
router.post('/gig-improve', scrolithaGigImproveController);
router.post('/job-improve', scrolithaJobImproveController);
router.post('/toxicity-check', scrolithaToxicityCheckController);
router.get('/history', scrolithaHistoryController);
router.get('/records', scrolithaRecordsController);
router.get('/knowledge', scrolithaKnowledgeController);
router.post('/feedback', scrolithaFeedbackController);
router.post('/contextual/ask', scrolithaContextualAskController);
router.get('/contextual/status', scrolithaContextualStatusController);
router.post('/contextual/retry', scrolithaContextualRetryController);
router.get('/contextual/suggestions', scrolithaContextualSuggestionsController);
router.post('/intelligence/ask', scrolithaIntelligenceAskController);
router.get('/intelligence/session', scrolithaIntelligenceSessionController);
router.post('/intelligence/dismiss', scrolithaIntelligenceDismissController);
router.get('/intelligence/skills', scrolithaSkillsListController);
router.get('/intelligence/network-status', scrolithaNetworkStatusController);
router.get('/intelligence/analytics', scrolithaAnalyticsController);
router.get('/intelligence/diagnostics', scrolithaDiagnosticsController);
router.get('/intelligence/health', scrolithaHealthController);
router.get('/intelligence/rollout', scrolithaRolloutController);
router.post('/os/bootstrap', scrolithaOsBootstrapController);
router.post('/os/ask', scrolithaOsAskController);
router.post('/os/cancel', scrolithaOsCancelController);
router.post('/intelligence/search', scrolithaDeepSearchController);
router.post('/moderation/assist', scrolithaModerationAssistController);

// Phase 7.7 — trust, memory, personalization, learning
router.get('/privacy', scrolithaPrivacyGetController);
router.put('/privacy', scrolithaPrivacyUpdateController);
router.get('/memory', scrolithaMemorySummaryController);
router.post('/memory/clear', scrolithaMemoryClearController);
router.post('/learning/signal', scrolithaLearningSignalController);
router.get('/learning/snapshot', scrolithaLearningSnapshotController);
router.post('/trust/assess', scrolithaTrustAssessController);

export default router;
