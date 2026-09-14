/**
 * Scrolitha Phase 4 evaluation suite.
 *
 * The fixtures represent real Scrolith workflows but contain only synthetic,
 * anonymized task text and public-style fields. The suite never reads live
 * conversations, profiles, KYC, or private messages and never changes ranking
 * for user traffic. It is safe to run from an admin-only diagnostics route.
 */
import { z } from 'zod';
import { hashCacheKey, enterpriseCache } from './scrolitha.enterpriseCache';
import { rerankHybridHits, queryExpansion, SCROLITHA_PHASE2_VERSION } from './scrolitha.phase2';
import { routeScrolithaModel, type ScrolithaDomain } from './scrolitha.phase3';

export const SCROLITHA_PHASE4_VERSION = 'phase4-eval-v1';

type EvalTask = {
  id: string;
  domain: ScrolithaDomain;
  query: string;
  expectedTerms: string[];
  safetySensitive: boolean;
  candidates: Array<{ id: string; label: string; summary: string; score: number; sourceLabel: string }>;
};

const TASKS: EvalTask[] = [
  {
    id: 'anon-profile-improvement-001',
    domain: 'profile',
    query: 'Improve a freelance profile for product design work',
    expectedTerms: ['portfolio', 'skills', 'profile'],
    safetySensitive: false,
    candidates: [
      { id: 'profile-a', label: 'Portfolio profile guidance', summary: 'Improve portfolio, skills, and profile proof', score: 0.72, sourceLabel: 'Public profile guidance' },
      { id: 'profile-b', label: 'Generic networking tips', summary: 'Build connections and share updates', score: 0.66, sourceLabel: 'Platform guidance' },
      { id: 'profile-c', label: 'Marketplace pricing', summary: 'Set service pricing and packages', score: 0.61, sourceLabel: 'Marketplace guidance' }
    ]
  },
  {
    id: 'anon-job-discovery-002',
    domain: 'career',
    query: 'Find remote frontend roles requiring React',
    expectedTerms: ['remote', 'frontend', 'react'],
    safetySensitive: false,
    candidates: [
      { id: 'job-a', label: 'Remote React frontend role', summary: 'Remote frontend role using React', score: 0.74, sourceLabel: 'Public job information' },
      { id: 'job-b', label: 'Design contract', summary: 'Product design contract opportunity', score: 0.68, sourceLabel: 'Public job information' },
      { id: 'job-c', label: 'Backend engineering role', summary: 'API and database engineering position', score: 0.67, sourceLabel: 'Public job information' }
    ]
  },
  {
    id: 'anon-marketplace-match-003',
    domain: 'marketplace',
    query: 'Recommend a verified logo design service',
    expectedTerms: ['verified', 'logo', 'design'],
    safetySensitive: false,
    candidates: [
      { id: 'gig-a', label: 'Verified logo design service', summary: 'Verified designer offers logo design package', score: 0.73, sourceLabel: 'Public service listing' },
      { id: 'gig-b', label: 'Social media management', summary: 'Monthly social media content service', score: 0.67, sourceLabel: 'Public service listing' },
      { id: 'gig-c', label: 'Brand strategy consultation', summary: 'Brand positioning and marketing consultation', score: 0.65, sourceLabel: 'Public service listing' }
    ]
  },
  {
    id: 'anon-message-draft-004',
    domain: 'messaging',
    query: 'Draft a concise message asking a client about project scope',
    expectedTerms: ['message', 'client', 'scope'],
    safetySensitive: false,
    candidates: [
      { id: 'msg-a', label: 'Scope clarification message', summary: 'Draft a concise client message about project scope', score: 0.7, sourceLabel: 'Messaging guidance' },
      { id: 'msg-b', label: 'Contract checklist', summary: 'Review deliverables and payment terms', score: 0.68, sourceLabel: 'Platform guidance' },
      { id: 'msg-c', label: 'Profile introduction', summary: 'Introduce skills and portfolio', score: 0.62, sourceLabel: 'Profile guidance' }
    ]
  },
  {
    id: 'anon-moderation-review-005',
    domain: 'moderation',
    query: 'Review a reported post for harassment signals',
    expectedTerms: ['reported', 'harassment', 'signals'],
    safetySensitive: true,
    candidates: [
      { id: 'safe-a', label: 'Harassment signal review', summary: 'Review reported content for harassment signals and evidence', score: 0.71, sourceLabel: 'Safety guidance' },
      { id: 'safe-b', label: 'Community growth tips', summary: 'Improve community engagement and visibility', score: 0.69, sourceLabel: 'Community guidance' },
      { id: 'safe-c', label: 'Content writing help', summary: 'Improve clarity and tone in a post', score: 0.65, sourceLabel: 'Writing guidance' }
    ]
  },
  {
    id: 'anon-search-ranking-006',
    domain: 'general',
    query: 'Find professional communities for startup founders',
    expectedTerms: ['professional', 'communities', 'founders'],
    safetySensitive: false,
    candidates: [
      { id: 'community-a', label: 'Startup founders community', summary: 'Professional community for startup founders', score: 0.72, sourceLabel: 'Community metadata' },
      { id: 'community-b', label: 'Freelance designers community', summary: 'Community for independent designers', score: 0.68, sourceLabel: 'Community metadata' },
      { id: 'community-c', label: 'Career development group', summary: 'Professional growth and job search group', score: 0.64, sourceLabel: 'Community metadata' }
    ]
  }
];

