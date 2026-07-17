import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeIntelligenceItem,
  attachIntelligenceToFeedItem,
  mapOrchestratedItemsWithIntelligence,
  INTELLIGENCE_CONTRACT_VERSION,
  __intelligenceContractTestUtils
} from '../services/intelligence/intelligence.contract';
import {
  buildNormalizedViewerFeedPreference,
  mapInsightsModeToFeedIntent,
  mapFeedIntentToInsightsMode
} from '../services/intelligence/viewerPreference';
import { labelForReasonCode, mapReasonCodesFromTexts } from '../services/intelligence/reasonCodes';
import { intelligenceMetrics } from '../services/intelligence/intelligence.observability';

test('legacy payload without intelligence metadata remains valid', () => {
  const item = normalizeIntelligenceItem({ id: 'p1', type: 'POST', content: 'hello' });
  assert.ok(item);
  assert.equal(item!.entityId, 'p1');
  assert.equal(item!.primaryReason, null);
  assert.deepEqual(item!.reasons, []);
  assert.equal(item!.intelligenceVersion, INTELLIGENCE_CONTRACT_VERSION);
});

test('canonical payload with all fields', () => {
  const item = normalizeIntelligenceItem({
    id: 'p2',
    type: 'POST',
    ranking: {
      score: 0.9,
      mode: 'for_you',
      primaryReason: 'Matches a topic you follow: design',
      reasons: ['Matches a topic you follow: design', 'Relevant to your location'],
      reasonCodes: ['TOPIC_AFFINITY', 'LOCATION_RELEVANCE'],
      confidence: 0.8,
      recipeKey: 'default'
    }
  });
  assert.ok(item);
  assert.equal(item!.score, 0.9);
  assert.equal(item!.rankMode, 'for_you');
  assert.equal(item!.primaryReason, 'Matches a topic you follow: design');
  assert.ok(item!.reasons!.includes('Relevant to your location'));
  assert.ok(!item!.reasons!.includes(item!.primaryReason!));
  assert.ok(item!.reasonCodes!.includes('TOPIC_AFFINITY'));
});

test('duplicate reasons and primary duplication removed', () => {
  const item = normalizeIntelligenceItem({
    id: 'p3',
    why: 'Recommended for you',
    ranking: {
      primaryReason: 'Recommended for you',
      reasons: ['Recommended for you', 'Recommended for you', 'Trending now']
    }
  });
  assert.equal(item!.primaryReason, 'Recommended for you');
  assert.deepEqual(item!.reasons, ['Trending now']);
});

test('invalid scores normalize to null', () => {
  assert.equal(__intelligenceContractTestUtils.normalizeScore(Number.NaN), null);
  assert.equal(__intelligenceContractTestUtils.normalizeScore(Number.POSITIVE_INFINITY), null);
  assert.equal(__intelligenceContractTestUtils.normalizeScore('not-a-number'), null);
  assert.equal(normalizeIntelligenceItem({ id: 'p4', score: Number.NaN })!.score, null);
});

test('empty reason values removed', () => {
  const item = normalizeIntelligenceItem({
    id: 'p5',
    ranking: { reasons: ['', '  ', null, 'Pinned post'] }
  });
  assert.equal(item!.primaryReason, 'Pinned post');
  assert.deepEqual(item!.reasons, []);
});

test('malformed arrays/objects do not throw', () => {
  assert.doesNotThrow(() =>
    normalizeIntelligenceItem({
      id: 'p6',
      ranking: { reasons: { bad: true }, primaryReason: { x: 1 } },
      why: { nested: true }
    })
  );
  const item = normalizeIntelligenceItem({
    id: 'p6',
    ranking: { reasons: { bad: true }, primaryReason: { x: 1 } },
    why: { nested: true }
  });
  assert.equal(item!.primaryReason, null);
});

test('object coercion artifact rejected', () => {
  const item = normalizeIntelligenceItem({
    id: 'p7',
    why: '[object Object]',
    ranking: { primaryReason: '[object Object]' }
  });
  assert.equal(item!.primaryReason, null);
});

test('attachIntelligence preserves score/order fields', () => {
  const feedItem = {
    type: 'POST',
    id: 'p8',
    sourceId: 'p8',
    feedKey: 'POST:p8',
    createdAt: new Date().toISOString(),
    score: 42,
    rankingScore: 42,
    author: null,
    media: null,
    visibility: 'public',
    why: 'Strong hiring intent',
    payload: {
      id: 'p8',
      ranking: { mode: 'hire', score: 42, primaryReason: 'Strong hiring intent', reasons: ['Strong hiring intent'] }
    }
  };
  const next = attachIntelligenceToFeedItem(feedItem as any, 'hire') as any;
  assert.equal(next.score, 42);
  assert.equal(next.why, 'Strong hiring intent');
  assert.ok(next.intelligence);
  assert.equal(next.intelligence.primaryReason, 'Strong hiring intent');
  assert.equal(next.payload.ranking.score, 42);
});

test('mapOrchestratedItemsWithIntelligence is additive for empty list', () => {
  assert.deepEqual(mapOrchestratedItemsWithIntelligence([], 'for_you'), []);
});

test('reason code catalog labels are user-safe', () => {
  assert.equal(labelForReasonCode('TOPIC_AFFINITY'), 'Matches topics you follow');
  assert.ok(mapReasonCodesFromTexts(['Strong hiring intent']).includes('HIRING_INTENT'));
});

test('preference mapping: insights modes', () => {
  assert.equal(mapInsightsModeToFeedIntent('growth'), 'for_you');
  assert.equal(mapInsightsModeToFeedIntent('learning'), 'learn');
  assert.equal(mapInsightsModeToFeedIntent('network'), 'following');
  assert.equal(mapInsightsModeToFeedIntent('opportunity', 'employer'), 'hire');
  assert.equal(mapInsightsModeToFeedIntent('opportunity', 'freelancer'), 'sell');
  assert.equal(mapFeedIntentToInsightsMode('hire'), 'opportunity');
  assert.equal(mapFeedIntentToInsightsMode('local'), 'growth');
});

test('preference invalid values fall back to for_you/growth', () => {
  const pref = buildNormalizedViewerFeedPreference({ insightsMode: 'nope' });
  assert.equal(pref.feedIntent, 'for_you');
  assert.equal(pref.insightsMode, 'growth');
});

test('preference personalization disabled forces for_you', () => {
  const pref = buildNormalizedViewerFeedPreference({
    insightsMode: 'opportunity',
    personalizationEnabled: false
  });
  assert.equal(pref.feedIntent, 'for_you');
  assert.equal(pref.personalizationEnabled, false);
});

test('observability counters are privacy-safe aggregates', () => {
  intelligenceMetrics.resetForTests();
  intelligenceMetrics.recordMemberFeedIntelligenceFill({
    primaryReason: 'x',
    reasons: ['y'],
    reasonCodes: ['TOPIC_AFFINITY'],
    score: 1
  });
  intelligenceMetrics.recordMobileOrchestrator('success');
  const snap = intelligenceMetrics.snapshot();
  assert.equal(snap['intel.items'], 1);
  assert.equal(snap['intel.primaryReason'], 1);
  assert.equal(snap['mobile.orch.success'], 1);
});
