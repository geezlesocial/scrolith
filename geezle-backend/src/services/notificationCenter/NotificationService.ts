/**
 * Phase 32.0 — Unified NotificationService facade.
 * Single entry point for emit + inbox mutations. Extends legacy Notification table.
 */
import { randomUUID } from 'crypto';
import prisma from '../../utils/prismaClient';
import { notifyUser } from '../../utils/notify';
import {
  buildNotificationActionUrl,
  normalizeNotificationActionUrl
} from '../notificationActionUrl.service';
import {
  legacyListNotifications,
  toApiNotification
} from '../notificationIntelligence/compatibility/legacyNotificationRead.service';
import {
  defaultDeepLink,
  NOTIFICATION_SCHEMA_VERSION,
  resolveNotificationCategory,
  resolvePriorityLevel
} from './taxonomy';
import { bumpNotificationMetric, stableIdempotencyKey, writeNotificationAudit } from './analytics';
import type {
  BulkInboxUpdateInput,
  InboxListQuery,
  NotificationEmitInput,
  NotificationEmitResult,
  NotificationEmitResultItem
} from './types';
import { DEFAULT_PIN_LIMIT } from './types';

const isMissingSchemaError = (err: any) => {
  const msg = String(err?.message || err || '');
  return (
    err?.code === 'P2021' ||
    err?.code === 'P2022' ||
    err?.code === 'P2010' ||
    /column|does not exist|Unknown arg|NotificationEvent|NotificationDelivery/i.test(msg)
  );
};

const normalizeIds = (input: NotificationEmitInput): string[] => {
  const fromArray = Array.isArray(input.recipientIds) ? input.recipientIds : [];
  const single = input.recipientId ? [input.recipientId] : [];
  return Array.from(
    new Set(
      [...fromArray, ...single]
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    )
  );
};

const getMeta = (input: NotificationEmitInput) => {
  const base =
    (input.metadata && typeof input.metadata === 'object' ? input.metadata : null) ||
    (input.meta && typeof input.meta === 'object' ? input.meta : null) ||
    {};
  return { ...base } as Record<string, any>;
};

async function recordDelivery(params: {
  notificationId: string | null;
  eventId: string;
  userId: string;
  channel: string;
  status: string;
  latencyMs?: number | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}) {
  try {
    await (prisma as any).notificationDelivery.create({
      data: {
        id: randomUUID(),
        notificationId: params.notificationId,
        eventId: params.eventId,
        userId: params.userId,
        channel: params.channel,
        status: params.status,
        attemptCount: 1,
        latencyMs: params.latencyMs ?? null,
        errorCode: params.errorCode || null,
        errorMessage: params.errorMessage || null,
        deliveredAt: params.status === 'delivered' || params.status === 'sent' ? new Date() : null
      }
    });
  } catch {
    // optional table
  }
}

async function recordEvent(params: {
  eventId: string;
  eventType: string;
  category: string;
  actorId: string | null;
  actorType: string | null;
  recipientIds: string[];
  entityType: string | null;
  entityId: string | null;
  title: string | null;
  body: string | null;
  deepLink: string | null;
  priority: string;
  metadata: Record<string, unknown>;
  idempotencyKey: string | null;
  source: string | null;
  correlationId: string | null;
  schemaVersion: string;
}) {
  try {
    await (prisma as any).notificationEvent.create({
      data: {
        id: randomUUID(),
        eventId: params.eventId,
        eventType: params.eventType,
        category: params.category,
        actorId: params.actorId,
        actorType: params.actorType,
        recipientIds: params.recipientIds,
        entityType: params.entityType,
        entityId: params.entityId,
        title: params.title,
        body: params.body,
        deepLink: params.deepLink,
        priority: params.priority,
        metadata: params.metadata,
        idempotencyKey: params.idempotencyKey,
        schemaVersion: params.schemaVersion,
        source: params.source,
        correlationId: params.correlationId,
        status: 'emitted'
      }
    });
  } catch {
    // optional table until migration applied
  }
}

