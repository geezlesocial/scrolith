import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  createScroll,
  updateScroll,
  deleteScroll,
  getScrollFeed,
  engageScroll,
  reportScroll
} from '../controllers/scroll.controller';

const router = express.Router();

router.get('/feed', authMiddleware, getScrollFeed);
router.post('/create', authMiddleware, createScroll);
router.put('/:id', authMiddleware, updateScroll);
router.delete('/:id', authMiddleware, deleteScroll);
router.post('/:id/engage', authMiddleware, engageScroll);
router.post('/:id/report', authMiddleware, reportScroll);

export default router;
