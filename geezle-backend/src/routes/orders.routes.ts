import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  listOrders,
  getOrder,
  deliverOrder,
  requestOrderInfo,
  proposeRevision,
  getOrderSummary
} from '../controllers/orders.controller';

const router = express.Router();

router.use(authMiddleware);

router.get('/', listOrders);
router.get('/summary', getOrderSummary);
router.get('/:id', getOrder);
router.post('/:id/deliver', deliverOrder);
router.post('/:id/request-info', requestOrderInfo);
router.post('/:id/propose-revision', proposeRevision);

export default router;
