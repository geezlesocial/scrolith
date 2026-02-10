import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  listProposals,
  getProposal,
  listMyProposals,
  createProposal,
  acceptProposal,
  rejectProposal,
  shortlistProposal,
  unshortlistProposal,
  messageFreelancer,
  scheduleInterview,
  withdrawProposal
} from '../controllers/proposals.controller';

const router = express.Router();

router.use(authMiddleware);

router.post('/', createProposal);
router.get('/', listProposals);
router.get('/me', listMyProposals);
router.get('/my', listMyProposals);
router.get('/:id', getProposal);
router.post('/:id/accept', acceptProposal);
router.post('/:id/reject', rejectProposal);
router.post('/:id/shortlist', shortlistProposal);
router.post('/:id/unshortlist', unshortlistProposal);
router.post('/:id/message', messageFreelancer);
router.post('/:id/interview', scheduleInterview);
router.post('/:id/withdraw', withdrawProposal);

export default router;
