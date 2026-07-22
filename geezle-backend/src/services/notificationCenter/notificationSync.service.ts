/**
 * Phase 32.3 — Cross-device sync snapshot, badge refresh, realtime broadcast.
 */
import { randomUUID } from 'crypto';
import prisma from '../../utils/prismaClient';
import { NotificationFocusModeService } from './focusMode.service';
import { writeNotificationAudit, bumpNotificationMetric } from './analytics';

const isMissing = (err: any) =>
  err?.code === 'P2021' ||
  err?.code === 'P2022' ||
  /does not exist|Unknown arg/i.test(String(err?.message || ''));

export type NotificationSyncSnapshot = {
  userId: string;
  serverTime: string;
  version: number;
  badgeCount: number;
  unreadCount: number;
  total: number;
  archived: number;
  pinned: number;
  focusActive: boolean;
  focus: any | null;
  preferenceVersion: number | null;
  quietHoursActive: boolean;
  lastEventAt: string | null;
};

async function countUnread(userId: string): Promise<{ unread: number; total: number; archived: number; pinned: number }> {
  try {
    const [unread, total, archived, pinned] = await Promise.all([
      prisma.notification.count({
        where: { userId, isRead: false, deletedAt: null } as any
      }),
      prisma.notification.count({
        where: { userId, deletedAt: null } as any
      }),
      prisma.notification.count({
        where: { userId, archivedAt: { not: null }, deletedAt: null } as any
      }),
      prisma.notification.count({
        where: { userId, pinnedAt: { not: null }, deletedAt: null } as any
      })
    ]);
    return { unread, total, archived, pinned };
  } catch {
    try {
      const unread = await prisma.notification.count({ where: { userId, isRead: false } });
      const total = await prisma.notification.count({ where: { userId } });
      return { unread, total, archived: 0, pinned: 0 };
    } catch {
      return { unread: 0, total: 0, archived: 0, pinned: 0 };
    }
  }
}

export class NotificationSyncService {
  static async getSnapshot(userId: string): Promise<NotificationSyncSnapshot> {
    const counts = await countUnread(userId);
    let focus: any = null;
    try {
      focus = await NotificationFocusModeService.getActive(userId);
    } catch {
      focus = null;
    }

    let preferenceVersion: number | null = null;
    try {
      const g = await (prisma as any).notificationGlobalPreference.findUnique({
        where: { userId },
        select: { version: true }
      });
      preferenceVersion = g?.version ?? null;
    } catch {
      preferenceVersion = null;
    }

    let quietHoursActive = false;
    try {
      const qh = await prisma.quietHourRule.count({ where: { userId, isActive: true } });
      quietHoursActive = qh > 0;
    } catch {
      quietHoursActive = false;
    }

    let version = 1;
    let lastEventAt: string | null = null;
    try {
      const row = await (prisma as any).notificationSyncState.findUnique({ where: { userId } });
      if (row) {
        version = row.version || 1;
        lastEventAt = row.lastEventAt ? new Date(row.lastEventAt).toISOString() : null;
      }
    } catch {
      /* pre-migration */
    }

    return {
      userId,
      serverTime: new Date().toISOString(),
      version,
      badgeCount: counts.unread,
      unreadCount: counts.unread,
      total: counts.total,
      archived: counts.archived,
      pinned: counts.pinned,
      focusActive: Boolean(focus),
      focus,
      preferenceVersion,
      quietHoursActive,
      lastEventAt
    };
  }

  /**
   * Persist badge/unread cursor and bump version for conflict resolution.
   * Deterministic: version always increments; counts are source-of-truth from DB.
   */
  static async refreshAndPersist(userId: string, deviceId?: string | null, reason?: string) {
    const snapshot = await this.getSnapshot(userId);
    try {
      const existing = await (prisma as any).notificationSyncState.findUnique({ where: { userId } });
      const version = (existing?.version || 0) + 1;
      await (prisma as any).notificationSyncState.upsert({
        where: { userId },
        create: {
          id: randomUUID(),
          userId,
          badgeCount: snapshot.badgeCount,
          unreadCount: snapshot.unreadCount,
          version,
          lastDeviceId: deviceId || null,
          lastEventAt: new Date(),
          metadata: reason ? { reason } : undefined
        },
        update: {
          badgeCount: snapshot.badgeCount,
          unreadCount: snapshot.unreadCount,
          version,
          lastDeviceId: deviceId || null,
          lastEventAt: new Date(),
          metadata: reason ? { reason } : undefined
        }
      });
      snapshot.version = version;
      snapshot.lastEventAt = new Date().toISOString();
    } catch (err) {
      if (!isMissing(err)) {
        console.warn('[notification-sync] persist failed', (err as any)?.message);
      }
    }
    return snapshot;
  }

  /** Broadcast cross-device sync payload over existing realtime bus */
  static async broadcast(
    userId: string,
    payload: Partial<NotificationSyncSnapshot> & { reason?: string; ids?: string[]; deviceId?: string | null } = {}
  ) {
    try {
      const realtime = (await import('../../utils/realtime')).default;
      const base = await this.refreshAndPersist(userId, payload.deviceId, payload.reason);
      const message = {
        ...base,
        reason: payload.reason || 'sync',
        ids: payload.ids || undefined,
        focus: payload.focus !== undefined ? payload.focus : base.focus,
        focusActive: payload.focus !== undefined ? Boolean(payload.focus) : base.focusActive
      };
      realtime.emitToUser(userId, 'notifications:sync', message);
      realtime.emitToUser(userId, 'notifications:badge', {
        badgeCount: message.badgeCount,
        unreadCount: message.unreadCount,
        version: message.version,
        serverTime: message.serverTime
      });
      await bumpNotificationMetric('sync_broadcast', null, 1);
      return message;
    } catch (err) {
      console.warn('[notification-sync] broadcast failed', (err as any)?.message);
      return null;
    }
  }

  static async touchDeviceSync(userId: string, deviceId: string | null | undefined) {
    if (!deviceId) return;
    try {
      await (prisma as any).deviceToken.updateMany({
        where: { userId, deviceId },
        data: { lastSyncAt: new Date(), lastSeenAt: new Date() }
      });
    } catch {
      /* optional columns */
    }
  }
}

export default NotificationSyncService;
