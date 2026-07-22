/**
 * Phase 33.2 — Explainable personalized recommendations.
 * Suggestions only — never auto-follow, join, apply, or purchase.
 */
import { randomUUID } from 'crypto';
import { ScrolithaAI } from './execute';
import { loadAIFeatureFlags } from './config';
import { getAIConsent } from './consent';
import { getAIMemory } from './memory';
import { applyLearningSignal } from './memory';
import { inc } from './observability';
import { writeAIAudit } from './audit';
import prisma from '../../utils/prismaClient';
import type {
  DashboardSectionId,
  RecoEntityType,
  RecoFeedbackAction
} from './types';

export type RecommendationCard = {
  id: string;
  entityType: RecoEntityType;
  entityId: string;
  title: string;
  subtitle?: string;
  hrefHint?: string;
  score: number;
  explanation: string;
  reasons: string[];
  whyAmISeeingThis: string;
  source: 'heuristic' | 'memory' | 'ai_assisted';
  advisoryOnly: true;
};

export type DashboardSection = {
  id: DashboardSectionId;
  title: string;
  items: RecommendationCard[];
  explanation: string;
};

export type RecoBundle = {
  enabled: boolean;
  reason?: string;
  items: RecommendationCard[];
  sections?: DashboardSection[];
  policy: {
    autoAct: false;
    userMustConfirm: true;
  };
};

const isMissing = (err: any) =>
  err?.code === 'P2021' || err instanceof TypeError || /does not exist/i.test(String(err?.message || ''));

export function explainFor(topic: string | null, entityType: RecoEntityType): string {
  if (topic) {
    return `Recommended because you follow topics related to ${topic}.`;
  }
  switch (entityType) {
    case 'job':
      return 'Recommended based on your disclosed professional interests.';
    case 'community':
      return 'Recommended because it matches communities you engage with.';
    case 'person':
    case 'freelancer':
      return 'Recommended based on people and skills you interact with.';
    case 'marketplace_product':
      return 'Recommended from marketplace categories you browse.';
    case 'event':
      return 'Recommended based on events and communities you follow.';
    case 'company':
      return 'Recommended based on companies and industries you follow.';
    default:
      return 'Recommended based on your disclosed Scrolitha preferences.';
  }
}

/** Seed catalog for offline / flag-gated demos — not production ranking */
const SEED_CATALOG: Array<Omit<RecommendationCard, 'explanation' | 'whyAmISeeingThis' | 'reasons' | 'source' | 'advisoryOnly' | 'score'> & { topics: string[]; score: number }> = [
  { id: 'seed-p1', entityType: 'person', entityId: 'seed-person-1', title: 'Alex Rivera', subtitle: 'Product designer', hrefHint: '/profile/seed-person-1', topics: ['design', 'react'], score: 0.72 },
  { id: 'seed-c1', entityType: 'community', entityId: 'seed-comm-1', title: 'React Builders', subtitle: 'Community', hrefHint: '/community/seed-comm-1', topics: ['react', 'javascript'], score: 0.8 },
  { id: 'seed-j1', entityType: 'job', entityId: 'seed-job-1', title: 'Senior Frontend Engineer', subtitle: 'Remote', hrefHint: '/jobs/seed-job-1', topics: ['react', 'typescript'], score: 0.76 },
  { id: 'seed-f1', entityType: 'freelancer', entityId: 'seed-free-1', title: 'Sam Okonkwo', subtitle: 'Full-stack freelancer', hrefHint: '/profile/seed-free-1', topics: ['nodejs', 'react'], score: 0.7 },
  { id: 'seed-m1', entityType: 'marketplace_product', entityId: 'seed-prod-1', title: 'UI Kit Pro', subtitle: 'Digital product', hrefHint: '/marketplace/seed-prod-1', topics: ['design', 'ui'], score: 0.65 },
  { id: 'seed-co1', entityType: 'company', entityId: 'seed-co-1', title: 'Northstar Labs', subtitle: 'Technology', hrefHint: '/company/seed-co-1', topics: ['ai', 'product'], score: 0.68 },
  { id: 'seed-e1', entityType: 'event', entityId: 'seed-ev-1', title: 'Community AMA', subtitle: 'This week', hrefHint: '/events/seed-ev-1', topics: ['community', 'react'], score: 0.66 },
  { id: 'seed-l1', entityType: 'learning', entityId: 'seed-learn-1', title: 'TypeScript Deep Dive', subtitle: 'Learning path', hrefHint: '/learning/seed-learn-1', topics: ['typescript', 'javascript'], score: 0.74 },
  { id: 'seed-g1', entityType: 'group', entityId: 'seed-group-1', title: 'Remote Workers Hub', subtitle: 'Messaging group', hrefHint: '/groups/seed-group-1', topics: ['remote', 'productivity'], score: 0.62 },
  { id: 'seed-post1', entityType: 'post', entityId: 'seed-post-1', title: 'Continue: Scaling design systems', subtitle: 'Post', hrefHint: '/posts/seed-post-1', topics: ['design', 'systems'], score: 0.71 }
];

