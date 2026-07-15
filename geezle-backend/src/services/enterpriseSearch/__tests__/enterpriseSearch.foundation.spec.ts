/**
 * Phase 9.2 foundation tests — contract, cursor, mappers, flags, fallback, compatibility.
 */
import {
  aliasToDomain,
  compatibility,
  decodeSearchCursor,
  encodeSearchCursor,
  hashViewerKey,
  invalidateEnterpriseSearchRolloutCache,
  mapSearchResultToV1Entry,
  mapToV1Unified,
  parseSearchQueryRequest,
  resolveEnterpriseSearchRolloutFlags,
  DEFAULT_ENTERPRISE_SEARCH_FLAGS,
  SearchContractError,
  SEARCH_MODEL_VERSION,
  type SearchResult
} from '../index';
import { EnterpriseSearchService } from '../service';
import { mapCandidateToSearchResult, mapDiscoveryItemToSearchResult } from '../dto/mappers';
import { lexicalRankCandidates } from '../ranking/lexicalFallback';
import { UI_REASON_ALIAS, headlineForCodes } from '../explain/explain';
import { validateFilters } from '../dto/validate';

describe('Enterprise Search foundation — rollout flags', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
    invalidateEnterpriseSearchRolloutCache();
  });

  test('defaults are all off', () => {
    delete process.env.ENTERPRISE_SEARCH_MASTER;
    delete process.env.ENTERPRISE_SEARCH_UNIFIED;
    delete process.env.ENTERPRISE_SEARCH_DISCOVERY_RANK;
    invalidateEnterpriseSearchRolloutCache();
    const flags = resolveEnterpriseSearchRolloutFlags({ ...process.env });
    expect(flags.master).toBe(false);
    expect(flags.unified).toBe(false);
    expect(flags.discoveryRank).toBe(false);
    expect(DEFAULT_ENTERPRISE_SEARCH_FLAGS.master).toBe(false);
  });

  test('sub-flags require master', () => {
    const flags = resolveEnterpriseSearchRolloutFlags({
      ENTERPRISE_SEARCH_MASTER: 'false',
      ENTERPRISE_SEARCH_DISCOVERY_RANK: 'true',
      ENTERPRISE_SEARCH_SUGGEST: 'true'
    } as any);
    expect(flags.master).toBe(false);
    expect(flags.discoveryRank).toBe(false);
    expect(flags.suggest).toBe(false);
  });

  test('master on enables sub-flags when set', () => {
    const flags = resolveEnterpriseSearchRolloutFlags({
      ENTERPRISE_SEARCH_MASTER: 'true',
      ENTERPRISE_SEARCH_DISCOVERY_RANK: 'true',
      ENTERPRISE_SEARCH_SUGGEST: '1'
    } as any);
    expect(flags.master).toBe(true);
    expect(flags.discoveryRank).toBe(true);
    expect(flags.suggest).toBe(true);
  });
});

describe('Enterprise Search foundation — validation', () => {
  test('parses query request with domain aliases', () => {
    const req = parseSearchQueryRequest({
      q: '  logo design  ',
      domains: 'people,jobs,gigs',
      limit: 5,
      strictDomains: true
    });
    expect(req.q).toBe('logo design');
    expect(req.domains).toEqual(['person', 'job', 'service']);
    expect(req.limit).toBe(5);
  });

  test('rejects reserved domains when strict', () => {
    expect(() =>
      parseSearchQueryRequest({ q: 'ai', domains: ['event'], strictDomains: true })
    ).toThrow(SearchContractError);
  });

  test('alias map covers v1 buckets', () => {
    expect(aliasToDomain('people')).toBe('person');
    expect(aliasToDomain('gigs')).toBe('service');
    expect(aliasToDomain('pages')).toBe('page');
  });

  test('filter validation rejects bad lat', () => {
    expect(() => validateFilters({ location: { lat: 120, lng: 0 } })).toThrow(SearchContractError);
  });

  test('filter validation accepts skills cap', () => {
    const f = validateFilters({ skills: Array.from({ length: 30 }, (_, i) => `s${i}`) });
    expect(f.skills?.length).toBe(20);
  });
});

