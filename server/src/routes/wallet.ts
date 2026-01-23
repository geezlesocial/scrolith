import express from 'express';
import { devAuth } from '../middleware/auth';
import { getMyWallet, getMyTransactions, requestWithdrawal, getMyWithdrawals } from '../controllers/walletController';

const router = express.Router();

router.use(devAuth);

router.get('/me', getMyWallet);
router.get('/me/transactions', getMyTransactions);

export default router;
