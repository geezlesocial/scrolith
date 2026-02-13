import express from 'express';
import {
  getPublicAppDistributionConfig,
  trackAppDistributionEvent
} from '../controllers/apps.controller';

const router = express.Router();

router.get('/config', getPublicAppDistributionConfig);
router.post('/track', trackAppDistributionEvent);

export default router;

