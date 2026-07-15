/**
 * Phase 9.4 — cache, feedback, cursor security, handoff, realtime.
 */
import {
  buildSearchCacheKey,
  bumpSearchCacheGeneration,
  clearSearchCacheForTests,
  coalesceSearchRequest,
  decodeSearchCursor,
  encodeSearchCursor,
  getSearchCache,
  getSearchCacheStats,
  getSearchMetricsSnapshot,
  invalidateSearchCache,
  invalidateEnterpriseSearchRolloutCache,
  resetSearchFeedbackStateForTests,
  resetSearchMetricsForTests,
  resetSearchRealtimeForTests,
  setSearchCache,
  submitSearchFeedback,
  validateSearchFeedback,
  SearchContractError,
  EnterpriseSearchService
} from '../index';
import { emitSearchInvalidation } from '../realtime/realtime';
import { rankViaDiscoveryOrFallback } from '../ranking/discoveryHandoff';
import { lexicalRankCandidates } from '../ranking/lexicalFallback';

describe('Phase 9.4 — cache', () => {
  beforeEach(() => {
    clearSearchCacheForTests();
    resetSearchMetricsForTests();
  });

  test('viewer-scoped keys differ', () => {
    const a = buildSearchCacheKey({ viewerId: 'u1', op: 'q', query: 'react', ns: 'query' });
    const b = buildSearchCacheKey({ viewerId: 'u2', op: 'q', query: 'react', ns: 'query' });
    expect(a).not.toBe(b);
    expect(a.startsWith('query:')).toBe(true);
  });

  test('get/set and hit ratio metrics', () => {
    const key = buildSearchCacheKey({ viewerId: 'u1', op: 't', query: 'x', ns: 'retrieve' });
    expect(getSearchCache(key)).toBeNull();
    setSearchCache(key, { ok: 1 }, 5_000, { ns: 'retrieve', viewerId: 'u1' });
    expect(getSearchCache<{ ok: number }>(key)?.ok).toBe(1);
    const stats = getSearchCacheStats();
    expect(stats.hits).toBeGreaterThanOrEqual(1);
    expect(stats.misses).toBeGreaterThanOrEqual(1);
    expect(stats.hitRatio).toBeGreaterThan(0);
  });

  test('invalidation by viewer removes only that viewer', () => {
    const k1 = buildSearchCacheKey({ viewerId: 'u1', op: 't', query: 'a', ns: 'query' });
    const k2 = buildSearchCacheKey({ viewerId: 'u2', op: 't', query: 'a', ns: 'query' });
    setSearchCache(k1, 1, 10_000, { ns: 'query', viewerId: 'u1' });
    setSearchCache(k2, 2, 10_000, { ns: 'query', viewerId: 'u2' });
    invalidateSearchCache({ viewerId: 'u1' });
    expect(getSearchCache(k1)).toBeNull();
    expect(getSearchCache(k2)).toBe(2);
  });

  test('generation bump clears all', () => {
    const k = buildSearchCacheKey({ viewerId: 'u1', op: 't', query: 'z', ns: 'query' });
    setSearchCache(k, 'v', 10_000, { ns: 'query', viewerId: 'u1' });
    bumpSearchCacheGeneration('test');
    expect(getSearchCache(k)).toBeNull();
  });

  test('coalesce reuses in-flight promise', async () => {
    let runs = 0;
    const key = 'coalesce-test';
    const p1 = coalesceSearchRequest(key, async () => {
      runs += 1;
      await new Promise((r) => setTimeout(r, 30));
      return 42;
    });
    const p2 = coalesceSearchRequest(key, async () => {
      runs += 1;
      return 99;
    });
    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toBe(42);
    expect(b).toBe(42);
    expect(runs).toBe(1);
  });
});

describe('Phase 9.4 — cursor security', () => {
  test('tamper detection', () => {
    const enc = encodeSearchCursor({
      viewerId: 'u1',
      offset: 5,
      seen: ['post:1'],
      normalizedQuery: 'ai',
      domains: ['post'],
      rankingModelVersion: 'lexical-v1'
    });
    const bad = enc.slice(0, -6) + 'AAAAAA';
    const decoded = decodeSearchCursor(bad, {
      viewerId: 'u1',
      normalizedQuery: 'ai',
      domains: ['post'],
      rankingModelVersion: 'lexical-v1'
    });
    expect(decoded.ok).toBe(false);
  });

  test('viewer mismatch', () => {
    const enc = encodeSearchCursor({
      viewerId: 'u1',
      offset: 0,
      seen: [],
      normalizedQuery: 'q',
      domains: ['job'],
      rankingModelVersion: 'lexical-v1'
    });
    const decoded = decodeSearchCursor(enc, {
      viewerId: 'u2',
      normalizedQuery: 'q',
      domains: ['job'],
      rankingModelVersion: 'lexical-v1'
    });
    expect(decoded.ok).toBe(false);
    if (decoded.ok === false) expect(decoded.code).toBe('CURSOR_VIEWER_MISMATCH');
  });

  test('query binding mismatch', () => {
    const enc = encodeSearchCursor({
      viewerId: 'u1',
      offset: 0,
      seen: [],
      normalizedQuery: 'alpha',
      domains: ['job'],
      rankingModelVersion: 'lexical-v1'
    });
    const decoded = decodeSearchCursor(enc, {
      viewerId: 'u1',
      normalizedQuery: 'beta',
      domains: ['job'],
      rankingModelVersion: 'lexical-v1'
    });
    expect(decoded.ok).toBe(false);
  });

  test('round-trip with nonce still validates', () => {
    const enc = encodeSearchCursor({
      viewerId: 'u1',
      offset: 10,
      seen: ['job:1'],
      normalizedQuery: 'node',
      domains: ['job', 'service'],
      filters: { verified: true },
      rankingModelVersion: 'lexical-v1'
    });
    const decoded = decodeSearchCursor(enc, {
      viewerId: 'u1',
      normalizedQuery: 'node',
      domains: ['job', 'service'],
      filters: { verified: true },
      rankingModelVersion: 'lexical-v1'
    });
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.state.o).toBe(10);
      expect(decoded.state.n).toBeTruthy();
    }
  });
});

