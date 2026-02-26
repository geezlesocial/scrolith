import express from 'express';
import {
  getAdminAchievementsController,
  getAdminInsightsConfigController,
  getAdminLeaderboardController,
  getAdminQuestCatalogController,
  postAdminAchievementController,
  postAdminLeaderboardRebuildController,
  postAdminQuestCatalogController,
  postAdminRecomputeAllController,
  postAdminRecomputeUserController,
  putAdminAchievementController,
  putAdminQuestCatalogController,
  putAdminInsightsConfigController,
  toggleAdminAchievementController,
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
router.get('/quests', getAdminQuestCatalogController);
router.post('/quests', postAdminQuestCatalogController);
router.put('/quests/:id', putAdminQuestCatalogController);
router.post('/quests/:id/toggle', toggleAdminQuestCatalogController);
router.get('/leaderboard/:weekKey', getAdminLeaderboardController);
router.post('/leaderboard/rebuild', postAdminLeaderboardRebuildController);

export default router;
