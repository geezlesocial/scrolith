import express from 'express';
import { getGigCategories, getJobCategories } from '../controllers/categoriesController';

const router = express.Router();

router.get('/gigs', getGigCategories);
router.get('/jobs', getJobCategories);

export default router;
