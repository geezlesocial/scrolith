import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';
import { listNotifications, markAsRead, markAllRead, createNotification, listNotificationsForUser, testPushNotification } from '../controllers/notifications.controller';
import { registerDevice, unregisterDevice } from '../controllers/notificationDevices.controller';
import { createMyQuietHourRule, deactivateMyQuietHourRule, getMyQuietHours } from '../services/journey.service';

const router = express.Router();

router.get('/', authMiddleware, listNotifications);
router.post('/mark-read', authMiddleware, markAsRead);
router.post('/mark-all-read', authMiddleware, markAllRead);
router.post('/create', authMiddleware, createNotification);
router.get('/user/:userId', authMiddleware, adminMiddleware, listNotificationsForUser);
router.get('/quiet-hours', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const data = await getMyQuietHours(userId);
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load quiet hours' });
  }
});
router.post('/quiet-hours', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const data = await createMyQuietHourRule(userId, req.body || {});
    return res.status(201).json({ success: true, data });
  } catch (error: any) {
    const message = error?.message || 'Failed to create quiet hour rule';
    const code = String(message).toLowerCase().includes('required') ? 400 : 500;
    return res.status(code).json({ success: false, error: message });
  }
});
router.delete('/quiet-hours/:id', authMiddleware, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const data = await deactivateMyQuietHourRule(userId, String(req.params.id || ''));
    return res.json({ success: true, data });
  } catch (error: any) {
    const message = error?.message || 'Failed to deactivate quiet hour rule';
    const status = String(message).toLowerCase().includes('not found') ? 404 : 500;
    return res.status(status).json({ success: false, error: message });
  }
});
router.post('/device/register', authMiddleware, registerDevice);
router.post('/device/unregister', authMiddleware, unregisterDevice);
router.post('/test/push', authMiddleware, adminMiddleware, testPushNotification);

export default router;
