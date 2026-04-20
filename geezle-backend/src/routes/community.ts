import express from 'express';
import { idempotency } from '../middleware/idempotency';
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
  getPostTranslation,
  createPost,
  updatePost,
  deletePost,
  getFeed,
  createPostReaction,
  deletePostReaction,
  createPostComment,
  getPostComments,
  updatePostComment,
  deletePostComment,
  togglePostCommentLike,
  getCommunityTags,
  getCommunityTrendingTags,
  getCommunityPostsByTag,
  getUserMentions
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
  deleteClub,
  getEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  registerEvent,
  unregisterEvent,
  getCommunityStats,
  getTopContributors,
  getLeaderboard,
  toggleRepost,
  moderateContent
} from '../controllers/community.extras.controller';
import {
  createAdDraft,
  getPublicAds,
  payAd,
  submitAd,
  getMyAds,
  getAdPerformance,
  getReviewQueue,
  approveAd,
  rejectAd,
  pauseAd,
  resumeAd,
  getAdsAnalytics,
  getAd,
  updateAd,
  deleteAd,
  getAllCampaigns,
  recordAdImpression,
  recordAdClick,
  getAdsConfig,
  getAdsRuntimeConfig,
  updateAdsConfig
} from '../controllers/community.ads.controller';
import {
  getCommunityHomepage,
  updateCommunityHomepage
} from '../controllers/community.homepage.controller';
import {
  getStoriesFeed,
  createStory,
  deleteStory,
  viewStory,
  updateStory,
  toggleStoryLike,
  engageStory
} from '../controllers/community.stories.controller';
import {
  getStoryRepliesController,
  createStoryReplyController,
  deleteStoryReplyController
} from '../controllers/community.storyReplies.controller';
import {
  getCommunityPollsController,
  voteCommunityPollController
} from '../controllers/community.polls.controller';
import {
  getBusinessPageFeatureConfig,
  getMyBusinessPages,
  createBusinessPage,
  updateBusinessPage,
  deleteBusinessPage,
  getRecommendedBusinessPages,
  getBusinessPageBySlug,
  getBusinessPagePackages,
  getBusinessPageStorefront,
  createBusinessPagePost,
  getBusinessPageFeed,
  updateBusinessPagePackages,
  getPageMentions,
  adminListBusinessPages,
  adminUpdateBusinessPage,
  adminModerateBusinessPage,
  adminDeleteBusinessPage
} from '../controllers/community.business.controller';
import {
  createBroadcastChannel,
  createBroadcastChannelPost,
  followBroadcastChannel,
  getBroadcastChannelDiscover,
  getMyBroadcastChannels,
  unfollowBroadcastChannel,
  updateBroadcastChannel
} from '../controllers/community.broadcast.controller';
import {
  followTarget,
  unfollowTarget,
  unfollowTargetByUserId,
  followStatusBulk,
  listFollowers,
  listFollowing,
  listBusinessPageFollowing,
  followFromBusinessPage,
  unfollowFromBusinessPage,
  listMyFollowers,
  listMyFollowing,
  blockUser,
  unblockUser,
  listMyBlocks
} from '../controllers/community.follow.controller';
import {
  getReactionsConfig,
  updateReactionsConfig
} from '../controllers/community.reactions.controller';
import { takeModerationAction } from '../controllers/community.moderation.controller';
import {
  getPostReportsAdmin,
  getPostReportByIdAdmin,
  replyToPostReportAdmin,
  actionPostReportAdmin
} from '../controllers/community.reports.controller';
import {
  getAdminConfig,
  updateAdminConfig
} from '../controllers/community.admin.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';
import communityGcoinRoutes from './community/gcoin';
import adminCommunityGcoinRoutes from './admin/community/gcoin';

const router = express.Router();
const SOCIAL_WRITE_IDEMPOTENCY_TTL_MS = 2 * 60 * 1000;

