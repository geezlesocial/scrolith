import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  changeUserPassword,
  getUserBasics,
  getUserByUsername,
  getUserProfile,
  logProfileView,
  listProfileViewers,
  listProfilesViewed,
  getUserSettings,
  checkUsernameAvailability,
  updateUserBasics,
  updateUserProfile,
  updateUserSettings
} from '../controllers/userController';
import { followUser, unfollowUser, listFollowers, listFollowing } from '../controllers/social.controller';

const router = express.Router();

// Health check (no auth)
router.get('/health', (_req, res) => {
  res.json({ success: true, service: 'users' });
});

// Username routes (public)
router.get('/username/availability/:username', checkUsernameAvailability);
router.get('/username/:username', getUserByUsername);

router.get('/:userId/profile', getUserProfile);
router.put('/:userId/profile', authMiddleware, updateUserProfile);
router.post('/:userId/views', authMiddleware, logProfileView);
router.get('/:userId/viewers', authMiddleware, listProfileViewers);
router.get('/:userId/viewing', authMiddleware, listProfilesViewed);

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
