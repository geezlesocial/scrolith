import express from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { postView, postLike, postShare, postRepost } from '../../controllers/community.posts.controller';

const router = express.Router();

router.post('/:id/view', authMiddleware, postView);
router.post('/:id/like', authMiddleware, postLike);
router.post('/:id/share', authMiddleware, postShare);
router.post('/:id/repost', authMiddleware, postRepost);

export default router;
