import express from 'express';
import { getAuthPagesConfig, saveAuthPagesConfig } from '../controllers/cms.auth-pages.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';

const router = express.Router();

// Public read
router.get('/auth-pages', getAuthPagesConfig);

// Admin write
router.post('/auth-pages', authMiddleware, adminMiddleware, saveAuthPagesConfig);

export default router;
