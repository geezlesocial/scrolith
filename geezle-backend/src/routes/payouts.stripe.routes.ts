import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  createStripeConnectAccount,
  createStripeDashboardLoginLink,
  createStripeOnboardingLink,
  disconnectStripeConnectAccount,
  getMyStripeAutoPayoutSettings,
  getMyStripePayoutStatus,
  saveMyStripeAutoPayoutSettings
} from '../controllers/payouts.stripe.controller';

const router = express.Router();

router.use(authMiddleware);

router.get('/status', getMyStripePayoutStatus);
router.get('/auto-settings', getMyStripeAutoPayoutSettings);
router.put('/auto-settings', saveMyStripeAutoPayoutSettings);
router.post('/create-account', createStripeConnectAccount);
router.post('/onboarding-link', createStripeOnboardingLink);
router.post('/login-link', createStripeDashboardLoginLink);
router.post('/disconnect', disconnectStripeConnectAccount);

export default router;
