import express from 'express';
import {
  getScrollAdminConfig,
  updateScrollAdminConfig,
  getScrollAdminVideos,
  removeScrollAdmin,
  getScrollAdminReports,
  reviewScrollReportAdmin,
  sendScrollOwnerMessageAdmin,
  sendScrollOwnerWarningAdmin,
  restrictScrollOwnerAdmin,
  liftScrollOwnerRestrictionAdmin
} from '../../controllers/scroll.controller';

const router = express.Router();

router.get('/config', getScrollAdminConfig);
router.put('/config', updateScrollAdminConfig);
router.get('/videos', getScrollAdminVideos);
router.post('/:id/remove', removeScrollAdmin);
router.post('/:id/message', sendScrollOwnerMessageAdmin);
router.post('/:id/warning', sendScrollOwnerWarningAdmin);
router.get('/reports', getScrollAdminReports);
router.post('/reports/:id/review', reviewScrollReportAdmin);
router.post('/users/:userId/restrictions', restrictScrollOwnerAdmin);
router.post('/users/:userId/restrictions/:restrictionId/lift', liftScrollOwnerRestrictionAdmin);

export default router;