describe('Phase 9.4 — feedback engine', () => {
  beforeEach(() => {
    resetSearchFeedbackStateForTests();
    clearSearchCacheForTests();
  });

  test('validates payload', () => {
    expect(() =>
      validateSearchFeedback({
        action: 'click',
        entityType: 'post',
        entityId: '',
        viewerId: 'u1'
      })
    ).toThrow(SearchContractError);
  });

  test('rejects invalid action', () => {
    expect(() =>
      validateSearchFeedback({
        action: 'explode' as any,
        entityType: 'post',
        entityId: 'p1',
        viewerId: 'u1'
      })
    ).toThrow(SearchContractError);
  });

  test('dedupes repeated events', async () => {
    jest.spyOn(require('../../discoveryEngine/discoveryEngine.service'), 'recordDiscoveryFeedback').mockResolvedValue({
      ok: true
    });

    const payload = {
      action: 'click' as const,
      entityType: 'post' as const,
      entityId: 'p1',
      viewerId: 'u1',
      trackingToken: 'tok'
    };
    const a = await submitSearchFeedback(payload);
    const b = await submitSearchFeedback(payload);
    expect(a).toEqual({ ok: true });
    expect(b.skipped).toBe(true);
    expect(b.reason).toBe('deduped');
  });

  test('rate limits impressions', async () => {
    jest.spyOn(require('../../discoveryEngine/discoveryEngine.service'), 'recordDiscoveryFeedback').mockResolvedValue({
      ok: true
    });
    const base = {
      action: 'impression' as const,
      entityType: 'post' as const,
      viewerId: 'rate-user'
    };
    // unique entity ids avoid dedupe; exceed impression cap
    let threw = false;
    for (let i = 0; i < 130; i++) {
      try {
        await submitSearchFeedback({ ...base, entityId: `p-${i}` });
      } catch (e) {
        if (e instanceof SearchContractError && e.code === 'RATE_LIMITED') {
          threw = true;
          break;
        }
      }
    }
    expect(threw).toBe(true);
  });
});

describe('Phase 9.4 — discovery handoff fallback', () => {
  test('lexical when discovery rank disabled includes searchTraceId', async () => {
    const res = await rankViaDiscoveryOrFallback({
      viewerId: 'u1',
      query: 'x',
      domains: ['job'],
      candidates: [
        { entityType: 'job', entityId: 'j1', title: 'Job', url: '/jobs/j1', lexicalScore: 0.8 }
      ],
      limit: 5,
      discoveryRankEnabled: false
    });
    expect(res.fallbackUsed).toBe(true);
    expect(res.rankingAuthority).toBe('lexical_fallback');
    expect(res.searchTraceId).toMatch(/^str_/);
    expect(res.rankingAuthorityValidated).toBe(true);
    expect(res.items[0].ranking?.authority).toBe('lexical_fallback');
  });

  test('lexicalRankCandidates stable', () => {
    const items = lexicalRankCandidates(
      [
        { entityType: 'post', entityId: 'b', title: 'B', url: '/p/b', lexicalScore: 0.2 },
        { entityType: 'post', entityId: 'a', title: 'A', url: '/p/a', lexicalScore: 0.9 }
      ],
      10
    );
    expect(items[0].entityId).toBe('a');
  });
});

describe('Phase 9.4 — realtime invalidation', () => {
  beforeEach(() => {
    resetSearchRealtimeForTests();
    clearSearchCacheForTests();
  });

  test('emit invalidates viewer cache even without socket', () => {
    const k = buildSearchCacheKey({ viewerId: 'u9', op: 't', query: 'hello', ns: 'query' });
    setSearchCache(k, { items: [] }, 20_000, { ns: 'query', viewerId: 'u9' });
    const out = emitSearchInvalidation({ viewerId: 'u9', reason: 'test', skipDebounce: true });
    expect(out.emitted === false || out.emitted === true).toBe(true);
    expect(getSearchCache(k)).toBeNull();
  });
});

describe('Phase 9.4 — flags still default off', () => {
  const prev = { ...process.env };
  afterEach(() => {
    process.env = { ...prev };
    invalidateEnterpriseSearchRolloutCache();
  });

  test('service disabled path', async () => {
    delete process.env.ENTERPRISE_SEARCH_MASTER;
    invalidateEnterpriseSearchRolloutCache();
    const res = await new EnterpriseSearchService().query({ q: 'hello' }, 'u1');
    expect(res.disabled).toBe(true);
    expect(res.searchModelVersion).toContain('9.4');
  });

  test('metrics snapshot includes cache block', () => {
    const snap = getSearchMetricsSnapshot();
    expect(snap.cache).toBeDefined();
    expect(typeof snap.fallbackCount).toBe('number');
  });
});
