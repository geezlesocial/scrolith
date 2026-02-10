import express from 'express';
import { devAuth } from '../middleware/auth';
import {
  listContracts,
  getContractById,
  createContract,
  updateContractStatus,
  startTracking,
  stopTracking,
  getTimeEntries,
  addTimeEntry,
  approveTimeEntry,
  payContractDue,
  listActiveTrackingSessions,
  forceStopTrackingSession,
  listAllTimeEntries
} from '../controllers/contractsController';

const router = express.Router();
router.use(devAuth);

router.get('/', listContracts);
router.get('/tracking/active', listActiveTrackingSessions);
router.get('/time-entries', listAllTimeEntries);
router.get('/:id', getContractById);
router.post('/', createContract);
router.patch('/:id/status', updateContractStatus);
router.post('/:id/tracking/start', startTracking);
router.post('/:id/tracking/stop', stopTracking);
router.get('/:id/time-entries', getTimeEntries);
router.post('/:id/time-entries', addTimeEntry);
router.post('/time-entries/:id/approve', approveTimeEntry);
router.post('/:id/pay', payContractDue);
router.post('/tracking/:sessionId/force-stop', forceStopTrackingSession);

export default router;
