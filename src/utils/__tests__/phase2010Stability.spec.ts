import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveFeedTerminalState, shouldHaltEmptyPageLoop } from '../continuousFeed';
import { shouldStopUnchangedCursorLoop, shouldAllowObserverLoadMore } from '../feedLifecycle';
import { getApiErrorMessage } from '../apiErrorMessage';

test('terminal when no cursor and zero unique adds', () => {
  const result = resolveFeedTerminalState({
    nextCursor: null,
    hasMoreFlag: null,
    uniqueAddedCount: 0,
    secondarySourcesRemaining: true
  });
  assert.equal(result.isTerminal, true);
  assert.equal(result.canContinue, false);
});

test('can continue with cursor and unique progress', () => {
  const result = resolveFeedTerminalState({
    nextCursor: 'abc',
    hasMoreFlag: true,
    uniqueAddedCount: 3
  });
  assert.equal(result.canContinue, true);
  assert.equal(result.isTerminal, false);
});

test('empty page loop halt after two empty pages', () => {
  assert.equal(shouldHaltEmptyPageLoop(2, 2), true);
  assert.equal(shouldHaltEmptyPageLoop(1, 2), false);
});

test('unchanged cursor with zero adds stops pagination', () => {
  assert.equal(
    shouldStopUnchangedCursorLoop({
      requestedCursor: 'c1',
      returnedCursor: 'c1',
      uniqueAddedCount: 0,
      consecutiveEmptyPages: 1
    }),
    true
  );
});

test('observer blocked when terminal', () => {
  assert.equal(
    shouldAllowObserverLoadMore({
      isIntersecting: true,
      initialLoading: false,
      loadMoreInFlight: false,
      isTerminal: true,
      hasCursor: true,
      offsetFallbackEnabled: false,
      secondarySourceRemaining: true
    }),
    false
  );
});

test('API error message prefers backend error field', () => {
  const msg = getApiErrorMessage(
    { response: { data: { error: 'Business page follows are disabled' } }, message: 'Request failed with status code 403' },
    'fallback'
  );
  assert.equal(msg, 'Business page follows are disabled');
});
