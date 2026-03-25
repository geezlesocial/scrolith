import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { idempotency } from '../middleware/idempotency';
import {
  addLiveSessionComment,
  acceptLiveInvite,
  createLiveSession,
  deleteLiveRecording,
  endLiveSession,
  getLiveFeatureStatus,
  getLiveActiveSessions,
  getLiveRuntimeConfig,
  getLiveRecording,
  getLiveSessionComments,
  getLiveSession,
  getMyLiveSessions,
  inviteLiveParticipant,
  leaveLiveSession,
  publishLiveRecording,
  reactLiveSession,
  reportLiveSession,
  saveLiveRecording,
  setLiveSessionFilter,
  sendLiveGift,
  startLiveSession,
  unpublishLiveRecording
} from '../controllers/live.controller';

const router = express.Router();
const SOCIAL_WRITE_IDEMPOTENCY_TTL_MS = 2 * 60 * 1000;

router.post('/sessions', authMiddleware, createLiveSession);
router.post('/sessions/:id/start', authMiddleware, startLiveSession);
router.post('/sessions/:id/filter', authMiddleware, setLiveSessionFilter);
router.post('/sessions/:id/end', authMiddleware, endLiveSession);
router.post('/sessions/:id/leave', authMiddleware, leaveLiveSession);
router.post('/sessions/:id/invite', authMiddleware, inviteLiveParticipant);
router.post('/invites/:inviteId/accept', authMiddleware, acceptLiveInvite);
router.post('/sessions/:id/reactions', authMiddleware, idempotency({ ttlMs: SOCIAL_WRITE_IDEMPOTENCY_TTL_MS }), reactLiveSession);
router.post('/sessions/:id/gifts', authMiddleware, sendLiveGift);
router.post('/sessions/:id/report', authMiddleware, reportLiveSession);
router.get('/feature-status', authMiddleware, getLiveFeatureStatus);
router.get('/runtime-config', authMiddleware, getLiveRuntimeConfig);
router.get('/sessions/active', authMiddleware, getLiveActiveSessions);
router.get('/sessions/:id/comments', authMiddleware, getLiveSessionComments);
router.post('/sessions/:id/comments', authMiddleware, idempotency({ ttlMs: SOCIAL_WRITE_IDEMPOTENCY_TTL_MS }), addLiveSessionComment);
router.get('/sessions/:id/recording', authMiddleware, getLiveRecording);
router.put('/sessions/:id/recording', authMiddleware, saveLiveRecording);
router.post('/sessions/:id/recording/publish', authMiddleware, publishLiveRecording);
router.post('/sessions/:id/recording/unpublish', authMiddleware, unpublishLiveRecording);
router.delete('/sessions/:id/recording', authMiddleware, deleteLiveRecording);
router.get('/sessions/:id', authMiddleware, getLiveSession);
router.get('/me', authMiddleware, getMyLiveSessions);

export default router;
