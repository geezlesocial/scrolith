import express from 'express';
import { listPublicGigs, getGigById } from '../controllers/gigsController';
import { listCommerceCategories } from '../controllers/categoriesController';

const router = express.Router();

router.get('/gigs', listPublicGigs);
router.get('/gigs/:id', getGigById);
router.get('/categories', listCommerceCategories);

export default router;
