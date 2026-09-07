import { createHash, randomUUID } from 'crypto';
import prisma from '../../utils/prismaClient';
import { NotificationService } from '../notificationCenter/NotificationService';
import { DEFAULT_ENGAGEMENT_TEMPLATES, EngagementSignalInput } from './contracts';
import {
  getCachedEngagementNotificationCopy,
  recordEngagementCopyFallback,
  warmEngagementNotificationCopy
} from './aiCopy.service';

const asRecord = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};

const isUniqueViolation = (error: any) => String(error?.code || '') === 'P2002';

const render = (value: string | null | undefined, input: { count: number; threshold: number; entityId: string }) =>
  String(value || '')
    .replace(/\{\{\s*count\s*\}\}/gi, String(input.count))
    .replace(/\{\{\s*threshold\s*\}\}/gi, String(input.threshold))
    .replace(/\{\{\s*entityId\s*\}\}/gi, input.entityId);

const rolloutBucket = (ruleId: string, ownerId: string, entityId: string) => {
  const digest = createHash('sha256').update(`${ruleId}:${ownerId}:${entityId}`).digest('hex');
  return parseInt(digest.slice(0, 8), 16) % 100;
};

const isGloballyPaused = async () => {
  try {
    const row = await (prisma as any).notificationOpsConfig.findUnique({
      where: { key: 'engagement_automations' },
      select: { value: true }
    });
    return Boolean(asRecord(row?.value).paused);
  } catch {
    return false;
  }
};

const claimMilestone = async (input: {
  rule: any;
  signal: EngagementSignalInput;
  threshold: number;
  status?: string;
  suppressedReason?: string;
}) => {
  try {
    return await (prisma as any).engagementMilestoneState.create({
      data: {
        id: randomUUID(),
        ruleId: input.rule.id,
        eventType: input.signal.eventType,
        entityType: input.signal.entityType,
        entityId: input.signal.entityId,
        ownerId: input.signal.ownerId,
        threshold: input.threshold,
        sourceEventId: input.signal.sourceEventId,
        status: input.status || 'claimed',
        suppressedReason: input.suppressedReason || null
      }
    });
  } catch (error: any) {
    if (isUniqueViolation(error)) return null;
    throw error;
  }
};

const emitMilestone = async (state: any, rule: any, signal: EngagementSignalInput) => {
  const fallback = DEFAULT_ENGAGEMENT_TEMPLATES[signal.eventType] || {
    title: 'Your engagement is growing',
    body: 'Your content has reached {{count}} interactions.',
    deepLink: '/analytics'
  };
  const metadata = asRecord(signal.metadata);
  const copyInput = {
    ruleId: String(rule.id),
    eventType: signal.eventType,
    entityType: signal.entityType,
    threshold: state.threshold,
    locale: typeof metadata.locale === 'string' ? metadata.locale : 'en'
  };
  const cachedAiCopy = rule.aiAssistanceEnabled
    ? getCachedEngagementNotificationCopy(copyInput)
    : null;
  if (rule.aiAssistanceEnabled && !cachedAiCopy) {
    recordEngagementCopyFallback('cache_miss');
    // Never await AI on the delivery path. The next milestone can use the
    // validated template if Ollama succeeds and the rule remains enabled.
    void warmEngagementNotificationCopy(copyInput).catch(() => undefined);
  }
  const title = render(rule.titleTemplate || cachedAiCopy?.title || fallback.title, {
    count: signal.aggregateCount,
    threshold: state.threshold,
    entityId: signal.entityId
  });
  const body = render(rule.bodyTemplate || cachedAiCopy?.body || fallback.body, {
    count: signal.aggregateCount,
    threshold: state.threshold,
    entityId: signal.entityId
  });
  const deepLink = render(rule.deepLinkTemplate || fallback.deepLink, {
    count: signal.aggregateCount,
    threshold: state.threshold,
    entityId: signal.entityId
  });
  const result = await NotificationService.emitToUser(signal.ownerId, {
    eventId: `engagement-milestone:${state.id}`,
    eventType: signal.eventType,
    type: 'engagement_milestone',
    category: rule.category || 'engagement',
    priority: rule.priority || 'normal',
    title,
    body,
    deepLink,
    entityType: signal.entityType,
    entityId: signal.entityId,
    actorId: signal.actorId || null,
    source: 'engagement-milestone-engine',
    idempotencyKey: `engagement-milestone:${rule.id}:${signal.entityType}:${signal.entityId}:${signal.ownerId}:${state.threshold}`,
    metadata: {
      ...metadata,
      ruleId: rule.id,
      threshold: state.threshold,
      aggregateCount: signal.aggregateCount,
      aiAssisted: Boolean(cachedAiCopy),
      aiCopySource: cachedAiCopy ? 'ollama_cache' : 'deterministic_fallback',
      templateKey: rule.templateKey || null
    },
    skipInApp: rule.inAppEnabled === false,
    skipPush: rule.pushEnabled === false,
    dedupeWindowSeconds: Math.max(0, Number(rule.cooldownSeconds || 0))
  });
  const item = result.items?.[0];
  await (prisma as any).engagementMilestoneState.update({
    where: { id: state.id },
    data: {
      status: item?.status === 'created' ? 'emitted' : item?.status || 'suppressed',
      notificationId: item?.notificationId || null,
      suppressedReason: item?.reason || null,
      emittedAt: item?.status === 'created' ? new Date() : null
    }
  });
  return result;
};

