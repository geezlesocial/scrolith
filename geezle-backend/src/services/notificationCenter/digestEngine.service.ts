/**
 * Phase 32.2 — Digest schedule storage, eligibility, aggregation, and worker.
 * Idempotent per user+mode+period. Uses existing email.service when available.
 */
import { createHash, randomUUID } from 'crypto';
import prisma from '../../utils/prismaClient';
import { sendSystemEmail } from '../email.service';
import { NotificationService } from './NotificationService';
import { writeNotificationAudit, bumpNotificationMetric } from './analytics';
import { NotificationDeliveryPolicy } from './delivery/NotificationDeliveryPolicy';

const isMissing = (err: any) =>
  err?.code === 'P2021' || /does not exist/i.test(String(err?.message || ''));

const periodKey = (userId: string, mode: string, start: Date, end: Date) =>
  createHash('sha256')
    .update(`${userId}|${mode}|${start.toISOString()}|${end.toISOString()}`)
    .digest('hex')
    .slice(0, 48);

const localParts = (date: Date, timeZone: string) => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short'
    }).formatToParts(date);
    const get = (t: string) => parts.find((p) => p.type === t)?.value || '0';
    return {
      year: Number(get('year')),
      month: Number(get('month')),
      day: Number(get('day')),
      hour: Number(get('hour') === '24' ? '0' : get('hour')),
      minute: Number(get('minute')),
      weekday: get('weekday')
    };
  } catch {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()]
    };
  }
};

export class NotificationDigestEngine {
  static async getSchedule(userId: string) {
    try {
      const row = await (prisma as any).notificationDigestSchedule.findUnique({ where: { userId } });
      return (
        row || {
          userId,
          mode: 'off',
          enabled: false,
          timezone: 'UTC',
          morningHour: 8,
          morningMinute: 0,
          eveningHour: 19,
          eveningMinute: 0,
          dailyHour: 9,
          dailyMinute: 0,
          weeklyDay: 1,
          weeklyHour: 9,
          weeklyMinute: 0,
          emailEnabled: true,
          inAppEnabled: true,
          pushReadyAlert: false
        }
      );
    } catch {
      return { userId, mode: 'off', enabled: false, timezone: 'UTC' };
    }
  }

  static async putSchedule(userId: string, patch: Record<string, any>) {
    try {
      const existing = await (prisma as any).notificationDigestSchedule.findUnique({ where: { userId } });
      const data = {
        mode: String(patch.mode || existing?.mode || 'off'),
        enabled: Boolean(patch.enabled ?? existing?.enabled ?? false),
        timezone: String(patch.timezone || existing?.timezone || 'UTC'),
        morningHour: Number(patch.morningHour ?? existing?.morningHour ?? 8),
        morningMinute: Number(patch.morningMinute ?? existing?.morningMinute ?? 0),
        eveningHour: Number(patch.eveningHour ?? existing?.eveningHour ?? 19),
        eveningMinute: Number(patch.eveningMinute ?? existing?.eveningMinute ?? 0),
        dailyHour: Number(patch.dailyHour ?? existing?.dailyHour ?? 9),
        dailyMinute: Number(patch.dailyMinute ?? existing?.dailyMinute ?? 0),
        weeklyDay: Number(patch.weeklyDay ?? existing?.weeklyDay ?? 1),
        weeklyHour: Number(patch.weeklyHour ?? existing?.weeklyHour ?? 9),
        weeklyMinute: Number(patch.weeklyMinute ?? existing?.weeklyMinute ?? 0),
        emailEnabled: patch.emailEnabled ?? existing?.emailEnabled ?? true,
        inAppEnabled: patch.inAppEnabled ?? existing?.inAppEnabled ?? true,
        pushReadyAlert: patch.pushReadyAlert ?? existing?.pushReadyAlert ?? false,
        includeRead: patch.includeRead ?? existing?.includeRead ?? false
      };
      const row = await (prisma as any).notificationDigestSchedule.upsert({
        where: { userId },
        create: { id: randomUUID(), userId, ...data },
        update: data
      });
      await writeNotificationAudit({ action: 'digest_schedule_updated', userId, details: { mode: data.mode } });
      return row;
    } catch (err) {
      if (isMissing(err)) {
        const e = new Error('Digest schedules require Phase 32.2 migration');
        (e as any).statusCode = 503;
        throw e;
      }
      throw err;
    }
  }

