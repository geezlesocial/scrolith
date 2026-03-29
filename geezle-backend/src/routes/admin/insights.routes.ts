import express from 'express';
import {
  getAdminAchievementsController,
  getAdminCreatorChallengesController,
  getAdminInsightsConfigController,
  getAdminLeaderboardController,
  getAdminQuestCatalogController,
  postAdminAchievementController,
  postAdminCreatorChallengeController,
  postAdminLeaderboardRebuildController,
  postAdminQuestCatalogController,
  postAdminRecomputeAllController,
  postAdminRecomputeUserController,
  finalizeAdminCreatorChallengeController,
  putAdminAchievementController,
  putAdminCreatorChallengeController,
  putAdminQuestCatalogController,
  putAdminInsightsConfigController,
  toggleAdminAchievementController,
  toggleAdminCreatorChallengeController,
  toggleAdminQuestCatalogController
} from '../../modules/insights/controllers/admin.insights.controller';

const router = express.Router();

router.get('/config', getAdminInsightsConfigController);
router.put('/config', putAdminInsightsConfigController);
router.post('/recompute/:userId', postAdminRecomputeUserController);
router.post('/recompute-all', postAdminRecomputeAllController);
router.get('/achievements', getAdminAchievementsController);
router.post('/achievements', postAdminAchievementController);
router.put('/achievements/:id', putAdminAchievementController);
router.post('/achievements/:id/toggle', toggleAdminAchievementController);
router.get('/challenges', getAdminCreatorChallengesController);
router.post('/challenges', postAdminCreatorChallengeController);
router.put('/challenges/:id', putAdminCreatorChallengeController);
router.post('/challenges/:id/toggle', toggleAdminCreatorChallengeController);
router.post('/challenges/:id/finalize', finalizeAdminCreatorChallengeController);
router.get('/quests', getAdminQuestCatalogController);
router.post('/quests', postAdminQuestCatalogController);
router.put('/quests/:id', putAdminQuestCatalogController);
router.post('/quests/:id/toggle', toggleAdminQuestCatalogController);
router.get('/leaderboard/:weekKey', getAdminLeaderboardController);
router.post('/leaderboard/rebuild', postAdminLeaderboardRebuildController);

export default router;
