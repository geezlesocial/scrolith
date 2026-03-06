import express from 'express';
import {
  banLiveAdminUser,
  clearLiveAdminRestriction,
  endLiveAdminSession,
  getLiveAdminConfig,
  getLiveAdminRestrictions,
  getLiveAdminReports,
  getLiveAdminSessions,
  restrictLiveAdminUser,
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
router.get('/restrictions', getLiveAdminRestrictions);
router.post('/users/:id/restrict', restrictLiveAdminUser);
router.post('/users/:id/ban', banLiveAdminUser);
router.post('/users/:id/restore', clearLiveAdminRestriction);

export default router;
