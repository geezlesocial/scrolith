import express from 'express';
import { requirePermission } from '../../middleware/rbac.middleware';
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

router.get('/config', requirePermission('live.read'), getLiveAdminConfig);
router.put('/config', requirePermission('live.manage'), updateLiveAdminConfig);
router.get('/sessions', requirePermission('live.read'), getLiveAdminSessions);
router.post('/sessions/:id/end', requirePermission('live.manage'), endLiveAdminSession);
router.get('/reports', requirePermission('live.read'), getLiveAdminReports);
router.post('/reports/:id/resolve', requirePermission('live.manage'), resolveLiveAdminReport);
router.get('/restrictions', requirePermission('live.read'), getLiveAdminRestrictions);
router.post('/users/:id/restrict', requirePermission('live.manage'), restrictLiveAdminUser);
router.post('/users/:id/ban', requirePermission('live.manage'), banLiveAdminUser);
router.post('/users/:id/restore', requirePermission('live.manage'), clearLiveAdminRestriction);

export default router;
