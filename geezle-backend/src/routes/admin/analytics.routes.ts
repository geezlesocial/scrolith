import express from 'express';
import { getActivityMetrics, getRevenueBreakdown } from '../../controllers/adminAnalytics.controller';

const router = express.Router();

router.get('/activity', getActivityMetrics as any);
router.get('/revenue-breakdown', getRevenueBreakdown as any);

export default router;
