import express from 'express';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware';
import {
  listJobs,
  getJob,
  createJob,
  updateJob,
  deleteJob,
  submitJob,
  pauseJob,
  activateJob,
  closeJob
} from '../controllers/jobs.controller';

const router = express.Router();

router.get('/', optionalAuthMiddleware, listJobs);
router.get('/:id', optionalAuthMiddleware, getJob);
router.post('/', authMiddleware, createJob);
router.put('/:id', authMiddleware, updateJob);
router.delete('/:id', authMiddleware, deleteJob);
router.post('/:id/submit', authMiddleware, submitJob);
router.post('/:id/pause', authMiddleware, pauseJob);
router.post('/:id/activate', authMiddleware, activateJob);
router.post('/:id/close', authMiddleware, closeJob);

export default router;
