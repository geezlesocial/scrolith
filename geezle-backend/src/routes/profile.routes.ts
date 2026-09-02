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

const router = express.Router();

router.get('/me', authMiddleware, getMyProfile);
router.put('/me', authMiddleware, updateMyProfile);
router.get('/me/availability', authMiddleware, getMyAvailability);
router.put('/me/availability', authMiddleware, updateMyAvailability);
router.post('/me/availability/pause', authMiddleware, pauseMyAvailability);
router.post('/me/availability/resume', authMiddleware, resumeMyAvailability);
router.delete('/me/availability', authMiddleware, disableMyAvailability);

export default router;
