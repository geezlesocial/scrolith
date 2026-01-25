import express from 'express';
import { getFraudAlerts, getFraudLogs } from '../../controllers/fraud.controller';

const router = express.Router();

router.get('/alerts', getFraudAlerts);
router.get('/logs', getFraudLogs);

export default router;