function cardFromSeed(
  seed: (typeof SEED_CATALOG)[0],
  memory: Awaited<ReturnType<typeof getAIMemory>>
): RecommendationCard | null {
  if (memory.mutedEntityIds.includes(seed.entityId)) return null;
  const muted = new Set(memory.mutedTopics.map((t) => t.toLowerCase()));
  if (seed.topics.some((t) => muted.has(t))) return null;

  const preferred = memory.preferredTopics.map((t) => t.toLowerCase());
  const match = seed.topics.find((t) => preferred.includes(t.toLowerCase())) || seed.topics[0] || null;
  let score = seed.score;
  if (match && preferred.includes(match.toLowerCase())) score = Math.min(1, score + 0.12);
  const w = match ? memory.signalWeights[`topic:${match.toLowerCase()}`] : 0;
  if (typeof w === 'number') score = Math.min(1, Math.max(0, score + w * 0.02));

  const explanation = explainFor(match, seed.entityType);
  return {
    id: seed.id,
    entityType: seed.entityType,
    entityId: seed.entityId,
    title: seed.title,
    subtitle: seed.subtitle,
    hrefHint: seed.hrefHint,
    score: Math.round(score * 1000) / 1000,
    explanation,
    reasons: match ? [`Interest: ${match}`, 'Disclosed preference match'] : ['General discovery'],
    whyAmISeeingThis: explanation,
    source: 'heuristic',
    advisoryOnly: true
  };
}

export async function getRecommendations(input: {
  userId: string;
  types?: RecoEntityType[];
  limit?: number;
  locale?: string;
}): Promise<RecoBundle> {
  const flags = await loadAIFeatureFlags();
  if (!flags.masterEnabled || flags.killSwitch || !flags.recommendationsEnabled) {
    return {
      enabled: false,
      reason: 'SURFACE_FLAG_DISABLED:recommendationsEnabled',
      items: [],
      policy: { autoAct: false, userMustConfirm: true }
    };
  }
  const consent = await getAIConsent(input.userId);
  if (!consent.aiFeaturesEnabled || !consent.aiSuggestionsAllowed) {
    return {
      enabled: false,
      reason: 'CONSENT_REQUIRED',
      items: [],
      policy: { autoAct: false, userMustConfirm: true }
    };
  }

  const memory = await getAIMemory(input.userId);
  const types = input.types?.length ? new Set(input.types) : null;
  const limit = Math.min(30, Math.max(1, input.limit || 12));

  let items = SEED_CATALOG.map((s) => cardFromSeed(s, memory))
    .filter((c): c is RecommendationCard => Boolean(c))
    .filter((c) => (types ? types.has(c.entityType) : true))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Optional AI reason refinement (MOCK path when provider calls off)
  if (flags.RECOMMENDATION_REASONING && items[0]) {
    try {
      const result = await ScrolithaAI.execute({
        capability: 'RECOMMENDATION_REASONING',
        userId: input.userId,
        input: `Item: ${items[0].title}; topics: ${memory.preferredTopics.join(', ') || 'general'}`,
        locale: input.locale || 'en',
        policy: { privacyLevel: 'PERSONAL', preferInternalProvider: true, allowCache: true, maxTokens: 120 },
        metadata: { surface: 'reco_reason', advisory: true }
      });
      if (result.ok && result.text && result.text.length < 280) {
        items = items.map((it, idx) =>
          idx === 0
            ? {
                ...it,
                explanation: result.text!.trim(),
                whyAmISeeingThis: result.text!.trim(),
                source: 'ai_assisted' as const
              }
            : it
        );
      }
    } catch {
      /* keep heuristic */
    }
  }

  inc('recommendationsIssued', items.length);
  return {
    enabled: true,
    items,
    policy: { autoAct: false, userMustConfirm: true }
  };
}

