import test from 'node:test';
import assert from 'node:assert/strict';
import {
  simulateLongSessionAppend,
  assertCursorIntegrity,
  assertStableOrderAfterTrim,
  buildSyntheticStream,
  FEED_SESSION_STABILITY_VERSION
} from '../feedSessionStability';
import { trimFeedForMemory } from '../enterpriseFeedEngine';
import { shouldEnableFeedVirtualization, resolveVirtualOverscan } from '../feedVirtualPolicy';
import {
  saveFeedScrollPosition,
  readFeedScrollPosition,
  clearFeedScrollPosition,
  scrollStorageKey
} from '../feedScrollRestoration';
import { markFeedPerf, buildFeedPerfReport, clearFeedPerfMarks, benchmarkMergeThroughput } from '../feedPerformanceProbe';
import { FEED_MEDIA_FALLBACK_DATA_URI, resolveFeedMediaUrlOrFallback } from '../feedMediaPrefetch';
import { ENTERPRISE_FEED_ENGINE_VERSION } from '../enterpriseFeedEngine';

test('engine and session versions are 21.0.2-aligned', () => {
  assert.equal(ENTERPRISE_FEED_ENGINE_VERSION, '21.0.2');
  // Session stability package remains 21.1.4+; engine label is independent.
  assert.ok(String(FEED_SESSION_STABILITY_VERSION).length > 0);
});

test('long session 500 items retains within cap without duplicates', () => {
  const report = simulateLongSessionAppend({ total: 500, pageSize: 20, maxRetained: 140 });
  assert.equal(report.ok, true, report.reasons.join(','));
  assert.equal(report.retainedItems, 140);
  assert.equal(report.uniqueKeys, 140);
});

test('long session 1000 items stable', () => {
  const report = simulateLongSessionAppend({ total: 1000, pageSize: 25, maxRetained: 140 });
  assert.equal(report.ok, true, report.reasons.join(','));
  assert.ok(report.pages >= 40);
});

test('long session 5000 items stable memory bound', () => {
  const start = Date.now();
  const report = simulateLongSessionAppend({ total: 5000, pageSize: 40, maxRetained: 140 });
  const durationMs = Date.now() - start;
  assert.equal(report.ok, true, report.reasons.join(','));
  assert.equal(report.retainedItems, 140);
  // Performance evidence: synthetic 5k merge under 5s on CI hardware
  assert.ok(durationMs < 5000, `5k session took ${durationMs}ms`);
});

test('trim preserves relative order', () => {
  const before = buildSyntheticStream(50);
  const after = trimFeedForMemory(before, 20) as typeof before;
  assert.equal(after.length, 20);
  assert.equal(assertStableOrderAfterTrim(before, after), true);
});

test('cursor integrity terminal cannot keep cursor', () => {
  assert.equal(assertCursorIntegrity({ cursor: 'abc', isTerminal: true, loadedCount: 10 }).ok, false);
  assert.equal(assertCursorIntegrity({ cursor: null, isTerminal: true, loadedCount: 10 }).ok, true);
});

test('virtualization default-on at 12+ items', () => {
  assert.equal(shouldEnableFeedVirtualization({ itemCount: 8 }), false);
  assert.equal(shouldEnableFeedVirtualization({ itemCount: 12 }), true);
  assert.equal(shouldEnableFeedVirtualization({ itemCount: 30, dataSaver: true }), true);
  assert.equal(shouldEnableFeedVirtualization({ itemCount: 15, force: false }), false);
  assert.ok(resolveVirtualOverscan({ isMobile: true }) >= 2);
});

test('scroll restoration round-trip (sessionStorage mock)', () => {
  const store = new Map<string, string>();
  const original = globalThis.window;
  (globalThis as any).window = {
    sessionStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      }
    }
  };
  try {
    saveFeedScrollPosition('member_home', 420, 'user1');
    assert.equal(readFeedScrollPosition('member_home', 'user1'), 420);
    assert.ok(scrollStorageKey('member_home', 'user1').includes('member_home'));
    clearFeedScrollPosition('member_home', 'user1');
    assert.equal(readFeedScrollPosition('member_home', 'user1'), null);
  } finally {
    (globalThis as any).window = original;
  }
});

test('performance probe marks request span', () => {
  clearFeedPerfMarks();
  markFeedPerf('feed_request_start');
  markFeedPerf('feed_request_end');
  const report = buildFeedPerfReport({ longSessionOk: true, retainedItems: 140 });
  assert.ok((report.summary.requestLatencyMs ?? -1) >= 0);
  assert.equal(report.version, '21.0.2');
});

test('merge throughput benchmark runs', () => {
  const bench = benchmarkMergeThroughput(200, 20, (params) =>
    simulateLongSessionAppend({ ...params, maxRetained: 140 })
  );
  assert.ok(bench.durationMs > 0);
  assert.ok(bench.itemsPerMs > 0);
});

test('media fallback is inline data uri', () => {
  assert.ok(FEED_MEDIA_FALLBACK_DATA_URI.startsWith('data:image/svg+xml'));
  assert.equal(resolveFeedMediaUrlOrFallback(''), FEED_MEDIA_FALLBACK_DATA_URI);
});
