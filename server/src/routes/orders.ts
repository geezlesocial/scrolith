import express from 'express';
import { devAuth } from '../middleware/auth';
import { listOrders, getOrder, deliverOrder, requestInfo, proposeRevision } from '../controllers/ordersController';

const router = express.Router();
router.use(devAuth);

router.get('/', listOrders);
router.get('/:id', getOrder);

router.post('/:id/deliver', deliverOrder);
router.post('/:id/request-info', requestInfo);
router.post('/:id/propose-revision', proposeRevision);

export default router;
