import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  getCart,
  addCartItem,
  updateCartItem,
  removeCartItem,
  clearCart
} from '../controllers/cart.controller';

const router = express.Router();

router.get('/', authMiddleware, getCart);
router.post('/items', authMiddleware, addCartItem);
router.patch('/items/:id', authMiddleware, updateCartItem);
router.delete('/items/:id', authMiddleware, removeCartItem);
router.delete('/items', authMiddleware, removeCartItem);
router.delete('/', authMiddleware, clearCart);

export default router;