describe('Enterprise Search foundation — cursor', () => {
  test('round-trip encode/decode for same viewer and query', () => {
    const encoded = encodeSearchCursor({
      viewerId: 'user-1',
      offset: 10,
      seen: ['person:a', 'job:b'],
      normalizedQuery: 'react',
      domains: ['person', 'job'],
      filters: {},
      rankingModelVersion: 'discovery-engine-v8.0.0'
    });
    expect(typeof encoded).toBe('string');
    expect(encoded.includes('user-1')).toBe(false);

    const decoded = decodeSearchCursor(encoded, {
      viewerId: 'user-1',
      normalizedQuery: 'react',
      domains: ['person', 'job'],
      filters: {},
      rankingModelVersion: 'discovery-engine-v8.0.0'
    });
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.state.o).toBe(10);
      expect(decoded.state.s).toEqual(['person:a', 'job:b']);
      expect(decoded.state.p).toBe(hashViewerKey('user-1'));
    }
  });

  test('rejects viewer mismatch', () => {
    const encoded = encodeSearchCursor({
      viewerId: 'user-1',
      offset: 0,
      seen: [],
      normalizedQuery: 'x',
      domains: ['post'],
      rankingModelVersion: 'lexical-v1'
    });
    const decoded = decodeSearchCursor(encoded, {
      viewerId: 'user-2',
      normalizedQuery: 'x',
      domains: ['post'],
      rankingModelVersion: 'lexical-v1'
    });
    expect(decoded.ok).toBe(false);
    if (decoded.ok === false) expect(decoded.code).toBe('CURSOR_VIEWER_MISMATCH');
  });

  test('rejects tampered cursor', () => {
    const encoded = encodeSearchCursor({
      viewerId: 'user-1',
      offset: 0,
      seen: [],
      normalizedQuery: 'x',
      domains: ['post'],
      rankingModelVersion: 'lexical-v1'
    });
    const tampered = encoded.slice(0, -4) + 'xxxx';
    const decoded = decodeSearchCursor(tampered, {
      viewerId: 'user-1',
      normalizedQuery: 'x',
      domains: ['post'],
      rankingModelVersion: 'lexical-v1'
    });
    expect(decoded.ok).toBe(false);
  });

  test('empty cursor starts at offset 0', () => {
    const decoded = decodeSearchCursor(null, {
      viewerId: null,
      normalizedQuery: 'q',
      domains: ['post'],
      rankingModelVersion: 'lexical-v1'
    });
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(decoded.state.o).toBe(0);
  });
});

describe('Enterprise Search foundation — mappers & compatibility', () => {
  const sample: SearchResult = {
    id: 'person:u1',
    entityType: 'person',
    entityId: 'u1',
    title: 'Ada Lovelace',
    subtitle: '@ada',
    url: '/u/ada',
    trackingToken: 'tok',
    score: 0.9,
    reasonCodes: ['lexical_match'],
    media: { avatarUrl: null },
    attributes: { username: 'ada' }
  };

  test('maps to v1 entry shape', () => {
    const v1 = mapSearchResultToV1Entry(sample);
    expect(v1.type).toBe('people');
    expect(v1.id).toBe('u1');
    expect(v1.title).toBe('Ada Lovelace');
    expect(v1.url).toBe('/u/ada');
    expect(v1.meta?.trackingToken).toBe('tok');
  });

  test('unified envelope has core five groups', () => {
    const env = mapToV1Unified('ada', [sample], 10);
    expect(env.groups.people.length).toBe(1);
    expect(env.groups.posts).toEqual([]);
    expect(env.totals.people).toBe(1);
    expect(env.results[0].type).toBe('people');
  });

  test('compatibility helper mirrors mapToV1Unified', () => {
    const env = compatibility.toUnifiedEnvelope({
      query: 'ada',
      normalizedQuery: 'ada',
      items: [sample],
      totals: { returned: 1 },
      nextCursor: null,
      requestId: 'r1',
      searchModelVersion: SEARCH_MODEL_VERSION,
      rankingModelVersion: 'lexical-v1',
      generatedAt: new Date().toISOString(),
      fallbackUsed: true,
      rankingAuthority: 'lexical_fallback',
      surface: 'search_results'
    });
    expect(env.groups.people[0].id).toBe('u1');
  });

  test('discovery item mapper', () => {
    const mapped = mapDiscoveryItemToSearchResult({
      entityType: 'job',
      entityId: 'j1',
      score: 0.8,
      explanation: 'Skills match',
      reasonCodes: ['skills_match'],
      source: 'related_job',
      rank: 1,
      trackingToken: 'dtok',
      generatedAt: new Date().toISOString(),
      label: 'Frontend Engineer',
      summary: 'React role',
      hrefHint: '/jobs/j1',
      category: 'Engineering'
    });
    expect(mapped.entityType).toBe('job');
    expect(mapped.explanation?.from).toBe('discovery');
    expect(mapped.trackingToken).toBe('dtok');
  });

  test('lexical rank assigns fallback authority', () => {
    const ranked = lexicalRankCandidates(
      [
        {
          entityType: 'post',
          entityId: 'p1',
          title: 'Hello',
          url: '/post/p1',
          lexicalScore: 0.5
        }
      ],
      5
    );
    expect(ranked[0].ranking?.authority).toBe('lexical_fallback');
    expect(ranked[0].reasonCodes).toContain('lexical_match');
    expect(ranked[0].trackingToken).toBeTruthy();
  });

  test('candidate mapper', () => {
    const r = mapCandidateToSearchResult(
      {
        entityType: 'service',
        entityId: 'g1',
        title: 'Logo',
        url: '/gigs/g1',
        lexicalScore: 0.7
      },
      { rank: 1, authority: 'lexical_fallback' }
    );
    expect(r.id).toBe('service:g1');
  });
});

