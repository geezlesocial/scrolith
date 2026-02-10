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

const router = express.Router();

router.get('/', authMiddleware, adminMiddleware, listWithdrawalsAdmin);
router.get('/methods', authMiddleware, adminMiddleware, getPayoutMethodsAdmin);
router.post('/methods', authMiddleware, adminMiddleware, savePayoutMethodsAdmin);
router.get('/payout-accounts', authMiddleware, adminMiddleware, listPayoutAccountsAdmin);
router.get('/payout-accounts/:userId', authMiddleware, adminMiddleware, getPayoutAccountAdmin);
router.post('/:id/approve', authMiddleware, adminMiddleware, approveWithdrawalAdmin);
router.post('/:id/reject', authMiddleware, adminMiddleware, rejectWithdrawalAdmin);
router.post('/:id/mark-paid', authMiddleware, adminMiddleware, markWithdrawalPaidAdmin);

export default router;
