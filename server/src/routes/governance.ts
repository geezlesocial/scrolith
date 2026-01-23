
import express from 'express';
import { predictDispute, adviseEscrow, suggestClauses, getEnterpriseInsights } from '../controllers/governanceController';

const router = express.Router();

// AI Dispute Resolution
router.post('/predict-dispute', predictDispute);

// Smart Escrow Advisor
router.post('/advise-escrow', adviseEscrow);

// Contract Intelligence
router.post('/suggest-clauses', suggestClauses);

// Enterprise Hiring Insights
router.post('/enterprise-insights', getEnterpriseInsights);

export default router;
