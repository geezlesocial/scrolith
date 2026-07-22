/**
 * Phase 33.2 — AI feed relevance scoring (advisory only).
 * Deterministic feed ranking remains authoritative. AI never reorders the feed itself.
 */
import { ScrolithaAI } from './execute';
import { loadAIFeatureFlags } from './config';
import { getAIConsent } from './consent';
import { getAIMemory } from './memory';
import { inc } from './observability';

export type FeedCandidate = {
  id: string;
  authorId?: string | null;
  topics?: string[];
  communityIds?: string[];
  createdAt?: string | null;
  engagementHint?: number | null;
  textSnippet?: string | null;
  creatorAffinity?: number | null;
};

export type FeedScoreBreakdown = {
  relevance: number;
  interest: number;
  freshness: number;
  diversity: number;
  creatorAffinity: number;
  engagementPrediction: number;
  composite: number;
};

export type FeedScoreItem = {
  id: string;
  score: number;
  breakdown: FeedScoreBreakdown;
  reasons: string[];
  advisoryOnly: true;
};

export type FeedScoringResult = {
  enabled: boolean;
  authoritative: false;
  reason?: string;
  scores: FeedScoreItem[];
  policy: {
    aiMayReorderFeed: false;
    deterministicRankingAuthoritative: true;
  };
  correlationId?: string;
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function hoursSince(iso?: string | null): number {
  if (!iso) return 48;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return 48;
  return Math.max(0, (Date.now() - t) / 3_600_000);
}

/**
 * Deterministic heuristic scores — used as primary advisory scores.
 * Optional LLM polish only when capability flags allow (still advisory).
 */
export function computeHeuristicScore(
  item: FeedCandidate,
  memory: Awaited<ReturnType<typeof getAIMemory>>,
  index: number,
  total: number
): FeedScoreItem {
  const topics = (item.topics || []).map((t) => t.toLowerCase());
  const preferred = new Set(memory.preferredTopics.map((t) => t.toLowerCase()));
  const muted = new Set(memory.mutedTopics.map((t) => t.toLowerCase()));
  const favComm = new Set(memory.favoriteCommunities.map((c) => c.toLowerCase()));

  let interest = 0.35;
  const reasons: string[] = [];
  for (const t of topics) {
    if (preferred.has(t)) {
      interest += 0.15;
      reasons.push(`Matches your interest in ${t}`);
    }
    if (muted.has(t)) {
      interest -= 0.25;
      reasons.push(`You muted topic ${t}`);
    }
    const w = memory.signalWeights[`topic:${t}`];
    if (typeof w === 'number') interest += clamp01(w / 10) * 0.1;
  }
  interest = clamp01(interest);

  const ageH = hoursSince(item.createdAt);
  const freshness = clamp01(1 - ageH / 72);
  if (freshness > 0.7) reasons.push('Recent activity');

  const engagementPrediction = clamp01(Number(item.engagementHint ?? 0.3));
  const creatorAffinity = clamp01(Number(item.creatorAffinity ?? 0.25));
  if (creatorAffinity > 0.6) reasons.push('Creator you engage with');

  let communityBoost = 0;
  for (const c of item.communityIds || []) {
    if (favComm.has(String(c).toLowerCase())) {
      communityBoost = 0.2;
      reasons.push('From a community you follow');
      break;
    }
  }

  // Diversity: slight penalty for same-slot clustering (caller can re-weight)
  const diversity = clamp01(0.5 + (index % 3 === 0 ? 0.2 : 0) - index / Math.max(20, total * 2));

  const relevance = clamp01(interest * 0.5 + communityBoost + creatorAffinity * 0.2);
  const composite = clamp01(
    relevance * 0.35 +
      interest * 0.2 +
      freshness * 0.15 +
      diversity * 0.1 +
      creatorAffinity * 0.1 +
      engagementPrediction * 0.1
  );

  if (memory.mutedEntityIds.includes(item.id)) {
    return {
      id: item.id,
      score: 0,
      breakdown: {
        relevance: 0,
        interest: 0,
        freshness,
        diversity,
        creatorAffinity,
        engagementPrediction,
        composite: 0
      },
      reasons: ['Hidden by your preferences'],
      advisoryOnly: true
    };
  }

  if (!reasons.length) reasons.push('General relevance based on public activity patterns');

  return {
    id: item.id,
    score: Math.round(composite * 1000) / 1000,
    breakdown: {
      relevance: Math.round(relevance * 1000) / 1000,
      interest: Math.round(interest * 1000) / 1000,
      freshness: Math.round(freshness * 1000) / 1000,
      diversity: Math.round(diversity * 1000) / 1000,
      creatorAffinity: Math.round(creatorAffinity * 1000) / 1000,
      engagementPrediction: Math.round(engagementPrediction * 1000) / 1000,
      composite: Math.round(composite * 1000) / 1000
    },
    reasons: reasons.slice(0, 4),
    advisoryOnly: true
  };
}

export async function scoreFeedCandidates(input: {
  userId: string;
  candidates: FeedCandidate[];
  locale?: string;
  useModelAssist?: boolean;
}): Promise<FeedScoringResult> {
  const flags = await loadAIFeatureFlags();
  if (flags.killSwitch || !flags.masterEnabled || !flags.feedScoringEnabled) {
    return {
      enabled: false,
      authoritative: false,
      reason: !flags.feedScoringEnabled ? 'SURFACE_FLAG_DISABLED:feedScoringEnabled' : 'AI_DISABLED',
      scores: [],
      policy: { aiMayReorderFeed: false, deterministicRankingAuthoritative: true }
    };
  }

  const consent = await getAIConsent(input.userId);
  if (!consent.aiFeaturesEnabled || !consent.personalizationAllowed) {
    return {
      enabled: false,
      authoritative: false,
      reason: 'CONSENT_REQUIRED',
      scores: [],
      policy: { aiMayReorderFeed: false, deterministicRankingAuthoritative: true }
    };
  }

  const memory = await getAIMemory(input.userId);
  const list = (input.candidates || []).slice(0, 50);
  const scores = list.map((c, i) => computeHeuristicScore(c, memory, i, list.length));

  let correlationId: string | undefined;
  // Optional model assist — does not replace heuristic composite; may refine reasons
  if (input.useModelAssist && flags.FEED_RELEVANCE_SCORING && flags.enableProviderCalls === false) {
    // Still call execute which uses MOCK when provider calls disabled — for reason polish only
    try {
      const snippet = list
        .slice(0, 8)
        .map((c) => `${c.id}: ${(c.topics || []).join(',')}`)
        .join('; ');
      const result = await ScrolithaAI.execute({
        capability: 'FEED_RELEVANCE_SCORING',
        userId: input.userId,
        input: `Advisory scoring context only (do not claim authority): ${snippet}`,
        locale: input.locale || 'en',
        policy: { privacyLevel: 'PERSONAL', preferInternalProvider: true, allowCache: true, maxTokens: 200 },
        metadata: { surface: 'feed_scoring', advisory: true }
      });
      correlationId = result.correlationId;
      // Heuristic scores remain; model path only exercises gateway for observability
    } catch {
      /* ignore */
    }
  }

  inc('feedScoresIssued', scores.length);
  return {
    enabled: true,
    authoritative: false,
    scores,
    correlationId,
    policy: { aiMayReorderFeed: false, deterministicRankingAuthoritative: true }
  };
}

export default { scoreFeedCandidates, computeHeuristicScore };
