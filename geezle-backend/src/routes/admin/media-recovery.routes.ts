import express from 'express';
import {
  postMediaRecoveryAudit,
  postMediaRecoveryRepair,
  postMediaRecoveryRun
} from '../../controllers/admin.mediaRecovery.controller';

const router = express.Router();

/**
 * Auth: inherited from /api/admin/* (authMiddleware + adminMiddleware).
 * No GET routes — repair cannot be triggered via GET.
 */

/** Dry-run audit only — no writes; repair flags ignored */
router.post('/audit', postMediaRecoveryAudit);

/** Repair recoverable files — requires confirm=true; never deletes */
router.post('/repair', postMediaRecoveryRepair);

/** Unified entry: mode=dry-run|repair (repair requires confirm=true) */
router.post('/run', postMediaRecoveryRun);

export default router;
