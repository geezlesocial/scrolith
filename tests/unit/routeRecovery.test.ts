import test from 'node:test';
import assert from 'node:assert/strict';
import { isLikelyChunkLoadError, normalizeRouteHref } from '../../src/mobile/runtime/routeRecovery';

test('normalizeRouteHref strips the origin from absolute URLs', () => {
  assert.equal(
    normalizeRouteHref('https://scrolith.com/messages/abc?tab=unread#latest'),
    '/messages/abc?tab=unread#latest'
  );
});

test('normalizeRouteHref preserves relative routes', () => {
  assert.equal(normalizeRouteHref('/m/notifications?filter=all'), '/m/notifications?filter=all');
});

test('isLikelyChunkLoadError detects dynamic import failures', () => {
  assert.equal(
    isLikelyChunkLoadError(new Error('Failed to fetch dynamically imported module')),
    true
  );
  assert.equal(isLikelyChunkLoadError(new Error('ordinary render error')), false);
});
