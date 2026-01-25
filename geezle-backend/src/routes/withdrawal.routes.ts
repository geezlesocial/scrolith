import express from 'express';
import { requestWithdrawal, getMyWithdrawals } from '../controllers/withdrawal.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// Protected routes
router.post('/request', authMiddleware, requestWithdrawal);
router.get('/me', authMiddleware, getMyWithdrawals);

export default router;
