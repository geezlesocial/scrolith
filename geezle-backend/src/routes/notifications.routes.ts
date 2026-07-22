import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';
import {
  listNotifications,
  markAsRead,
  markAllRead,
  createNotification,
  listNotificationsForUser,
  testPushNotification,
  emitNotification,
  getNotificationSummary,
  bulkUpdateNotifications,
  markAsUnread
} from '../controllers/notifications.controller';
import { registerDevice, unregisterDevice } from '../controllers/notificationDevices.controller';
import {
  createMyQuietHourRule,
  deactivateMyQuietHourRule,
  getMyQuietHours
} from '../services/journey.service';
import {
  getPreferencesBundle,
  patchPreferencesGlobal,
  patchPreferenceCategory,
  patchPreferenceEvent,
  resetPreferences,
  putQuietHours,
  getFocusMode,
  startFocusMode,
  stopFocusMode,
  getDigestSettings,
  putDigestSettings,
  listDigests,
  getDigest,
  markDigestRead,
  evaluateDeliveryPolicy
} from '../controllers/notificationPreferences.controller';

const router = express.Router();

router.get('/', authMiddleware, listNotifications);
router.get('/summary', authMiddleware, getNotificationSummary);
router.get('/counters', authMiddleware, getNotificationSummary);
router.post('/mark-read', authMiddleware, markAsRead);
router.post('/mark-unread', authMiddleware, markAsUnread);
router.post('/mark-all-read', authMiddleware, markAllRead);
router.post('/bulk', authMiddleware, bulkUpdateNotifications);
router.post('/create', authMiddleware, createNotification);
router.post('/emit', authMiddleware, emitNotification);
router.get('/user/:userId', authMiddleware, adminMiddleware, listNotificationsForUser);

// Phase 32.2 — Preferences
router.get('/preferences', authMiddleware, getPreferencesBundle);
router.patch('/preferences', authMiddleware, patchPreferencesGlobal);
router.patch('/preferences/categories/:category', authMiddleware, patchPreferenceCategory);
router.patch('/preferences/events/:eventType', authMiddleware, patchPreferenceEvent);
router.post('/preferences/reset', authMiddleware, resetPreferences);
router.post('/preferences/evaluate', authMiddleware, evaluateDeliveryPolicy);

// Quiet hours
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
router.put('/quiet-hours', authMiddleware, putQuietHours);
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

// Focus mode
router.get('/focus-mode', authMiddleware, getFocusMode);
router.post('/focus-mode', authMiddleware, startFocusMode);
router.delete('/focus-mode', authMiddleware, stopFocusMode);

// Digests
router.get('/digest-settings', authMiddleware, getDigestSettings);
router.put('/digest-settings', authMiddleware, putDigestSettings);
router.get('/digests', authMiddleware, listDigests);
router.get('/digests/:digestId', authMiddleware, getDigest);
router.post('/digests/:digestId/mark-read', authMiddleware, markDigestRead);

router.post('/device/register', authMiddleware, registerDevice);
router.post('/device/unregister', authMiddleware, unregisterDevice);
router.post('/test/push', authMiddleware, adminMiddleware, testPushNotification);

export default router;
