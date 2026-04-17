import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  scrolithaChatController,
  scrolithaExecuteController,
  scrolithaFeedbackController,
  scrolithaHistoryController,
  scrolithaKnowledgeController,
  scrolithaRecordsController,
  scrolithaWidgetConfigController,
  scrolithaWorkOsPlanController
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

router.get('/widget-config', scrolithaWidgetConfigController);

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

export default router;
