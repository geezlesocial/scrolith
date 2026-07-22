import { randomUUID } from 'crypto';
import prisma from '../../utils/prismaClient';
import { writeNotificationAudit } from './analytics';

const MAX_FOCUS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days admin default max

const isMissing = (err: any) =>
  err?.code === 'P2021' || /does not exist/i.test(String(err?.message || ''));

export class NotificationFocusModeService {
  static async getActive(userId: string) {
    try {
      // expire stale sessions
      await (prisma as any).notificationFocusSession.updateMany({
        where: {
          userId,
          active: true,
          indefinite: false,
          endsAt: { lte: new Date() }
        },
        data: { active: false }
      });
      return await (prisma as any).notificationFocusSession.findFirst({
        where: {
          userId,
          active: true,
          OR: [{ indefinite: true }, { endsAt: { gt: new Date() } }]
        },
        orderBy: { createdAt: 'desc' }
      });
    } catch (err) {
      if (isMissing(err)) return null;
      throw err;
    }
  }

  static async start(
    userId: string,
    input: {
      durationMinutes?: number;
      endsAt?: string | Date | null;
      indefinite?: boolean;
      silencePush?: boolean;
      silenceEmail?: boolean;
      allowCritical?: boolean;
      allowSecurity?: boolean;
      allowedCategories?: string[];
      allowedUserIds?: string[];
      allowedConversationIds?: string[];
      untilTomorrowMorning?: boolean;
      timezone?: string | null;
    }
  ) {
    try {
      // Deactivate previous
      await (prisma as any).notificationFocusSession.updateMany({
        where: { userId, active: true },
        data: { active: false }
      });

      let endsAt: Date | null = null;
      let indefinite = Boolean(input.indefinite);

      if (input.untilTomorrowMorning) {
        const tz = input.timezone || 'UTC';
        // Approximate: 08:00 local next day via UTC offset guess — use local Date for server
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(8, 0, 0, 0);
        if (tomorrow.getTime() <= now.getTime()) tomorrow.setDate(tomorrow.getDate() + 1);
        endsAt = tomorrow;
        indefinite = false;
      } else if (input.endsAt) {
        endsAt = new Date(input.endsAt);
      } else if (input.durationMinutes) {
        const ms = Math.min(MAX_FOCUS_MS, Math.max(60_000, Number(input.durationMinutes) * 60_000));
        endsAt = new Date(Date.now() + ms);
      } else if (!indefinite) {
        endsAt = new Date(Date.now() + 60 * 60 * 1000); // default 1h
      }

      if (endsAt && endsAt.getTime() - Date.now() > MAX_FOCUS_MS) {
        endsAt = new Date(Date.now() + MAX_FOCUS_MS);
      }

      const row = await (prisma as any).notificationFocusSession.create({
        data: {
          id: randomUUID(),
          userId,
          startsAt: new Date(),
          endsAt,
          indefinite,
          silencePush: input.silencePush !== false,
          silenceEmail: Boolean(input.silenceEmail),
          allowCritical: input.allowCritical !== false,
          allowSecurity: input.allowSecurity !== false,
          allowedCategories: input.allowedCategories || [],
          allowedUserIds: input.allowedUserIds || [],
          allowedConversationIds: input.allowedConversationIds || [],
          active: true
        }
      });
      await writeNotificationAudit({
        action: 'focus_mode_started',
        userId,
        details: { endsAt, indefinite }
      });
      return row;
    } catch (err) {
      if (isMissing(err)) {
        const e = new Error('Focus mode requires Phase 32.2 migration');
        (e as any).statusCode = 503;
        throw e;
      }
      throw err;
    }
  }

  static async stop(userId: string) {
    try {
      await (prisma as any).notificationFocusSession.updateMany({
        where: { userId, active: true },
        data: { active: false }
      });
      await writeNotificationAudit({ action: 'focus_mode_stopped', userId });
      return { success: true };
    } catch (err) {
      if (isMissing(err)) {
        const e = new Error('Focus mode requires Phase 32.2 migration');
        (e as any).statusCode = 503;
        throw e;
      }
      throw err;
    }
  }

  /** Cleanup expired focus sessions (cron) */
  static async cleanupExpired() {
    try {
      const result = await (prisma as any).notificationFocusSession.updateMany({
        where: {
          active: true,
          indefinite: false,
          endsAt: { lte: new Date() }
        },
        data: { active: false }
      });
      return { cleaned: result.count || 0 };
    } catch {
      return { cleaned: 0 };
    }
  }
}

export default NotificationFocusModeService;
