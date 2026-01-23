import { Router } from 'express';
import { getOverview } from '../controllers/freelancerController';

const router = Router();

router.get('/overview', getOverview);

export default router;
