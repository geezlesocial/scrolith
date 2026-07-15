import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { getPushRuntimeStatus, isPushEnabled, sendPushToUser } from '../services/pushNotifications';
import {
  notificationIntelligenceService
} from '../services/notificationIntelligence';

const ensureAuthId = (req: Request) => req.user?.id as string | undefined;

const isAdminRole = (role: unknown) => String(role || '').toLowerCase().includes('admin');

const requestIdOf = (req: Request) =>
  String(req.headers['x-request-id'] || req.headers['x-correlation-id'] || '').trim() || null;

export const listNotifications = async (req: Request, res: Response) => {
  try {
    const authId = ensureAuthId(req);
    if (!authId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const result = await notificationIntelligenceService.listForViewer({
      viewerId: authId,
      limit: req.query?.limit,
      cursor: req.query?.cursor,
      requestId: requestIdOf(req)
    });
    return res.json({
      success: true,
      data: result.items,
      pagination: result.pagination
    });
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
    try {
      await notificationIntelligenceService.markRead({
        viewerId: authId,
        ids,
        requestId: requestIdOf(req)
      });
    } catch (err: any) {
      if (Number(err?.statusCode) === 400) {
        return res.status(400).json({ success: false, error: err.message || 'ids required' });
      }
      throw err;
    }
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

    await notificationIntelligenceService.markAllRead({
      viewerId: authId,
      requestId: requestIdOf(req)
    });
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Mark all notifications read error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to mark notifications' });
  }
};

/**
 * Create notification.
 * Phase 10.2 security: recipient must be the authenticated user, or caller must be admin.
 * Does not widen permissions; closes IDOR (Phase 10.1.5 R1) without new write APIs.
 */
export const createNotification = async (req: Request, res: Response) => {
  try {
    const authId = ensureAuthId(req);
    if (!authId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { userId, actorId, type, title, body } = req.body || {};
    if (!userId || !type) return res.status(400).json({ success: false, error: 'userId and type are required' });

    const targetUserId = String(userId).trim();
    const admin = isAdminRole(req.user?.role);
    if (targetUserId !== authId && !admin) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const created = await prisma.notification.create({
      data: {
        userId: targetUserId,
        actorId: actorId || null,
        type,
        title: title || '',
        body: body || '',
        isRead: false
      }
    });
    return res.json({ success: true, data: { id: created.id } });
  } catch (error: any) {
    console.error('Create notification error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to create notification' });
  }
};

export const listNotificationsForUser = async (req: Request, res: Response) => {
  try {
    const role = req.user?.role || '';
    if (!isAdminRole(role)) return res.status(403).json({ success: false, error: 'Forbidden' });
    const userId = req.params.userId;
    if (!userId) return res.status(400).json({ success: false, error: 'userId required' });

    const result = await notificationIntelligenceService.listForUserAdmin({
      userId,
      limit: req.query?.limit,
      cursor: req.query?.cursor,
      requestId: requestIdOf(req)
    });
    return res.json({
      success: true,
      data: result.items,
      pagination: result.pagination
    });
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
      return res.status(503).json({
        success: false,
        error: 'FCM not initialized',
        data: {
          pushRuntime: getPushRuntimeStatus()
        }
      });
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
