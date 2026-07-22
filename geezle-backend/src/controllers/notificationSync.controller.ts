/**
 * Phase 32.3 — Sync state, devices list, lifecycle receipts.
 */
import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { NotificationSyncService } from '../services/notificationCenter/notificationSync.service';
import { NotificationLifecycleService } from '../services/notificationCenter/notificationLifecycle.service';
import { NotificationService } from '../services/notificationCenter/NotificationService';

const authId = (req: Request) => req.user?.id as string | undefined;

const handle = (res: Response, error: any, fallback: string) => {
  const status = Number(error?.statusCode || 500);
  return res.status(status).json({
    success: false,
    code: error?.code,
    error: error?.message || fallback
  });
};

export const getSyncState = async (req: Request, res: Response) => {
  try {
    const userId = authId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const deviceId = req.query?.deviceId ? String(req.query.deviceId) : null;
    const data = await NotificationSyncService.getSnapshot(userId);
    if (deviceId) await NotificationSyncService.touchDeviceSync(userId, deviceId);
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to load sync state');
  }
};

export const postSyncHeartbeat = async (req: Request, res: Response) => {
  try {
    const userId = authId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const deviceId = req.body?.deviceId ? String(req.body.deviceId) : null;
    await NotificationSyncService.touchDeviceSync(userId, deviceId);
    const data = await NotificationSyncService.refreshAndPersist(userId, deviceId, 'heartbeat');
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to sync heartbeat');
  }
};

export const listDevices = async (req: Request, res: Response) => {
  try {
    const userId = authId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const rows = await prisma.deviceToken.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
      take: 50
    });
    // Never return full push tokens to the client
    const data = rows.map((r: any) => ({
      id: r.id,
      deviceId: r.deviceId,
      platform: r.platform,
      deviceName: r.deviceName || null,
      appVersion: r.appVersion || null,
      pushStatus: r.pushStatus || 'active',
      notificationCapable: r.notificationCapable !== false,
      lastSeenAt: r.lastSeenAt,
      lastSyncAt: r.lastSyncAt || null,
      createdAt: r.createdAt,
      tokenPrefix: String(r.token || '').slice(0, 8)
    }));
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to list devices');
  }
};

export const removeDevice = async (req: Request, res: Response) => {
  try {
    const userId = authId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const id = String(req.params.deviceId || req.params.id || '').trim();
    if (!id) return res.status(400).json({ success: false, error: 'deviceId required' });
    const removed = await prisma.deviceToken.deleteMany({
      where: {
        userId,
        OR: [{ id }, { deviceId: id }]
      }
    });
    if (!removed.count) return res.status(404).json({ success: false, error: 'Device not found' });
    return res.json({ success: true, data: { removed: removed.count } });
  } catch (error: any) {
    return handle(res, error, 'Failed to remove device');
  }
};

export const postReceipts = async (req: Request, res: Response) => {
  try {
    const userId = authId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const body = req.body || {};
    if (Array.isArray(body.events)) {
      const data = await NotificationLifecycleService.recordBatch(userId, body.events);
      return res.json({ success: true, data });
    }
    const data = await NotificationLifecycleService.record({
      userId,
      notificationId: body.notificationId,
      eventId: body.eventId,
      deviceId: body.deviceId,
      channel: body.channel || 'push',
      lifecycle: body.lifecycle || body.stage || 'delivered',
      clientTimestamp: body.clientTimestamp || body.timestamp,
      metadata: body.metadata,
      idempotencyKey: body.idempotencyKey
    });
    return res.json({ success: true, data });
  } catch (error: any) {
    return handle(res, error, 'Failed to record receipt');
  }
};

/**
 * Unified action endpoint for offline queue flush and Android rich actions.
 * Reuses NotificationService.bulkUpdate / mark paths.
 */
export const postNotificationAction = async (req: Request, res: Response) => {
  try {
    const userId = authId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const action = String(req.body?.action || '').trim().toLowerCase();
    const ids = Array.isArray(req.body?.ids)
      ? req.body.ids.map((id: any) => String(id || '').trim()).filter(Boolean)
      : req.body?.notificationId
        ? [String(req.body.notificationId)]
        : [];
    const deviceId = req.body?.deviceId ? String(req.body.deviceId) : null;
    const clientVersion = req.body?.clientVersion != null ? Number(req.body.clientVersion) : null;

    // Optional optimistic concurrency: if client is far behind, still apply and return fresh snapshot
    const map: Record<string, 'read' | 'unread' | 'archive' | 'unarchive' | 'delete' | 'pin' | 'unpin'> = {
      mark_read: 'read',
      read: 'read',
      mark_unread: 'unread',
      unread: 'unread',
      archive: 'archive',
      unarchive: 'unarchive',
      delete: 'delete',
      pin: 'pin',
      unpin: 'unpin'
    };

    if (action === 'mark_all_read') {
      await NotificationService.markAllRead(userId);
      const sync = await NotificationSyncService.broadcast(userId, {
        reason: 'mark_all_read',
        lastEventAt: undefined
      } as any);
      return res.json({ success: true, data: { action, sync, clientVersion } });
    }

    const bulkAction = map[action];
    if (!bulkAction) {
      return res.status(400).json({ success: false, error: 'Unsupported action' });
    }
    if (!ids.length) {
      return res.status(400).json({ success: false, error: 'ids required' });
    }

    const result = await NotificationService.bulkUpdate({ userId, ids, action: bulkAction });
    if (action === 'mark_read' || action === 'read') {
      await NotificationLifecycleService.record({
        userId,
        notificationId: ids[0],
        deviceId,
        channel: 'in_app',
        lifecycle: 'read',
        clientTimestamp: req.body?.clientTimestamp
      }).catch(() => null);
    }
    const sync = await NotificationSyncService.broadcast(userId, {
      reason: action,
      ids
    } as any);
    return res.json({ success: true, data: { ...result, action: bulkAction, sync } });
  } catch (error: any) {
    return handle(res, error, 'Failed to apply notification action');
  }
};
