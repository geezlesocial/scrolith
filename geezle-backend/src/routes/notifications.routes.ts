import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';
import { listNotifications, markAsRead, markAllRead, createNotification, listNotificationsForUser } from '../controllers/notifications.controller';

const router = express.Router();

router.get('/', authMiddleware, listNotifications);
router.post('/mark-read', authMiddleware, markAsRead);
router.post('/mark-all-read', authMiddleware, markAllRead);
router.post('/create', authMiddleware, createNotification);
router.get('/user/:userId', authMiddleware, adminMiddleware, listNotificationsForUser);

export default router;
