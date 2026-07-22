/**
 * Phase 32.2 — Deterministic delivery policy evaluator.
 * Precedence: emergency → mandatory security → admin → event override → category →
 * device → focus → quiet hours → digest → global pause → defaults
 */
import prisma from '../../../utils/prismaClient';
import {
  resolveNotificationCategory,
  resolvePriorityLevel,
  type NotificationCenterCategory
} from '../taxonomy';
import {
  DeliveryAction,
  DeliveryChannel,
  DeliveryMode,
  DeliveryPolicyDecision,
  DeliveryPolicyInput,
  EMERGENCY_SYSTEM_EVENT_TYPES,
  FUTURE_CHANNELS,
  MANDATORY_SECURITY_EVENT_TYPES,
  PreferenceSource
} from './policyTypes';

const isMissing = (err: any) =>
  err?.code === 'P2021' ||
  err?.code === 'P2022' ||
  /does not exist|Unknown arg/i.test(String(err?.message || ''));

const PRIORITY_RANK: Record<string, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
  silent: 0
};

const minuteOfDayInTz = (date: Date, timeZone: string) => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short'
    }).formatToParts(date);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value || 0);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value || 0);
    const weekday = String(parts.find((p) => p.type === 'weekday')?.value || '');
    const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return {
      minuteOfDay: (hour === 24 ? 0 : hour) * 60 + minute,
      dayOfWeek: map[weekday] ?? date.getUTCDay()
    };
  } catch {
    return { minuteOfDay: date.getUTCHours() * 60 + date.getUTCMinutes(), dayOfWeek: date.getUTCDay() };
  }
};

const inQuietWindow = (minuteOfDay: number, start: number, end: number) => {
  if (start === end) return true;
  if (start < end) return minuteOfDay >= start && minuteOfDay < end;
  return minuteOfDay >= start || minuteOfDay < end;
};

const decision = (
  input: DeliveryPolicyInput,
  partial: Omit<DeliveryPolicyDecision, 'channel' | 'category' | 'eventType'>
): DeliveryPolicyDecision => ({
  channel: input.channel,
  category: String(input.category),
  eventType: String(input.eventType),
  ...partial
});

export class NotificationDeliveryPolicy {
  static isMandatorySecurity(eventType: string, flag?: boolean) {
    if (flag) return true;
    return MANDATORY_SECURITY_EVENT_TYPES.has(String(eventType || '').trim().toLowerCase());
  }

  static isEmergencySystem(eventType: string, flag?: boolean) {
    if (flag) return true;
    return EMERGENCY_SYSTEM_EVENT_TYPES.has(String(eventType || '').trim().toLowerCase());
  }

