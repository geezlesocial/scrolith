import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  followAuthor,
  getPostOptionsState,
  hidePost,
  markInterested,
  markNotInterested,
  reportPost,
  savePost,
  toggleNotifications,
  unfollowAuthor,
  unsavePost,
  whyThisPost
} from '../controllers/posts.options.controller';

const router = express.Router();

// All actions require auth (guest users should be prompted to login in the UI).
router.post('/:id/save', authMiddleware, savePost);
router.post('/:id/unsave', authMiddleware, unsavePost);
router.post('/:id/hide', authMiddleware, hidePost);
router.post('/:id/interested', authMiddleware, markInterested);
router.post('/:id/not-interested', authMiddleware, markNotInterested);
router.post('/:id/report', authMiddleware, reportPost);
router.post('/:id/follow-author', authMiddleware, followAuthor);
router.post('/:id/unfollow-author', authMiddleware, unfollowAuthor);
router.post('/:id/toggle-notifications', authMiddleware, toggleNotifications);
router.get('/:id/options-state', authMiddleware, getPostOptionsState);
router.get('/:id/why-this-post', authMiddleware, whyThisPost);

export default router;
