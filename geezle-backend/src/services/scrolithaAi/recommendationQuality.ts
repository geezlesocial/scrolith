/**
 * Phase 33.4 — deterministic quality telemetry and bounded ranking calibration.
 * No prompts, message bodies, or external-provider data are stored.
 */
import { randomUUID } from 'crypto';
import prisma from '../../utils/prismaClient';
import { inc } from './observability';

const isMissing = (err: any) =>
  err?.code === 'P2021' || err instanceof TypeError || /does not exist/i.test(String(err?.message || ''));

export type RecommendationEventType = 'impression' | 'open' | 'feedback';

export type RecommendationEventInput = {
  userId: string;
  eventType: RecommendationEventType;
  entityType: string;
  entityId: string;
  recommendationId?: string | null;
  position?: number | null;
  relevanceScore?: number | null;
  latencyMs?: number | null;
  surface?: string | null;
};

let profileCache: { expiresAt: number; byType: Record<string, number>; byTopic: Record<string, number> } | null = null;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export async function recordRecommendationEvent(input: RecommendationEventInput): Promise<void> {
  const safeLatency = input.latencyMs == null ? null : clamp(Math.round(input.latencyMs), 0, 120_000);
  const safePosition = input.position == null ? null : clamp(Math.round(input.position), 0, 1000);
  const safeScore = input.relevanceScore == null ? null : clamp(Number(input.relevanceScore), 0, 1);
  inc(input.eventType === 'impression' ? 'recoImpressions' : input.eventType === 'open' ? 'recoOpens' : 'recoEvents');
  if (safeLatency != null) inc('recoLatencyTotalMs', safeLatency);
  try {
    await (prisma as any).aIRecommendationEvent?.create?.({
      data: {
        id: randomUUID(),
        userId: input.userId,
        eventType: input.eventType,
        entityType: String(input.entityType).slice(0, 80),
        entityId: String(input.entityId).slice(0, 200),
        recommendationId: input.recommendationId ? String(input.recommendationId).slice(0, 200) : null,
        position: safePosition,
        relevanceScore: safeScore,
        latencyMs: safeLatency,
        surface: input.surface ? String(input.surface).slice(0, 80) : null
      }
    });
  } catch (err) {
    if (!isMissing(err)) inc('recoTelemetryWriteFailures');
  }
}

export async function getRecommendationQualityProfile(force = false) {
  if (!force && profileCache && profileCache.expiresAt > Date.now()) return profileCache;
  const byType: Record<string, number> = {};
  const byTopic: Record<string, number> = {};
  try {
    const rows = (await (prisma as any).aIRecommendationFeedback?.findMany?.({
      where: { createdAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
      select: { entityType: true, topic: true, action: true },
      orderBy: { createdAt: 'desc' },
      take: 1000
    })) || [];
    const scores = (key: string, map: Record<string, { score: number; count: number }>, action: string) => {
      const item = map[key] || { score: 0, count: 0 };
      item.score += action === 'useful' ? 1 : -1;
      item.count += 1;
      map[key] = item;
    };
    const typeScores: Record<string, { score: number; count: number }> = {};
    const topicScores: Record<string, { score: number; count: number }> = {};
    for (const row of rows) {
      scores(String(row.entityType || 'unknown'), typeScores, String(row.action || ''));
      if (row.topic) scores(String(row.topic).toLowerCase(), topicScores, String(row.action || ''));
    }
    for (const [key, value] of Object.entries(typeScores)) byType[key] = clamp(value.score / Math.max(5, value.count), -0.08, 0.08);
    for (const [key, value] of Object.entries(topicScores)) byTopic[key] = clamp(value.score / Math.max(5, value.count), -0.08, 0.08);
  } catch (err) {
    if (!isMissing(err)) inc('recoQualityReadFailures');
  }
  profileCache = { expiresAt: Date.now() + 60_000, byType, byTopic };
  return profileCache;
}

export function applyQualityAdjustment(score: number, entityType: string, topic?: string | null, profile?: Awaited<ReturnType<typeof getRecommendationQualityProfile>>) {
  const adjustment = (profile?.byType[entityType] || 0) + (topic ? profile?.byTopic[topic.toLowerCase()] || 0 : 0);
  return Math.round(clamp(score + adjustment, 0, 1) * 1000) / 1000;
}

export default { recordRecommendationEvent, getRecommendationQualityProfile, applyQualityAdjustment };