export class NotificationService {
  /**
   * Canonical emit path for all modules.
   * Always creates legacy-compatible Notification rows when not suppressed.
   */
  static async emit(input: NotificationEmitInput): Promise<NotificationEmitResult> {
    const started = Date.now();
    const recipientIds = normalizeIds(input);
    const type = String(input.type || 'system').trim() || 'system';
    const eventType = String(input.eventType || type).trim();
    const eventId = String(input.eventId || randomUUID()).trim();
    const schemaVersion = String(input.schemaVersion || NOTIFICATION_SCHEMA_VERSION);
    const category = resolveNotificationCategory(type, input.category);
    const priority = resolvePriorityLevel(input.priority, category);
    const actorId = input.actorId ? String(input.actorId).trim() : null;
    const entityType = input.entityType ? String(input.entityType) : null;
    const entityId = input.entityId ? String(input.entityId) : null;
    const title = String(input.title || 'Notification');
    const body = String(input.body || input.message || '');
    const meta = getMeta(input);
    const deepLink =
      normalizeNotificationActionUrl(
        input.deepLink ||
          input.actionUrl ||
          meta.actionUrl ||
          meta.action_url ||
          meta.link ||
          null
      ) ||
      defaultDeepLink({ type, deepLink: input.deepLink, entityType, entityId, meta }) ||
      buildNotificationActionUrl(type, meta);

    meta.category = category;
    meta.priority = priority;
    meta.schemaVersion = schemaVersion;
    meta.eventId = eventId;
    meta.eventType = eventType;
    if (entityType) meta.entityType = meta.entityType || entityType;
    if (entityId) meta.entityId = meta.entityId || entityId;
    if (deepLink) {
      meta.actionUrl = deepLink;
      meta.action_url = deepLink;
      meta.link = deepLink;
      meta.deepLink = deepLink;
    }

    const baseIdempotency =
      input.idempotencyKey ||
      stableIdempotencyKey([eventType, actorId, entityType, entityId, type]);

    await recordEvent({
      eventId,
      eventType,
      category,
      actorId,
      actorType: input.actorType ? String(input.actorType) : actorId ? 'user' : 'system',
      recipientIds,
      entityType,
      entityId,
      title,
      body,
      deepLink,
      priority,
      metadata: meta,
      idempotencyKey: baseIdempotency,
      source: input.source || 'notification-center',
      correlationId: input.correlationId || null,
      schemaVersion
    });

    await bumpNotificationMetric('emitted', category, 1);
    await writeNotificationAudit({
      action: 'event_emitted',
      eventId,
      actorId,
      details: { type, category, recipientCount: recipientIds.length, priority }
    });

    const items: NotificationEmitResultItem[] = [];
    if (!recipientIds.length) {
      return {
        eventId,
        schemaVersion,
        items,
        createdCount: 0,
        duplicateCount: 0,
        suppressedCount: 0,
        failedCount: 0
      };
    }

    for (const userId of recipientIds) {
      if (actorId && userId === actorId) {
        items.push({ userId, notificationId: null, status: 'suppressed', reason: 'self_actor' });
        continue;
      }

      const idempotencyKey = `${baseIdempotency}:${userId}`;

      // Idempotency key check (column when migrated; meta fallback scan in recent window)
      try {
        let existingByKey: { id: string } | null = null;
        try {
          existingByKey = await prisma.notification.findFirst({
            where: { userId, idempotencyKey } as any,
            select: { id: true }
          });
        } catch {
          existingByKey = null;
        }
        if (!existingByKey) {
          const recent = await prisma.notification.findMany({
            where: {
              userId,
              type,
              createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            },
            select: { id: true, meta: true },
            take: 40,
            orderBy: { createdAt: 'desc' }
          });
          const hit = recent.find((row) => {
            const m = (row.meta || {}) as any;
            return String(m.idempotencyKey || '') === idempotencyKey;
          });
          if (hit) existingByKey = { id: hit.id };
        }
        if (existingByKey?.id) {
          items.push({
            userId,
            notificationId: existingByKey.id,
            status: 'duplicate',
            reason: 'idempotency_key'
          });
          await bumpNotificationMetric('duplicate', category, 1);
          continue;
        }
      } catch {
        // continue to create
      }

      // Time-window soft dedupe
      const windowSec = Math.max(0, Number(input.dedupeWindowSeconds || 0));
      if (windowSec > 0 && entityId) {
        const since = new Date(Date.now() - windowSec * 1000);
        const recent = await prisma.notification.findFirst({
          where: {
            userId,
            type,
            createdAt: { gte: since },
            ...(actorId ? { actorId } : {})
          },
          select: { id: true, meta: true }
        });
        if (recent) {
          const m = (recent.meta || {}) as any;
          if (String(m.entityId || '') === String(entityId)) {
            items.push({
              userId,
              notificationId: recent.id,
              status: 'duplicate',
              reason: 'time_window'
            });
            await bumpNotificationMetric('duplicate', category, 1);
            continue;
          }
        }
      }

      if (input.skipInApp) {
        items.push({ userId, notificationId: null, status: 'suppressed', reason: 'skip_in_app' });
        continue;
      }

      meta.idempotencyKey = idempotencyKey;

      try {
        let created: any;
        try {
          created = await prisma.notification.create({
            data: {
              userId,
              actorId,
              type,
              title,
              body,
              meta,
              isRead: false,
              category,
              priority,
              deepLink,
              eventId,
              idempotencyKey,
              entityType,
              entityId,
              schemaVersion
            } as any
          });
        } catch (err: any) {
          if (isMissingSchemaError(err) || err?.code === 'P2002') {
            if (err?.code === 'P2002') {
              items.push({
                userId,
                notificationId: null,
                status: 'duplicate',
                reason: 'unique_constraint'
              });
              await bumpNotificationMetric('duplicate', category, 1);
              continue;
            }
            // Pre-migration fallback — legacy columns only
            created = await prisma.notification.create({
              data: {
                userId,
                actorId,
                type,
                title,
                body,
                meta,
                isRead: false
              }
            });
          } else {
            throw err;
          }
        }

        const latencyMs = Date.now() - started;
        await recordDelivery({
          notificationId: created.id,
          eventId,
          userId,
          channel: 'in_app',
          status: 'delivered',
          latencyMs
        });
        await bumpNotificationMetric('delivered_in_app', category, 1);
        await writeNotificationAudit({
          action: 'delivered',
          notificationId: created.id,
          eventId,
          userId,
          actorId,
          details: { channel: 'in_app', latencyMs }
        });

        if (!input.skipRealtime && !input.skipPush && priority !== 'silent') {
          try {
            notifyUser(userId, {
              id: created.id,
              type,
              title,
              body,
              action_url: deepLink || undefined,
              meta,
              createdAt: created.createdAt?.toISOString?.() || new Date().toISOString()
            });
            await recordDelivery({
              notificationId: created.id,
              eventId,
              userId,
              channel: 'push',
              status: 'sent',
              latencyMs: Date.now() - started
            });
            await bumpNotificationMetric('push_sent', category, 1);
          } catch (pushErr: any) {
            await recordDelivery({
              notificationId: created.id,
              eventId,
              userId,
              channel: 'push',
              status: 'failed',
              errorMessage: pushErr?.message || 'push_failed'
            });
            await bumpNotificationMetric('push_failed', category, 1);
          }
        }

        items.push({ userId, notificationId: created.id, status: 'created' });
        await bumpNotificationMetric('created', category, 1);
      } catch (err: any) {
        items.push({
          userId,
          notificationId: null,
          status: 'failed',
          reason: err?.message || 'create_failed'
        });
        await bumpNotificationMetric('failed', category, 1);
        await writeNotificationAudit({
          action: 'failed',
          eventId,
          userId,
          actorId,
          details: { error: err?.message || 'create_failed' }
        });
      }
    }

    return {
      eventId,
      schemaVersion,
      items,
      createdCount: items.filter((i) => i.status === 'created').length,
      duplicateCount: items.filter((i) => i.status === 'duplicate').length,
      suppressedCount: items.filter((i) => i.status === 'suppressed').length,
      failedCount: items.filter((i) => i.status === 'failed').length
    };
  }

