/**
 * Legacy notification read/mark implementation.
 * Behavior-identical extraction of prior notifications.controller logic (Phase 10.2).
 * NI-CORE façade delegates here — no ranking, delivery, or schema changes.
 */
import prisma from '../../../utils/prismaClient';
import {
  buildNotificationActionUrl,
  normalizeNotificationActionUrl
} from '../../notificationActionUrl.service';
import type { NotificationApiShape } from '../contracts/types';

const getObject = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};

export const parseNotificationLimit = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

export const toApiNotification = (notification: any): NotificationApiShape => {
  const meta = getObject(notification.meta);
  const actionUrl =
    normalizeNotificationActionUrl(meta.action_url || meta.actionUrl || meta.link) ||
    buildNotificationActionUrl(notification.type, {
      ...meta,
      actorId: notification.actorId || meta.actorId || null
    });
  const actorId = notification.actorId || meta.actorId || null;
  const actorName = meta.actorName || null;
  const actorAvatar = meta.actorAvatar || null;
  const entityType = meta.entityType || meta.entity_type || null;
  const entityId = meta.entityId || meta.entity_id || null;
  const parentId = meta.parentId || meta.parent_id || null;
  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    body: notification.body,
    message: notification.body || '',
    actor_id: actorId,
    actorId,
    actor_name: actorName,
    actorName,
    actor_avatar: actorAvatar,
    actorAvatar,
    entity_type: entityType,
    entityType,
    entity_id: entityId,
    entityId,
    parent_id: parentId,
    parentId,
    is_read: notification.isRead,
    isRead: notification.isRead,
    meta,
    metadata: meta,
    action_url: actionUrl,
    actionUrl,
    created_at: notification.createdAt,
    createdAt: notification.createdAt
  };
};

const NOTIFICATION_SELECT = {
  id: true,
  type: true,
  title: true,
  body: true,
  actorId: true,
  meta: true,
  isRead: true,
  createdAt: true
} as const;

export const legacyListNotifications = async (input: {
  userId: string;
  limit?: unknown;
  cursor?: unknown;
  defaultLimit?: number;
  minLimit?: number;
  maxLimit?: number;
}) => {
  const defaultLimit = input.defaultLimit ?? 50;
  const minLimit = input.minLimit ?? 10;
  const maxLimit = input.maxLimit ?? 100;
  const limit = parseNotificationLimit(input.limit, defaultLimit, minLimit, maxLimit);
  const cursorId = String(input.cursor || '').trim();
  const rows = await prisma.notification.findMany({
    where: { userId: input.userId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    select: NOTIFICATION_SELECT
  });
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore ? String(pageRows[pageRows.length - 1]?.id || '') : null;
  return {
    items: pageRows.map(toApiNotification),
    pagination: { limit, hasMore, nextCursor }
  };
};

export const legacyMarkNotificationsRead = async (userId: string, ids: string[]) => {
  const normalized = (Array.isArray(ids) ? ids : []).map((id) => String(id || '').trim()).filter(Boolean);
  if (!normalized.length) {
    const err = new Error('ids required');
    (err as any).statusCode = 400;
    throw err;
  }
  await prisma.notification.updateMany({
    where: { id: { in: normalized }, userId },
    data: { isRead: true }
  });
  return { success: true as const };
};

export const legacyMarkAllNotificationsRead = async (userId: string) => {
  await prisma.notification.updateMany({
    where: { userId, isRead: false },
    data: { isRead: true }
  });
  return { success: true as const };
};
