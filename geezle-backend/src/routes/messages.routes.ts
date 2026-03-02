import express from 'express';
import {
  listConversations,
  getConversation,
  createConversation,
  postMessage,
  markRead,
  markConversationUnread,
  updateConversationPreferences,
  deleteConversationForUser,
  reportBlockConversation,
  toggleReaction,
  deleteMessage,
  editMessage,
  copyMessage
} from '../controllers/messages.controller';
import { getVoiceRuntimeConfig, listVoiceCalls, postVoiceNoteMessage } from '../controllers/messenger.voice.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

router.get('/conversations', authMiddleware, listConversations);
router.get('/voice/config', authMiddleware, getVoiceRuntimeConfig);
router.get('/conversations/:id', authMiddleware, getConversation);
router.post('/conversations', authMiddleware, createConversation);
router.post('/conversations/:id/messages', authMiddleware, postMessage);
router.post('/conversations/:id/voice-notes', authMiddleware, postVoiceNoteMessage);
router.get('/conversations/:id/voice-calls', authMiddleware, listVoiceCalls);
router.post('/conversations/:id/read', authMiddleware, markRead);
router.post('/conversations/:id/unread', authMiddleware, markConversationUnread);
router.patch('/conversations/:id/preferences', authMiddleware, updateConversationPreferences);
router.post('/conversations/:id/report-block', authMiddleware, reportBlockConversation);
router.delete('/conversations/:id', authMiddleware, deleteConversationForUser);
router.post('/conversations/:id/messages/:messageId/reactions', authMiddleware, toggleReaction);
router.patch('/conversations/:id/messages/:messageId', authMiddleware, editMessage);
router.post('/conversations/:id/messages/:messageId/copy', authMiddleware, copyMessage);
router.delete('/conversations/:id/messages/:messageId', authMiddleware, deleteMessage);

export default router;
