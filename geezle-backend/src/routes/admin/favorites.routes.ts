import express from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminMiddleware } from '../../middleware/admin.middleware';
import { listFavoritesAdmin, getTopFavorites } from '../../controllers/favorites.controller';

const router = express.Router();

router.get('/', authMiddleware, adminMiddleware, listFavoritesAdmin);
router.get('/top', authMiddleware, adminMiddleware, getTopFavorites);

export default router;
