/**
 * Phase 33.2 — Discovery: feed scoring, recommendations, memory, search, feedback.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { setAIFeatureFlags } from '../config';
import { updateAIConsent } from '../consent';
import {
  getAIMemory,
  updateAIMemory,
  deleteAIMemory,
  sanitizeTopics,
  applyLearningSignal
} from '../memory';
import { scoreFeedCandidates, computeHeuristicScore } from '../feedScoring';
import {
  getRecommendations,
  getDashboardRecommendations,
  submitRecoFeedback,
  explainFor
} from '../recommendations';
import { assistSearchQuery, detectIntent, simpleTypoExpand } from '../semanticSearch';
import { recordLearningSignal } from '../learning';
import { getDiscoveryAnalytics } from '../discoveryAnalytics';

const USER = 'user-discovery-332';

async function enableDiscovery() {
  await setAIFeatureFlags({
    masterEnabled: true,
    killSwitch: false,
    enableProviderCalls: false,
    feedScoringEnabled: true,
    recommendationsEnabled: true,
    semanticSearchEnabled: true,
    aiMemoryEnabled: true,
    learningSignalsEnabled: true,
    dashboardRecommendationsEnabled: true,
    recommendationFeedbackEnabled: true,
    discoveryAnalyticsEnabled: true,
    FEED_RELEVANCE_SCORING: true,
    RECOMMENDATION_REASONING: true,
    SEMANTIC_QUERY_EXPANSION: true,
    INTEREST_INFERENCE: true,
    SEMANTIC_SEARCH_PREPARATION: true,
    NOTIFICATION_PRIORITIZATION: true,
    notificationAiHooks: true,
    betaAllowlistOnly: false
  });
  await updateAIConsent(USER, {
    aiFeaturesEnabled: true,
    personalizationAllowed: true,
    aiSuggestionsAllowed: true,
    externalProviderProcessingAllowed: false,
    privateMessageAnalysisAllowed: false,
    aiActivityHistoryEnabled: false,
    productImprovementDataAllowed: false
  });
}

describe('Phase 33.2 explainability', () => {
  it('builds user-facing explanations', () => {
    const e = explainFor('react', 'community');
    expect(e.toLowerCase()).toContain('react');
  });
});

describe('Phase 33.2 memory', () => {
  it('sanitizes forbidden sensitive topics', () => {
    const t = sanitizeTopics(['react', 'religion politics', 'typescript']);
    expect(t).toContain('react');
    expect(t).toContain('typescript');
    expect(t.some((x) => /religion/i.test(x))).toBe(false);
  });

  it('updates, exports fields, and deletes memory', async () => {
    await enableDiscovery();
    await updateAIConsent(USER, { aiFeaturesEnabled: true, personalizationAllowed: true });
    const m = await updateAIMemory(USER, {
      preferredTopics: ['react', 'design'],
      mutedTopics: ['spam']
    });
    expect(m.preferredTopics).toContain('react');
    const got = await getAIMemory(USER);
    expect(got.preferredTopics.length).toBeGreaterThan(0);
    const del = await deleteAIMemory(USER);
    expect(del.deleted).toBe(true);
    const empty = await getAIMemory(USER);
    expect(empty.preferredTopics.length).toBe(0);
  });
});

describe('Phase 33.2 feed scoring', () => {
  beforeEach(async () => {
    await enableDiscovery();
    await updateAIMemory(USER, { preferredTopics: ['react'], mutedTopics: [] });
  });

  it('returns advisory scores only when enabled', async () => {
    const result = await scoreFeedCandidates({
      userId: USER,
      candidates: [
        {
          id: 'p1',
          topics: ['react'],
          createdAt: new Date().toISOString(),
          engagementHint: 0.5,
          creatorAffinity: 0.4
        },
        {
          id: 'p2',
          topics: ['gardening'],
          createdAt: new Date(Date.now() - 86400000 * 5).toISOString()
        }
      ]
    });
    expect(result.enabled).toBe(true);
    expect(result.authoritative).toBe(false);
    expect(result.policy.aiMayReorderFeed).toBe(false);
    expect(result.policy.deterministicRankingAuthoritative).toBe(true);
    expect(result.scores.length).toBe(2);
    expect(result.scores[0].advisoryOnly).toBe(true);
    expect(result.scores[0].reasons.length).toBeGreaterThan(0);
    // Preferred topic should score higher
    const reactScore = result.scores.find((s) => s.id === 'p1')!.score;
    const otherScore = result.scores.find((s) => s.id === 'p2')!.score;
    expect(reactScore).toBeGreaterThanOrEqual(otherScore);
  });

  it('disabled when surface flag off', async () => {
    await setAIFeatureFlags({ feedScoringEnabled: false, masterEnabled: true });
    const result = await scoreFeedCandidates({
      userId: USER,
      candidates: [{ id: 'x', topics: ['a'] }]
    });
    expect(result.enabled).toBe(false);
    expect(result.scores.length).toBe(0);
  });

  it('heuristic breakdown is bounded', () => {
    const mem = {
      userId: USER,
      preferredTopics: ['ai'],
      preferredIndustries: [],
      mutedTopics: [],
      preferredLanguages: [],
      favoriteCommunities: [],
      mutedEntityIds: [],
      signalWeights: {},
      version: 1,
      updatedAt: null,
      privacyNotice: ''
    };
    const s = computeHeuristicScore(
      { id: '1', topics: ['ai'], createdAt: new Date().toISOString() },
      mem as any,
      0,
      1
    );
    expect(s.breakdown.composite).toBeGreaterThanOrEqual(0);
    expect(s.breakdown.composite).toBeLessThanOrEqual(1);
  });
});

describe('Phase 33.2 recommendations', () => {
  beforeEach(async () => {
    await enableDiscovery();
    await updateAIMemory(USER, { preferredTopics: ['react', 'design'] });
  });

  it('returns explainable cards with whyAmISeeingThis', async () => {
    const r = await getRecommendations({ userId: USER, limit: 8 });
    expect(r.enabled).toBe(true);
    expect(r.policy.autoAct).toBe(false);
    expect(r.items.length).toBeGreaterThan(0);
    expect(r.items[0].whyAmISeeingThis.length).toBeGreaterThan(5);
    expect(r.items[0].advisoryOnly).toBe(true);
  });

  it('builds dashboard sections', async () => {
    const d = await getDashboardRecommendations({ userId: USER });
    expect(d.enabled).toBe(true);
    expect((d.sections || []).length).toBeGreaterThan(0);
    for (const s of d.sections || []) {
      expect(s.title).toBeTruthy();
      expect(s.explanation).toBeTruthy();
    }
  });

  it('feedback updates preferences without retrain', async () => {
    const fb = await submitRecoFeedback({
      userId: USER,
      entityType: 'community',
      entityId: 'seed-comm-1',
      action: 'not_interested',
      topic: 'react'
    });
    expect(fb.ok).toBe(true);
  });

  it('blocks recommendation surfaces outside the beta allowlist', async () => {
    await enableDiscovery();
    await setAIFeatureFlags({
      masterEnabled: true,
      recommendationsEnabled: true,
      recommendationFeedbackEnabled: true,
      betaAllowlistOnly: true
    });
    const user = 'user-discovery-not-allowlisted-332';
    const recommendations = await getRecommendations({ userId: user, limit: 4 });
    expect(recommendations.enabled).toBe(false);
    expect(recommendations.reason).toBe('USER_NOT_IN_BETA_ALLOWLIST');
    const feedback = await submitRecoFeedback({
      userId: user,
      entityType: 'community',
      entityId: 'seed-comm-1',
      action: 'not_interested'
    });
    expect(feedback.ok).toBe(false);
    expect(feedback.reason).toBe('USER_NOT_IN_BETA_ALLOWLIST');
    await setAIFeatureFlags({ betaAllowlistOnly: false });
  });
});

describe('Phase 33.2 semantic search', () => {
  beforeEach(async () => {
    await enableDiscovery();
  });

  it('detects intent and typo hints', () => {
    expect(detectIntent('senior job openings')).toBe('jobs');
    expect(simpleTypoExpand('reac developer').length).toBeGreaterThan(0);
  });

  it('returns suggestions without executing search', async () => {
    const r = await assistSearchQuery({
      userId: USER,
      query: 'reac remote jobs'
    });
    expect(r.enabled).toBe(true);
    expect(r.aiExecutesSearch).toBe(false);
    expect(r.executionEngine).toBe('deterministic_search');
    expect(r.suggestions.length).toBeGreaterThan(0);
    expect(r.detectedIntent).toBeTruthy();
  });
});

describe('Phase 33.2 learning signals', () => {
  it('records disclosed signals when allowed', async () => {
    await enableDiscovery();
    const r = await recordLearningSignal({
      userId: USER,
      type: 'follow',
      topic: 'typescript',
      entityType: 'person'
    });
    expect(r.ok).toBe(true);
    await applyLearningSignal(USER, { type: 'like', topic: 'typescript' });
    const mem = await getAIMemory(USER);
    expect(mem.signalWeights['topic:typescript'] || mem.preferredTopics.includes('typescript')).toBeTruthy();
  });
});

describe('Phase 33.2 analytics', () => {
  it('returns admin snapshot', async () => {
    const a = await getDiscoveryAnalytics();
    expect(a.phase).toBe('33.2');
    expect(a.recommendation).toBeTruthy();
    expect(a.diversity).toBeTruthy();
    expect(a.provider).toBeTruthy();
  });
});