export async function getDashboardRecommendations(input: {
  userId: string;
  locale?: string;
}): Promise<RecoBundle> {
  const flags = await loadAIFeatureFlags();
  if (!flags.dashboardRecommendationsEnabled) {
    return {
      enabled: false,
      reason: 'SURFACE_FLAG_DISABLED:dashboardRecommendationsEnabled',
      items: [],
      sections: [],
      policy: { autoAct: false, userMustConfirm: true }
    };
  }
  const base = await getRecommendations({ userId: input.userId, limit: 20, locale: input.locale });
  if (!base.enabled) return { ...base, sections: [] };

  const byType = (t: RecoEntityType[]) => base.items.filter((i) => t.includes(i.entityType)).slice(0, 4);

  const sections: DashboardSection[] = [
    {
      id: 'continue_reading',
      title: 'Continue Reading',
      items: byType(['post', 'learning']),
      explanation: 'Based on content you recently engaged with.'
    },
    {
      id: 'recommended_connections',
      title: 'Recommended Connections',
      items: byType(['person', 'freelancer']),
      explanation: 'People and freelancers related to your interests.'
    },
    {
      id: 'jobs_you_may_like',
      title: 'Jobs You May Like',
      items: byType(['job']),
      explanation: 'Jobs matched to your disclosed professional topics.'
    },
    {
      id: 'trending_in_communities',
      title: 'Trending in Your Communities',
      items: byType(['community', 'group', 'post']),
      explanation: 'Popular in communities you follow or prefer.'
    },
    {
      id: 'opportunities_near_you',
      title: 'Opportunities Near You',
      items: byType(['job', 'marketplace_product', 'freelancer']),
      explanation: 'Marketplace and work opportunities related to your interests.'
    },
    {
      id: 'suggested_events',
      title: 'Suggested Events',
      items: byType(['event']),
      explanation: 'Events aligned with your communities and topics.'
    },
    {
      id: 'learning_recommendations',
      title: 'Learning Recommendations',
      items: byType(['learning']),
      explanation: 'Learning paths from topics you explore.'
    }
  ].filter((s) => s.items.length > 0);

  inc('dashboardSectionsBuilt', sections.length);
  return {
    ...base,
    sections,
    items: base.items
  };
}

export async function submitRecoFeedback(input: {
  userId: string;
  entityType: RecoEntityType | string;
  entityId: string;
  action: RecoFeedbackAction;
  topic?: string | null;
  recommendationId?: string | null;
  comment?: string | null;
}): Promise<{ ok: boolean; reason?: string }> {
  const flags = await loadAIFeatureFlags();
  if (!flags.recommendationFeedbackEnabled) {
    return { ok: false, reason: 'SURFACE_FLAG_DISABLED:recommendationFeedbackEnabled' };
  }

  if (input.action === 'useful') inc('recoFeedbackUseful');
  else if (input.action === 'not_interested') inc('recoFeedbackNotInterested');
  else inc('recoFeedbackHideSimilar');

  const signalType =
    input.action === 'useful' ? 'like' : input.action === 'hide_similar' ? 'hide_similar' : 'dismiss';

  await applyLearningSignal(input.userId, {
    type: signalType,
    topic: input.topic,
    entityId: input.entityId,
    entityType: String(input.entityType),
    weight: input.action === 'useful' ? 1 : -1
  });

  try {
    await (prisma as any).aIRecommendationFeedback?.create?.({
      data: {
        id: randomUUID(),
        userId: input.userId,
        entityType: String(input.entityType),
        entityId: String(input.entityId),
        action: input.action,
        topic: input.topic || null,
        recommendationId: input.recommendationId || null,
        comment: input.comment ? String(input.comment).slice(0, 300) : null
      }
    });
  } catch (err) {
    if (!isMissing(err)) {
      /* soft */
    }
  }

  await writeAIAudit({
    action: 'reco.feedback',
    actorUserId: input.userId,
    metadata: { action: input.action, entityType: input.entityType, entityId: input.entityId }
  });

  return { ok: true };
}

export default {
  getRecommendations,
  getDashboardRecommendations,
  submitRecoFeedback,
  explainFor
};
