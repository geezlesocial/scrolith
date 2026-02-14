import express from 'express';
import { getFeed } from '../controllers/community.controller';

const router = express.Router();

// Alias feed endpoint for mobile shell compatibility.
// GET /api/feed?cursor=&limit=&scope=
router.get('/', getFeed);

export default router;

