import express from 'express';
import { devAuth } from '../middleware/auth';
import { listJobs, createJob, updateJob, deleteJob, jobAction } from '../controllers/jobsController';

const router = express.Router();
router.use(devAuth);

router.get('/', listJobs);
router.post('/', createJob);
router.put('/:id', updateJob);
router.delete('/:id', deleteJob);

router.post('/:id/:action', jobAction);

export default router;