  /** Convenience single-recipient emit */
  static async emitToUser(
    userId: string,
    input: Omit<NotificationEmitInput, 'recipientId' | 'recipientIds'>
  ) {
    return this.emit({ ...input, recipientId: userId });
  }

  private static mapInboxRow(row: any) {
    const api = toApiNotification(row);
    const meta = (api.meta || {}) as Record<string, any>;
    const pinnedAt = row.pinnedAt || meta.pinnedAt || null;
    return {
      ...api,
      category: row.category || meta.category || null,
      priority: row.priority || meta.priority || 'normal',
      deepLink: row.deepLink || api.actionUrl,
      archivedAt: row.archivedAt || null,
      deletedAt: row.deletedAt || null,
      pinnedAt,
      isPinned: Boolean(pinnedAt),
      eventId: row.eventId || meta.eventId || null,
      schemaVersion: row.schemaVersion || meta.schemaVersion || null,
      actorName: api.actorName || meta.actorName || null,
      actorAvatar: api.actorAvatar || meta.actorAvatar || null
    };
  }

  private static buildTimeRangeFilter(timeRange?: string | null) {
    const range = String(timeRange || '').trim().toLowerCase();
    if (!range || range === 'all') return {};
    const now = Date.now();
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    if (range === 'today') {
      return { createdAt: { gte: startOfToday } };
    }
    if (range === 'week' || range === 'this_week') {
      return { createdAt: { gte: weekAgo } };
    }
    if (range === 'older') {
      return { createdAt: { lt: weekAgo } };
    }
    return {};
  }

