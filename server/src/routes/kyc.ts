import express from 'express';
import { devAuth } from '../middleware/auth';
import { getKYC, submitKYC, updateKYC } from '../controllers/kycController';

const router = express.Router();
router.use(devAuth);

router.get('/me', getKYC);
router.get('/', getKYC);
router.post('/', submitKYC);
router.post('/submit', submitKYC);
router.put('/:id', updateKYC);

export default router;
