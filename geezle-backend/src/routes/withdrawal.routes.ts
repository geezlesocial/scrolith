import express from 'express';
import { requestWithdrawal, getMyWithdrawals, getPayoutAccount, savePayoutAccountDetails, getPayoutMethods } from '../controllers/withdrawal.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// Protected routes
router.post('/request', authMiddleware, requestWithdrawal);
router.get('/me', authMiddleware, getMyWithdrawals);
router.get('/account', authMiddleware, getPayoutAccount);
router.post('/account', authMiddleware, savePayoutAccountDetails);
router.get('/methods', authMiddleware, getPayoutMethods);

export default router;