  static async evaluate(raw: DeliveryPolicyInput): Promise<DeliveryPolicyDecision> {
    const channel = String(raw.channel || 'IN_APP').toUpperCase() as DeliveryChannel;
    const eventType = String(raw.eventType || 'system').trim();
    const category = resolveNotificationCategory(eventType, raw.category);
    const priority = resolvePriorityLevel(raw.priority, category as NotificationCenterCategory);
    const ts = raw.timestamp ? new Date(raw.timestamp) : new Date();
    const input: DeliveryPolicyInput = { ...raw, channel, eventType, category, priority, timestamp: ts };

    // Future channels disabled
    if ((FUTURE_CHANNELS as string[]).includes(channel)) {
      return decision(input, {
        allowed: false,
        action: 'SUPPRESS',
        reason: 'channel_not_available',
        effectivePreferenceSource: 'default_platform'
      });
    }

    // 1) Emergency platform policy
    if (this.isEmergencySystem(eventType, raw.isEmergencySystem)) {
      return decision(input, {
        allowed: true,
        action: 'DELIVER_NOW',
        reason: 'emergency_system_alert',
        effectivePreferenceSource: 'emergency_platform'
      });
    }

    // 2) Mandatory security
    if (this.isMandatorySecurity(eventType, raw.isMandatorySecurity)) {
      return decision(input, {
        allowed: true,
        action: 'DELIVER_NOW',
        reason: 'mandatory_security',
        effectivePreferenceSource: 'mandatory_security'
      });
    }

    // Load user prefs (best-effort)
    let global: any = null;
    let catPref: any = null;
    let eventPref: any = null;
    let focus: any = null;
    let quietRules: any[] = [];
    let digestSchedule: any = null;

    try {
      [global, catPref, eventPref, focus, quietRules, digestSchedule] = await Promise.all([
        (prisma as any).notificationGlobalPreference
          ?.findUnique?.({ where: { userId: raw.userId } })
          .catch?.(() => null) ?? prisma.$queryRaw`SELECT 1`.then(() => null).catch(() => null),
        (prisma as any).notificationPreference
          ?.findUnique?.({
            where: { userId_category: { userId: raw.userId, category } }
          })
          .catch?.(() => null),
        (prisma as any).notificationEventPreference
          ?.findUnique?.({
            where: { userId_eventType: { userId: raw.userId, eventType } }
          })
          .catch?.(() => null),
        (prisma as any).notificationFocusSession
          ?.findFirst?.({
            where: {
              userId: raw.userId,
              active: true,
              OR: [{ indefinite: true }, { endsAt: { gt: ts } }, { endsAt: null }]
            },
            orderBy: { createdAt: 'desc' }
          })
          .catch?.(() => null),
        prisma.quietHourRule
          .findMany({
            where: { userId: raw.userId, isActive: true },
            orderBy: { createdAt: 'desc' }
          })
          .catch(() => []),
        (prisma as any).notificationDigestSchedule
          ?.findUnique?.({ where: { userId: raw.userId } })
          .catch?.(() => null)
      ]);
    } catch (err) {
      if (!isMissing(err)) {
        // continue with defaults
      }
    }

    // Fallbacks if delegates undefined
    try {
      if (!global) {
        global = await (prisma as any).notificationGlobalPreference.findUnique({
          where: { userId: raw.userId }
        });
      }
    } catch {
      global = null;
    }
    try {
      if (!catPref) {
        catPref = await (prisma as any).notificationPreference.findFirst({
          where: { userId: raw.userId, category }
        });
      }
    } catch {
      catPref = null;
    }
    try {
      if (!eventPref) {
        eventPref = await (prisma as any).notificationEventPreference.findFirst({
          where: { userId: raw.userId, eventType }
        });
      }
    } catch {
      eventPref = null;
    }
    try {
      if (!focus) {
        focus = await (prisma as any).notificationFocusSession.findFirst({
          where: {
            userId: raw.userId,
            active: true,
            OR: [{ indefinite: true }, { endsAt: { gt: ts } }]
          },
          orderBy: { createdAt: 'desc' }
        });
      }
    } catch {
      focus = null;
    }
    try {
      if (!digestSchedule) {
        digestSchedule = await (prisma as any).notificationDigestSchedule.findUnique({
          where: { userId: raw.userId }
        });
      }
    } catch {
      digestSchedule = null;
    }

    // 3) Global pause optional (not security/emergency)
    if (global?.pauseOptional) {
      return decision(input, {
        allowed: false,
        action: 'SUPPRESS',
        reason: 'optional_paused',
        effectivePreferenceSource: 'global_pause'
      });
    }

    // Resolve channel enable + delivery mode from event override → category
    let channelEnabled = true;
    let deliveryMode: DeliveryMode = 'immediate';
    let minPriority = 'normal';
    let source: PreferenceSource = 'default_platform';

    if (eventPref) {
      source = 'event_override';
      if (eventPref.muted) {
        return decision(input, {
          allowed: false,
          action: 'SUPPRESS',
          reason: 'event_muted',
          effectivePreferenceSource: source
        });
      }
      if (channel === 'IN_APP' && eventPref.inAppEnabled === false) channelEnabled = false;
      if (channel === 'PUSH' && eventPref.pushEnabled === false) channelEnabled = false;
      if (channel === 'EMAIL' && eventPref.emailEnabled === false) channelEnabled = false;
      if (eventPref.deliveryMode) deliveryMode = eventPref.deliveryMode;
      if (eventPref.minPriority) minPriority = eventPref.minPriority;
    } else if (catPref) {
      source = 'category_preference';
      if (channel === 'IN_APP' && catPref.inAppEnabled === false) channelEnabled = false;
      if (channel === 'PUSH' && catPref.pushEnabled === false) channelEnabled = false;
      if (channel === 'EMAIL' && catPref.emailEnabled === false) channelEnabled = false;
      if (catPref.deliveryMode) deliveryMode = catPref.deliveryMode;
      if (catPref.minPriority) minPriority = catPref.minPriority;
    }

    if (!channelEnabled) {
      return decision(input, {
        allowed: false,
        action: 'SUPPRESS',
        reason: 'channel_disabled',
        effectivePreferenceSource: source,
        deliveryMode
      });
    }

    if (deliveryMode === 'muted') {
      return decision(input, {
        allowed: false,
        action: 'SUPPRESS',
        reason: 'category_muted',
        effectivePreferenceSource: source,
        deliveryMode
      });
    }

    const pr = PRIORITY_RANK[priority] ?? 2;
    const min = PRIORITY_RANK[String(minPriority || 'normal')] ?? 2;
    if (deliveryMode === 'priority_only' && pr < min) {
      return decision(input, {
        allowed: false,
        action: 'SUPPRESS',
        reason: 'below_min_priority',
        effectivePreferenceSource: source,
        deliveryMode
      });
    }
    if (pr < min && deliveryMode !== 'digest') {
      return decision(input, {
        allowed: false,
        action: 'SUPPRESS',
        reason: 'below_min_priority',
        effectivePreferenceSource: source,
        deliveryMode
      });
    }

    // Focus mode
    if (focus) {
      const allowCritical = focus.allowCritical !== false;
      const allowSecurity = focus.allowSecurity !== false;
      const allowedCats: string[] = Array.isArray(focus.allowedCategories) ? focus.allowedCategories : [];
      const allowedUsers: string[] = Array.isArray(focus.allowedUserIds) ? focus.allowedUserIds : [];
      const allowedConvs: string[] = Array.isArray(focus.allowedConversationIds)
        ? focus.allowedConversationIds
        : [];

      const exception =
        (allowCritical && priority === 'critical') ||
        (allowSecurity && category === 'security') ||
        allowedCats.includes(category) ||
        (raw.actorId && allowedUsers.includes(String(raw.actorId))) ||
        (raw.conversationId && allowedConvs.includes(String(raw.conversationId)));

      if (!exception) {
        if (channel === 'PUSH' && focus.silencePush !== false) {
          return decision(input, {
            allowed: false,
            action: deliveryMode === 'digest' || digestSchedule?.enabled ? 'QUEUE_FOR_DIGEST' : 'DEFER',
            reason: 'focus_mode_silence_push',
            effectivePreferenceSource: 'focus_mode',
            deliveryMode,
            nextEligibleAt: focus.endsAt || null
          });
        }
        if (channel === 'EMAIL' && focus.silenceEmail) {
          return decision(input, {
            allowed: false,
            action: deliveryMode === 'digest' || digestSchedule?.enabled ? 'QUEUE_FOR_DIGEST' : 'DEFER',
            reason: 'focus_mode_silence_email',
            effectivePreferenceSource: 'focus_mode',
            deliveryMode,
            nextEligibleAt: focus.endsAt || null
          });
        }
      }
    }

    // Quiet hours (push/email primarily; in-app usually allowed)
    if ((channel === 'PUSH' || channel === 'EMAIL') && quietRules?.length) {
      for (const rule of quietRules) {
        const tz = String(rule.timezone || raw.timezone || global?.timezone || 'UTC');
        const local = minuteOfDayInTz(ts, tz);
        const days: string[] = Array.isArray(rule.daysOfWeek) ? rule.daysOfWeek.map(String) : [];
        // days empty = all days; or match day index as string
        const dayOk =
          !days.length ||
          days.includes(String(local.dayOfWeek)) ||
          days.map((d) => d.toLowerCase()).includes(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][local.dayOfWeek]);
        if (!dayOk) continue;
        const start = Number(rule.startMinute || 0);
        const end = Number(rule.endMinute || 0);
        if (!inQuietWindow(local.minuteOfDay, start, end)) continue;

        // Allow critical/high if metadata says so
        const meta = (rule.metadata || {}) as any;
        if (priority === 'critical' && meta.allowCritical !== false) continue;
        if (priority === 'high' && meta.allowHigh) continue;
        if (category === 'messaging' && meta.allowMentions && /mention/i.test(eventType)) continue;

        return decision(input, {
          allowed: false,
          action: meta.addToDigest || deliveryMode === 'digest' || digestSchedule?.enabled
            ? 'QUEUE_FOR_DIGEST'
            : 'DEFER',
          reason: 'quiet_hours',
          effectivePreferenceSource: 'quiet_hours',
          deliveryMode,
          nextEligibleAt: null
        });
      }
    }

    // Digest mode
    if (deliveryMode === 'digest' || (digestSchedule?.enabled && digestSchedule?.mode !== 'off' && channel !== 'IN_APP' && priority !== 'critical')) {
      if (channel === 'PUSH' || channel === 'EMAIL') {
        return decision(input, {
          allowed: false,
          action: 'QUEUE_FOR_DIGEST',
          reason: 'digest_mode',
          effectivePreferenceSource: 'digest_mode',
          deliveryMode: 'digest'
        });
      }
    }

    return decision(input, {
      allowed: true,
      action: 'DELIVER_NOW',
      reason: 'allowed',
      effectivePreferenceSource: source,
      deliveryMode
    });
  }
}

export default NotificationDeliveryPolicy;
