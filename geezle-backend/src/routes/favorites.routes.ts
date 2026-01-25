import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  listFavorites,
  addFavorite,
  removeFavorite,
  getExpandedFavorites,
  getFavoritesReceived
} from '../controllers/favorites.controller';

const router = express.Router();

router.get('/', authMiddleware, listFavorites);
router.post('/', authMiddleware, addFavorite);
router.delete('/', authMiddleware, removeFavorite);
router.get('/expanded', authMiddleware, getExpandedFavorites);
router.get('/received', authMiddleware, getFavoritesReceived);

export default router;
