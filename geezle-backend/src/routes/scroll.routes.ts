import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { idempotency } from '../middleware/idempotency';
import {
  createScroll,
  createScrollComment,
  updateScroll,
  updateScrollComment,
  deleteScroll,
  deleteScrollComment,
  getScrollFeed,
  getScrollComments,
  engageScroll,
  reportScroll
} from '../controllers/scroll.controller';

const router = express.Router();
const SOCIAL_WRITE_IDEMPOTENCY_TTL_MS = 2 * 60 * 1000;

router.get('/feed', authMiddleware, getScrollFeed);
router.post('/create', authMiddleware, createScroll);
router.get('/:id/comments', authMiddleware, getScrollComments);
router.put('/:id', authMiddleware, updateScroll);
router.delete('/:id', authMiddleware, deleteScroll);
router.post('/:id/engage', authMiddleware, idempotency({ ttlMs: SOCIAL_WRITE_IDEMPOTENCY_TTL_MS }), engageScroll);
router.post('/:id/report', authMiddleware, reportScroll);
router.post('/:id/comments', authMiddleware, idempotency({ ttlMs: SOCIAL_WRITE_IDEMPOTENCY_TTL_MS }), createScrollComment);
router.put('/comments/:id', authMiddleware, updateScrollComment);
router.delete('/comments/:id', authMiddleware, deleteScrollComment);

export default router;
