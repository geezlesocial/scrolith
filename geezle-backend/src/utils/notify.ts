import realtime from './realtime';
import { sendPushToAdmins, sendPushToUser } from '../services/pushNotifications';
import { buildNotificationActionUrl, normalizeNotificationActionUrl } from '../services/notificationActionUrl.service';

const buildId = () => `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const nowIso = () => new Date().toISOString();

export type NotificationPayload = {
  id?: string;
  type?: string;
  title?: string;
  body?: string;
  message?: string;
  link?: string;
  actionUrl?: string;
  action_url?: string;
  meta?: Record<string, any>;
  createdAt?: string;
};

const normalizePayload = (payload: NotificationPayload) => {
  const type = payload.type || 'system';
  const actionUrl =
    normalizeNotificationActionUrl(payload.actionUrl || payload.action_url || payload.link) ||
    buildNotificationActionUrl(type, payload.meta);

  return {
    id: payload.id || buildId(),
    type,
    title: payload.title || 'Notification',
    body: payload.body || payload.message || '',
    actionUrl,
    action_url: actionUrl,
    link: actionUrl,
    meta: payload.meta || undefined,
    createdAt: payload.createdAt || nowIso()
  };
};

export const notifyUser = (userId: string | undefined | null, payload: NotificationPayload) => {
  if (!userId) return;
  try {
    const normalized = normalizePayload(payload);
    realtime.emitToUser(userId, 'notifications:new', normalized);
    void sendPushToUser(String(userId), normalized);
  } catch (e) {
    // swallow
  }
};

export const notifyAdmins = (payload: NotificationPayload) => {
  try {
    const normalized = normalizePayload(payload);
    realtime.emitToRoom('community:admin', 'notifications:new', normalized);
    void sendPushToAdmins(normalized);
  } catch (e) {
    // swallow
  }
};
