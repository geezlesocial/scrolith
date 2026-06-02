import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { requirePermission, staffOnlyMiddleware } from '../middleware/rbac.middleware';
import {
  applyUserModerationActionController,
  getUserModerationSummaryController
} from '../controllers/accountModeration.controller';

const router = express.Router();

router.use(authMiddleware, staffOnlyMiddleware);

router.get('/users/:userId', requirePermission('community.accounts.moderate'), getUserModerationSummaryController);
router.post('/users/:userId/action', requirePermission('community.accounts.moderate'), applyUserModerationActionController);

export default router;
