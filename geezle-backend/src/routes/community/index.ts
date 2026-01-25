import express from 'express';
import gcoinRoutes from './gcoin';
import adsRoutes from './ads';
import postsRoutes from './posts';

const router = express.Router();

router.use('/gcoin', gcoinRoutes);
router.use('/ads', adsRoutes);
router.use('/posts', postsRoutes);

export default router;
