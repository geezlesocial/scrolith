/**
 * Phase 20.2.6R — notification grouping, mute, and ranking helpers.
 */

import { getNotificationCategoryMeta } from './notificationTaxonomy';

export type NotificationMuteScope = {
  conversationId?: string;
  category?: string;
  mutedUntil?: number | null;
};

const MUTE_KEY = 'scrolith.notification.mutes.v1';

const readMutes = (): NotificationMuteScope[] => {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem(MUTE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeMutes = (rows: NotificationMuteScope[]) => {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(MUTE_KEY, JSON.stringify(rows.slice(0, 200)));
  } catch {
    // ignore quota
  }
};

export const muteConversationNotifications = (conversationId: string, durationMs = 86_400_000) => {
  const id = String(conversationId || '').trim();
  if (!id) return;
  const rows = readMutes().filter((row) => row.conversationId !== id);
  rows.push({ conversationId: id, mutedUntil: Date.now() + Math.max(60_000, durationMs) });
  writeMutes(rows);
};

export const unmuteConversationNotifications = (conversationId: string) => {
  const id = String(conversationId || '').trim();
  if (!id) return;
  writeMutes(readMutes().filter((row) => row.conversationId !== id));
};

export const isNotificationMuted = (notification: any): boolean => {
  const now = Date.now();
  const meta = notification?.metadata && typeof notification.metadata === 'object' ? notification.metadata : {};
  const conversationId = String(
    notification?.conversationId || meta.conversationId || meta.conversation_id || ''
  ).trim();
  const category = getNotificationCategoryMeta({
    type: notification?.type,
    category: notification?.category || meta.category,
    metadata: meta
  }).key;

  return readMutes().some((row) => {
    if (row.mutedUntil && row.mutedUntil < now) return false;
    if (row.conversationId && conversationId && row.conversationId === conversationId) return true;
    if (row.category && row.category === category) return true;
    return false;
  });
};

export type GroupedNotification = {
  groupKey: string;
  label: string;
  count: number;
  latest: any;
  items: any[];
};

/**
 * Group notifications by conversation (messages) or category for smart collapsing.
 */
export const groupNotificationsForDisplay = (notifications: any[]): GroupedNotification[] => {
  const list = Array.isArray(notifications) ? notifications : [];
  const groups = new Map<string, GroupedNotification>();

  list.forEach((n) => {
    if (isNotificationMuted(n)) return;
    const meta = n?.metadata && typeof n.metadata === 'object' ? n.metadata : {};
    const conversationId = String(n?.conversationId || meta.conversationId || meta.conversation_id || '').trim();
    const categoryMeta = getNotificationCategoryMeta({
      type: n?.type,
      category: n?.category || meta.category,
      metadata: meta
    });
    const groupKey = conversationId
      ? `conversation:${conversationId}`
      : `category:${categoryMeta.key}`;
    const label = conversationId
      ? `${categoryMeta.label} thread`
      : categoryMeta.label;

    const existing = groups.get(groupKey);
    if (!existing) {
      groups.set(groupKey, { groupKey, label, count: 1, latest: n, items: [n] });
      return;
    }
    existing.count += 1;
    existing.items.push(n);
    const existingTs = Date.parse(String(existing.latest?.timestamp || existing.latest?.createdAt || 0));
    const nextTs = Date.parse(String(n?.timestamp || n?.createdAt || 0));
    if (nextTs >= existingTs) existing.latest = n;
  });

  return Array.from(groups.values()).sort((a, b) => {
    const aTs = Date.parse(String(a.latest?.timestamp || a.latest?.createdAt || 0));
    const bTs = Date.parse(String(b.latest?.timestamp || b.latest?.createdAt || 0));
    return bTs - aTs;
  });
};

/** Priority score for ranking (higher first). */
export const scoreNotificationPriority = (notification: any): number => {
  const category = getNotificationCategoryMeta({
    type: notification?.type,
    category: notification?.category || notification?.metadata?.category,
    metadata: notification?.metadata
  }).key;
  const unread = !Boolean(notification?.isRead ?? notification?.is_read);
  const base =
    category === 'security'
      ? 100
      : category === 'message'
        ? 90
        : category === 'mention'
          ? 80
          : category === 'scrolitha'
            ? 70
            : 40;
  return base + (unread ? 10 : 0);
};
