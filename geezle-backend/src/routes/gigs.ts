import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  listGigs,
  getGig,
  createGig,
  updateGig,
  deleteGig,
  submitGig,
  pauseGig,
  activateGig
} from '../controllers/gigs.controller';

const router = express.Router();

router.get('/', authMiddleware, listGigs);
router.get('/:id', getGig);
router.post('/', authMiddleware, createGig);
router.put('/:id', authMiddleware, updateGig);
router.delete('/:id', authMiddleware, deleteGig);
router.post('/:id/submit', authMiddleware, submitGig);
router.post('/:id/pause', authMiddleware, pauseGig);
router.post('/:id/activate', authMiddleware, activateGig);

export default router;
