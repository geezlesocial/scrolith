import express from 'express';
import { getFeed, postFeedIntent } from '../controllers/community.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// Alias feed endpoint for mobile shell compatibility.
// GET /api/feed?cursor=&limit=&scope=
router.get('/', getFeed);
router.post('/intent', authMiddleware, postFeedIntent);

export default router;
