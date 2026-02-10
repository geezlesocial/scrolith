import express from 'express';
import { createPaymentIntent, handleWebhook } from '../controllers/payment.controller';
import { triggerReconcileAdPayments } from '../controllers/payment.controller';
import {
  handlePaystackWebhook,
  handleFlutterwaveWebhook,
  handlePaypalWebhook,
  handlePaymongoWebhook,
  handleXenditWebhook,
  handleMonnifyWebhook,
  handleOpayWebhook,
  handleDragonpayCallback,
  handlePayoneerNotify
} from '../controllers/walletFunding.controller';
import { listFundingGatewaysPublic } from '../controllers/walletFunding.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// Webhook needs raw body
router.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);

// Read-only active payment methods for community ads
router.get('/methods/active', listFundingGatewaysPublic);

// Wallet top-up webhooks (JSON payloads)
router.post('/paypal/webhook', express.json(), handlePaypalWebhook);
router.post('/paystack/webhook', express.json(), handlePaystackWebhook);
router.post('/flutterwave/webhook', express.json(), handleFlutterwaveWebhook);
router.post('/paymongo/webhook', express.json(), handlePaymongoWebhook);
router.post('/xendit/webhook', express.json(), handleXenditWebhook);
router.post('/monnify/webhook', express.json(), handleMonnifyWebhook);
router.post('/opay/webhook', express.json(), handleOpayWebhook);
router.get('/dragonpay/callback', handleDragonpayCallback);
router.post('/payoneer/notify', express.json(), handlePayoneerNotify);

// Protected routes
router.post('/create-intent', authMiddleware, createPaymentIntent);
router.post('/reconcile-adpayments', authMiddleware, triggerReconcileAdPayments);

export default router;
