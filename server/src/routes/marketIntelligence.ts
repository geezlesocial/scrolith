import { Router } from 'express';
import {
  getHealth,
  getKpis,
  getLtvPredictions,
  getDemandForecast,
  getRadarSummary
} from '../controllers/marketIntelligenceController';

const router = Router();

router.get('/health', getHealth);
router.get('/kpis', getKpis);
router.get('/ltv-predictions', getLtvPredictions);
router.get('/demand-forecast', getDemandForecast);
router.get('/opportunity-radar/summary', getRadarSummary);

export default router;
