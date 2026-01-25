import express from 'express';
import { releaseEscrow, refundEscrow } from '../controllers/escrow.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';

const router = express.Router();

// Admin routes
router.post('/:id/release', authMiddleware, adminMiddleware, releaseEscrow);
router.post('/:id/refund', authMiddleware, adminMiddleware, refundEscrow);

export default router;