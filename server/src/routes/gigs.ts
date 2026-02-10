import express from 'express';
import { devAuth } from '../middleware/auth';
import {
  listGigs,
  getGigById,
  createGig,
  updateGig,
  deleteGig,
  submitGig,
  pauseGig,
  activateGig
} from '../controllers/gigsController';

const router = express.Router();
router.use(devAuth);

router.get('/', listGigs);
router.get('/:id', getGigById);
router.post('/', createGig);
router.put('/:id', updateGig);
router.delete('/:id', deleteGig);

router.post('/:id/submit', submitGig);
router.post('/:id/pause', pauseGig);
router.post('/:id/activate', activateGig);

export default router;