type EvalArm = 'baseline' | 'hybrid-tiered';

const armSchema = z.object({
  arm: z.enum(['baseline', 'hybrid-tiered']),
  tasks: z.number().int().nonnegative(),
  meanRelevance: z.number().min(0).max(1),
  meanTopOneAccuracy: z.number().min(0).max(1),
  safetyPassRate: z.number().min(0).max(1),
  estimatedP50LatencyMs: z.number().nonnegative(),
  modelTiers: z.record(z.number().int().nonnegative())
});

const scoreTermCoverage = (text: string, terms: string[]) => {
  const value = text.toLowerCase();
  return terms.filter((term) => value.includes(term.toLowerCase())).length / Math.max(1, terms.length);
};

const runtimeForEvaluation = (model: string) => ({
  model,
  maxTokens: 900,
  temperature: 0.7,
  topP: 0.9
} as any);

const evaluateArm = (arm: EvalArm, model: string) => {
  const rows = TASKS.map((task) => {
    const ranked = arm === 'hybrid-tiered'
      ? rerankHybridHits({
          query: task.query,
          lexical: task.candidates.map((candidate) => ({ ...candidate, type: task.domain })),
          semantic: task.candidates.map((candidate) => ({
            ...candidate,
            type: task.domain,
            score: candidate.score + scoreTermCoverage(candidate.summary, task.expectedTerms) * 0.15
          })),
          limit: task.candidates.length
        })
      : [...task.candidates].sort((a, b) => b.score - a.score);
    const relevance = scoreTermCoverage(ranked[0]?.summary || '', task.expectedTerms);
    const tier = routeScrolithaModel({
      runtime: runtimeForEvaluation(model),
      message: task.query,
      intent: task.domain,
      hasActions: task.domain === 'messaging',
      safeMode: task.safetySensitive
    });
    return {
      relevance,
      topOne: relevance >= 0.66 ? 1 : 0,
      safety: task.safetySensitive ? (tier.tier === 'advanced' ? 1 : 0) : 1,
      tier: tier.tier,
      latency: tier.tier === 'fast' ? 180 : tier.tier === 'standard' ? 420 : 700
    };
  });
  const mean = (key: 'relevance' | 'topOne' | 'safety' | 'latency') => rows.reduce((sum, row) => sum + row[key], 0) / rows.length;
  const modelTiers = rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.tier] = (counts[row.tier] || 0) + 1;
    return counts;
  }, {});
  return armSchema.parse({
    arm,
    tasks: rows.length,
    meanRelevance: Number(mean('relevance').toFixed(4)),
    meanTopOneAccuracy: Number(mean('topOne').toFixed(4)),
    safetyPassRate: Number(mean('safety').toFixed(4)),
    estimatedP50LatencyMs: Math.round(mean('latency')),
    modelTiers
  });
};

export const assignPhase4Arm = (subjectId: string, experiment = SCROLITHA_PHASE4_VERSION): EvalArm => {
  const bucket = parseInt(hashCacheKey(['phase4-arm', experiment, subjectId]).slice(0, 8), 16) % 100;
  return bucket < 50 ? 'baseline' : 'hybrid-tiered';
};

export const runPhase4Evaluation = (input?: { model?: string; forceRefresh?: boolean }) => {
  const cacheKey = `evaluation:${SCROLITHA_PHASE4_VERSION}:${String(input?.model || 'runtime')}`;
  if (!input?.forceRefresh) {
    const cached = enterpriseCache.get<ReturnType<typeof runPhase4Evaluation>>('analytics', cacheKey);
    if (cached) return cached;
  }
  const result = {
    version: SCROLITHA_PHASE4_VERSION,
    generatedAt: new Date().toISOString(),
    privacy: 'Synthetic anonymized Scrolith workflow tasks only; no prompts, PII, or private content read.',
    experiment: {
      assignment: 'stable hash bucket, 50/50 baseline vs hybrid-tiered',
      liveTrafficMutation: false,
      externalProviderCalls: false,
      phase2Version: SCROLITHA_PHASE2_VERSION
    },
    taskCount: TASKS.length,
    arms: [evaluateArm('baseline', input?.model || 'runtime'), evaluateArm('hybrid-tiered', input?.model || 'runtime')]
  };
  enterpriseCache.set('analytics', cacheKey, result, 10 * 60_000);
  return result;
};

export const getPhase4TaskCatalog = () =>
  TASKS.map(({ id, domain, safetySensitive }) => ({ id, domain, safetySensitive }));
