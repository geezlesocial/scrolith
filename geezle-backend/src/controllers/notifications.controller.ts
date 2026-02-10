import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { isPushEnabled, sendPushToUser } from '../services/pushNotifications';

const ensureAuthId = (req: Request) => req.user?.id as string | undefined;
const getObject = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};

const toApiNotification = (notification: any) => {
  const meta = getObject(notification.meta);
  const actionUrl = meta.action_url || meta.actionUrl || meta.link || null;
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

export const listNotifications = async (req: Request, res: Response) => {
  try {
    const authId = ensureAuthId(req);
    if (!authId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const notifications = await prisma.notification.findMany({ where: { userId: authId }, orderBy: { createdAt: 'desc' }, take: 100 });
    return res.json({ success: true, data: notifications.map(toApiNotification) });
  } catch (error: any) {
    console.error('List notifications error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load notifications' });
  }
};

export const markAsRead = async (req: Request, res: Response) => {
  try {
    const authId = ensureAuthId(req);
    if (!authId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ success: false, error: 'ids required' });

    await prisma.notification.updateMany({ where: { id: { in: ids }, userId: authId }, data: { isRead: true } });
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Mark notifications read error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to mark notifications' });
  }
};

export const markAllRead = async (req: Request, res: Response) => {
  try {
    const authId = ensureAuthId(req);
    if (!authId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    await prisma.notification.updateMany({ where: { userId: authId, isRead: false }, data: { isRead: true } });
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Mark all notifications read error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to mark notifications' });
  }
};

export const createNotification = async (req: Request, res: Response) => {
  try {
    const { userId, actorId, type, title, body } = req.body || {};
    if (!userId || !type) return res.status(400).json({ success: false, error: 'userId and type are required' });

    const created = await prisma.notification.create({ data: { userId, actorId: actorId || null, type, title: title || '', body: body || '', isRead: false } });
    return res.json({ success: true, data: { id: created.id } });
  } catch (error: any) {
    console.error('Create notification error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to create notification' });
  }
};

export const listNotificationsForUser = async (req: Request, res: Response) => {
  try {
    // Admin-only
    const role = req.user?.role || '';
    if (!role.toString().toLowerCase().includes('admin')) return res.status(403).json({ success: false, error: 'Forbidden' });
    const userId = req.params.userId;
    if (!userId) return res.status(400).json({ success: false, error: 'userId required' });
    const notifications = await prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 200 });
    return res.json({ success: true, data: notifications.map(toApiNotification) });
  } catch (error: any) {
    console.error('List notifications for user error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load notifications' });
  }
};

export const testPushNotification = async (req: Request, res: Response) => {
  try {
    const { toUserId, title, body, deepLink, data } = req.body || {};
    if (!toUserId || !title || !body) {
      return res.status(400).json({ success: false, error: 'toUserId, title, and body are required' });
    }

    if (!isPushEnabled()) {
      return res.status(503).json({ success: false, error: 'FCM not initialized' });
    }

    const result = await sendPushToUser(String(toUserId), {
      type: data?.type || 'test',
      title: String(title),
      body: String(body),
      deepLink: deepLink ? String(deepLink) : undefined,
      data: data && typeof data === 'object' ? data : undefined
    });

    return res.json({ success: true, data: result });
  } catch (error: any) {
    console.error('Test push error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to send test push' });
  }
};