// Public routes
router.get('/threads', getThreads);
router.get('/threads/:id', getThreadById);
router.get('/comments', getComments);
router.get('/feed', getFeed);
router.get('/tags/trending', getCommunityTrendingTags);
router.get('/tags/:slug/posts', getCommunityPostsByTag);
router.get('/tags', getCommunityTags);
router.get('/analytics', authMiddleware, adminMiddleware, getCommunityAnalytics);
router.get('/channels', authMiddleware, adminMiddleware, getChannels);
router.get('/channels/:channelId/messages', authMiddleware, adminMiddleware, getChannelMessages);
router.get('/clubs', authMiddleware, getClubs);
router.get('/events', authMiddleware, getEvents);
router.get('/stats', authMiddleware, getCommunityStats);
router.get('/contributors', authMiddleware, getTopContributors);
router.get('/leaderboard', authMiddleware, getLeaderboard);
router.get('/settings', authMiddleware, adminMiddleware, getCommunitySettings);
router.get('/homepage', getCommunityHomepage);
router.get('/stories/feed', authMiddleware, getStoriesFeed);
router.get('/stories/:id/replies', authMiddleware, getStoryRepliesController);
router.get('/polls/discover', authMiddleware, getCommunityPollsController);
router.get('/business-pages/recommendations', authMiddleware, getRecommendedBusinessPages);
router.get('/business-pages/config', getBusinessPageFeatureConfig);
router.get('/broadcast-channels/discover', authMiddleware, getBroadcastChannelDiscover);
router.get('/broadcast-channels/mine', authMiddleware, getMyBroadcastChannels);
router.get('/mentions/pages', getPageMentions);
router.get('/mentions/users', authMiddleware, getUserMentions);

// Protected routes (require auth)
router.post('/threads', authMiddleware, createThread);
router.post('/comments', authMiddleware, idempotency({ ttlMs: SOCIAL_WRITE_IDEMPOTENCY_TTL_MS }), postComment);
router.post('/like', authMiddleware, idempotency({ ttlMs: SOCIAL_WRITE_IDEMPOTENCY_TTL_MS }), toggleLike);
router.post('/repost', authMiddleware, toggleRepost);
router.post('/moderation/check', authMiddleware, moderateContent);
router.post('/settings', authMiddleware, adminMiddleware, updateCommunitySettings);
router.post('/settings/toggle', authMiddleware, adminMiddleware, toggleCommunitySetting);
router.post('/channels', authMiddleware, adminMiddleware, createChannel);
router.post('/channels/:channelId/delete', authMiddleware, adminMiddleware, deleteChannel);
router.post('/channels/:channelId/join', authMiddleware, adminMiddleware, joinChannel);
router.post('/channels/:channelId/leave', authMiddleware, adminMiddleware, leaveChannel);
router.post('/channels/:channelId/messages', authMiddleware, adminMiddleware, postChannelMessage);
router.post('/broadcast-channels', authMiddleware, createBroadcastChannel);
router.put('/broadcast-channels/:id', authMiddleware, updateBroadcastChannel);
router.post('/broadcast-channels/:id/follow', authMiddleware, followBroadcastChannel);
router.post('/broadcast-channels/:id/unfollow', authMiddleware, unfollowBroadcastChannel);
router.post('/broadcast-channels/:id/posts', authMiddleware, idempotency({ ttlMs: SOCIAL_WRITE_IDEMPOTENCY_TTL_MS }), createBroadcastChannelPost);
router.post('/clubs/join', authMiddleware, joinClub);
router.post('/clubs/leave', authMiddleware, leaveClub);
router.post('/clubs/:clubId/delete', authMiddleware, adminMiddleware, deleteClub);
router.post('/events/register', authMiddleware, registerEvent);
router.post('/events/unregister', authMiddleware, unregisterEvent);
router.post('/events', authMiddleware, adminMiddleware, createEvent);
router.put('/events/:eventId', authMiddleware, adminMiddleware, updateEvent);
router.post('/events/:eventId/delete', authMiddleware, adminMiddleware, deleteEvent);

// CommunityPost CRUD endpoints
router.get('/posts', getPosts); // Public: list posts (feed)
router.get('/posts/:id', getPostById); // Public: get single post
router.get('/posts/:id/translation', getPostTranslation);
router.get('/posts/:id/comments', getPostComments); // Public: get post comments
router.post('/posts', authMiddleware, createPost); // Auth: create post
router.put('/posts/:id', authMiddleware, updatePost); // Auth: update post (owner/admin/moderator)
router.delete('/posts/:id', authMiddleware, deletePost); // Auth: delete post (owner/admin/moderator)
router.post('/posts/:id/reactions', authMiddleware, idempotency({ ttlMs: SOCIAL_WRITE_IDEMPOTENCY_TTL_MS }), createPostReaction);
router.delete('/posts/:id/reactions', authMiddleware, idempotency({ ttlMs: SOCIAL_WRITE_IDEMPOTENCY_TTL_MS }), deletePostReaction);
router.post('/posts/:id/comments', authMiddleware, idempotency({ ttlMs: SOCIAL_WRITE_IDEMPOTENCY_TTL_MS }), createPostComment);
router.put('/comments/:id', authMiddleware, updatePostComment);
router.delete('/comments/:id', authMiddleware, deletePostComment);
router.post('/comments/:id/like', authMiddleware, idempotency({ ttlMs: SOCIAL_WRITE_IDEMPOTENCY_TTL_MS }), togglePostCommentLike);

