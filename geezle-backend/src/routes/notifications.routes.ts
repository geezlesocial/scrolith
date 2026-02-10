import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';
import { listNotifications, markAsRead, markAllRead, createNotification, listNotificationsForUser, testPushNotification } from '../controllers/notifications.controller';
import { registerDevice, unregisterDevice } from '../controllers/notificationDevices.controller';

const router = express.Router();

router.get('/', authMiddleware, listNotifications);
router.post('/mark-read', authMiddleware, markAsRead);
router.post('/mark-all-read', authMiddleware, markAllRead);
router.post('/create', authMiddleware, createNotification);
router.get('/user/:userId', authMiddleware, adminMiddleware, listNotificationsForUser);
router.post('/device/register', authMiddleware, registerDevice);
router.post('/device/unregister', authMiddleware, unregisterDevice);
router.post('/test/push', authMiddleware, adminMiddleware, testPushNotification);

export default router;
