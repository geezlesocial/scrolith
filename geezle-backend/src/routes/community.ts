import express from 'express';
import {
  getThreads,
  getThreadById,
  createThread,
  getComments,
  postComment,
  toggleLike,
  toggleThreadPin,
  toggleThreadLock,
  deleteThread,
  deleteComment,
  getPosts,
  getPostById,
  createPost,
  updatePost,
  deletePost
} from '../controllers/community.controller';
import {
  getCommunitySettings,
  updateCommunitySettings,
  toggleCommunitySetting
} from '../controllers/community.settings.controller';
import {
  getCommunityAnalytics,
  getModerationLogs,
  getChannels,
  createChannel,
  deleteChannel,
  joinChannel,
  leaveChannel,
  getChannelMessages,
  postChannelMessage,
  getClubs,
  joinClub,
  leaveClub,
  getEvents,
  registerEvent,
  unregisterEvent,
  getTopContributors,
  getLeaderboard,
  toggleRepost,
  moderateContent
} from '../controllers/community.extras.controller';
import {
  createAdDraft,
  payAd,
  submitAd,
  getMyAds,
  getAdPerformance,
  getReviewQueue,
  approveAd,
  rejectAd,
  pauseAd,
  resumeAd,
  getAdsAnalytics
  ,getAd, updateAd, getAllCampaigns
} from '../controllers/community.ads.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';

const router = express.Router();

// Public routes
router.get('/threads', getThreads);
router.get('/threads/:id', getThreadById);
router.get('/comments', getComments);
router.get('/analytics', authMiddleware, adminMiddleware, getCommunityAnalytics);
router.get('/channels', authMiddleware, adminMiddleware, getChannels);
router.get('/channels/:channelId/messages', authMiddleware, adminMiddleware, getChannelMessages);
router.get('/clubs', authMiddleware, adminMiddleware, getClubs);
router.get('/events', authMiddleware, adminMiddleware, getEvents);
router.get('/contributors', authMiddleware, adminMiddleware, getTopContributors);
router.get('/leaderboard', authMiddleware, adminMiddleware, getLeaderboard);
router.get('/settings', authMiddleware, adminMiddleware, getCommunitySettings);

// Protected routes (require auth)
router.post('/threads', authMiddleware, createThread);
router.post('/comments', authMiddleware, postComment);
router.post('/like', authMiddleware, toggleLike);
router.post('/repost', authMiddleware, toggleRepost);
router.post('/moderation/check', authMiddleware, moderateContent);
router.post('/settings', authMiddleware, adminMiddleware, updateCommunitySettings);
router.post('/settings/toggle', authMiddleware, adminMiddleware, toggleCommunitySetting);
router.post('/channels', authMiddleware, adminMiddleware, createChannel);
router.post('/channels/:channelId/delete', authMiddleware, adminMiddleware, deleteChannel);
router.post('/channels/:channelId/join', authMiddleware, adminMiddleware, joinChannel);
router.post('/channels/:channelId/leave', authMiddleware, adminMiddleware, leaveChannel);
router.post('/channels/:channelId/messages', authMiddleware, adminMiddleware, postChannelMessage);
router.post('/clubs/join', authMiddleware, adminMiddleware, joinClub);
router.post('/clubs/leave', authMiddleware, adminMiddleware, leaveClub);
router.post('/events/register', authMiddleware, adminMiddleware, registerEvent);
router.post('/events/unregister', authMiddleware, adminMiddleware, unregisterEvent);

// CommunityPost CRUD endpoints
router.get('/posts', getPosts); // Public: list posts (feed)
router.get('/posts/:id', getPostById); // Public: get single post
router.post('/posts', authMiddleware, createPost); // Auth: create post
router.put('/posts/:id', authMiddleware, updatePost); // Auth: update post (owner/admin/moderator)
router.delete('/posts/:id', authMiddleware, deletePost); // Auth: delete post (owner/admin/moderator)

// Post metric endpoints (Gcoin earning triggers)
router.post('/posts/:id/view', authMiddleware, async (req, res, next) => { try { const c = require('../controllers/community.controller'); return c.postView(req, res); } catch(e){ next(e); } });
router.post('/posts/:id/share', authMiddleware, async (req, res, next) => { try { const c = require('../controllers/community.controller'); return c.postShare(req, res); } catch(e){ next(e); } });
router.post('/posts/:id/repost', authMiddleware, async (req, res, next) => { try { const c = require('../controllers/community.controller'); return c.postRepost(req, res); } catch(e){ next(e); } });
router.post('/posts/:id/like', authMiddleware, async (req, res, next) => { try { const c = require('../controllers/community.controller'); return c.postLike(req, res); } catch(e){ next(e); } });
router.delete('/posts/:id/like', authMiddleware, async (req, res, next) => { try { const c = require('../controllers/community.controller'); return c.postUnlike(req, res); } catch(e){ next(e); } });

// Ads routes (community-scoped)
router.post('/ads/draft', authMiddleware, createAdDraft);
router.post('/ads/:id/pay', authMiddleware, payAd);
router.post('/ads/:id/submit', authMiddleware, submitAd);
router.put('/ads/:id', authMiddleware, updateAd);
router.get('/ads/:id', authMiddleware, getAd);
router.get('/ads/me', authMiddleware, getMyAds);
router.get('/ads/:id/performance', authMiddleware, getAdPerformance);

// Admin ads routes
router.get('/admin/ads/review-queue', authMiddleware, adminMiddleware, getReviewQueue);
router.get('/admin/ads', authMiddleware, adminMiddleware, getAllCampaigns);
router.post('/admin/ads/:id/approve', authMiddleware, adminMiddleware, approveAd);
router.post('/admin/ads/:id/reject', authMiddleware, adminMiddleware, rejectAd);
router.post('/admin/ads/:id/pause', authMiddleware, adminMiddleware, pauseAd);
router.post('/admin/ads/:id/resume', authMiddleware, adminMiddleware, resumeAd);
router.get('/admin/ads/analytics', authMiddleware, adminMiddleware, getAdsAnalytics);

// Admin/Moderator routes
router.post('/threads/:id/pin', authMiddleware, toggleThreadPin);
router.post('/threads/:id/lock', authMiddleware, toggleThreadLock);
router.post('/threads/:id/delete', authMiddleware, deleteThread);
router.post('/comments/:id/delete', authMiddleware, deleteComment);
router.get('/moderation/logs', authMiddleware, adminMiddleware, getModerationLogs);

export default router;
