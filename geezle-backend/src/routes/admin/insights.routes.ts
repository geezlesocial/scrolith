import express from 'express';
import {
  getAdminAchievementsController,
  getAdminInsightsConfigController,
  getAdminLeaderboardController,
  postAdminAchievementController,
  postAdminLeaderboardRebuildController,
  postAdminRecomputeAllController,
  postAdminRecomputeUserController,
  putAdminAchievementController,
  putAdminInsightsConfigController,
  toggleAdminAchievementController
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
router.get('/leaderboard/:weekKey', getAdminLeaderboardController);
router.post('/leaderboard/rebuild', postAdminLeaderboardRebuildController);

export default router;

