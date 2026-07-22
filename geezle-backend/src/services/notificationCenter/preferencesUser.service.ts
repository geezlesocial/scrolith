/**
 * Phase 32.2 — User preference read/write (extends NotificationPreference tables).
 */
import { randomUUID } from 'crypto';
import prisma from '../../utils/prismaClient';
import { ALL_NOTIFICATION_CATEGORIES } from './taxonomy';
import { writeNotificationAudit } from './analytics';

const isMissing = (err: any) =>
  err?.code === 'P2021' || err?.code === 'P2022' || /does not exist/i.test(String(err?.message || ''));

const DEFAULT_GLOBAL = {
  pauseOptional: false,
  allowMandatorySecurity: true,
  allowEmergencySystem: true,
  showPreviews: true,
  playSounds: true,
  enableVibration: true,
  syncReadState: true,
  groupSimilar: true,
  badgeEnabled: true,
  marketingEnabled: false,
  productUpdatesEnabled: true,
  timezone: null as string | null,
  version: 1
};

const defaultCategory = (category: string) => ({
  category,
  inAppEnabled: true,
  pushEnabled: category === 'security' || category === 'messaging' || category === 'wallet',
  emailEnabled: category === 'security' || category === 'jobs' || category === 'marketplace',
  smsEnabled: false,
  digestEnabled: false,
  quietHoursEnabled: false,
  focusMode: false,
  deliveryMode: category === 'system' ? 'digest' : 'immediate',
  minPriority: 'normal',
  soundEnabled: true,
  vibrationEnabled: true,
  previewEnabled: true,
  version: 1
});

export class NotificationPreferencesUserService {
  static async getAll(userId: string) {
    let global = { ...DEFAULT_GLOBAL, userId };
    let categories = ALL_NOTIFICATION_CATEGORIES.map((c) => defaultCategory(c));
    let eventOverrides: any[] = [];
    let digest = {
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
    };
    let focus: any = null;

    try {
      const g = await (prisma as any).notificationGlobalPreference.findUnique({ where: { userId } });
      if (g) global = { ...DEFAULT_GLOBAL, ...g, userId };
    } catch {
      /* pre-migration */
    }

    try {
      const rows = await (prisma as any).notificationPreference.findMany({ where: { userId } });
      if (rows?.length) {
        const byCat = new Map(rows.map((r: any) => [r.category, r]));
        categories = ALL_NOTIFICATION_CATEGORIES.map((c) => ({
          ...defaultCategory(c),
          ...(byCat.get(c) || {})
        }));
      }
    } catch {
      /* pre-migration */
    }

    try {
      eventOverrides = await (prisma as any).notificationEventPreference.findMany({
        where: { userId },
        orderBy: { eventType: 'asc' }
      });
    } catch {
      eventOverrides = [];
    }

    try {
      const d = await (prisma as any).notificationDigestSchedule.findUnique({ where: { userId } });
      if (d) digest = { ...digest, ...d };
    } catch {
      /* */
    }

    try {
      focus = await (prisma as any).notificationFocusSession.findFirst({
        where: {
          userId,
          active: true,
          OR: [{ indefinite: true }, { endsAt: { gt: new Date() } }]
        },
        orderBy: { createdAt: 'desc' }
      });
    } catch {
      focus = null;
    }

    let quietHours: any[] = [];
    try {
      quietHours = await prisma.quietHourRule.findMany({
        where: { userId, isActive: true },
        orderBy: { createdAt: 'desc' }
      });
    } catch {
      quietHours = [];
    }

    return {
      userId,
      global,
      categories,
      eventOverrides,
      digest,
      focus,
      quietHours,
      channels: {
        IN_APP: { available: true },
        PUSH: { available: true },
        EMAIL: { available: true },
        SMS: { available: false, future: true },
        DESKTOP: { available: false, future: true },
        WEBHOOK: { available: false, future: true }
      },
      precedence: [
        'emergency_platform',
        'mandatory_security',
        'admin_enforced',
        'event_override',
        'category_preference',
        'device_channel',
        'focus_mode',
        'quiet_hours',
        'digest_mode',
        'global_pause',
        'default_platform'
      ]
    };
  }

  static async patchGlobal(userId: string, patch: Record<string, any>, expectedVersion?: number) {
    try {
      const existing = await (prisma as any).notificationGlobalPreference.findUnique({ where: { userId } });
      if (existing && expectedVersion != null && existing.version !== expectedVersion) {
        const err = new Error('Preference version conflict');
        (err as any).statusCode = 409;
        (err as any).code = 'PREFERENCE_VERSION_CONFLICT';
        throw err;
      }
      const data = {
        pauseOptional: patch.pauseOptional ?? existing?.pauseOptional ?? false,
        allowMandatorySecurity: patch.allowMandatorySecurity ?? existing?.allowMandatorySecurity ?? true,
        allowEmergencySystem: patch.allowEmergencySystem ?? existing?.allowEmergencySystem ?? true,
        showPreviews: patch.showPreviews ?? existing?.showPreviews ?? true,
        playSounds: patch.playSounds ?? existing?.playSounds ?? true,
        enableVibration: patch.enableVibration ?? existing?.enableVibration ?? true,
        syncReadState: patch.syncReadState ?? existing?.syncReadState ?? true,
        groupSimilar: patch.groupSimilar ?? existing?.groupSimilar ?? true,
        badgeEnabled: patch.badgeEnabled ?? existing?.badgeEnabled ?? true,
        marketingEnabled: patch.marketingEnabled ?? existing?.marketingEnabled ?? false,
        productUpdatesEnabled: patch.productUpdatesEnabled ?? existing?.productUpdatesEnabled ?? true,
        timezone: patch.timezone ?? existing?.timezone ?? null,
        version: (existing?.version || 0) + 1,
        metadata: patch.metadata ?? existing?.metadata
      };
      const row = await (prisma as any).notificationGlobalPreference.upsert({
        where: { userId },
        create: { id: randomUUID(), userId, ...data },
        update: data
      });
      await writeNotificationAudit({
        action: 'preferences_global_updated',
        userId,
        details: { version: row.version }
      });
      return row;
    } catch (err: any) {
      if (err?.statusCode === 409) throw err;
      if (isMissing(err)) {
        const e = new Error('Preferences storage requires Phase 32.2 migration');
        (e as any).statusCode = 503;
        throw e;
      }
      throw err;
    }
  }

