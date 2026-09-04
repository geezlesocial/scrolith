import express from 'express';
import { getAdminMatchAnalyticsController, getAdminMatchConfigController, putAdminMatchConfigController } from '../../controllers/scrolithMatch.controller';

const router = express.Router();
router.get('/', getAdminMatchConfigController);
router.put('/', putAdminMatchConfigController);
router.get('/analytics', getAdminMatchAnalyticsController);
export default router;
