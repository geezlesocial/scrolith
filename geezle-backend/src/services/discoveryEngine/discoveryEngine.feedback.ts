/**
 * Feedback & impressions via existing RecoFeedbackLog / RecoImpressionLog.
 * Quality gates + realtime invalidation. No new schema.
 */
import prisma from '../../utils/prismaClient';
import type { DiscoveryFeedbackInput } from './discoveryEngine.types';
import { resolveDiscoveryRolloutFlags } from './discoveryEngine.rollout';
import { discoveryCache } from './discoveryEngine.cache';
import { recordDiscoveryMetric } from './discoveryEngine.observability';
import {
  evaluateFeedbackQuality,
  mapToRecoLogAction,
  decayAffinity
} from './discoveryEngine.behavior';
import { emitDiscoveryInvalidation } from './discoveryEngine.realtime';

const text = (v: unknown) => String(v || '').trim();

const startOfUtcDay = (at = new Date()) =>
  new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));

export const recordDiscoveryFeedback = async (input: DiscoveryFeedbackInput) => {
  const flags = resolveDiscoveryRolloutFlags();
  const viewerId = text(input.viewerId);
  if (!viewerId) throw new Error('viewerId is required');

  const entityType = text(input.entityType);
  const entityId = text(input.entityId);
  const surface = text(input.surface) || 'discovery';
  if (!entityType || !entityId) throw new Error('Invalid feedback payload');

  const quality = evaluateFeedbackQuality({
    action: text(input.action),
    metadata: input.metadata,
    hadImpression: input.metadata?.hadImpression === true || input.metadata?.hadImpression === 'true'
  });
  if (!quality.accept || !quality.event) {
    return { ok: false, skipped: true, reason: quality.reason || 'rejected' };
  }

  if (quality.event === 'impression') {
    if (!flags.impressions) return { ok: true, skipped: true, reason: 'impressions_disabled' };
    const day = startOfUtcDay();
    try {
      await prisma.recoImpressionLog.upsert({
        where: {
          viewerId_entityType_entityId_surface_shownAtDay: {
            viewerId,
            entityType,
            entityId,
            surface,
            shownAtDay: day
          }
        },
        create: {
          viewerId,
          entityType,
          entityId,
          surface,
          shownAtDay: day,
          count: 1
        },
        update: { count: { increment: 1 } }
      });
    } catch {
      await prisma.recoImpressionLog.create({
        data: {
          viewerId,
          entityType,
          entityId,
          surface,
          shownAtDay: day,
          count: 1
        }
      });
    }
    recordDiscoveryMetric('impressions', 1);
    return { ok: true, action: 'impression' };
  }

  if (!flags.feedback) return { ok: true, skipped: true, reason: 'feedback_disabled' };

  const logAction = mapToRecoLogAction(quality.event);
  await prisma.recoFeedbackLog.create({
    data: {
      viewerId,
      entityType,
      entityId,
      surface,
      action: logAction,
      metadata: {
        ...(input.metadata || {}),
        trackingToken: input.trackingToken || null,
        engine: 'discovery-engine-v8.1',
        originalAction: input.action,
        behavioralEvent: quality.event,
        weight: quality.weight
      }
    }
  });

  recordDiscoveryMetric('feedback', 1);
  recordDiscoveryMetric(`feedback_${quality.event}`, 1);

  // Viewer-scoped cache invalidation + optional socket signal for preference-changing actions.
  if (['hide', 'not_interested', 'report', 'follow', 'save', 'apply', 'click'].includes(quality.event)) {
    emitDiscoveryInvalidation({
      viewerId,
      reason: `feedback_${quality.event}`,
      entityType,
      entityId,
      surface
    });
  } else {
    // Soft preference signals still drop this viewer's cached responses / interest.
    discoveryCache.invalidateByPrefix(`resp:v:${viewerId}:`);
    discoveryCache.invalidateByPrefix(`interest:${viewerId}`);
  }

  return { ok: true, action: quality.event, weight: quality.weight };
};

export const loadNegativeKeys = async (viewerId: string | null): Promise<Set<string>> => {
  const out = new Set<string>();
  if (!viewerId) return out;
  try {
    const rows = await prisma.recoFeedbackLog.findMany({
      where: {
        viewerId,
        action: { in: ['hide', 'dismiss', 'report'] },
        createdAt: { gte: new Date(Date.now() - 60 * 24 * 60 * 60_000) }
      },
      take: 200,
      select: { entityType: true, entityId: true }
    });
    for (const r of rows) out.add(`${r.entityType}:${r.entityId}`.toLowerCase());
  } catch {
    // ignore
  }
  return out;
};

export const loadPositiveAffinity = async (
  viewerId: string | null
): Promise<Map<string, number>> => {
  const map = new Map<string, number>();
  if (!viewerId) return map;
  try {
    const rows = await prisma.recoFeedbackLog.findMany({
      where: {
        viewerId,
        action: { in: ['click', 'follow'] },
        createdAt: { gte: new Date(Date.now() - 60 * 24 * 60 * 60_000) }
      },
      take: 200,
      select: { entityType: true, entityId: true, createdAt: true, metadata: true }
    });
    const now = Date.now();
    for (const r of rows) {
      const key = `${r.entityType}:${r.entityId}`.toLowerCase();
      const ageDays = (now - r.createdAt.getTime()) / 86_400_000;
      const metaWeight = Number((r.metadata as any)?.weight || 0.2);
      const w = decayAffinity(Math.min(0.5, metaWeight || 0.2), ageDays);
      map.set(key, Math.min(1, (map.get(key) || 0) + w));
    }
  } catch {
    // ignore
  }
  return map;
};
