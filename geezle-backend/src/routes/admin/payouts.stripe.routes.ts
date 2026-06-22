import express from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminMiddleware } from '../../middleware/admin.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import {
  disableStripePayoutForUserAdmin,
  enableStripePayoutForUserAdmin,
  invalidateStripeRuntimeConfigAdmin,
  listStripePayoutAccountsAdmin
} from '../../controllers/payouts.stripe.controller';

const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

router.get('/accounts', requirePermission('payouts.read'), listStripePayoutAccountsAdmin);
router.post('/users/:userId/disable', requirePermission('payouts.release'), disableStripePayoutForUserAdmin);
router.post('/users/:userId/enable', requirePermission('payouts.release'), enableStripePayoutForUserAdmin);
router.post('/config/invalidate-cache', requirePermission('payouts.release'), invalidateStripeRuntimeConfigAdmin);

export default router;
