import { Router } from 'express';
import { requireAuth } from '../../middlewares/auth';
import { requireRole } from '../../middlewares/rbac';
import { getFreelancerOrders } from './orders.controller';
import { getWalletSummary, getWalletTransactions } from './wallet.controller';

const r = Router();

r.use(requireAuth, requireRole('FREELANCER'));

r.get('/orders', getFreelancerOrders);
r.get('/wallet', getWalletSummary);
r.get('/wallet/transactions', getWalletTransactions);

export default r;
