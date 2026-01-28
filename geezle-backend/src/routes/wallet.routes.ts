import express from 'express';
import {
  getWallet,
  getWalletByUserId,
  getTransactions,
  getTransactionsByUserId,
  getEscrows,
  getEscrowsByUserId,
  getCommissionSettings,
  saveCommissionSettings,
  getPlatformFinancials,
  getAllTransactionsAdmin,
  adjustWalletBalance,
  freezeWallet,
  unfreezeWallet,
  reverseTransaction
} from '../controllers/wallet.controller';
import {
  initiateWalletTopup,
  getWalletTopupStatus,
  listWalletTopupProviders,
  listFundingGatewaysAdmin,
  saveFundingGatewaysAdmin
} from '../controllers/walletFunding.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';

const router = express.Router();

// User routes
router.get('/me', authMiddleware, getWallet);
router.get('/me/transactions', authMiddleware, getTransactions);
router.get('/me/escrows', authMiddleware, getEscrows);
router.get('/topup/providers', authMiddleware, listWalletTopupProviders);
import { idempotency } from '../middleware/idempotency';

router.post('/topup/initiate', authMiddleware, idempotency(), initiateWalletTopup);
router.get('/topup/status/:intentId', authMiddleware, getWalletTopupStatus);

// Settings
router.get('/settings/commission', authMiddleware, getCommissionSettings);
router.post('/settings/commission', authMiddleware, saveCommissionSettings);

// Admin routes
router.get('/admin/transactions', authMiddleware, adminMiddleware, getAllTransactionsAdmin);
router.get('/admin/gateways', authMiddleware, adminMiddleware, listFundingGatewaysAdmin);
router.post('/admin/gateways', authMiddleware, adminMiddleware, saveFundingGatewaysAdmin);
router.get('/platform-financials', authMiddleware, adminMiddleware, getPlatformFinancials);
router.post('/transactions/:id/reverse', authMiddleware, adminMiddleware, reverseTransaction);
router.post('/:userId/adjust', authMiddleware, adminMiddleware, adjustWalletBalance);
router.post('/:userId/freeze', authMiddleware, adminMiddleware, freezeWallet);
router.post('/:userId/unfreeze', authMiddleware, adminMiddleware, unfreezeWallet);

// User-scoped routes (keep last to avoid collisions)
router.get('/:userId', authMiddleware, getWalletByUserId);
router.get('/:userId/transactions', authMiddleware, getTransactionsByUserId);
router.get('/:userId/escrows', authMiddleware, getEscrowsByUserId);

export default router;
