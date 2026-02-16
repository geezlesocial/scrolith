import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  scrolithaChatController,
  scrolithaExecuteController,
  scrolithaFeedbackController,
  scrolithaHistoryController,
  scrolithaKnowledgeController,
  scrolithaRecordsController,
  scrolithaWidgetConfigController
} from '../controllers/scrolitha.controller';

const router = express.Router();

router.get('/widget-config', scrolithaWidgetConfigController);

router.use(authMiddleware);

router.post('/chat', scrolithaChatController);
router.post('/execute', scrolithaExecuteController);
router.get('/history', scrolithaHistoryController);
router.get('/records', scrolithaRecordsController);
router.get('/knowledge', scrolithaKnowledgeController);
router.post('/feedback', scrolithaFeedbackController);

export default router;
