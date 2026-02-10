import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  getReactionSummary,
  getReactionSummaryBulk,
  getReactionUsers,
  upsertReaction
} from '../controllers/reactions.controller';

const router = express.Router();

router.post('/', authMiddleware, upsertReaction);
router.get('/summary', authMiddleware, getReactionSummary);
router.post('/summary/bulk', authMiddleware, getReactionSummaryBulk);
router.get('/users', authMiddleware, getReactionUsers);

export default router;
