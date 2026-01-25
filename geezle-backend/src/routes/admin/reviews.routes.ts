import express from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminMiddleware } from '../../middleware/admin.middleware';
import { adminListReviews, adminUpdateReviewStatus } from '../../controllers/reviews.controller';

const router = express.Router();

router.get('/', authMiddleware, adminMiddleware, adminListReviews);
router.patch('/:id/status', authMiddleware, adminMiddleware, adminUpdateReviewStatus);

export default router;
