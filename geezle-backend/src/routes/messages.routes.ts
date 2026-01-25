import express from 'express';
import {
  listConversations,
  getConversation,
  createConversation,
  postMessage,
  markRead,
  toggleReaction,
  deleteMessage
} from '../controllers/messages.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

router.get('/conversations', authMiddleware, listConversations);
router.get('/conversations/:id', authMiddleware, getConversation);
router.post('/conversations', authMiddleware, createConversation);
router.post('/conversations/:id/messages', authMiddleware, postMessage);
router.post('/conversations/:id/read', authMiddleware, markRead);
router.post('/conversations/:id/messages/:messageId/reactions', authMiddleware, toggleReaction);
router.delete('/conversations/:id/messages/:messageId', authMiddleware, deleteMessage);

export default router;
