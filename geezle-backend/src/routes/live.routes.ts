import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  acceptLiveInvite,
  createLiveSession,
  endLiveSession,
  getLiveSession,
  getMyLiveSessions,
  inviteLiveParticipant,
  reactLiveSession,
  reportLiveSession,
  sendLiveGift,
  startLiveSession
} from '../controllers/live.controller';

const router = express.Router();

router.post('/sessions', authMiddleware, createLiveSession);
router.post('/sessions/:id/start', authMiddleware, startLiveSession);
router.post('/sessions/:id/end', authMiddleware, endLiveSession);
router.post('/sessions/:id/invite', authMiddleware, inviteLiveParticipant);
router.post('/invites/:inviteId/accept', authMiddleware, acceptLiveInvite);
router.post('/sessions/:id/reactions', authMiddleware, reactLiveSession);
router.post('/sessions/:id/gifts', authMiddleware, sendLiveGift);
router.post('/sessions/:id/report', authMiddleware, reportLiveSession);
router.get('/sessions/:id', authMiddleware, getLiveSession);
router.get('/me', authMiddleware, getMyLiveSessions);

export default router;
