import express from 'express';
import {
  getScrollAdminConfig,
  updateScrollAdminConfig,
  getScrollAdminVideos,
  removeScrollAdmin,
  getScrollAdminReports
} from '../../controllers/scroll.controller';

const router = express.Router();

router.get('/config', getScrollAdminConfig);
router.put('/config', updateScrollAdminConfig);
router.get('/videos', getScrollAdminVideos);
router.post('/:id/remove', removeScrollAdmin);
router.get('/reports', getScrollAdminReports);

export default router;
