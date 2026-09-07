import { randomUUID } from 'crypto';
import prisma from '../../utils/prismaClient';
import { DEFAULT_ENGAGEMENT_TEMPLATES, ENGAGEMENT_EVENT_TYPES } from './contracts';
import { NotificationOpsConfigService } from '../notificationCenter/ops/opsConfig.service';
import { writeNotificationAudit } from '../notificationCenter/analytics';

const EVENT_TYPES = Object.values(ENGAGEMENT_EVENT_TYPES);

const normalizeThresholds = (value: unknown) => Array.from(new Set(
  (Array.isArray(value) ? value : [])
    .map(Number)
    .filter((item) => Number.isInteger(item) && item > 0 && item <= 1_000_000_000)
)).sort((a, b) => a - b);

const normalizeRule = (input: any) => {
  const eventType = String(input?.eventType || '').trim();
  if (!EVENT_TYPES.includes(eventType as any)) throw Object.assign(new Error('Unsupported engagement event type'), { statusCode: 400 });
  const thresholds = normalizeThresholds(input?.thresholds);
  if (!thresholds.length) throw Object.assign(new Error('At least one positive threshold is required'), { statusCode: 400 });
  const rolloutPercentage = Math.min(100, Math.max(0, Number(input?.rolloutPercentage ?? 0)));
  return {
    eventType,
    name: String(input?.name || `${eventType} milestones`).trim().slice(0, 120),
    isEnabled: Boolean(input?.isEnabled),
    thresholds,
    cooldownSeconds: Math.max(0, Math.min(31_536_000, Number(input?.cooldownSeconds || 0))),
    frequencyWindowSeconds: Math.max(60, Math.min(31_536_000, Number(input?.frequencyWindowSeconds || 86_400))),
    maxNotificationsPerWindow: Math.max(1, Math.min(100, Number(input?.maxNotificationsPerWindow || 1))),
    inAppEnabled: input?.inAppEnabled !== false,
    pushEnabled: input?.pushEnabled !== false,
    rolloutPercentage,
    aiAssistanceEnabled: Boolean(input?.aiAssistanceEnabled),
    category: String(input?.category || 'engagement').trim().slice(0, 64),
    priority: String(input?.priority || 'normal').trim().slice(0, 32),
    templateKey: input?.templateKey ? String(input.templateKey).trim().slice(0, 120) : null,
    titleTemplate: input?.titleTemplate ? String(input.titleTemplate).trim().slice(0, 180) : null,
    bodyTemplate: input?.bodyTemplate ? String(input.bodyTemplate).trim().slice(0, 500) : null,
    deepLinkTemplate: input?.deepLinkTemplate ? String(input.deepLinkTemplate).trim().slice(0, 240) : null,
    metadata: input?.metadata && typeof input.metadata === 'object' ? input.metadata : null
  };
};

export class EngagementMilestoneAdminService {
  static async listRules() {
    return (prisma as any).engagementNotificationRule.findMany({ orderBy: [{ eventType: 'asc' }, { updatedAt: 'desc' }] });
  }

  static async createRule(input: any, actorId?: string) {
    const data = normalizeRule(input);
    const row = await (prisma as any).engagementNotificationRule.create({
      data: { id: randomUUID(), ...data, createdById: actorId || null, updatedById: actorId || null }
    });
    await writeNotificationAudit({ action: 'engagement_rule_created', actorId, details: { ruleId: row.id, eventType: row.eventType } });
    return row;
  }

  static async updateRule(id: string, input: any, actorId?: string) {
    const current = await (prisma as any).engagementNotificationRule.findUnique({ where: { id } });
    if (!current) throw Object.assign(new Error('Engagement rule not found'), { statusCode: 404 });
    const data = normalizeRule({ ...current, ...input });
    const row = await (prisma as any).engagementNotificationRule.update({
      where: { id },
      data: { ...data, updatedById: actorId || null }
    });
    await writeNotificationAudit({ action: 'engagement_rule_updated', actorId, details: { ruleId: row.id, eventType: row.eventType } });
    return row;
  }

  static async getGlobalState() {
    const current = await NotificationOpsConfigService.getSettings();
    const row = await (prisma as any).notificationOpsConfig.findUnique({ where: { key: 'engagement_automations' } }).catch(() => null);
    return { paused: Boolean((row?.value as any)?.paused), version: row?.version || 1, settings: current.value };
  }

  static async setGlobalPause(paused: boolean, actorId?: string) {
    const row = await (prisma as any).notificationOpsConfig.upsert({
      where: { key: 'engagement_automations' },
      create: { id: randomUUID(), key: 'engagement_automations', value: { paused: Boolean(paused) }, version: 1, updatedBy: actorId || null },
      update: { value: { paused: Boolean(paused) }, version: { increment: 1 }, updatedBy: actorId || null }
    });
    await writeNotificationAudit({ action: paused ? 'engagement_automations_paused' : 'engagement_automations_activated', actorId, details: { version: row.version } });
    return { paused: Boolean(paused), version: row.version };
  }

  static async stats() {
    const [states, signals] = await Promise.all([
      (prisma as any).engagementMilestoneState.groupBy({ by: ['status'], _count: { _all: true } }),
      (prisma as any).engagementSignal.count()
    ]);
    return { signals, states };
  }

  static preview(input: any) {
    const data = normalizeRule({
      ...input,
      thresholds: input?.thresholds?.length ? input.thresholds : [50],
      eventType: input?.eventType || ENGAGEMENT_EVENT_TYPES.POST_IMPRESSION
    });
    const fallback = DEFAULT_ENGAGEMENT_TEMPLATES[data.eventType];
    return {
      title: data.titleTemplate || fallback?.title || 'Your engagement is growing',
      body: data.bodyTemplate || fallback?.body || 'Your content has reached {{count}} interactions.',
      deepLink: data.deepLinkTemplate || fallback?.deepLink || '/analytics',
      aiAssistanceEnabled: data.aiAssistanceEnabled,
      deterministicFallback: true
    };
  }
}
