import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { getRecoAccountsController, submitRecoFeedbackController } from '../controllers/reco.controller';

const router = express.Router();

router.use(authMiddleware);
router.get('/accounts', getRecoAccountsController);
router.post('/feedback', submitRecoFeedbackController);

export default router;
