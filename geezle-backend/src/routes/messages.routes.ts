import express from 'express';
import { idempotency } from '../middleware/idempotency';
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
  copyMessage,
  ensureScrolithaMessagingConversation,
  postScrolithaUnifiedTurn,
  postScrolithaUnifiedTurnStream,
  searchMessages,
  listConversationAttachments,
  getConversationSecurityStatus
} from '../controllers/messages.controller';
import {
  updateGroupMeta,
  listGroupMembers,
  addGroupMembers,
  removeGroupMember,
  updateGroupMember,
  createGroupInvite,
  acceptGroupInvite,
  getMessagesAround
} from '../controllers/groupMessaging.controller';
import { getVoiceRuntimeConfig, listVoiceCalls, postVoiceNoteMessage } from '../controllers/messenger.voice.controller';
import { postConversationReceipts } from '../controllers/messageReceipts.controller';
import {
  getPresenceBatch,
  patchPresencePrivacy,
  postPresenceHeartbeat
} from '../controllers/presence.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();
const SOCIAL_WRITE_IDEMPOTENCY_TTL_MS = 2 * 60 * 1000;

// Phase 22.3 — presence (mounted under /api/messages for auth reuse; also used as /presence aliases via server)
router.post('/presence/heartbeat', authMiddleware, postPresenceHeartbeat);
router.get('/presence', authMiddleware, getPresenceBatch);
router.patch('/presence/privacy', authMiddleware, patchPresencePrivacy);

router.get('/scrolitha/ensure', authMiddleware, ensureScrolithaMessagingConversation);
router.post('/scrolitha/ensure', authMiddleware, ensureScrolithaMessagingConversation);
// Phase 20.7.1 — conversation unification + streaming
router.post('/scrolitha/turn', authMiddleware, postScrolithaUnifiedTurn);
router.post('/scrolitha/turn/stream', authMiddleware, postScrolithaUnifiedTurnStream);
// Phase 20.7.5 — Messages search (was implemented but never registered → 404)
router.get('/search', authMiddleware, searchMessages);
router.get('/conversations', authMiddleware, listConversations);
router.get('/voice/config', authMiddleware, getVoiceRuntimeConfig);
// Phase 22.2 — group invites accept (before :id routes)
router.post('/invites/:code/accept', authMiddleware, acceptGroupInvite);
router.get('/conversations/:id', authMiddleware, getConversation);
// Phase 20.7.8 — media browser + honest security status
router.get('/conversations/:id/attachments', authMiddleware, listConversationAttachments);
router.get('/conversations/:id/security', authMiddleware, getConversationSecurityStatus);
// Phase 22.2 — group management
router.patch('/conversations/:id/group', authMiddleware, updateGroupMeta);
router.get('/conversations/:id/members', authMiddleware, listGroupMembers);
router.post('/conversations/:id/members', authMiddleware, addGroupMembers);
router.patch('/conversations/:id/members/:memberUserId', authMiddleware, updateGroupMember);
router.delete('/conversations/:id/members/:memberUserId', authMiddleware, removeGroupMember);
router.post('/conversations/:id/invites', authMiddleware, createGroupInvite);
router.get('/conversations/:id/messages/around/:messageId', authMiddleware, getMessagesAround);
router.post('/conversations', authMiddleware, createConversation);
router.post('/conversations/:id/messages', authMiddleware, postMessage);
router.post('/conversations/:id/voice-notes', authMiddleware, postVoiceNoteMessage);
router.get('/conversations/:id/voice-calls', authMiddleware, listVoiceCalls);
router.post('/conversations/:id/read', authMiddleware, markRead);
// Phase 22.3 — batch delivery/read watermarks
router.post('/conversations/:id/receipts', authMiddleware, postConversationReceipts);
router.post('/conversations/:id/unread', authMiddleware, markConversationUnread);
router.patch('/conversations/:id/preferences', authMiddleware, updateConversationPreferences);
router.post('/conversations/:id/report-block', authMiddleware, reportBlockConversation);
router.delete('/conversations/:id', authMiddleware, deleteConversationForUser);
router.post('/conversations/:id/messages/:messageId/reactions', authMiddleware, idempotency({ ttlMs: SOCIAL_WRITE_IDEMPOTENCY_TTL_MS }), toggleReaction);
router.patch('/conversations/:id/messages/:messageId', authMiddleware, editMessage);
router.post('/conversations/:id/messages/:messageId/copy', authMiddleware, copyMessage);
router.delete('/conversations/:id/messages/:messageId', authMiddleware, deleteMessage);

export default router;
