import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  completeMyQuestController,
  generateOpportunityBriefController,
  generateSkillGapController,
  getFeedModeController,
  getLeaderboardController,
  getMatchesController,
  getMyAchievementsController,
  getOpportunityHubController,
  getMyPgsController,
  getMyQuestsController,
  getMySkillGapController,
  getMyStreakController,
  getPostPredictionController,
  getRevenueController,
  setFeedModeController
} from '../modules/insights/controllers/insights.controller';

const router = express.Router();

router.use(authMiddleware);

router.get('/pgs/me', getMyPgsController);
router.get('/achievements/me', getMyAchievementsController);
router.get('/streak/me', getMyStreakController);
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
