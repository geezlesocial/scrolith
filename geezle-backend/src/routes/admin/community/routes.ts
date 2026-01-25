import express from 'express';
import gcoinAdmin from './gcoin';
import adsAdmin from './ads';

const router = express.Router();

router.use('/gcoin', gcoinAdmin);
router.use('/ads', adsAdmin);

export default router;
