import express from 'express';
import { devAuth } from '../middleware/auth';
import {
  listProposals,
  getProposal,
  createProposal,
  acceptProposal,
  rejectProposal,
  shortlistProposal,
  unshortlistProposal,
  messageProposal,
  withdrawProposal,
  listMyProposals
} from '../controllers/proposalsController';

const router = express.Router();
router.use(devAuth);

router.get('/', listProposals);
router.get('/me', listMyProposals);
router.get('/my', listMyProposals);
router.get('/:id', getProposal);
router.post('/', createProposal);
router.post('/:id/accept', acceptProposal);
router.post('/:id/reject', rejectProposal);
router.post('/:id/shortlist', shortlistProposal);
router.post('/:id/unshortlist', unshortlistProposal);
router.post('/:id/message', messageProposal);
router.post('/:id/withdraw', withdrawProposal);

export default router;
