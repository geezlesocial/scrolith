import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  scrolithaChatController,
  scrolithaExecuteController,
  scrolithaFeedbackController,
  scrolithaHistoryController
} from '../controllers/scrolitha.controller';

const router = express.Router();

router.use(authMiddleware);

router.post('/chat', scrolithaChatController);
router.post('/execute', scrolithaExecuteController);
router.get('/history', scrolithaHistoryController);
router.post('/feedback', scrolithaFeedbackController);

export default router;
