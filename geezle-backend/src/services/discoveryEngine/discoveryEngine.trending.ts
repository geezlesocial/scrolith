/**
 * Bounded trending velocity model — unique actors, recency, quality, anti-abuse.
 */
import prisma from '../../utils/prismaClient';
import { discoveryCache } from './discoveryEngine.cache';
import type { RecommendationCandidate } from './discoveryEngine.types';

const WINDOW_HOURS = 48;
const MIN_UNIQUE = 4;

export type TrendingScoreMap = Map<string, { velocity: number; unique: number; score: number }>;

export const buildTrendingScores = async (): Promise<TrendingScoreMap> => {
  const cacheKey = 'trend:v1';
  const cached = discoveryCache.get<TrendingScoreMap>(cacheKey);
  if (cached) return cached;

  const map: TrendingScoreMap = new Map();
  try {
    const since = new Date(Date.now() - WINDOW_HOURS * 60 * 60_000);
    const rows = await prisma.recoFeedbackLog.findMany({
      where: {
        action: { in: ['click', 'follow', 'save'] },
        createdAt: { gte: since }
      },
      take: 3_000,
      select: { entityType: true, entityId: true, viewerId: true, createdAt: true }
    });

    type Agg = { viewers: Set<string>; times: number[] };
    const agg = new Map<string, Agg>();
    for (const row of rows) {
      if (!row.viewerId) continue;
      const key = `${row.entityType}:${row.entityId}`.toLowerCase();
      if (!agg.has(key)) agg.set(key, { viewers: new Set(), times: [] });
      const a = agg.get(key)!;
      // self-engagement still counts once per viewer — unique set handles farms partially
      a.viewers.add(row.viewerId);
      a.times.push(row.createdAt.getTime());
    }

    const now = Date.now();
    for (const [key, a] of agg) {
      const unique = a.viewers.size;
      if (unique < MIN_UNIQUE) continue;

      // Velocity: unique engagers per hour in window, quality-weighted by recency of events
      let recencyWeight = 0;
      for (const t of a.times) {
        const ageH = Math.max(0, (now - t) / 3_600_000);
        recencyWeight += Math.exp(-ageH / 18);
      }
      const velocity = unique / WINDOW_HOURS;
      // Burst detection: if >80% of events in last 2h from few viewers — dampen
      const recent = a.times.filter((t) => now - t < 2 * 3_600_000).length;
      const burstRatio = recent / Math.max(1, a.times.length);
      const burstPenalty = burstRatio > 0.8 && unique < 8 ? 0.45 : 1;

      const score = Math.max(
        0,
        Math.min(1, (velocity / 2) * 0.5 + Math.min(1, unique / 40) * 0.3 + Math.min(1, recencyWeight / 20) * 0.2) *
          burstPenalty
      );
      map.set(key, { velocity, unique, score });
    }
  } catch {
    // empty
  }

  discoveryCache.set(cacheKey, map, 3 * 60_000);
  return map;
};

export const applyTrendingFeatures = (
  candidate: RecommendationCandidate,
  trending: TrendingScoreMap
): RecommendationCandidate => {
  const key = `${candidate.entityType}:${candidate.entityId}`.toLowerCase();
  const t = trending.get(key);
  if (!t) return candidate;
  return {
    ...candidate,
    baseFeatures: {
      ...(candidate.baseFeatures || {}),
      velocity: t.velocity,
      uniqueEngagers: t.unique,
      trendingScore: t.score
    }
  };
};