  static async patchCategory(userId: string, category: string, patch: Record<string, any>) {
    const cat = String(category || '').trim().toLowerCase();
    if (!ALL_NOTIFICATION_CATEGORIES.includes(cat as any)) {
      const err = new Error('Invalid category');
      (err as any).statusCode = 400;
      throw err;
    }
    // Security/admin: cannot fully disable mandatory channels via user API — clamp
    if (cat === 'security') {
      patch.inAppEnabled = true;
      if (patch.deliveryMode === 'muted') patch.deliveryMode = 'immediate';
    }
    try {
      const existing = await (prisma as any).notificationPreference.findFirst({
        where: { userId, category: cat }
      });
      const data = {
        inAppEnabled: patch.inAppEnabled ?? existing?.inAppEnabled ?? true,
        pushEnabled: patch.pushEnabled ?? existing?.pushEnabled ?? true,
        emailEnabled: patch.emailEnabled ?? existing?.emailEnabled ?? true,
        smsEnabled: false,
        digestEnabled: patch.digestEnabled ?? existing?.digestEnabled ?? false,
        deliveryMode: patch.deliveryMode ?? existing?.deliveryMode ?? 'immediate',
        minPriority: patch.minPriority ?? existing?.minPriority ?? 'normal',
        soundEnabled: patch.soundEnabled ?? existing?.soundEnabled ?? true,
        vibrationEnabled: patch.vibrationEnabled ?? existing?.vibrationEnabled ?? true,
        previewEnabled: patch.previewEnabled ?? existing?.previewEnabled ?? true,
        version: (existing?.version || 0) + 1,
        metadata: patch.metadata ?? existing?.metadata
      };
      let row;
      if (existing) {
        row = await (prisma as any).notificationPreference.update({
          where: { id: existing.id },
          data
        });
      } else {
        row = await (prisma as any).notificationPreference.create({
          data: { id: randomUUID(), userId, category: cat, ...data }
        });
      }
      await writeNotificationAudit({
        action: 'preferences_category_updated',
        userId,
        details: { category: cat }
      });
      return row;
    } catch (err: any) {
      if (err?.statusCode) throw err;
      if (isMissing(err)) {
        const e = new Error('Preferences storage requires Phase 32.2 migration');
        (e as any).statusCode = 503;
        throw e;
      }
      throw err;
    }
  }

  static async patchEvent(userId: string, eventType: string, patch: Record<string, any>) {
    const et = String(eventType || '').trim();
    if (!et) {
      const err = new Error('eventType required');
      (err as any).statusCode = 400;
      throw err;
    }
    try {
      const existing = await (prisma as any).notificationEventPreference.findFirst({
        where: { userId, eventType: et }
      });
      const data = {
        category: patch.category ?? existing?.category ?? null,
        inAppEnabled: patch.inAppEnabled ?? existing?.inAppEnabled ?? null,
        pushEnabled: patch.pushEnabled ?? existing?.pushEnabled ?? null,
        emailEnabled: patch.emailEnabled ?? existing?.emailEnabled ?? null,
        deliveryMode: patch.deliveryMode ?? existing?.deliveryMode ?? null,
        minPriority: patch.minPriority ?? existing?.minPriority ?? null,
        muted: Boolean(patch.muted ?? existing?.muted ?? false),
        metadata: patch.metadata ?? existing?.metadata
      };
      let row;
      if (existing) {
        row = await (prisma as any).notificationEventPreference.update({
          where: { id: existing.id },
          data
        });
      } else {
        row = await (prisma as any).notificationEventPreference.create({
          data: { id: randomUUID(), userId, eventType: et, ...data }
        });
      }
      await writeNotificationAudit({
        action: 'preferences_event_updated',
        userId,
        details: { eventType: et }
      });
      return row;
    } catch (err: any) {
      if (err?.statusCode) throw err;
      if (isMissing(err)) {
        const e = new Error('Event preferences require Phase 32.2 migration');
        (e as any).statusCode = 503;
        throw e;
      }
      throw err;
    }
  }

  static async reset(userId: string) {
    try {
      await (prisma as any).notificationPreference.deleteMany({ where: { userId } });
      await (prisma as any).notificationEventPreference.deleteMany({ where: { userId } });
      await (prisma as any).notificationGlobalPreference.deleteMany({ where: { userId } });
      await writeNotificationAudit({ action: 'preferences_reset', userId });
      return this.getAll(userId);
    } catch (err) {
      if (isMissing(err)) {
        const e = new Error('Preferences storage requires Phase 32.2 migration');
        (e as any).statusCode = 503;
        throw e;
      }
      throw err;
    }
  }
}

export default NotificationPreferencesUserService;