  static async listDigests(userId: string, limit = 20) {
    try {
      return await (prisma as any).notificationDigest.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: Math.min(50, Math.max(1, limit))
      });
    } catch {
      return [];
    }
  }

  static async getDigest(userId: string, digestId: string) {
    try {
      const digest = await (prisma as any).notificationDigest.findFirst({
        where: { id: digestId, userId }
      });
      if (!digest) return null;
      const items = await (prisma as any).notificationDigestItem.findMany({
        where: { digestId },
        orderBy: { sortOrder: 'asc' }
      });
      return { ...digest, items };
    } catch {
      return null;
    }
  }

  static async markDigestRead(userId: string, digestId: string) {
    try {
      const digest = await (prisma as any).notificationDigest.findFirst({
        where: { id: digestId, userId }
      });
      if (!digest) {
        const err = new Error('Digest not found');
        (err as any).statusCode = 404;
        throw err;
      }
      return await (prisma as any).notificationDigest.update({
        where: { id: digestId },
        data: { readAt: new Date() }
      });
    } catch (err: any) {
      if (err?.statusCode) throw err;
      if (isMissing(err)) {
        const e = new Error('Digests require Phase 32.2 migration');
        (e as any).statusCode = 503;
        throw e;
      }
      throw err;
    }
  }

  /** Eligibility for digest inclusion */
  static isEligibleForDigest(n: any, includeRead: boolean) {
    if (!n) return false;
    if (n.deletedAt) return false;
    if (!includeRead && n.isRead) return false;
    const priority = String(n.priority || 'normal');
    if (priority === 'critical') return false; // critical stays immediate
    const type = String(n.type || '');
    if (NotificationDeliveryPolicy.isMandatorySecurity(type)) return false;
    if (NotificationDeliveryPolicy.isEmergencySystem(type)) return false;
    return true;
  }

  static groupItems(notifications: any[]) {
    const groups = new Map<string, any[]>();
    for (const n of notifications) {
      const cat = String(n.category || 'system');
      const entity = String(n.entityId || n.meta?.entityId || '');
      const key = entity ? `${cat}:${n.entityType || 'entity'}:${entity}` : `${cat}:${n.type}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(n);
    }
    const items: any[] = [];
    let order = 0;
    for (const [groupKey, rows] of groups) {
      if (rows.length === 1) {
        const n = rows[0];
        items.push({
          notificationId: n.id,
          eventId: n.eventId,
          category: n.category,
          priority: n.priority,
          title: n.title,
          body: n.body,
          deepLink: n.deepLink || n.meta?.actionUrl,
          groupKey,
          sortOrder: order++,
          metadata: { count: 1 }
        });
      } else {
        const n = rows[0];
        items.push({
          notificationId: n.id,
          eventId: n.eventId,
          category: n.category,
          priority: n.priority,
          title: `${rows.length} updates: ${n.title || n.type}`,
          body: rows
            .slice(0, 3)
            .map((r) => r.body || r.title)
            .filter(Boolean)
            .join(' · '),
          deepLink: n.deepLink || n.meta?.actionUrl,
          groupKey,
          sortOrder: order++,
          metadata: { count: rows.length, notificationIds: rows.map((r) => r.id) }
        });
      }
    }
    return items;
  }

  static async buildAndDeliverForUser(
    userId: string,
    mode: string,
    periodStart: Date,
    periodEnd: Date,
    schedule: any
  ) {
    const idempotencyKey = periodKey(userId, mode, periodStart, periodEnd);
    try {
      const existing = await (prisma as any).notificationDigest.findUnique({
        where: { idempotencyKey }
      });
      if (existing) return { status: 'duplicate', digest: existing };

      const rows = await prisma.notification.findMany({
        where: {
          userId,
          createdAt: { gte: periodStart, lt: periodEnd },
          deletedAt: null
        } as any,
        orderBy: { createdAt: 'desc' },
        take: 200
      });

      const eligible = rows.filter((n) => this.isEligibleForDigest(n, Boolean(schedule?.includeRead)));
      if (!eligible.length) {
        await bumpNotificationMetric('digest_empty', mode, 1);
        return { status: 'empty', digest: null };
      }

      const grouped = this.groupItems(eligible);
      const unreadCount = eligible.filter((n) => !n.isRead).length;
      const criticalCount = eligible.filter((n) => n.priority === 'critical').length;
      const highCount = eligible.filter((n) => n.priority === 'high' || n.priority === 'critical').length;

      const byCategory: Record<string, number> = {};
      for (const n of eligible) {
        const c = String(n.category || 'system');
        byCategory[c] = (byCategory[c] || 0) + 1;
      }

      const digest = await (prisma as any).notificationDigest.create({
        data: {
          id: randomUUID(),
          userId,
          scheduleId: schedule?.id || null,
          mode,
          periodStart,
          periodEnd,
          timezone: schedule?.timezone || 'UTC',
          idempotencyKey,
          status: 'ready',
          itemCount: eligible.length,
          unreadCount,
          criticalCount,
          highCount,
          summaryJson: { byCategory, groupedCount: grouped.length }
        }
      });

      for (const item of grouped) {
        await (prisma as any).notificationDigestItem.create({
          data: { id: randomUUID(), digestId: digest.id, ...item }
        });
      }

      // In-app digest summary notification
      let inAppId: string | null = null;
      if (schedule?.inAppEnabled !== false) {
        const emit = await NotificationService.emit({
          recipientId: userId,
          type: 'system.digest_ready',
          category: 'system',
          title: `${mode.charAt(0).toUpperCase()}${mode.slice(1)} digest ready`,
          body: `${eligible.length} updates · ${unreadCount} unread`,
          deepLink: `/notifications?digest=${digest.id}`,
          priority: 'low',
          skipPush: !schedule?.pushReadyAlert,
          source: 'digest-engine',
          idempotencyKey: `digest-inapp:${digest.id}`
        });
        inAppId = emit.items[0]?.notificationId || null;
      }

      // Email digest
      let emailStatus = 'skipped';
      if (schedule?.emailEnabled !== false) {
        try {
          const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, name: true }
          });
          if (user?.email) {
            const html = this.renderEmailHtml({
              name: user.name || 'there',
              mode,
              count: eligible.length,
              unreadCount,
              highCount,
              items: grouped.slice(0, 12),
              digestId: digest.id
            });
            const sent = await sendSystemEmail({
              to: user.email,
              subject: `Your Scrolith ${mode} digest`,
              html,
              text: `You have ${eligible.length} notification updates. Open Notification Center: https://scrolith.com/notifications`
            });
            emailStatus = sent.success ? 'sent' : 'failed';
            if (!sent.success) {
              await writeNotificationAudit({
                action: 'digest_email_failed',
                userId,
                details: { error: sent.error }
              });
            }
          } else {
            emailStatus = 'no_email';
          }
        } catch (emailErr: any) {
          emailStatus = 'failed';
          await writeNotificationAudit({
            action: 'digest_email_failed',
            userId,
            details: { error: emailErr?.message }
          });
        }
      }

      const updated = await (prisma as any).notificationDigest.update({
        where: { id: digest.id },
        data: {
          status: 'sent',
          emailStatus,
          inAppNotificationId: inAppId,
          sentAt: new Date()
        }
      });

      if (schedule?.id) {
        await (prisma as any).notificationDigestSchedule.update({
          where: { id: schedule.id },
          data: { lastRunKey: idempotencyKey, lastRunAt: new Date() }
        });
      }

      await bumpNotificationMetric('digest_sent', mode, 1);
      await writeNotificationAudit({
        action: 'digest_sent',
        userId,
        details: { digestId: digest.id, mode, itemCount: eligible.length }
      });

      return { status: 'sent', digest: updated };
    } catch (err) {
      if (isMissing(err)) return { status: 'migration_required', digest: null };
      throw err;
    }
  }

  static renderEmailHtml(input: {
    name: string;
    mode: string;
    count: number;
    unreadCount: number;
    highCount: number;
    items: any[];
    digestId: string;
  }) {
    const rows = input.items
      .map(
        (i) =>
          `<tr><td style="padding:8px 0;border-bottom:1px solid #e2e8f0;">
            <div style="font-weight:600;color:#0f172a;">${escapeHtml(i.title || 'Update')}</div>
            <div style="font-size:13px;color:#475569;">${escapeHtml(i.body || '')}</div>
          </td></tr>`
      )
      .join('');
    return `<!doctype html><html><body style="font-family:system-ui,sans-serif;background:#f8fafc;padding:24px;">
      <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #e2e8f0;">
        <h1 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Hi ${escapeHtml(input.name)},</h1>
        <p style="margin:0 0 16px;color:#475569;">Your Scrolith <strong>${escapeHtml(input.mode)}</strong> digest:
          ${input.count} updates (${input.unreadCount} unread${input.highCount ? `, ${input.highCount} high priority` : ''}).</p>
        <table style="width:100%;border-collapse:collapse;">${rows}</table>
        <p style="margin:20px 0 0;">
          <a href="https://scrolith.com/notifications?digest=${encodeURIComponent(input.digestId)}"
             style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600;">
            Open Notification Center
          </a>
        </p>
        <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">
          <a href="https://scrolith.com/settings/notifications" style="color:#64748b;">Manage notification preferences</a>
        </p>
      </div>
    </body></html>`;
  }

  /**
   * Worker tick: process users due for morning/evening/daily/weekly digests.
   * Safe to call from node-cron; bounded concurrency.
   */
  static async processDueDigests(limitUsers = 50) {
    await import('./focusMode.service').then((m) => m.NotificationFocusModeService.cleanupExpired());
    try {
      const schedules = await (prisma as any).notificationDigestSchedule.findMany({
        where: { enabled: true, mode: { not: 'off' } },
        take: limitUsers
      });
      const results: any[] = [];
      const now = new Date();
      for (const schedule of schedules || []) {
        const due = this.isScheduleDue(schedule, now);
        if (!due) continue;
        const periodEnd = now;
        const periodStart = new Date(now.getTime() - due.periodMs);
        const result = await this.buildAndDeliverForUser(
          schedule.userId,
          schedule.mode,
          periodStart,
          periodEnd,
          schedule
        );
        results.push({ userId: schedule.userId, mode: schedule.mode, ...result });
      }
      return { processed: results.length, results };
    } catch (err) {
      if (isMissing(err)) return { processed: 0, results: [], note: 'migration_required' };
      throw err;
    }
  }

  static isScheduleDue(schedule: any, now: Date): { periodMs: number } | null {
    const tz = String(schedule.timezone || 'UTC');
    const local = localParts(now, tz);
    const mode = String(schedule.mode || 'off');
    const runKeyPrefix = `${local.year}-${local.month}-${local.day}`;

    // Prevent same-day double runs via lastRunKey prefix
    if (schedule.lastRunKey && String(schedule.lastRunKey).includes(runKeyPrefix) && mode !== 'weekly') {
      // still allow evening after morning if modes differ — use hour key
    }

    const matchTime = (h: number, m: number) => local.hour === h && local.minute >= m && local.minute < m + 15;

    if (mode === 'morning' && matchTime(Number(schedule.morningHour || 8), Number(schedule.morningMinute || 0))) {
      if (schedule.lastRunAt && now.getTime() - new Date(schedule.lastRunAt).getTime() < 12 * 3600_000) return null;
      return { periodMs: 16 * 3600_000 };
    }
    if (mode === 'evening' && matchTime(Number(schedule.eveningHour || 19), Number(schedule.eveningMinute || 0))) {
      if (schedule.lastRunAt && now.getTime() - new Date(schedule.lastRunAt).getTime() < 12 * 3600_000) return null;
      return { periodMs: 16 * 3600_000 };
    }
    if (mode === 'daily' && matchTime(Number(schedule.dailyHour || 9), Number(schedule.dailyMinute || 0))) {
      if (schedule.lastRunAt && now.getTime() - new Date(schedule.lastRunAt).getTime() < 20 * 3600_000) return null;
      return { periodMs: 24 * 3600_000 };
    }
    if (mode === 'weekly') {
      const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const localDay = dayMap[local.weekday] ?? 0;
      if (
        localDay === Number(schedule.weeklyDay || 1) &&
        matchTime(Number(schedule.weeklyHour || 9), Number(schedule.weeklyMinute || 0))
      ) {
        if (schedule.lastRunAt && now.getTime() - new Date(schedule.lastRunAt).getTime() < 6 * 24 * 3600_000) {
          return null;
        }
        return { periodMs: 7 * 24 * 3600_000 };
      }
    }
    return null;
  }
}

function escapeHtml(value: string) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export default NotificationDigestEngine;
