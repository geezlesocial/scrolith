import { Request, Response } from 'express';
import { getPushRuntimeStatus, isPushEnabled, sendPushToUser } from '../services/pushNotifications';
import {
  notificationIntelligenceService
} from '../services/notificationIntelligence';
import { NotificationService } from '../services/notificationCenter';

const ensureAuthId = (req: Request) => req.user?.id as string | undefined;

const isAdminRole = (role: unknown) => String(role || '').toLowerCase().includes('admin');

const requestIdOf = (req: Request) =>
  String(req.headers['x-request-id'] || req.headers['x-correlation-id'] || '').trim() || null;

export const listNotifications = async (req: Request, res: Response) => {
  try {
    const authId = ensureAuthId(req);
    if (!authId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    // Phase 32.0/32.1 inbox list with search/filters; falls back to NI legacy path
    const q = String(req.query?.q || req.query?.search || '').trim();
    const result = await NotificationService.listInbox({
      userId: authId,
      limit: req.query?.limit,
      cursor: req.query?.cursor,
      category: (req.query?.category as string) || null,
      q: q || null,
      search: q || null,
      unreadOnly:
        String(req.query?.unreadOnly || '') === 'true' ||
        String(req.query?.unread || '') === '1' ||
        String(req.query?.filter || '') === 'unread',
      readOnly:
        String(req.query?.readOnly || '') === 'true' || String(req.query?.filter || '') === 'read',
      includeArchived:
        String(req.query?.includeArchived || '') === 'true' ||
        String(req.query?.filter || '') === 'archived',
      archivedOnly: String(req.query?.archivedOnly || '') === 'true' || String(req.query?.filter || '') === 'archived',
      includeDeleted: String(req.query?.includeDeleted || '') === 'true',
      priority: (req.query?.priority as string) || null,
      highPriorityOnly:
        String(req.query?.highPriorityOnly || '') === 'true' ||
        String(req.query?.filter || '') === 'high',
      criticalOnly:
        String(req.query?.criticalOnly || '') === 'true' ||
        String(req.query?.filter || '') === 'critical',
      pinnedOnly:
        String(req.query?.pinnedOnly || '') === 'true' || String(req.query?.filter || '') === 'pinned',
      timeRange: (req.query?.timeRange as string) || (req.query?.range as string) || null
    });
    return res.json({
      success: true,
      data: result.items,
      pagination: result.pagination
    });
  } catch (error: any) {
    console.error('List notifications error:', error);
    // Fallback to Phase 10.2 NI façade if foundation path fails unexpectedly
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
    } catch (fallbackError: any) {
      return res.status(500).json({
        success: false,
        error: fallbackError.message || error.message || 'Failed to load notifications'
      });
    }
  }
};

export const markAsRead = async (req: Request, res: Response) => {
  try {
    const authId = ensureAuthId(req);
    if (!authId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    try {
      await NotificationService.markRead(authId, ids);
    } catch (err: any) {
      if (Number(err?.statusCode) === 400) {
        return res.status(400).json({ success: false, error: err.message || 'ids required' });
      }
      // Compatibility fallback
      await notificationIntelligenceService.markRead({
        viewerId: authId,
        ids,
        requestId: requestIdOf(req)
      });
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

    await NotificationService.markAllRead(authId);
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Mark all notifications read error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to mark notifications' });
  }
};

/**
 * Create notification.
 * Phase 10.2 security: recipient must be the authenticated user, or caller must be admin.
 * Phase 32.0: routed through NotificationService.emit for taxonomy/dedup/audit.
 */
export const createNotification = async (req: Request, res: Response) => {
  try {
    const authId = ensureAuthId(req);
    if (!authId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { userId, actorId, type, title, body, category, priority, deepLink, metadata, idempotencyKey } =
      req.body || {};
    if (!userId || !type) return res.status(400).json({ success: false, error: 'userId and type are required' });

    const targetUserId = String(userId).trim();
    const admin = isAdminRole(req.user?.role);
    if (targetUserId !== authId && !admin) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const result = await NotificationService.emit({
      recipientId: targetUserId,
      actorId: actorId || authId || null,
      type: String(type),
      title: title || '',
      body: body || '',
      category,
      priority,
      deepLink,
      metadata: metadata || req.body?.meta || null,
      idempotencyKey: idempotencyKey || null,
      source: 'api.notifications.create',
      correlationId: requestIdOf(req)
    });

    const first = result.items[0];
    return res.json({
      success: true,
      data: {
        id: first?.notificationId || null,
        eventId: result.eventId,
        status: first?.status || 'failed',
        emit: result
      }
    });
  } catch (error: any) {
    console.error('Create notification error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to create notification' });
  }
};

/** Phase 32.0 — unified emit (admin or self multi-recipient via service policies) */
export const emitNotification = async (req: Request, res: Response) => {
  try {
    const authId = ensureAuthId(req);
    if (!authId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const admin = isAdminRole(req.user?.role);
    const body = req.body || {};
    let recipientIds: string[] = Array.isArray(body.recipientIds)
      ? body.recipientIds.map((id: any) => String(id || '').trim()).filter(Boolean)
      : [];
    if (body.recipientId) recipientIds.push(String(body.recipientId).trim());
    recipientIds = Array.from(new Set(recipientIds.filter(Boolean)));

    if (!recipientIds.length) {
      return res.status(400).json({ success: false, error: 'recipientId or recipientIds required' });
    }
    if (!body.type) {
      return res.status(400).json({ success: false, error: 'type is required' });
    }

    // Non-admins may only emit to self
    if (!admin && recipientIds.some((id) => id !== authId)) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    const result = await NotificationService.emit({
      ...body,
      recipientIds,
      actorId: body.actorId || authId,
      source: body.source || 'api.notifications.emit',
      correlationId: requestIdOf(req)
    });

    return res.status(201).json({ success: true, data: result });
  } catch (error: any) {
    console.error('Emit notification error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to emit notification' });
  }
};

export const getNotificationSummary = async (req: Request, res: Response) => {
  try {
    const authId = ensureAuthId(req);
    if (!authId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const data = await NotificationService.getSummary(authId);
    return res.json({ success: true, data });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Failed to load summary' });
  }
};

export const bulkUpdateNotifications = async (req: Request, res: Response) => {
  try {
    const authId = ensureAuthId(req);
    if (!authId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const action = String(req.body?.action || '').trim() as any;
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const result = await NotificationService.bulkUpdate({ userId: authId, ids, action });
    return res.json({ success: true, data: result });
  } catch (error: any) {
    const status = Number(error?.statusCode || 500);
    return res.status(status).json({
      success: false,
      code: error?.code,
      error: error.message || 'Failed to update notifications'
    });
  }
};

export const markAsUnread = async (req: Request, res: Response) => {
  try {
    const authId = ensureAuthId(req);
    if (!authId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    await NotificationService.markUnread(authId, ids);
    return res.json({ success: true });
  } catch (error: any) {
    const status = Number(error?.statusCode || 500);
    return res.status(status).json({ success: false, error: error.message || 'Failed to mark unread' });
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
