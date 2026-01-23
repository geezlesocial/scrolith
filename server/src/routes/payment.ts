
import express from 'express';
import { createPaymentIntent, handleWebhook } from '../controllers/paymentController';
import { releaseEscrow, refundEscrow } from '../controllers/escrowController';
import { requestWithdrawal, approveWithdrawal } from '../controllers/withdrawalController';

const router = express.Router();

// Payments
router.post('/create-intent', createPaymentIntent);
router.post('/webhook', handleWebhook);

// Escrow
router.post('/escrow/:id/release', releaseEscrow);
router.post('/escrow/:id/refund', refundEscrow);

// Withdrawals
router.post('/withdraw', requestWithdrawal);
router.post('/withdraw/:id/approve', approveWithdrawal);

export default router;
