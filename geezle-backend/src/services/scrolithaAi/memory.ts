/**
 * Phase 33.2 — Scoped AI memory / disclosed preferences.
 * No sensitive personal profiling. User can view, edit, export, delete.
 */
import { randomUUID } from 'crypto';
import prisma from '../../utils/prismaClient';
import { getAIConsent } from './consent';
import { loadAIFeatureFlags } from './config';
import { inc } from './observability';
import { writeAIAudit } from './audit';

const isMissing = (err: any) =>
  err?.code === 'P2021' || err instanceof TypeError || /does not exist/i.test(String(err?.message || ''));

export type AIUserMemory = {
  userId: string;
  preferredTopics: string[];
  preferredIndustries: string[];
  mutedTopics: string[];
  preferredLanguages: string[];
  favoriteCommunities: string[];
  mutedEntityIds: string[];
  /** Disclosed signal weights — not hidden profiles */
  signalWeights: Record<string, number>;
  version: number;
  updatedAt: string | null;
  privacyNotice: string;
};

export const EMPTY_MEMORY = (userId: string): AIUserMemory => ({
  userId,
  preferredTopics: [],
  preferredIndustries: [],
  mutedTopics: [],
  preferredLanguages: [],
  favoriteCommunities: [],
  mutedEntityIds: [],
  signalWeights: {},
  version: 1,
  updatedAt: null,
  privacyNotice:
    'Scrolitha AI memory stores only preferences you set or explicit engagement signals you allow. No sensitive personal profiling. You can export or delete this data anytime.'
});

const memoryStore = new Map<string, AIUserMemory>();

const MAX_LIST = 40;
const sanitizeList = (arr: unknown, max = MAX_LIST): string[] => {
  if (!Array.isArray(arr)) return [];
  return Array.from(
    new Set(
      arr
        .map((x) => String(x || '').trim().slice(0, 64))
        .filter((x) => x && x.length >= 2)
    )
  ).slice(0, max);
};

// Block sensitive category inference
const FORBIDDEN_TOPIC =
  /\b(religion|political party|sexual orientation|health condition|disability|race|ethnicity|income|ssn|password)\b/i;

export function sanitizeTopics(topics: string[]): string[] {
  return sanitizeList(topics).filter((t) => !FORBIDDEN_TOPIC.test(t));
}

function mapRow(row: any, userId: string): AIUserMemory {
  const base = EMPTY_MEMORY(userId);
  return {
    ...base,
    preferredTopics: sanitizeTopics(row.preferredTopics || row.preferred_topics || []),
    preferredIndustries: sanitizeList(row.preferredIndustries || []),
    mutedTopics: sanitizeList(row.mutedTopics || []),
    preferredLanguages: sanitizeList(row.preferredLanguages || [], 12),
    favoriteCommunities: sanitizeList(row.favoriteCommunities || []),
    mutedEntityIds: sanitizeList(row.mutedEntityIds || [], 100),
    signalWeights:
      row.signalWeights && typeof row.signalWeights === 'object' ? row.signalWeights : {},
    version: Number(row.version || 1),
    updatedAt: row.updatedAt?.toISOString?.() || row.updatedAt || null
  };
}

export async function getAIMemory(userId: string): Promise<AIUserMemory> {
  if (memoryStore.has(userId)) return { ...memoryStore.get(userId)! };
  try {
    const row = await (prisma as any).aIUserMemory?.findUnique?.({ where: { userId } });
    if (row) {
      const m = mapRow(row, userId);
      memoryStore.set(userId, m);
      return { ...m };
    }
  } catch (err) {
    if (!isMissing(err)) {
      /* soft */
    }
  }
  return EMPTY_MEMORY(userId);
}

