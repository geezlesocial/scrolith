import express from 'express';
import {
  listWithdrawalsAdmin,
  approveWithdrawalAdmin,
  rejectWithdrawalAdmin,
  markWithdrawalPaidAdmin,
  listPayoutAccountsAdmin,
  getPayoutAccountAdmin,
  getPayoutMethodsAdmin,
  savePayoutMethodsAdmin
} from '../../controllers/withdrawal.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminMiddleware } from '../../middleware/admin.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';

const router = express.Router();

router.get('/', authMiddleware, adminMiddleware, requirePermission('payouts.read'), listWithdrawalsAdmin);
router.get('/methods', authMiddleware, adminMiddleware, requirePermission('payouts.read'), getPayoutMethodsAdmin);
router.post('/methods', authMiddleware, adminMiddleware, requirePermission('payouts.release'), savePayoutMethodsAdmin);
router.get('/payout-accounts', authMiddleware, adminMiddleware, requirePermission('payouts.read'), listPayoutAccountsAdmin);
router.get('/payout-accounts/:userId', authMiddleware, adminMiddleware, requirePermission('payouts.read'), getPayoutAccountAdmin);
router.post('/:id/approve', authMiddleware, adminMiddleware, requirePermission('payouts.release'), approveWithdrawalAdmin);
router.post('/:id/reject', authMiddleware, adminMiddleware, requirePermission('payouts.release'), rejectWithdrawalAdmin);
router.post('/:id/mark-paid', authMiddleware, adminMiddleware, requirePermission('payouts.release'), markWithdrawalPaidAdmin);

export default router;
