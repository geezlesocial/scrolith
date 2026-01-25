import express from 'express';
import {
  listContracts,
  getContract,
  createContract,
  updateContractStatus,
  startTracking,
  stopTracking,
  getActiveSessionForContract,
  listActiveSessions,
  forceStopSession,
  listTimeEntries,
  listTimeEntriesForContract,
  logTimeEntry,
  approveTimeEntry,
  payContractDue
} from '../controllers/contracts.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

router.get('/', authMiddleware, listContracts);
router.get('/tracking/active', authMiddleware, listActiveSessions);
router.post('/tracking/:sessionId/force-stop', authMiddleware, forceStopSession);
router.get('/:id/tracking/active', authMiddleware, getActiveSessionForContract);

router.get('/time-entries', authMiddleware, listTimeEntries);
router.post('/time-entries/:id/approve', authMiddleware, approveTimeEntry);

router.post('/', authMiddleware, createContract);
router.get('/:id', authMiddleware, getContract);
router.patch('/:id/status', authMiddleware, updateContractStatus);

router.post('/:id/tracking/start', authMiddleware, startTracking);
router.post('/:id/tracking/stop', authMiddleware, stopTracking);

router.get('/:id/time-entries', authMiddleware, listTimeEntriesForContract);
router.post('/:id/time-entries', authMiddleware, logTimeEntry);
router.post('/:id/pay', authMiddleware, payContractDue);

export default router;
