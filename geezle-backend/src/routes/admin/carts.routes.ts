import express from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminMiddleware } from '../../middleware/admin.middleware';
import {
  listCartsAdmin,
  getCartAdmin,
  deleteCartAdmin,
  removeCartItemAdmin
} from '../../controllers/cart.controller';

const router = express.Router();

router.get('/', authMiddleware, adminMiddleware, listCartsAdmin);
router.get('/:id', authMiddleware, adminMiddleware, getCartAdmin);
router.delete('/items/:itemId', authMiddleware, adminMiddleware, removeCartItemAdmin);
router.delete('/:id', authMiddleware, adminMiddleware, deleteCartAdmin);

export default router;
