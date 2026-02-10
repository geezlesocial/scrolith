import express from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminMiddleware } from '../../middleware/admin.middleware';
import {
  disableStripePayoutForUserAdmin,
  enableStripePayoutForUserAdmin,
  invalidateStripeRuntimeConfigAdmin,
  listStripePayoutAccountsAdmin
} from '../../controllers/payouts.stripe.controller';

const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

router.get('/accounts', listStripePayoutAccountsAdmin);
router.post('/users/:userId/disable', disableStripePayoutForUserAdmin);
router.post('/users/:userId/enable', enableStripePayoutForUserAdmin);
router.post('/config/invalidate-cache', invalidateStripeRuntimeConfigAdmin);

export default router;

