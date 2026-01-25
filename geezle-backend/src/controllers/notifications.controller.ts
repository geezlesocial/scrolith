import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';

const ensureAuthId = (req: Request) => req.user?.id as string | undefined;

export const listNotifications = async (req: Request, res: Response) => {
  try {
    const authId = ensureAuthId(req);
    if (!authId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const notifications = await prisma.notification.findMany({ where: { userId: authId }, orderBy: { createdAt: 'desc' }, take: 100 });
    return res.json({ success: true, data: notifications.map(n => ({ id: n.id, type: n.type, title: n.title, body: n.body, actor_id: n.actorId, is_read: n.isRead, created_at: n.createdAt })) });
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
    return res.json({ success: true, data: notifications.map(n => ({ id: n.id, type: n.type, title: n.title, body: n.body, actor_id: n.actorId, is_read: n.isRead, meta: n.meta, created_at: n.createdAt })) });
  } catch (error: any) {
    console.error('List notifications for user error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load notifications' });
  }
};
