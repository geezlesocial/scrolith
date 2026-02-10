import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  getMyMonetization,
  listMyMonetizationApplications,
  submitMonetizationApplication
} from '../controllers/monetization.controller';

const router = express.Router();

router.use(authMiddleware);

router.get('/me', getMyMonetization);
router.post('/apply', submitMonetizationApplication);
router.get('/applications', listMyMonetizationApplications);

export default router;
