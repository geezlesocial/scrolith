import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { idempotency } from '../middleware/idempotency';
import {
  getReactionSummary,
  getReactionSummaryBulk,
  getReactionUsers,
  upsertReaction
} from '../controllers/reactions.controller';

const router = express.Router();
const SOCIAL_WRITE_IDEMPOTENCY_TTL_MS = 2 * 60 * 1000;

router.post('/', authMiddleware, idempotency({ ttlMs: SOCIAL_WRITE_IDEMPOTENCY_TTL_MS }), upsertReaction);
router.get('/summary', authMiddleware, getReactionSummary);
router.post('/summary/bulk', authMiddleware, getReactionSummaryBulk);
router.get('/users', authMiddleware, getReactionUsers);

export default router;