export async function updateAIMemory(
  userId: string,
  partial: Partial<
    Pick<
      AIUserMemory,
      | 'preferredTopics'
      | 'preferredIndustries'
      | 'mutedTopics'
      | 'preferredLanguages'
      | 'favoriteCommunities'
      | 'mutedEntityIds'
      | 'signalWeights'
    >
  >
): Promise<AIUserMemory> {
  const flags = await loadAIFeatureFlags();
  if (!flags.aiMemoryEnabled && !flags.recommendationsEnabled && !flags.feedScoringEnabled) {
    // Allow updates when any discovery surface that uses memory is on; else still store for readiness
  }
  const consent = await getAIConsent(userId);
  if (!consent.aiFeaturesEnabled) {
    throw Object.assign(new Error('CONSENT_AI_FEATURES_DISABLED'), { code: 'CONSENT' });
  }
  if (!consent.personalizationAllowed && (partial.preferredTopics || partial.signalWeights)) {
    // Explicit topic edits still allowed (user-controlled); signal weights need personalization
    if (partial.signalWeights && Object.keys(partial.signalWeights).length) {
      throw Object.assign(new Error('CONSENT_PERSONALIZATION_DISABLED'), { code: 'CONSENT' });
    }
  }

  const current = await getAIMemory(userId);
  const next: AIUserMemory = {
    ...current,
    preferredTopics:
      partial.preferredTopics !== undefined
        ? sanitizeTopics(partial.preferredTopics)
        : current.preferredTopics,
    preferredIndustries:
      partial.preferredIndustries !== undefined
        ? sanitizeList(partial.preferredIndustries)
        : current.preferredIndustries,
    mutedTopics:
      partial.mutedTopics !== undefined ? sanitizeList(partial.mutedTopics) : current.mutedTopics,
    preferredLanguages:
      partial.preferredLanguages !== undefined
        ? sanitizeList(partial.preferredLanguages, 12)
        : current.preferredLanguages,
    favoriteCommunities:
      partial.favoriteCommunities !== undefined
        ? sanitizeList(partial.favoriteCommunities)
        : current.favoriteCommunities,
    mutedEntityIds:
      partial.mutedEntityIds !== undefined
        ? sanitizeList(partial.mutedEntityIds, 100)
        : current.mutedEntityIds,
    signalWeights:
      partial.signalWeights !== undefined
        ? { ...current.signalWeights, ...partial.signalWeights }
        : current.signalWeights,
    version: current.version + 1,
    updatedAt: new Date().toISOString()
  };
  memoryStore.set(userId, next);
  inc('memoryUpdates');

  try {
    await (prisma as any).aIUserMemory?.upsert?.({
      where: { userId },
      create: {
        id: randomUUID(),
        userId,
        preferredTopics: next.preferredTopics,
        preferredIndustries: next.preferredIndustries,
        mutedTopics: next.mutedTopics,
        preferredLanguages: next.preferredLanguages,
        favoriteCommunities: next.favoriteCommunities,
        mutedEntityIds: next.mutedEntityIds,
        signalWeights: next.signalWeights,
        version: next.version
      },
      update: {
        preferredTopics: next.preferredTopics,
        preferredIndustries: next.preferredIndustries,
        mutedTopics: next.mutedTopics,
        preferredLanguages: next.preferredLanguages,
        favoriteCommunities: next.favoriteCommunities,
        mutedEntityIds: next.mutedEntityIds,
        signalWeights: next.signalWeights,
        version: next.version
      }
    });
  } catch {
    /* memory */
  }

  await writeAIAudit({
    action: 'memory.updated',
    actorUserId: userId,
    targetUserId: userId,
    metadata: { version: next.version, keys: Object.keys(partial) }
  });

  return { ...next };
}

export async function deleteAIMemory(userId: string): Promise<{ deleted: boolean }> {
  memoryStore.delete(userId);
  try {
    await (prisma as any).aIUserMemory?.deleteMany?.({ where: { userId } });
  } catch {
    /* soft */
  }
  await writeAIAudit({
    action: 'memory.deleted',
    actorUserId: userId,
    targetUserId: userId
  });
  return { deleted: true };
}

export async function exportAIMemory(userId: string) {
  const memory = await getAIMemory(userId);
  return {
    exportedAt: new Date().toISOString(),
    privacyNotice: memory.privacyNotice,
    memory
  };
}

/** Apply a disclosed engagement signal to preference weights (no model retrain). */
export async function applyLearningSignal(
  userId: string,
  signal: {
    type: string;
    topic?: string | null;
    entityId?: string | null;
    entityType?: string | null;
    weight?: number;
  }
): Promise<AIUserMemory | null> {
  const flags = await loadAIFeatureFlags();
  if (!flags.learningSignalsEnabled) return null;
  const consent = await getAIConsent(userId);
  if (!consent.personalizationAllowed || !consent.aiFeaturesEnabled) return null;

  const memory = await getAIMemory(userId);
  const topic = signal.topic ? sanitizeTopics([signal.topic])[0] : null;
  const delta = Number(signal.weight ?? (signal.type === 'dismiss' || signal.type === 'not_interested' ? -1 : 1));
  const weights = { ...memory.signalWeights };

  if (topic) {
    weights[`topic:${topic.toLowerCase()}`] = (weights[`topic:${topic.toLowerCase()}`] || 0) + delta;
  }
  if (signal.entityType) {
    weights[`type:${signal.entityType}`] = (weights[`type:${signal.entityType}`] || 0) + delta * 0.5;
  }

  const mutedEntityIds = [...memory.mutedEntityIds];
  if (
    (signal.type === 'hide_similar' || signal.type === 'dismiss') &&
    signal.entityId &&
    !mutedEntityIds.includes(signal.entityId)
  ) {
    mutedEntityIds.push(String(signal.entityId).slice(0, 64));
  }

  let preferredTopics = memory.preferredTopics;
  if (topic && delta > 0 && !preferredTopics.includes(topic) && preferredTopics.length < MAX_LIST) {
    preferredTopics = [...preferredTopics, topic];
  }
  let mutedTopics = memory.mutedTopics;
  if (topic && delta < 0 && !mutedTopics.includes(topic)) {
    mutedTopics = [...mutedTopics, topic].slice(0, MAX_LIST);
    preferredTopics = preferredTopics.filter((t) => t !== topic);
  }

  inc('learningSignals');
  return updateAIMemory(userId, {
    signalWeights: weights,
    preferredTopics,
    mutedTopics,
    mutedEntityIds: mutedEntityIds.slice(0, 100)
  });
}

export default {
  getAIMemory,
  updateAIMemory,
  deleteAIMemory,
  exportAIMemory,
  applyLearningSignal,
  sanitizeTopics,
  EMPTY_MEMORY
};
