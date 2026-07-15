/**
 * AI Learning Loop — feedback signals for improving future interactions.
 * Never stores private message bodies in aggregate stats.
 * Never exposes private user data in admin aggregates.
 */
import prisma from '../../utils/prismaClient';
import { enterpriseCache } from './scrolitha.enterpriseCache';
import { getUserPrivacyControls } from './scrolitha.privacyControls';
import { rememberMemoryFact } from './scrolitha.memoryLayers';
import { trackAnalytics } from './scrolitha.analytics';

export type LearningSignalType =
  | 'accepted_suggestion'
  | 'dismissed_suggestion'
  | 'rewritten_answer'
  | 'successful_recommendation'
  | 'abandoned_interaction'
  | 'positive_feedback'
  | 'negative_feedback'
  | 'used_action_card';

export type LearningSignal = {
  type: LearningSignalType;
  category?: string;
  key?: string;
  scoreDelta?: number;
  at: string;
  /** Non-sensitive surface only */
  surface?: string;
};

type AggregateCounters = Record<LearningSignalType, number> & {
  total: number;
};

const emptyAgg = (): AggregateCounters => ({
  accepted_suggestion: 0,
  dismissed_suggestion: 0,
  rewritten_answer: 0,
  successful_recommendation: 0,
  abandoned_interaction: 0,
  positive_feedback: 0,
  negative_feedback: 0,
  used_action_card: 0,
  total: 0
});

const AGG_KEY = 'learning:agg:v1';
const text = (v: unknown) => String(v || '').trim();

const readAgg = (): AggregateCounters =>
  enterpriseCache.get<AggregateCounters>('analytics', AGG_KEY) || emptyAgg();

const writeAgg = (c: AggregateCounters) => {
  enterpriseCache.set('analytics', AGG_KEY, c, 24 * 60 * 60_000);
};

/**
 * Record a privacy-safe learning signal for a user.
 */
export const recordLearningSignal = async (input: {
  userId: string;
  signal: Omit<LearningSignal, 'at'> & { at?: string };
}): Promise<{ ok: boolean; reason?: string }> => {
  const userId = text(input.userId);
  if (!userId) return { ok: false, reason: 'missing_user' };

  const privacy = await getUserPrivacyControls(userId);
  if (!privacy.allowLearningLoop) return { ok: false, reason: 'learning_disabled' };
  if (!privacy.personalizationEnabled && input.signal.type !== 'dismissed_suggestion') {
    // Still allow dismiss to reduce noise
    if (input.signal.type !== 'abandoned_interaction') {
      return { ok: false, reason: 'personalization_disabled' };
    }
  }

  const signal: LearningSignal = {
    type: input.signal.type,
    category: text(input.signal.category).slice(0, 40) || undefined,
    key: text(input.signal.key).slice(0, 80) || undefined,
    scoreDelta:
      typeof input.signal.scoreDelta === 'number'
        ? Math.max(-1, Math.min(1, input.signal.scoreDelta))
        : undefined,
    surface: text(input.signal.surface).slice(0, 40) || undefined,
    at: input.signal.at || new Date().toISOString()
  };

  // Aggregate (no user id in global counters for privacy of rare events — only type counts)
  const agg = readAgg();
  agg[signal.type] = (agg[signal.type] || 0) + 1;
  agg.total += 1;
  writeAgg(agg);

  // Per-user lightweight signal ring buffer in preference metadata
  try {
    const pref = await prisma.scrolithaUserPreference.findUnique({ where: { userId } });
    const baseMeta =
      pref?.metadata && typeof pref.metadata === 'object' && !Array.isArray(pref.metadata)
        ? { ...(pref.metadata as Record<string, any>) }
        : {};
    const prev = Array.isArray(baseMeta.learningSignals) ? baseMeta.learningSignals : [];
    const next = [
      {
        type: signal.type,
        category: signal.category,
        key: signal.key,
        scoreDelta: signal.scoreDelta,
        surface: signal.surface,
        at: signal.at
      },
      ...prev
    ].slice(0, 40);
    baseMeta.learningSignals = next;

    // Topic affinity from category
    if (signal.category && (signal.type === 'accepted_suggestion' || signal.type === 'successful_recommendation')) {
      const aff = (baseMeta.topicAffinity && typeof baseMeta.topicAffinity === 'object'
        ? { ...baseMeta.topicAffinity }
        : {}) as Record<string, number>;
      aff[signal.category] = Math.min(1000, (aff[signal.category] || 0) + 1);
      baseMeta.topicAffinity = aff;
    }
    if (signal.category && signal.type === 'dismissed_suggestion') {
      const aff = (baseMeta.topicAffinity && typeof baseMeta.topicAffinity === 'object'
        ? { ...baseMeta.topicAffinity }
        : {}) as Record<string, number>;
      aff[signal.category] = Math.max(0, (aff[signal.category] || 0) - 1);
      baseMeta.topicAffinity = aff;
    }

    await prisma.scrolithaUserPreference.upsert({
      where: { userId },
      create: {
        userId,
        quickActions: [],
        troubleshootingMode: 'standard',
        assistantTone: 'concise',
        metadata: baseMeta
      },
      update: { metadata: baseMeta }
    });

    // Optional durable preference memory (non-sensitive)
    if (
      privacy.memoryEnabled &&
      signal.type === 'accepted_suggestion' &&
      signal.category
    ) {
      await rememberMemoryFact({
        userId,
        layer: 'userPreference',
        key: `interest:${signal.category}`,
        value: `User engaged with ${signal.category} suggestions`,
        tags: [signal.category, 'learning_loop'],
        confidence: 0.55,
        source: 'learning_loop'
      });
    }
  } catch {
    // soft fail
  }

  try {
    trackAnalytics('recommendation_request', { intent: signal.type, surface: signal.surface });
  } catch {
    // optional
  }

  return { ok: true };
};

export const getLearningLoopSnapshot = (opts?: { admin?: boolean }) => {
  const agg = readAgg();
  // Never include user ids or private content
  return {
    aggregates: agg,
    note: 'Aggregates only — no private user content or identifiers',
    admin: Boolean(opts?.admin)
  };
};

export const getUserTopicAffinity = async (
  userId: string
): Promise<Record<string, number>> => {
  const uid = text(userId);
  if (!uid) return {};
  try {
    const pref = await prisma.scrolithaUserPreference.findUnique({
      where: { userId: uid },
      select: { metadata: true }
    });
    const meta =
      pref?.metadata && typeof pref.metadata === 'object' ? (pref.metadata as any) : {};
    if (!meta.topicAffinity || typeof meta.topicAffinity !== 'object') return {};
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(meta.topicAffinity as Record<string, any>)) {
      const n = Math.floor(Number(v));
      if (k && Number.isFinite(n) && n > 0) out[String(k).slice(0, 40)] = Math.min(1000, n);
    }
    return out;
  } catch {
    return {};
  }
};
