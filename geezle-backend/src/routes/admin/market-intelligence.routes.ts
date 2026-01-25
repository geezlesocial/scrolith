import express from 'express';
import {
  getHealth,
  getKpis,
  getLtvPredictions,
  getDemandForecast,
  getRadarSummary
} from '../../controllers/adminMarketIntelligence.controller';

const router = express.Router();

router.get('/health', getHealth as any);
router.get('/kpis', getKpis as any);
router.get('/ltv-predictions', getLtvPredictions as any);
router.get('/demand-forecast', getDemandForecast as any);
router.get('/opportunity-radar/summary', getRadarSummary as any);

export default router;
