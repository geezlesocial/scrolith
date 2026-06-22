import express from 'express';
import { releaseEscrow, refundEscrow } from '../controllers/escrow.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';
import { requirePermission } from '../middleware/rbac.middleware';

const router = express.Router();

// Admin routes
router.post('/:id/release', authMiddleware, adminMiddleware, requirePermission('payouts.release'), releaseEscrow);
router.post('/:id/refund', authMiddleware, adminMiddleware, requirePermission('disputes.manage'), refundEscrow);

export default router;
