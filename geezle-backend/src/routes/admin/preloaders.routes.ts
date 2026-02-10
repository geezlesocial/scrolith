import express from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminMiddleware } from '../../middleware/admin.middleware';
import {
  adminActivatePreloader,
  adminCreatePreloader,
  adminDeactivatePreloader,
  adminDeletePreloader,
  adminListPreloaders,
  adminUpdatePreloader
} from '../../controllers/preloader.controller';

const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

router.get('/', adminListPreloaders);
router.post('/', adminCreatePreloader);
router.put('/:id', adminUpdatePreloader);
router.post('/:id/activate', adminActivatePreloader);
router.post('/:id/deactivate', adminDeactivatePreloader);
router.delete('/:id', adminDeletePreloader);

export default router;

