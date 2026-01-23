import express from 'express';
import { devAuth } from '../middleware/auth';
import { requestWithdrawal, getMyWithdrawals } from '../controllers/walletController';

const router = express.Router();
router.use(devAuth);

router.post('/request', requestWithdrawal);
router.get('/me', getMyWithdrawals);

export default router;
