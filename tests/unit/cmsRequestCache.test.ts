import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRequestFailure, RequestCache } from '../../src/services/cmsRequestCache';

test('header and hero configuration requests dedupe and cache', async () => {
  const cache = new RequestCache<{ value: string }>();
  let requests = 0;
  const load = async () => {
    requests += 1;
    await Promise.resolve();
    return { value: 'ready' };
  };

  const [first, second] = await Promise.all([
    cache.get('cms:header', load, () => ({ value: 'fallback' })),
    cache.get('cms:header', load, () => ({ value: 'fallback' }))
  ]);

  assert.deepEqual(first, { value: 'ready' });
  assert.deepEqual(second, { value: 'ready' });
  assert.equal(requests, 1);
  assert.deepEqual(await cache.get('cms:header', load, () => ({ value: 'fallback' })), { value: 'ready' });
  assert.equal(requests, 1);
});

test('rejected CMS configuration uses defaults and does not loop', async () => {
  const cache = new RequestCache<string>();
  let requests = 0;
  const result = await cache.get(
    'cms:hero-search',
    async () => {
      requests += 1;
      throw new TypeError('Failed to fetch');
    },
    () => 'default'
  );

  assert.equal(result, 'default');
  assert.equal(await cache.get('cms:hero-search', async () => 'unexpected', () => 'default'), 'default');
  assert.equal(requests, 1);
  assert.equal(cache.snapshot()[0]?.hasInFlight, false);
});

test('abort failures are classified as cancellation, not network errors', () => {
  assert.equal(classifyRequestFailure(new DOMException('cancelled', 'AbortError')), 'abort');
  assert.equal(classifyRequestFailure(new TypeError('Failed to fetch')), 'network-rejection');
  assert.equal(classifyRequestFailure({ status: 503, message: 'Unavailable' }), 'http-error');
});

test('a stale request cannot overwrite a newer invalidated request', async () => {
  const cache = new RequestCache<string>();
  let resolveOld: ((value: string) => void) | undefined;
  const old = cache.get(
    'cms:header',
    () => new Promise<string>((resolve) => {
      resolveOld = resolve;
    }),
    () => 'fallback'
  );

  cache.invalidate('cms:header');
  const current = cache.get('cms:header', async () => 'current', () => 'fallback');
  assert.equal(await current, 'current');
  resolveOld?.('stale');
  assert.equal(await old, 'stale');
  assert.equal(await cache.get('cms:header', async () => 'unexpected', () => 'fallback'), 'current');
});
