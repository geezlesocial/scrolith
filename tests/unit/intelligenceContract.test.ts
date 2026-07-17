import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeClientIntelligence,
  labelForReasonCode,
  INTELLIGENCE_CONTRACT_VERSION
} from '../../src/utils/intelligenceContract';
import {
  resolveFeedRankingPresentation,
  resolveListingFitReasons,
  resolvePersonRecoPresentation
} from '../../src/utils/feedIntelligence';
import {
  buildNormalizedViewerFeedPreference,
  mapInsightsModeToFeedIntent,
  mapFeedIntentToInsightsMode
} from '../../src/utils/viewerFeedPreference';

test('normalizeClientIntelligence: legacy payload without metadata', () => {
  const item = normalizeClientIntelligence({ id: 'p1', content: 'hello' });
  assert.ok(item);
  assert.equal(item!.entityId, 'p1');
  assert.equal(item!.primaryReason, null);
  assert.equal(item!.intelligenceVersion, INTELLIGENCE_CONTRACT_VERSION);
});

test('normalizeClientIntelligence: server intelligence envelope preferred', () => {
  const item = normalizeClientIntelligence({
    id: 'p2',
    intelligence: {
      entityType: 'post',
      entityId: 'p2',
      primaryReason: 'Strong hiring intent',
      reasons: ['Relevant to your location'],
      reasonCodes: ['HIRING_INTENT'],
      score: 12
    },
    ranking: { primaryReason: 'fallback' }
  });
  assert.equal(item!.primaryReason, 'Strong hiring intent');
  assert.ok(item!.reasons!.includes('Relevant to your location'));
  assert.equal(item!.score, 12);
});

test('resolveFeedRankingPresentation prefers server primary reason', () => {
  const presentation = resolveFeedRankingPresentation({
    id: 'p3',
    ranking: {
      primaryReason: 'Matches a topic you follow: product',
      reasons: ['Matches a topic you follow: product', 'Pinned post'],
      score: 0.9
    }
  });
  assert.equal(presentation.primaryReason, 'Matches a topic you follow: product');
  assert.ok(presentation.reasons.includes('Pinned post'));
  assert.ok(!presentation.reasons.includes(presentation.primaryReason!));
  assert.equal(presentation.scoreLabel, 'Strong match');
});

test('resolveFeedRankingPresentation rejects object coercion artifacts', () => {
  const presentation = resolveFeedRankingPresentation({
    id: 'p4',
    why: '[object Object]',
    ranking: { primaryReason: '[object Object]', reasons: ['[object Object]'] }
  });
  assert.equal(presentation.primaryReason, null);
});

test('resolveListingFitReasons uses server reasons over generic chips', () => {
  const reasons = resolveListingFitReasons(
    {
      id: 'j1',
      primaryReason: 'Matched to your hiring graph',
      reasons: ['Budget fit'],
      category: 'Engineering'
    },
    'job'
  );
  assert.equal(reasons[0], 'Matched to your hiring graph');
  assert.ok(reasons.includes('Budget fit'));
});

test('resolveListingFitReasons falls back when server absent', () => {
  const reasons = resolveListingFitReasons(
    { id: 'g1', category: 'Design', featured: true, price: 100 },
    'gig'
  );
  assert.ok(reasons.includes('Service'));
  assert.ok(reasons.includes('Design') || reasons.includes('Featured'));
});

test('resolvePersonRecoPresentation does not invent High match from bare score', () => {
  const reco = resolvePersonRecoPresentation({
    id: 'u1',
    score: 0.99,
    account: { name: 'Ada', industry: 'Design' }
  });
  assert.ok(!reco.reasons.includes('High match'));
  assert.ok(reco.whyRecommended);
});

test('resolvePersonRecoPresentation uses server reason', () => {
  const reco = resolvePersonRecoPresentation({
    id: 'u2',
    reason: 'Mutual connections in your industry',
    account: { name: 'Bob' }
  });
  assert.equal(reco.whyRecommended, 'Mutual connections in your industry');
});

test('raw reason codes map to safe labels', () => {
  assert.equal(labelForReasonCode('TOPIC_AFFINITY'), 'Matches topics you follow');
  const presentation = resolveFeedRankingPresentation({
    id: 'p5',
    ranking: { reasonCodes: ['SPONSORED'] }
  });
  assert.equal(presentation.primaryReason, 'Sponsored');
});

test('preference mapping covers all insights modes', () => {
  assert.equal(mapInsightsModeToFeedIntent('growth'), 'for_you');
  assert.equal(mapInsightsModeToFeedIntent('opportunity', 'employer'), 'hire');
  assert.equal(mapInsightsModeToFeedIntent('opportunity', 'freelancer'), 'sell');
  assert.equal(mapInsightsModeToFeedIntent('network'), 'following');
  assert.equal(mapInsightsModeToFeedIntent('learning'), 'learn');
});

test('preference mapping reverse and invalid fallback', () => {
  assert.equal(mapFeedIntentToInsightsMode('sell'), 'opportunity');
  assert.equal(mapFeedIntentToInsightsMode('local'), 'growth');
  const pref = buildNormalizedViewerFeedPreference({ insightsMode: 'invalid' });
  assert.equal(pref.feedIntent, 'for_you');
  assert.equal(pref.insightsMode, 'growth');
});

test('personalization disabled forces for_you', () => {
  const pref = buildNormalizedViewerFeedPreference({
    insightsMode: 'opportunity',
    roleLike: 'employer',
    personalizationEnabled: false
  });
  assert.equal(pref.feedIntent, 'for_you');
});
