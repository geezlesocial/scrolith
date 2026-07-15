/**
 * Privacy-safe bounded co-engagement collaborative abstraction.
 * Uses RecoFeedbackLog aggregates only — no individual behavior disclosure.
 * Minimum cohort threshold; not tag matching labeled as collaborative.
 */
import prisma from '../../utils/prismaClient';
import { discoveryCache } from './discoveryEngine.cache';
import type { RecommendationCandidate } from './discoveryEngine.types';

const MIN_COHORT = 5;
const WINDOW_DAYS = 45;
const MAX_ROWS = 2_000;

export type CollaborativeIndex = {
  /** entityKey -> related entityKey -> count */
  edges: Map<string, Map<string, number>>;
  builtAt: number;
  cohortOk: boolean;
};

const entityKey = (type: string, id: string) => `${type}:${id}`.toLowerCase();

/**
 * Build a global co-click/follow co-occurrence index from feedback logs.
 * Aggregate only; viewer-specific filtering happens at score time.
 */
export const buildCollaborativeIndex = async (): Promise<CollaborativeIndex> => {
  const cacheKey = 'collab:index:v1';
  const cached = discoveryCache.get<CollaborativeIndex>(cacheKey);
  if (cached) return cached;

  const edges = new Map<string, Map<string, number>>();
  let cohortOk = false;

  try {
    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60_000);
    const rows = await prisma.recoFeedbackLog.findMany({
      where: {
        action: { in: ['click', 'follow', 'save'] },
        createdAt: { gte: since },
        viewerId: { not: null }
      },
      take: MAX_ROWS,
      orderBy: { createdAt: 'desc' },
      select: { viewerId: true, entityType: true, entityId: true, action: true }
    });

    // viewer -> set of entities
    const byViewer = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!row.viewerId) continue;
      const key = entityKey(row.entityType, row.entityId);
      if (!byViewer.has(row.viewerId)) byViewer.set(row.viewerId, new Set());
      byViewer.get(row.viewerId)!.add(key);
    }

    // Only viewers with enough distinct entities contribute (reduces noise)
    let contributingViewers = 0;
    for (const entities of byViewer.values()) {
      if (entities.size < 2) continue;
      contributingViewers += 1;
      const list = Array.from(entities).slice(0, 40);
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) {
          const a = list[i];
          const b = list[j];
          if (!edges.has(a)) edges.set(a, new Map());
          if (!edges.has(b)) edges.set(b, new Map());
          edges.get(a)!.set(b, (edges.get(a)!.get(b) || 0) + 1);
          edges.get(b)!.set(a, (edges.get(b)!.get(a) || 0) + 1);
        }
      }
    }
    cohortOk = contributingViewers >= MIN_COHORT;
  } catch {
    cohortOk = false;
  }

  const index: CollaborativeIndex = { edges, builtAt: Date.now(), cohortOk };
  discoveryCache.set(cacheKey, index, 5 * 60_000);
  return index;
};

export const scoreCollaborativeForCandidate = (input: {
  candidate: RecommendationCandidate;
  positiveEntityKeys: Set<string>;
  index: CollaborativeIndex;
  allowed: boolean;
}): number => {
  if (!input.allowed || !input.index.cohortOk) return 0;
  if (!input.positiveEntityKeys.size) return 0;

  const target = entityKey(input.candidate.entityType, input.candidate.entityId);
  if (input.positiveEntityKeys.has(target)) return 0.05; // already engaged

  let raw = 0;
  let supporting = 0;
  for (const pos of input.positiveEntityKeys) {
    const count = input.index.edges.get(pos)?.get(target) || 0;
    // Enforce min co-occurrence as privacy/quality floor
    if (count >= MIN_COHORT) {
      raw += Math.min(1, count / 40);
      supporting += 1;
    }
  }
  if (supporting === 0) return 0;

  // Popularity bias correction: dampen if edge is ultra-common from many seeds
  const damped = raw / Math.sqrt(supporting);
  return Math.max(0, Math.min(0.75, damped * 0.45));
};

export const isMeaningfulCollaborative = (score: number) => score >= 0.12;
