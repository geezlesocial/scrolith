import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { getMatchController, getMutualMatchController, postMatchDismissController, postMatchInterestController, postMutualConversationController } from '../controllers/scrolithMatch.controller';

const router = express.Router();
router.use(authMiddleware);
router.get('/', getMatchController);
router.get('/mutual', getMutualMatchController);
router.post('/conversation', postMutualConversationController);
router.post('/interest', postMatchInterestController);
router.post('/dismiss', postMatchDismissController);
export default router;
