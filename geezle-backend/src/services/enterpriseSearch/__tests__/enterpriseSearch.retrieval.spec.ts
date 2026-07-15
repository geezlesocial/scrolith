/**
 * Phase 9.3 — retrieval engine tests (adapters, perms, dedupe, normalize, pipeline fallback).
 */
import {
  applyPermissionFilters,
  candidateKey,
  clearNormalizeCacheForTests,
  dedupeCandidates,
  emptyViewerContext,
  invalidateEnterpriseSearchRolloutCache,
  lexicalMatchScore,
  listRegisteredAdapters,
  normalizeSearchQuery,
  EnterpriseSearchService
} from '../index';
import { collapsePageCompanyDupes } from '../retrieval/dedupe';
import { withTimeout, AdapterTimeoutError } from '../retrieval/timeout';
import type { SearchCandidate } from '../contracts/types';

describe('Phase 9.3 — normalize', () => {
  afterEach(() => clearNormalizeCacheForTests());

  test('normalizes whitespace and tokens', () => {
    const n = normalizeSearchQuery('  React   Developer  ');
    expect(n.normalized).toBe('React Developer');
    expect(n.tokens).toEqual(['react', 'developer']);
    expect(n.lower).toBe('react developer');
  });

  test('lexical exact > prefix > partial', () => {
    const n = normalizeSearchQuery('react');
    expect(lexicalMatchScore('react', n)).toBe(1);
    expect(lexicalMatchScore('react native', n)).toBeGreaterThan(lexicalMatchScore('love react tools', n));
    expect(lexicalMatchScore('typescript', n)).toBe(0);
  });
});

describe('Phase 9.3 — dedupe', () => {
  test('dedupes by type:id preferring higher score', () => {
    const a: SearchCandidate = {
      entityType: 'post',
      entityId: '1',
      title: 'A',
      url: '/p/1',
      lexicalScore: 0.5
    };
    const b: SearchCandidate = {
      entityType: 'post',
      entityId: '1',
      title: 'B',
      url: '/p/1',
      lexicalScore: 0.9
    };
    const out = dedupeCandidates([a, b, { ...a, entityId: '2', lexicalScore: 0.2 }]);
    expect(out).toHaveLength(2);
    expect(out[0].title).toBe('B');
    expect(candidateKey('post', '1')).toBe('post:1');
  });

  test('collapses page/company same id when both requested', () => {
    const candidates: SearchCandidate[] = [
      { entityType: 'page', entityId: 'x', title: 'P', url: '/c/x', lexicalScore: 0.5 },
      { entityType: 'company', entityId: 'x', title: 'C', url: '/c/x', lexicalScore: 0.6 }
    ];
    const out = collapsePageCompanyDupes(candidates, ['page', 'company']);
    expect(out).toHaveLength(1);
    expect(out[0].entityType).toBe('company');
  });
});

describe('Phase 9.3 — permissions', () => {
  test('filters blocked owners and hidden posts', () => {
    const ctx = emptyViewerContext();
    ctx.viewerId = 'me';
    ctx.blockedUserIds.add('bad');
    ctx.hiddenPostIds.add('hidden-post');
    const candidates: SearchCandidate[] = [
      { entityType: 'post', entityId: 'ok', title: 'ok', url: '/p/ok', authorOrOwnerId: 'good' },
      { entityType: 'post', entityId: 'hidden-post', title: 'h', url: '/p/h', authorOrOwnerId: 'good' },
      { entityType: 'person', entityId: 'bad', title: 'b', url: '/u/b', authorOrOwnerId: 'bad' }
    ];
    const out = applyPermissionFilters(candidates, ctx);
    expect(out.map((c) => c.entityId)).toEqual(['ok']);
  });

  test('filters private groups for non-members', () => {
    const ctx = emptyViewerContext();
    ctx.viewerId = 'me';
    const candidates: SearchCandidate[] = [
      {
        entityType: 'group',
        entityId: 'g1',
        title: 'Secret',
        url: '/g/1',
        attributes: { visibility: 'PRIVATE' }
      },
      {
        entityType: 'group',
        entityId: 'g2',
        title: 'Open',
        url: '/g/2',
        attributes: { visibility: 'PUBLIC' }
      }
    ];
    expect(applyPermissionFilters(candidates, ctx).map((c) => c.entityId)).toEqual(['g2']);
    ctx.memberClubIds.add('g1');
    expect(applyPermissionFilters(candidates, ctx).map((c) => c.entityId).sort()).toEqual(['g1', 'g2']);
  });
});

describe('Phase 9.3 — adapters registry', () => {
  test('registers all production domains', () => {
    const list = listRegisteredAdapters();
    for (const d of [
      'person',
      'post',
      'page',
      'company',
      'job',
      'service',
      'freelancer',
      'marketplace_listing',
      'product',
      'community',
      'group',
      'discussion'
    ]) {
      expect(list).toContain(d);
    }
    expect(list).not.toContain('event');
  });
});

describe('Phase 9.3 — timeout helper', () => {
  test('withTimeout rejects on budget', async () => {
    await expect(
      withTimeout(new Promise((r) => setTimeout(r, 200)), 30, 'slow')
    ).rejects.toBeInstanceOf(AdapterTimeoutError);
  });

  test('withTimeout resolves fast path', async () => {
    await expect(withTimeout(Promise.resolve(42), 200, 'fast')).resolves.toBe(42);
  });
});

describe('Phase 9.3 — service fallback via pipeline', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
    invalidateEnterpriseSearchRolloutCache();
    jest.restoreAllMocks();
  });

  test('master on + discovery rank off uses lexical over retrieved candidates', async () => {
    process.env.ENTERPRISE_SEARCH_MASTER = 'true';
    process.env.ENTERPRISE_SEARCH_DISCOVERY_RANK = 'false';
    invalidateEnterpriseSearchRolloutCache();

    jest.spyOn(require('../retrieval/retrieve'), 'retrieveCandidates').mockResolvedValue({
      candidates: [
        {
          entityType: 'job',
          entityId: 'job-9',
          title: 'React Engineer',
          url: '/jobs/job-9',
          lexicalScore: 0.95
        }
      ],
      warnings: [],
      normalized: normalizeSearchQuery('react'),
      viewer: emptyViewerContext(),
      diagnostics: { perDomain: { job: 1 }, adapterErrors: [], durationMs: 1 }
    });

    const svc = new EnterpriseSearchService();
    const res = await svc.query({ q: 'react', domains: ['job'], limit: 5 }, 'user-1');
    expect(res.fallbackUsed).toBe(true);
    expect(res.rankingAuthority).toBe('lexical_fallback');
    expect(res.items[0]?.entityId).toBe('job-9');
    expect(res.searchModelVersion).toMatch(/enterprise-search-v9\./);
  });

  test('master remains off by default', async () => {
    delete process.env.ENTERPRISE_SEARCH_MASTER;
    invalidateEnterpriseSearchRolloutCache();
    const res = await new EnterpriseSearchService().query({ q: 'x' }, null);
    expect(res.disabled).toBe(true);
    expect(res.items).toEqual([]);
  });
});
