import { Router } from 'express';
import {
  listConversations,
  getConversation,
  createConversation,
  postMessage,
  markRead,
  toggleReaction,
  deleteMessage
} from '../controllers/messagesController';

const router = Router();

router.get('/conversations', listConversations);
router.get('/conversations/:id', getConversation);
router.post('/conversations', createConversation);
router.post('/conversations/:id/messages', postMessage);
router.post('/conversations/:id/read', markRead);
router.post('/conversations/:id/messages/:messageId/reactions', toggleReaction);
router.delete('/conversations/:id/messages/:messageId', deleteMessage);

export default router;
