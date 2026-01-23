import express from 'express';
import { devAuth } from '../middleware/auth';
import { listProposals, acceptProposal, rejectProposal, inviteProposal } from '../controllers/proposalsController';

const router = express.Router();
router.use(devAuth);

router.get('/', listProposals);
router.post('/:id/accept', acceptProposal);
router.post('/:id/reject', rejectProposal);
router.post('/invite', inviteProposal);

export default router;