  static async listInbox(query: InboxListQuery) {
    const includeArchived = Boolean(query.includeArchived) || Boolean(query.archivedOnly);
    const includeDeleted = Boolean(query.includeDeleted);
    const categoryRaw = String(query.category || '').trim().toLowerCase();
    const category =
      categoryRaw && categoryRaw !== 'all'
        ? resolveNotificationCategory('x', categoryRaw)
        : null;
    const q = String(query.q || query.search || '').trim();
    const priorityRaw = String(query.priority || '').trim().toLowerCase();

    try {
      const defaultLimit = 40;
      const limit = Math.max(10, Math.min(100, Number(query.limit) || defaultLimit));
      const cursorId = String(query.cursor || '').trim();
      const where: any = {
        userId: query.userId,
        ...(includeDeleted ? {} : { deletedAt: null }),
        ...(query.archivedOnly
          ? { archivedAt: { not: null } }
          : includeArchived
            ? {}
            : { archivedAt: null }),
        ...(query.unreadOnly ? { isRead: false } : {}),
        ...(query.readOnly ? { isRead: true } : {}),
        ...(category ? { category } : {}),
        ...(query.pinnedOnly ? { pinnedAt: { not: null } } : {}),
        ...(query.criticalOnly || priorityRaw === 'critical'
          ? { priority: 'critical' }
          : query.highPriorityOnly || priorityRaw === 'high'
            ? { priority: { in: ['high', 'critical'] } }
            : priorityRaw
              ? { priority: priorityRaw }
              : {}),
        ...this.buildTimeRangeFilter(query.timeRange)
      };

      if (q) {
        where.OR = [
          { title: { contains: q, mode: 'insensitive' } },
          { body: { contains: q, mode: 'insensitive' } },
          { type: { contains: q, mode: 'insensitive' } },
          { category: { contains: q, mode: 'insensitive' } },
          { deepLink: { contains: q, mode: 'insensitive' } }
        ];
      }

      const rows = await prisma.notification.findMany({
        where,
        // Pinned first, then newest
        orderBy: [{ pinnedAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }] as any,
        take: limit + 1,
        ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {})
      });
      const hasMore = rows.length > limit;
      const pageRows = hasMore ? rows.slice(0, limit) : rows;
      return {
        items: pageRows.map((row) => this.mapInboxRow(row)),
        pagination: {
          limit,
          hasMore,
          nextCursor: hasMore ? String(pageRows[pageRows.length - 1]?.id || '') : null
        }
      };
    } catch (err) {
      if (!isMissingSchemaError(err)) throw err;
      // Fallback without pin ordering / extended columns
      try {
        const defaultLimit = 40;
        const limit = Math.max(10, Math.min(100, Number(query.limit) || defaultLimit));
        const cursorId = String(query.cursor || '').trim();
        const where: any = {
          userId: query.userId,
          ...(query.unreadOnly ? { isRead: false } : {}),
          ...(q
            ? {
                OR: [
                  { title: { contains: q, mode: 'insensitive' } },
                  { body: { contains: q, mode: 'insensitive' } },
                  { type: { contains: q, mode: 'insensitive' } }
                ]
              }
            : {})
        };
        const rows = await prisma.notification.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: limit + 1,
          ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {})
        });
        const hasMore = rows.length > limit;
        const pageRows = hasMore ? rows.slice(0, limit) : rows;
        return {
          items: pageRows.map((row) => this.mapInboxRow(row)),
          pagination: {
            limit,
            hasMore,
            nextCursor: hasMore ? String(pageRows[pageRows.length - 1]?.id || '') : null
          }
        };
      } catch {
        return legacyListNotifications({
          userId: query.userId,
          limit: query.limit,
          cursor: query.cursor
        });
      }
    }
  }

  static async getSummary(userId: string) {
    try {
      const baseOpen = { userId, deletedAt: null, archivedAt: null } as any;
      const [unread, total, archived, critical, high, pinned] = await Promise.all([
        prisma.notification.count({ where: { ...baseOpen, isRead: false } }),
        prisma.notification.count({ where: baseOpen }),
        prisma.notification.count({
          where: { userId, archivedAt: { not: null }, deletedAt: null } as any
        }),
        prisma.notification.count({
          where: { ...baseOpen, isRead: false, priority: 'critical' }
        }),
        prisma.notification.count({
          where: { ...baseOpen, isRead: false, priority: { in: ['high', 'critical'] } }
        }),
        prisma.notification.count({
          where: { ...baseOpen, pinnedAt: { not: null } }
        })
      ]);

      // Category breakdown (unread in default inbox)
      let byCategory: Record<string, number> = {};
      try {
        const grouped = await prisma.notification.groupBy({
          by: ['category'] as any,
          where: { ...baseOpen, isRead: false } as any,
          _count: { _all: true }
        } as any);
        byCategory = Object.fromEntries(
          (grouped || []).map((row: any) => [
            String(row.category || 'system'),
            Number(row._count?._all || 0)
          ])
        );
      } catch {
        byCategory = {};
      }

      return {
        unread,
        total,
        archived,
        critical,
        high,
        pinned,
        byCategory
      };
    } catch {
      const unread = await prisma.notification.count({
        where: { userId, isRead: false }
      });
      const total = await prisma.notification.count({ where: { userId } });
      return {
        unread,
        total,
        archived: 0,
        critical: 0,
        high: 0,
        pinned: 0,
        byCategory: {}
      };
    }
  }

  static async bulkUpdate(input: BulkInboxUpdateInput) {
    const ids = (input.ids || []).map((id) => String(id || '').trim()).filter(Boolean);
    if (!ids.length) {
      const err = new Error('ids required');
      (err as any).statusCode = 400;
      throw err;
    }

    const data: any = {};
    const action = input.action;
    if (action === 'read') {
      data.isRead = true;
      data.readAt = new Date();
    } else if (action === 'unread') {
      data.isRead = false;
      data.readAt = null;
    } else if (action === 'archive') {
      data.archivedAt = new Date();
    } else if (action === 'unarchive') {
      data.archivedAt = null;
    } else if (action === 'delete') {
      data.deletedAt = new Date();
    } else if (action === 'restore') {
      data.deletedAt = null;
    } else if (action === 'pin') {
      // Enforce pin limit
      try {
        const currentPinned = await prisma.notification.count({
          where: {
            userId: input.userId,
            pinnedAt: { not: null },
            deletedAt: null
          } as any
        });
        const alreadyPinned = await prisma.notification.count({
          where: {
            userId: input.userId,
            id: { in: ids },
            pinnedAt: { not: null }
          } as any
        });
        const newPins = Math.max(0, ids.length - alreadyPinned);
        if (currentPinned + newPins > DEFAULT_PIN_LIMIT) {
          const err = new Error(`Pin limit is ${DEFAULT_PIN_LIMIT}. Unpin some notifications first.`);
          (err as any).statusCode = 400;
          (err as any).code = 'NOTIFICATION_PIN_LIMIT';
          throw err;
        }
      } catch (limitErr: any) {
        if (limitErr?.code === 'NOTIFICATION_PIN_LIMIT') throw limitErr;
        // ignore count failures when column missing
      }
      data.pinnedAt = new Date();
    } else if (action === 'unpin') {
      data.pinnedAt = null;
    } else {
      const err = new Error('Invalid action');
      (err as any).statusCode = 400;
      throw err;
    }

    try {
      const result = await prisma.notification.updateMany({
        where: { id: { in: ids }, userId: input.userId },
        data
      });
      await writeNotificationAudit({
        action: `bulk_${action}`,
        userId: input.userId,
        details: { ids, count: result.count }
      });
      if (action === 'read' || action === 'unread') {
        await bumpNotificationMetric(action === 'read' ? 'read' : 'unread', null, result.count);
      }
      if (action === 'archive') await bumpNotificationMetric('archived', null, result.count);
      if (action === 'delete') await bumpNotificationMetric('deleted', null, result.count);
      if (action === 'pin') await bumpNotificationMetric('pinned', null, result.count);
      return { success: true as const, count: result.count };
    } catch (err) {
      if (isMissingSchemaError(err) && (action === 'read' || action === 'unread')) {
        const result = await prisma.notification.updateMany({
          where: { id: { in: ids }, userId: input.userId },
          data: { isRead: action === 'read' }
        });
        return { success: true as const, count: result.count };
      }
      if (isMissingSchemaError(err)) {
        const e = new Error('This inbox action requires Phase 32 migrations');
        (e as any).statusCode = 503;
        (e as any).code = 'NOTIFICATION_FOUNDATION_MIGRATION_REQUIRED';
        throw e;
      }
      throw err;
    }
  }

  static async markRead(userId: string, ids: string[]) {
    return this.bulkUpdate({ userId, ids, action: 'read' });
  }

  static async markUnread(userId: string, ids: string[]) {
    return this.bulkUpdate({ userId, ids, action: 'unread' });
  }

  static async markAllRead(userId: string) {
    try {
      const result = await prisma.notification.updateMany({
        where: { userId, isRead: false, deletedAt: null } as any,
        data: { isRead: true, readAt: new Date() } as any
      });
      await writeNotificationAudit({
        action: 'mark_all_read',
        userId,
        details: { count: result.count }
      });
      return { success: true as const, count: result.count };
    } catch {
      await prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true }
      });
      return { success: true as const, count: 0 };
    }
  }
}

export default NotificationService;