describe('Enterprise Search foundation — explain', () => {
  test('UI aliases map to canonical codes', () => {
    expect(UI_REASON_ALIAS.FOLLOWING).toBe('followed_similar');
    expect(UI_REASON_ALIAS.TRENDING).toBe('trending_now');
  });

  test('headlines resolve', () => {
    expect(headlineForCodes(['trending_now'])).toMatch(/trend/i);
  });
});

describe('Enterprise Search foundation — service disabled path', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
    invalidateEnterpriseSearchRolloutCache();
  });

  test('query returns disabled empty payload when master off', async () => {
    delete process.env.ENTERPRISE_SEARCH_MASTER;
    invalidateEnterpriseSearchRolloutCache();
    const svc = new EnterpriseSearchService();
    const res = await svc.query({ q: 'logo design' }, 'user-1');
    expect(res.disabled).toBe(true);
    expect(res.items).toEqual([]);
    expect(res.rankingAuthority).toBe('none');
    expect(res.fallbackUsed).toBe(false);
    expect(res.searchModelVersion).toBe(SEARCH_MODEL_VERSION);
  });

  test('suggest disabled when master off', async () => {
    delete process.env.ENTERPRISE_SEARCH_MASTER;
    invalidateEnterpriseSearchRolloutCache();
    const svc = new EnterpriseSearchService();
    const res = await svc.suggest({ q: 'logo' }, null);
    expect(res.disabled).toBe(true);
    expect(res.suggestions).toEqual([]);
  });

  test('feedback skipped when master off', async () => {
    delete process.env.ENTERPRISE_SEARCH_MASTER;
    invalidateEnterpriseSearchRolloutCache();
    const svc = new EnterpriseSearchService();
    const res = await svc.feedback({
      action: 'click',
      entityType: 'post',
      entityId: 'p1',
      viewerId: 'u1'
    });
    expect(res.skipped).toBe(true);
  });

  test('health reports version and flags off', () => {
    delete process.env.ENTERPRISE_SEARCH_MASTER;
    invalidateEnterpriseSearchRolloutCache();
    const svc = new EnterpriseSearchService();
    const h = svc.health();
    expect(h.version).toBe(SEARCH_MODEL_VERSION);
    expect(h.flags.master).toBe(false);
  });
});

describe('Enterprise Search foundation — fallback path (master on, discovery rank off)', () => {
  const prev = { ...process.env };

  afterEach(() => {
    process.env = { ...prev };
    invalidateEnterpriseSearchRolloutCache();
    jest.restoreAllMocks();
  });

  test('uses lexical fallback when discovery rank disabled', async () => {
    process.env.ENTERPRISE_SEARCH_MASTER = 'true';
    process.env.ENTERPRISE_SEARCH_DISCOVERY_RANK = 'false';
    invalidateEnterpriseSearchRolloutCache();

    jest.spyOn(require('../retrieval/retrieve'), 'retrieveCandidates').mockResolvedValue({
      candidates: [
        {
          entityType: 'job',
          entityId: 'job-1',
          title: 'React Developer',
          url: '/jobs/job-1',
          lexicalScore: 0.9
        }
      ],
      warnings: [],
      normalized: { raw: 'react', normalized: 'react', tokens: ['react'], lower: 'react' },
      viewer: { viewerId: null, blockedUserIds: new Set(), hiddenPostIds: new Set(), memberClubIds: new Set() }
    });

    const svc = new EnterpriseSearchService();
    const res = await svc.query({ q: 'react', domains: ['job'], limit: 5 }, 'user-1');
    expect(res.disabled).toBeUndefined();
    expect(res.fallbackUsed).toBe(true);
    expect(res.rankingAuthority).toBe('lexical_fallback');
    expect(res.items.length).toBe(1);
    expect(res.items[0].entityId).toBe('job-1');
    expect(res.items[0].trackingToken).toBeTruthy();
  });
});