// Gcoin routes (community-scoped)
router.use('/gcoin', authMiddleware, communityGcoinRoutes);
// Admin Gcoin alias under community namespace (maps to /api/admin/community/gcoin)
router.use('/admin/gcoin', adminCommunityGcoinRoutes);

// Post metric endpoints (Gcoin earning triggers)
router.post('/posts/:id/view', authMiddleware, async (req, res, next) => { try { const c = require('../controllers/community.controller'); return c.postView(req, res); } catch(e){ next(e); } });
router.post('/posts/:id/share', authMiddleware, async (req, res, next) => { try { const c = require('../controllers/community.controller'); return c.postShare(req, res); } catch(e){ next(e); } });
router.post('/posts/:id/repost', authMiddleware, async (req, res, next) => { try { const c = require('../controllers/community.controller'); return c.postRepost(req, res); } catch(e){ next(e); } });
router.post('/posts/:id/like', authMiddleware, async (req, res, next) => { try { const c = require('../controllers/community.controller'); return c.postLike(req, res); } catch(e){ next(e); } });
router.delete('/posts/:id/like', authMiddleware, async (req, res, next) => { try { const c = require('../controllers/community.controller'); return c.postUnlike(req, res); } catch(e){ next(e); } });

// Stories
router.post('/stories', authMiddleware, createStory);
router.put('/stories/:id', authMiddleware, updateStory);
router.delete('/stories/:id', authMiddleware, deleteStory);
router.post('/stories/:id/view', authMiddleware, viewStory);
router.post('/stories/:id/like', authMiddleware, toggleStoryLike);
router.post('/stories/:id/engage', authMiddleware, engageStory);
router.post('/stories/:id/replies', authMiddleware, idempotency({ ttlMs: SOCIAL_WRITE_IDEMPOTENCY_TTL_MS }), createStoryReplyController);
router.delete('/stories/replies/:replyId', authMiddleware, deleteStoryReplyController);
router.post('/polls/:pollId/vote', authMiddleware, idempotency({ ttlMs: SOCIAL_WRITE_IDEMPOTENCY_TTL_MS }), voteCommunityPollController);

// Business pages
router.get('/business-pages/me', authMiddleware, getMyBusinessPages);
router.post('/business-pages', authMiddleware, createBusinessPage);
router.put('/business-pages/:id', authMiddleware, updateBusinessPage);
router.delete('/business-pages/:id', authMiddleware, deleteBusinessPage);
router.get('/business-pages/:id/packages', getBusinessPagePackages);
router.get('/business-pages/:id/storefront', getBusinessPageStorefront);
router.put('/business-pages/:id/packages', authMiddleware, updateBusinessPagePackages);
router.post('/business-pages/:id/posts', authMiddleware, createBusinessPagePost);
router.get('/business-pages/:slug/feed', getBusinessPageFeed);
router.get('/business-pages/:slug', getBusinessPageBySlug);
router.get('/business-pages/:id/following', authMiddleware, listBusinessPageFollowing);
router.post('/business-pages/:id/follow', authMiddleware, followFromBusinessPage);
router.post('/business-pages/:id/unfollow', authMiddleware, unfollowFromBusinessPage);

// Follow system
router.post('/follow', authMiddleware, followTarget);
router.delete('/follow/:id', authMiddleware, unfollowTarget);
router.post('/unfollow', authMiddleware, unfollowTargetByUserId);
router.post('/follow/status', authMiddleware, followStatusBulk);
router.get('/followers', authMiddleware, listFollowers);
router.get('/following', authMiddleware, listFollowing);
router.get('/followers/me', authMiddleware, listMyFollowers);
router.get('/following/me', authMiddleware, listMyFollowing);
router.post('/blocks', authMiddleware, blockUser);
router.delete('/blocks/:userId', authMiddleware, unblockUser);
router.get('/blocks/me', authMiddleware, listMyBlocks);

