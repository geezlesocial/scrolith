import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';
import {
  getSettings,
  saveSettings,
  getWallet,
  getMe,
  getAllWallets,
  getTransactions,
  getAllTransactions,
  createTransaction,
  creditUser,
  adminAdjustBalance,
  transferGcoin,
  donateGcoin,
  requestConversion,
  getConversionRequests,
  processConversion,
  freezeWallet,
  unfreezeWallet,
  getEarningsSummary,
  getEarningsByPost
} from '../controllers/gcoin.controller';

import { checkAndAward } from '../controllers/gcoin.controller';

const router = express.Router();

router.get('/settings', authMiddleware, getSettings);
router.post('/settings', authMiddleware, adminMiddleware, saveSettings);

router.get('/me', authMiddleware, getMe);

router.get('/wallets', authMiddleware, adminMiddleware, getAllWallets);
router.get('/wallets/:userId', authMiddleware, getWallet);
router.post('/wallets/:userId/freeze', authMiddleware, adminMiddleware, freezeWallet);
router.post('/wallets/:userId/unfreeze', authMiddleware, adminMiddleware, unfreezeWallet);

router.get('/transactions', authMiddleware, getTransactions);
router.get('/admin/transactions', authMiddleware, adminMiddleware, getAllTransactions);
router.post('/transactions', authMiddleware, adminMiddleware, createTransaction);

// Admin summary: issuance/liabilities
router.get('/admin/summary', authMiddleware, adminMiddleware, (async (req, res) => { return (await import('../controllers/gcoin.controller')).getAdminSummary(req, res); }) as any);

router.post('/admin/credit', authMiddleware, adminMiddleware, creditUser);
router.post('/admin/adjust', authMiddleware, adminMiddleware, adminAdjustBalance);

router.post('/transfer', authMiddleware, transferGcoin);
router.post('/donate', authMiddleware, donateGcoin);

router.get('/earnings/summary', authMiddleware, getEarningsSummary);
router.get('/earnings/by-post', authMiddleware, getEarningsByPost);

router.post('/admin/recompute', authMiddleware, adminMiddleware, (async (req, res) => { return (await import('../controllers/gcoin.controller')).recomputeFraudScores(req, res); }) as any);

router.post('/rewards', authMiddleware, checkAndAward);
router.get('/admin/fraud', authMiddleware, adminMiddleware, (async (req, res) => { return (await import('../controllers/gcoin.controller')).getFraudReports(req, res); }) as any);

router.get('/conversions', authMiddleware, getConversionRequests);
router.post('/conversions', authMiddleware, requestConversion);
router.post('/conversions/:id', authMiddleware, adminMiddleware, processConversion);

export default router;
