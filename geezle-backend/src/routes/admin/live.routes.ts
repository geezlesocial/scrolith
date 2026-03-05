import express from 'express';
import {
  endLiveAdminSession,
  getLiveAdminConfig,
  getLiveAdminReports,
  getLiveAdminSessions,
  resolveLiveAdminReport,
  updateLiveAdminConfig
} from '../../controllers/live.controller';

const router = express.Router();

router.get('/config', getLiveAdminConfig);
router.put('/config', updateLiveAdminConfig);
router.get('/sessions', getLiveAdminSessions);
router.post('/sessions/:id/end', endLiveAdminSession);
router.get('/reports', getLiveAdminReports);
router.post('/reports/:id/resolve', resolveLiveAdminReport);

export default router;
