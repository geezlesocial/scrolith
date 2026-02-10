import express from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminMiddleware } from '../../middleware/admin.middleware';
import { listFavoritesAdmin, getTopFavorites, deleteFavoriteAdmin } from '../../controllers/favorites.controller';

const router = express.Router();

router.get('/', authMiddleware, adminMiddleware, listFavoritesAdmin);
router.get('/top', authMiddleware, adminMiddleware, getTopFavorites);
router.delete('/:id', authMiddleware, adminMiddleware, deleteFavoriteAdmin);

export default router;
