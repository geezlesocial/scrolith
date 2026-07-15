/**
 * Phase 9.6 — offline load micro-benchmark (no DB).
 * Run: npx ts-node --transpile-only src/services/enterpriseSearch/__tests__/enterpriseSearch.loadBench.ts
 */
import { performance } from 'perf_hooks';
import {
  encodeSearchCursor,
  decodeSearchCursor
} from '../cursor/cursor';
import {
  buildSearchCacheKey,
  setSearchCache,
  getSearchCache,
  clearSearchCacheForTests,
  getSearchCacheStats
} from '../cache/cache';
import { normalizeSearchQuery, lexicalMatchScore } from '../retrieval/normalize';
import { dedupeCandidates } from '../retrieval/dedupe';
import { applyPermissionFilters, emptyViewerContext } from '../retrieval/permissions';
import {
  resolveEnterpriseSearchRolloutFlags,
  invalidateEnterpriseSearchRolloutCache
} from '../rollout/rollout';

function bench(name: string, n: number, fn: (i: number) => void) {
  const t0 = performance.now();
  for (let i = 0; i < n; i++) fn(i);
  const ms = performance.now() - t0;
  return {
    name,
    n,
    totalMs: Math.round(ms * 100) / 100,
    avgMs: Math.round((ms / n) * 10000) / 10000,
    opsPerSec: Math.round(n / (ms / 1000))
  };
}

clearSearchCacheForTests();
invalidateEnterpriseSearchRolloutCache();
const flags = resolveEnterpriseSearchRolloutFlags();

const results: ReturnType<typeof bench>[] = [];
results.push(bench('normalizeQuery', 5000, (i) => normalizeSearchQuery(`  React developer ${i % 50}`)));
results.push(
  bench('lexicalScore', 10000, () =>
    lexicalMatchScore('react native developer', normalizeSearchQuery('react'))
  )
);
results.push(
  bench('cursorEncodeDecode', 2000, (i) => {
    const c = encodeSearchCursor({
      viewerId: 'u1',
      offset: i % 20,
      seen: [`post:${i}`],
      normalizedQuery: 'react',
      domains: ['post', 'job'],
      rankingModelVersion: 'lexical-v1'
    });
    decodeSearchCursor(c, {
      viewerId: 'u1',
      normalizedQuery: 'react',
      domains: ['post', 'job'],
      rankingModelVersion: 'lexical-v1'
    });
  })
);
results.push(
  bench('cursorTamperReject', 1000, () => {
    const c = encodeSearchCursor({
      viewerId: 'u1',
      offset: 0,
      seen: [],
      normalizedQuery: 'x',
      domains: ['post'],
      rankingModelVersion: 'lexical-v1'
    });
    decodeSearchCursor(`${c.slice(0, -4)}zzzz`, {
      viewerId: 'u1',
      normalizedQuery: 'x',
      domains: ['post'],
      rankingModelVersion: 'lexical-v1'
    });
  })
);

clearSearchCacheForTests();
results.push(
  bench('cacheColdMiss', 1000, (i) => {
    const k = buildSearchCacheKey({ viewerId: `u${i % 10}`, op: 'q', query: `q${i}`, ns: 'query' });
    getSearchCache(k);
  })
);

for (let i = 0; i < 200; i++) {
  const k = buildSearchCacheKey({ viewerId: 'u1', op: 'q', query: `warm${i}`, ns: 'query' });
  setSearchCache(k, { i }, 30_000, { ns: 'query', viewerId: 'u1' });
}
results.push(
  bench('cacheWarmHit', 2000, (i) => {
    const k = buildSearchCacheKey({ viewerId: 'u1', op: 'q', query: `warm${i % 200}`, ns: 'query' });
    getSearchCache(k);
  })
);

const cands = Array.from({ length: 500 }, (_, i) => ({
  entityType: (i % 2 ? 'post' : 'job') as 'post' | 'job',
  entityId: String(i % 100),
  title: `t${i}`,
  url: '/x',
  lexicalScore: Math.random(),
  authorOrOwnerId: i % 7 === 0 ? 'blocked' : 'ok'
}));
results.push(bench('dedupe500', 500, () => dedupeCandidates(cands)));
const ctx = emptyViewerContext();
ctx.blockedUserIds.add('blocked');
results.push(bench('permissionFilter500', 500, () => applyPermissionFilters(cands, ctx)));

const out = {
  flagsDefault: flags,
  cacheStats: getSearchCacheStats(),
  benches: results,
  memMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
};
// eslint-disable-next-line no-console
console.log(JSON.stringify(out, null, 2));
