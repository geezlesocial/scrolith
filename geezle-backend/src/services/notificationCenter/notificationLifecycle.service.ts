/**
 * Phase 32.3 — Notification lifecycle / delivery receipts (analytics only).
 * Transitions: created | delivered | displayed | opened | read | archived | deleted | expired
 */
import { createHash, randomUUID } from 'crypto';
import prisma from '../../utils/prismaClient';
import { writeNotificationAudit, bumpNotificationMetric } from './analytics';

const isMissing = (err: any) =>
  err?.code === 'P2021' || /does not exist/i.test(String(err?.message || ''));

export const LIFECYCLE_STAGES = [
  'created',
  'delivered',
  'displayed',
  'opened',
  'read',
  'archived',
  'deleted',
  'expired'
] as const;

export type LifecycleStage = (typeof LIFECYCLE_STAGES)[number];

const ALLOWED = new Set<string>(LIFECYCLE_STAGES);

export class NotificationLifecycleService {
  static async record(input: {
    userId: string;
    notificationId?: string | null;
    eventId?: string | null;
    deviceId?: string | null;
    channel?: string;
    lifecycle: string;
    clientTimestamp?: string | Date | null;
    metadata?: Record<string, unknown> | null;
    idempotencyKey?: string | null;
  }) {
    const lifecycle = String(input.lifecycle || '').trim().toLowerCase();
    if (!ALLOWED.has(lifecycle)) {
      const err = new Error(`Invalid lifecycle stage: ${lifecycle}`);
      (err as any).statusCode = 400;
      throw err;
    }

    // Ownership check when notificationId present
    if (input.notificationId) {
      try {
        const row = await prisma.notification.findFirst({
          where: { id: String(input.notificationId), userId: input.userId },
          select: { id: true }
        });
        if (!row) {
          const err = new Error('Notification not found');
          (err as any).statusCode = 404;
          throw err;
        }
      } catch (e: any) {
        if (e?.statusCode) throw e;
      }
    }

    const idempotencyKey =
      input.idempotencyKey ||
      createHash('sha256')
        .update(
          [
            input.userId,
            lifecycle,
            input.notificationId || '',
            input.deviceId || '',
            input.channel || 'push',
            input.clientTimestamp ? new Date(input.clientTimestamp).toISOString() : ''
          ].join('|')
        )
        .digest('hex')
        .slice(0, 48);

    const model = (prisma as any).notificationLifecycleEvent;
    if (!model?.findUnique || !model?.create) {
      return { status: 'skipped' as const, event: null, note: 'migration_required' };
    }

    try {
      const existing = await model.findUnique({
        where: { idempotencyKey }
      });
      if (existing) return { status: 'duplicate' as const, event: existing };

      const event = await model.create({
        data: {
          id: randomUUID(),
          userId: input.userId,
          notificationId: input.notificationId || null,
          eventId: input.eventId || null,
          deviceId: input.deviceId || null,
          channel: String(input.channel || 'push'),
          lifecycle,
          clientTimestamp: input.clientTimestamp ? new Date(input.clientTimestamp) : null,
          serverTimestamp: new Date(),
          idempotencyKey,
          metadata: input.metadata || undefined
        }
      });

      await bumpNotificationMetric(`lifecycle_${lifecycle}`, input.channel || 'push', 1);
      if (lifecycle === 'opened' || lifecycle === 'delivered' || lifecycle === 'displayed') {
        await writeNotificationAudit({
          action: `lifecycle_${lifecycle}`,
          userId: input.userId,
          notificationId: input.notificationId || undefined,
          details: { deviceId: input.deviceId, channel: input.channel }
        });
      }
      return { status: 'recorded' as const, event };
    } catch (err: any) {
      if (err?.statusCode) throw err;
      if (isMissing(err) || err instanceof TypeError) {
        // Soft success pre-migration — do not block clients
        return { status: 'skipped' as const, event: null, note: 'migration_required' };
      }
      // Unique conflict → duplicate
      if (err?.code === 'P2002') {
        return { status: 'duplicate' as const, event: null };
      }
      throw err;
    }
  }

  static async recordBatch(
    userId: string,
    events: Array<{
      notificationId?: string | null;
      eventId?: string | null;
      deviceId?: string | null;
      channel?: string;
      lifecycle: string;
      clientTimestamp?: string | null;
      metadata?: Record<string, unknown> | null;
      idempotencyKey?: string | null;
    }>
  ) {
    const results = [];
    const list = Array.isArray(events) ? events.slice(0, 50) : [];
    for (const ev of list) {
      results.push(await this.record({ userId, ...ev }));
    }
    return { count: results.length, results };
  }
}

export default NotificationLifecycleService;
