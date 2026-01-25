import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { getMyProfile, updateMyProfile } from '../controllers/userController';

const router = express.Router();

router.get('/me', authMiddleware, getMyProfile);
router.put('/me', authMiddleware, updateMyProfile);

export default router;
