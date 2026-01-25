import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';
import {
  createReview,
  getUserReviews,
  getMyReviews,
  getPendingReviews,
  updateReview,
  adminListReviews,
  adminUpdateReviewStatus
} from '../controllers/reviews.controller';

const router = express.Router();

router.post('/', authMiddleware, createReview);
router.get('/users/:id', getUserReviews);
router.get('/me', authMiddleware, getMyReviews);
router.get('/me/pending', authMiddleware, getPendingReviews);
router.patch('/:id', authMiddleware, updateReview);

router.get('/admin/all', authMiddleware, adminMiddleware, adminListReviews);
router.patch('/admin/:id/status', authMiddleware, adminMiddleware, adminUpdateReviewStatus);

export default router;
