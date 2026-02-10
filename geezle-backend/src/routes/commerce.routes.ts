import express from 'express';
import { getGigs, getGigById, getCategories } from '../controllers/commerce.controller';

const router = express.Router();

// Health check (no auth)
router.get('/health', (_req, res) => {
  res.json({ success: true, service: 'commerce' });
});

router.get('/gigs', getGigs);
router.get('/gigs/:id', getGigById);
router.get('/categories', getCategories);

export default router;
