import { createHash, randomBytes } from 'crypto';
import prisma from '../../utils/prismaClient';

const isMissingError = (err: any) => {
  const msg = String(err?.message || err || '');
  return err?.code === 'P2021' || err?.code === 'P2010' || /does not exist|NotificationAnalytics/i.test(msg);
};

/** Best-effort analytics counters for Phase 32.1+ dashboards */
export async function bumpNotificationMetric(
  metric: string,
  category: string | null = null,
  delta = 1
) {
  try {
    const now = new Date();
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const existing = await (prisma as any).notificationAnalyticsCounter.findFirst({
      where: { date: day, category, metric }
    });
    if (existing) {
      await (prisma as any).notificationAnalyticsCounter.update({
        where: { id: existing.id },
        data: { value: Number(existing.value || 0) + delta }
      });
    } else {
      await (prisma as any).notificationAnalyticsCounter.create({
        data: {
          id: randomBytes(12).toString('hex'),
          date: day,
          category,
          metric,
          value: delta
        }
      });
    }
  } catch (err) {
    if (!isMissingError(err)) {
      // swallow — analytics must never break emit
    }
  }
}

export async function writeNotificationAudit(params: {
  action: string;
  notificationId?: string | null;
  eventId?: string | null;
  userId?: string | null;
  actorId?: string | null;
  details?: Record<string, unknown> | null;
}) {
  try {
    await (prisma as any).notificationAudit.create({
      data: {
        id: randomBytes(12).toString('hex'),
        action: params.action,
        notificationId: params.notificationId || null,
        eventId: params.eventId || null,
        userId: params.userId || null,
        actorId: params.actorId || null,
        details: params.details || undefined
      }
    });
  } catch {
    // best-effort
  }
}

export function stableIdempotencyKey(parts: Array<string | null | undefined>) {
  const raw = parts.map((p) => String(p || '').trim()).join('|');
  return createHash('sha256').update(raw).digest('hex').slice(0, 40);
}