// Ads routes (community-scoped)
router.get('/ads', getPublicAds);
router.get('/ads/runtime-config', getAdsRuntimeConfig);
router.get('/ads/config', authMiddleware, getAdsConfig);
router.post('/ads/draft', authMiddleware, createAdDraft);
router.post('/ads/:id/pay', authMiddleware, payAd);
router.post('/ads/:id/submit', authMiddleware, submitAd);
router.get('/ads/me', authMiddleware, getMyAds);
router.put('/ads/:id', authMiddleware, updateAd);
router.get('/ads/:id', authMiddleware, getAd);
router.delete('/ads/:id', authMiddleware, deleteAd);
router.get('/ads/:id/performance', authMiddleware, getAdPerformance);
router.post('/ads/:id/pause', authMiddleware, pauseAd);
router.post('/ads/:id/resume', authMiddleware, resumeAd);
router.post('/ads/:id/impression', recordAdImpression);
router.post('/ads/:id/click', recordAdClick);

// Admin ads routes
router.get('/admin/ads/review-queue', authMiddleware, adminMiddleware, getReviewQueue);
router.get('/admin/ads', authMiddleware, adminMiddleware, getAllCampaigns);
router.post('/admin/ads/:id/approve', authMiddleware, adminMiddleware, approveAd);
router.post('/admin/ads/:id/reject', authMiddleware, adminMiddleware, rejectAd);
router.post('/admin/ads/:id/pause', authMiddleware, adminMiddleware, pauseAd);
router.post('/admin/ads/:id/resume', authMiddleware, adminMiddleware, resumeAd);
router.get('/admin/ads/analytics', authMiddleware, adminMiddleware, getAdsAnalytics);
router.get('/admin/ads/config', authMiddleware, adminMiddleware, getAdsConfig);
router.put('/admin/ads/config', authMiddleware, adminMiddleware, updateAdsConfig);

// Admin reactions config
router.get('/admin/reactions', authMiddleware, adminMiddleware, getReactionsConfig);
router.put('/admin/reactions', authMiddleware, adminMiddleware, updateReactionsConfig);

// Admin community global config
router.get('/admin/config', authMiddleware, adminMiddleware, getAdminConfig);
router.put('/admin/config', authMiddleware, adminMiddleware, updateAdminConfig);

// Admin business pages
router.get('/admin/business-pages', authMiddleware, adminMiddleware, adminListBusinessPages);
router.put('/admin/business-pages/:id', authMiddleware, adminMiddleware, adminUpdateBusinessPage);
router.post('/admin/business-pages/:id/moderate', authMiddleware, adminMiddleware, adminModerateBusinessPage);
router.delete('/admin/business-pages/:id', authMiddleware, adminMiddleware, adminDeleteBusinessPage);

// Admin moderation
router.get('/admin/moderation/flags', authMiddleware, adminMiddleware, getModerationLogs);
router.post('/admin/moderation/action', authMiddleware, adminMiddleware, takeModerationAction);
router.get('/admin/reports/posts', authMiddleware, adminMiddleware, getPostReportsAdmin);
router.get('/admin/reports/posts/:reportId', authMiddleware, adminMiddleware, getPostReportByIdAdmin);
router.post('/admin/reports/posts/:reportId/reply', authMiddleware, adminMiddleware, replyToPostReportAdmin);
router.post('/admin/reports/posts/:reportId/action', authMiddleware, adminMiddleware, actionPostReportAdmin);

// Admin community homepage config
router.get('/admin/homepage', authMiddleware, adminMiddleware, getCommunityHomepage);
router.put('/admin/homepage', authMiddleware, adminMiddleware, updateCommunityHomepage);

// Admin/Moderator routes
router.post('/threads/:id/pin', authMiddleware, toggleThreadPin);
router.post('/threads/:id/lock', authMiddleware, toggleThreadLock);
router.post('/threads/:id/delete', authMiddleware, deleteThread);
router.post('/comments/:id/delete', authMiddleware, deleteComment);
router.get('/moderation/logs', authMiddleware, adminMiddleware, getModerationLogs);

export default router;
