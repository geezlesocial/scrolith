import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { getMyProfile, updateMyProfile } from '../controllers/userController';
import {
  disableMyAvailability,
  getMyAvailability,
  pauseMyAvailability,
  resumeMyAvailability,
  updateMyAvailability
} from '../controllers/professionalAvailability.controller';
import {
  disableMyClientHiringStatus,
  getMyClientHiringStatus,
  pauseMyClientHiringStatus,
  resumeMyClientHiringStatus,
  updateMyClientHiringStatus
} from '../controllers/clientHiringStatus.controller';

const router = express.Router();

router.get('/me', authMiddleware, getMyProfile);
router.put('/me', authMiddleware, updateMyProfile);
router.get('/me/availability', authMiddleware, getMyAvailability);
router.put('/me/availability', authMiddleware, updateMyAvailability);
router.post('/me/availability/pause', authMiddleware, pauseMyAvailability);
router.post('/me/availability/resume', authMiddleware, resumeMyAvailability);
router.delete('/me/availability', authMiddleware, disableMyAvailability);
router.get('/me/hiring-status', authMiddleware, getMyClientHiringStatus);
router.put('/me/hiring-status', authMiddleware, updateMyClientHiringStatus);
router.post('/me/hiring-status/pause', authMiddleware, pauseMyClientHiringStatus);
router.post('/me/hiring-status/resume', authMiddleware, resumeMyClientHiringStatus);
router.delete('/me/hiring-status', authMiddleware, disableMyClientHiringStatus);

export default router;