export const evaluatePersistedEngagementSignal = async (signal: EngagementSignalInput) => {
  const sourceEventId = String(signal.sourceEventId || '').trim();
  const ownerId = String(signal.ownerId || '').trim();
  const entityId = String(signal.entityId || '').trim();
  const eventType = String(signal.eventType || '').trim();
  const aggregateCount = Math.max(0, Math.floor(Number(signal.aggregateCount || 0)));
  if (!sourceEventId || !ownerId || !entityId || !eventType || aggregateCount < 1) {
    return { emitted: 0, reason: 'invalid_signal' };
  }

  if (await isGloballyPaused()) return { emitted: 0, paused: true };

  const rules = await (prisma as any).engagementNotificationRule.findMany({
    where: { eventType, isEnabled: true },
    orderBy: { updatedAt: 'desc' }
  });
  let emitted = 0;
  for (const rule of rules) {
    const rollout = Math.min(100, Math.max(0, Number(rule.rolloutPercentage ?? 0)));
    if (rollout <= 0 || rolloutBucket(rule.id, ownerId, entityId) >= rollout) continue;
    const thresholds: number[] = Array.from(new Set<number>((Array.isArray(rule.thresholds) ? rule.thresholds : []).map(Number)))
      .filter((value) => Number.isInteger(value) && value > 0 && value <= aggregateCount)
      .sort((a, b) => a - b);
    for (const threshold of thresholds) {
      const windowStart = new Date(Date.now() - Math.max(0, Number(rule.frequencyWindowSeconds || 0)) * 1000);
      const recentCount = Number(await (prisma as any).engagementMilestoneState.count({
        where: { ruleId: rule.id, ownerId, createdAt: { gte: windowStart }, status: { in: ['claimed', 'emitted'] } }
      }));
      if (recentCount >= Math.max(1, Number(rule.maxNotificationsPerWindow || 1))) continue;
      const latest = Number(rule.cooldownSeconds || 0) > 0
        ? await (prisma as any).engagementMilestoneState.findFirst({
          where: { ruleId: rule.id, ownerId, createdAt: { gte: new Date(Date.now() - Number(rule.cooldownSeconds) * 1000) } },
          orderBy: { createdAt: 'desc' },
          select: { id: true }
        })
        : null;
      if (latest) continue;
      const state = await claimMilestone({ rule, signal: { ...signal, sourceEventId, ownerId, entityId, eventType, aggregateCount }, threshold });
      if (!state) continue;
      await emitMilestone(state, rule, { ...signal, sourceEventId, ownerId, entityId, eventType, aggregateCount });
      emitted += 1;
    }
  }
  return { emitted };
};

export const recordEngagementSignal = async (signal: EngagementSignalInput) => {
  const sourceEventId = String(signal.sourceEventId || '').trim();
  const ownerId = String(signal.ownerId || '').trim();
  const entityId = String(signal.entityId || '').trim();
  const eventType = String(signal.eventType || '').trim();
  const aggregateCount = Math.max(0, Math.floor(Number(signal.aggregateCount || 0)));
  if (!sourceEventId || !ownerId || !entityId || !eventType || aggregateCount < 1) {
    return { accepted: false, duplicate: false, emitted: 0, reason: 'invalid_signal' };
  }

  try {
    await (prisma as any).engagementSignal.create({
      data: {
        id: randomUUID(),
        sourceEventId,
        eventType,
        entityType: String(signal.entityType || 'entity'),
        entityId,
        ownerId,
        actorId: signal.actorId || null,
        aggregateCount,
        occurredAt: signal.occurredAt || new Date(),
        metadata: signal.metadata || null
      }
    });
  } catch (error: any) {
    if (isUniqueViolation(error)) return { accepted: false, duplicate: true, emitted: 0 };
    throw error;
  }

  const result = await evaluatePersistedEngagementSignal({ ...signal, sourceEventId, ownerId, entityId, eventType, aggregateCount });
  return { accepted: true, duplicate: false, ...result };
};
