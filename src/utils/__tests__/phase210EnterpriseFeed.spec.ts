import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCaughtUpSuggestions,
  buildObserverRootMargin,
  classifyFeedNetwork,
  mixFeedBatchForDiversity,
  resolveAdaptivePageSize,
  resolvePrefetchPolicy,
  shouldPrefetchNextPage,
  trimFeedForMemory,
  ENTERPRISE_FEED_ENGINE_VERSION
} from '../enterpriseFeedEngine';
import { resolveFeedTerminalState } from '../continuousFeed';

test('engine version is 21.0.2', () => {
  assert.equal(ENTERPRISE_FEED_ENGINE_VERSION, '21.0.2');
});

test('classifyFeedNetwork maps saveData and 2g to constrained/slow', () => {
  assert.equal(classifyFeedNetwork({ saveData: true }), 'constrained');
  assert.equal(classifyFeedNetwork({ effectiveType: '2g' }), 'slow');
  assert.equal(classifyFeedNetwork({ onLine: false }), 'offline');
  assert.equal(classifyFeedNetwork({ effectiveType: '4g', downlink: 12 }), 'fast');
});

test('adaptive page size shrinks for data saver and grows for fast', () => {
  const base = 12;
  assert.ok(
    resolveAdaptivePageSize({ basePageSize: base, networkClass: 'slow', dataSaver: true }) <= 8
  );
  assert.ok(
    resolveAdaptivePageSize({ basePageSize: base, networkClass: 'fast', isMobile: false }) >= base
  );
});

test('prefetch only when progressive window nears end of loaded list', () => {
  assert.equal(
    shouldPrefetchNextPage({
      loadedCount: 20,
      renderedCount: 10,
      remainingItemThreshold: 4,
      hasCursor: true,
      isTerminal: false,
      loadMoreInFlight: false,
      initialLoading: false
    }),
    false
  );
  assert.equal(
    shouldPrefetchNextPage({
      loadedCount: 20,
      renderedCount: 17,
      remainingItemThreshold: 4,
      hasCursor: true,
      isTerminal: false,
      loadMoreInFlight: false,
      initialLoading: false
    }),
    true
  );
  assert.equal(
    shouldPrefetchNextPage({
      loadedCount: 20,
      renderedCount: 19,
      remainingItemThreshold: 4,
      hasCursor: true,
      isTerminal: true,
      loadMoreInFlight: false,
      initialLoading: false
    }),
    false
  );
});

test('prefetch policy returns larger rootMargin on fast networks', () => {
  const slow = resolvePrefetchPolicy('slow', { isMobile: true });
  const fast = resolvePrefetchPolicy('fast', { isMobile: true });
  assert.ok(fast.observerRootMarginPx > slow.observerRootMarginPx);
  assert.match(buildObserverRootMargin(fast.observerRootMarginPx), /^\d+px 0px$/);
});

test('diversity interleave avoids long runs of same type when alternatives exist', () => {
  const mixed = mixFeedBatchForDiversity(
    [
      { id: '1', type: 'post', authorId: 'a' },
      { id: '2', type: 'post', authorId: 'a' },
      { id: '3', type: 'post', authorId: 'a' },
      { id: '4', type: 'job', authorId: 'b' },
      { id: '5', type: 'listing', authorId: 'c' }
    ],
    { maxConsecutiveSameType: 2, maxConsecutiveSameAuthor: 1 }
  );
  assert.equal(mixed.length, 5);
  // First three should not all be the same type if diversify worked.
  const firstThreeTypes = mixed.slice(0, 3).map((item) => item.type);
  assert.ok(!(firstThreeTypes[0] === 'post' && firstThreeTypes[1] === 'post' && firstThreeTypes[2] === 'post'));
});

test('trimFeedForMemory keeps tail within cap', () => {
  const items = Array.from({ length: 50 }, (_, i) => ({ id: String(i) }));
  const trimmed = trimFeedForMemory(items, 30);
  assert.equal(trimmed.length, 30);
  assert.equal(trimmed[0].id, '20');
  assert.equal(trimmed[29].id, '49');
});

test('caught-up suggestions always include professional discovery paths', () => {
  const suggestions = buildCaughtUpSuggestions({ surface: 'member_home' });
  assert.ok(suggestions.length >= 4);
  const kinds = new Set(suggestions.map((s) => s.kind));
  assert.ok(kinds.has('communities') || kinds.has('people'));
  assert.ok(kinds.has('jobs') || kinds.has('marketplace'));
});

test('terminal state still ends empty-cursor zero-progress pages (20.10 continuity)', () => {
  const result = resolveFeedTerminalState({
    nextCursor: null,
    hasMoreFlag: null,
    uniqueAddedCount: 0
  });
  assert.equal(result.isTerminal, true);
});
