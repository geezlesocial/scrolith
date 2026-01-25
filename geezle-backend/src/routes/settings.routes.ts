import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { getMySettings, updateMySettings } from '../controllers/userController';

const router = express.Router();

router.get('/me', authMiddleware, getMySettings);
router.put('/me', authMiddleware, updateMySettings);

export default router;
