import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getStableFeedReactKey,
  isStaleFeedResponse,
  prependRealtimeItem,
  resolveRenderedCountAfterCommit,
  resolveTransportAfterFailure,
  shouldAllowObserverLoadMore,
  shouldShowInitialSkeleton,
  shouldSkipDuplicateCursorRequest,
  shouldStopUnchangedCursorLoop
} from '../../src/utils/feedLifecycle.ts';
import { mergeUniqueFeedItems } from '../../src/utils/feedPagination.ts';

test('existing feed remains considered visible during load-more (no initial skeleton)', () => {
  assert.equal(shouldShowInitialSkeleton({ loading: true, existingItemCount: 12 }), false);
  assert.equal(shouldShowInitialSkeleton({ loading: true, existingItemCount: 0 }), true);
  assert.equal(shouldShowInitialSkeleton({ loading: false, existingItemCount: 0 }), false);
});

test('initial loading does not repeatedly clear content: soft commit preserves render window', () => {
  const next = resolveRenderedCountAfterCommit({
    previousRendered: 14,
    previousLength: 14,
    nextLength: 16,
    initialWindow: 8,
    forceReset: false
  });
  assert.ok(next >= 14, 'soft refresh must not collapse progressive window');
  const hard = resolveRenderedCountAfterCommit({
    previousRendered: 14,
    previousLength: 14,
    nextLength: 16,
    initialWindow: 8,
    forceReset: true
  });
  assert.equal(hard, 8);
});

test('observer does not fire while a request is in flight', () => {
  assert.equal(
    shouldAllowObserverLoadMore({
      isIntersecting: true,
      initialLoading: false,
      loadMoreInFlight: true,
      isTerminal: false,
      hasCursor: true,
      offsetFallbackEnabled: false,
      secondarySourceRemaining: false
    }),
    false
  );
  assert.equal(
    shouldAllowObserverLoadMore({
      isIntersecting: true,
      initialLoading: true,
      loadMoreInFlight: false,
      isTerminal: false,
      hasCursor: true,
      offsetFallbackEnabled: false,
      secondarySourceRemaining: false
    }),
    false
  );
});

test('same cursor cannot be requested twice concurrently', () => {
  assert.equal(
    shouldSkipDuplicateCursorRequest({
      cursor: 'abc123',
      inFlightCursor: 'abc123',
      loadMoreInFlight: true
    }),
    true
  );
  assert.equal(
    shouldSkipDuplicateCursorRequest({
      cursor: 'abc123',
      inFlightCursor: null,
      loadMoreInFlight: false,
      lastCompletedCursor: 'abc123',
      lastCompletedAddedCount: 0
    }),
    true
  );
  assert.equal(
    shouldSkipDuplicateCursorRequest({
      cursor: 'next-1',
      inFlightCursor: null,
      loadMoreInFlight: false,
      lastCompletedCursor: 'prev-1',
      lastCompletedAddedCount: 5
    }),
    false
  );
});

test('empty page with unchanged cursor does not loop', () => {
  assert.equal(
    shouldStopUnchangedCursorLoop({
      requestedCursor: 'cur-1',
      returnedCursor: 'cur-1',
      uniqueAddedCount: 0,
      consecutiveEmptyPages: 1
    }),
    true
  );
  assert.equal(
    shouldStopUnchangedCursorLoop({
      requestedCursor: 'cur-1',
      returnedCursor: 'cur-2',
      uniqueAddedCount: 0,
      consecutiveEmptyPages: 2,
      maxEmptyPages: 2
    }),
    true
  );
  assert.equal(
    shouldStopUnchangedCursorLoop({
      requestedCursor: 'cur-1',
      returnedCursor: 'cur-2',
      uniqueAddedCount: 4,
      consecutiveEmptyPages: 0
    }),
    false
  );
});

test('orchestrator failure switches once to legacy and stays there', () => {
  const afterFail = resolveTransportAfterFailure('orchestrated', 'orchestrated');
  assert.equal(afterFail, 'legacy');
  const sticky = resolveTransportAfterFailure('legacy', 'orchestrated');
  assert.equal(sticky, 'legacy');
});

test('stale responses cannot replace newer data', () => {
  assert.equal(isStaleFeedResponse(3, 5), true);
  assert.equal(isStaleFeedResponse(5, 5), false);
});

test('load-more appends and dedupes', () => {
  const existing = [{ id: 'a' }, { id: 'b' }];
  const incoming = [{ id: 'b' }, { id: 'c' }];
  const { merged, addedCount } = mergeUniqueFeedItems(existing, incoming);
  assert.equal(addedCount, 1);
  assert.deepEqual(
    merged.map((x) => x.id),
    ['a', 'b', 'c']
  );
});

test('realtime insert does not reset pagination (prepend only)', () => {
  const existing = [{ id: '1' }, { id: '2' }];
  const { next, inserted } = prependRealtimeItem(existing, { id: 'new' });
  assert.equal(inserted, true);
  assert.deepEqual(
    next.map((x) => x.id),
    ['new', '1', '2']
  );
  const dup = prependRealtimeItem(next, { id: '1' });
  assert.equal(dup.inserted, false);
  assert.equal(dup.next.length, 3);
});

test('stable item keys are used (never empty; prefer feedKey/id)', () => {
  assert.equal(getStableFeedReactKey({ feedKey: 'POST:x', id: 'x' }), 'POST:x');
  assert.equal(getStableFeedReactKey({ id: 'abc' }), 'abc');
  assert.ok(getStableFeedReactKey({}, 3).includes('3'));
});

test('loading state does not unmount feed when content exists', () => {
  assert.equal(shouldShowInitialSkeleton({ loading: true, existingItemCount: 5 }), false);
});

test('hasMore=false disconnects observer path (terminal blocks)', () => {
  assert.equal(
    shouldAllowObserverLoadMore({
      isIntersecting: true,
      initialLoading: false,
      loadMoreInFlight: false,
      isTerminal: true,
      hasCursor: false,
      offsetFallbackEnabled: false,
      secondarySourceRemaining: false
    }),
    false
  );
});

test('member-home and community share the same safe pagination guards', () => {
  const shared = shouldAllowObserverLoadMore({
    isIntersecting: true,
    initialLoading: false,
    loadMoreInFlight: false,
    isTerminal: false,
    hasCursor: true,
    offsetFallbackEnabled: false,
    secondarySourceRemaining: false
  });
  assert.equal(shared, true);
});
