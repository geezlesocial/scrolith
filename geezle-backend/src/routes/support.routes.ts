import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { requirePermission } from '../middleware/rbac.middleware';
import {
  getCategories,
  saveCategory,
  deleteCategory,
  createTicket,
  getTicketById,
  replyToTicket,
  listTickets,
  listMyTickets,
  updateTicketStatus,
  updateTicketPriority
} from '../controllers/support.controller';

const router = express.Router();

router.get('/categories', getCategories);
router.post('/categories', authMiddleware, saveCategory);
router.delete('/categories/:id', authMiddleware, deleteCategory);

router.post('/tickets', createTicket);
router.post('/tickets/auth', authMiddleware, createTicket);
router.get('/tickets/mine', authMiddleware, listMyTickets);
router.get('/tickets', authMiddleware, requirePermission('disputes.read'), listTickets);
router.get('/tickets/:idOrCode', getTicketById);
router.post('/tickets/:id/replies', authMiddleware, replyToTicket);
router.patch('/tickets/:id/status', authMiddleware, requirePermission('disputes.manage'), updateTicketStatus);
router.patch('/tickets/:id/priority', authMiddleware, requirePermission('disputes.manage'), updateTicketPriority);

export default router;
