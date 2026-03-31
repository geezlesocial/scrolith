import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  claimRewardDropController,
  completeMyQuestController,
  endFriendStreakController,
  generateOpportunityBriefController,
  generateSkillGapController,
  getFeedModeController,
  getLeaderboardController,
  getMatchesController,
  getMyAchievementsController,
  getMyCreatorChallengesController,
  getOpportunityHubController,
  getMyPgsController,
  getMyQuestsController,
  getMySkillGapController,
  getMyStreakController,
  inviteFriendStreakController,
  getPostPredictionController,
  getRevenueController,
  inviteReferralSquadController,
  leaveReferralSquadController,
  respondFriendStreakController,
  respondReferralSquadController,
  setFeedModeController,
  submitCreatorChallengeEntryController,
  voteCreatorChallengeEntryController
} from '../modules/insights/controllers/insights.controller';

const router = express.Router();

router.use(authMiddleware);

router.get('/pgs/me', getMyPgsController);
router.get('/achievements/me', getMyAchievementsController);
router.get('/streak/me', getMyStreakController);
router.post('/streak/friends/invite', inviteFriendStreakController);
router.post('/streak/friends/:friendStreakId/respond', respondFriendStreakController);
router.post('/streak/friends/:friendStreakId/end', endFriendStreakController);
router.post('/streak/referral-squads/invite', inviteReferralSquadController);
router.post('/streak/referral-squads/invites/:inviteId/respond', respondReferralSquadController);
router.post('/streak/referral-squads/:squadId/leave', leaveReferralSquadController);
router.post('/streak/reward-drops/:dropId/claim', claimRewardDropController);
router.get('/challenges/me', getMyCreatorChallengesController);
router.post('/challenges/:challengeId/entries', submitCreatorChallengeEntryController);
router.post('/challenges/:challengeId/vote', voteCreatorChallengeEntryController);
router.get('/quests/me', getMyQuestsController);
router.post('/quests/:userQuestId/complete', completeMyQuestController);
router.get('/leaderboard', getLeaderboardController);
router.get('/matches/me', getMatchesController);
router.get('/revenue/me', getRevenueController);
router.get('/opportunity-hub/me', getOpportunityHubController);
router.post('/opportunity-brief', generateOpportunityBriefController);
router.get('/post/:postId/prediction', getPostPredictionController);
router.post('/skill-gap/generate', generateSkillGapController);
router.get('/skill-gap/me', getMySkillGapController);
router.post('/feed-mode', setFeedModeController);
router.get('/feed-mode', getFeedModeController);

export default router;
