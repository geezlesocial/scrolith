import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  changeUserPassword,
  getUserBasics,
  getUserProfile,
  getUserSettings,
  updateUserBasics,
  updateUserProfile,
  updateUserSettings
} from '../controllers/userController';
import { followUser, unfollowUser, listFollowers, listFollowing } from '../controllers/social.controller';

const router = express.Router();

router.get('/:userId/profile', getUserProfile);
router.put('/:userId/profile', authMiddleware, updateUserProfile);

router.get('/:userId/settings', authMiddleware, getUserSettings);
router.put('/:userId/settings', authMiddleware, updateUserSettings);

router.post('/:userId/password', authMiddleware, changeUserPassword);
router.put('/:userId', authMiddleware, updateUserBasics);
router.get('/:userId', getUserBasics);

// Follow / followers
router.post('/:userId/follow', authMiddleware, followUser);
router.post('/:userId/unfollow', authMiddleware, unfollowUser);
router.get('/:userId/followers', listFollowers);
router.get('/:userId/following', listFollowing);

export default router;
