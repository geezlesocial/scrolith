import express from 'express';
import { getGigs, getCategories } from '../controllers/commerce.controller';

const router = express.Router();

router.get('/gigs', getGigs);
router.get('/categories', getCategories);

export default router;