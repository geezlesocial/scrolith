import {
  buildFeedKey,
  decodeMemberFeedCursor,
  diversifyFeedCandidates,
  dedupeCandidatesByFeedKey,
  encodeMemberFeedCursor,
  shouldIncludeFeedDiagnostics,
  __feedOrchestratorTestUtils
} from '../services/feedOrchestrator.service';

const cand = (partial: any) => ({
  type: partial.type || 'POST',
  id: partial.id,
  sourceId: partial.id,
  feedKey: partial.feedKey || buildFeedKey(partial.type || 'POST', partial.id),
  createdAt: partial.createdAt || new Date().toISOString(),
  score: partial.score ?? 10,
  rankingScore: partial.score ?? 10,
  author: partial.author ?? { id: partial.authorId || 'u1', displayName: 'User' },
  media: null,
  visibility: 'public',
  why: null,
  payload: {},
  _source: partial._source || 'test',
  _authorKey: String(partial.authorId || partial.author?.id || 'u1')
});

describe('feedOrchestrator pure helpers', () => {
  test('buildFeedKey is stable type:id', () => {
    expect(buildFeedKey('POST', 'abc')).toBe('POST:abc');
    expect(buildFeedKey('JOB', 'abc')).toBe('JOB:abc');
  });

  test('opaque cursor round-trips keys and watermark', () => {
    const encoded = encodeMemberFeedCursor({
      v: 1,
      k: ['POST:1', 'JOB:2'],
      w: '2026-01-01T00:00:00.000Z'
    });
    const decoded = decodeMemberFeedCursor(encoded);
    expect(decoded.v).toBe(1);
    expect(decoded.k).toEqual(['POST:1', 'JOB:2']);
    expect(decoded.w).toBe('2026-01-01T00:00:00.000Z');
  });

  test('decode accepts legacy ISO createdAt cursor', () => {
    const iso = '2026-06-01T12:00:00.000Z';
    const decoded = decodeMemberFeedCursor(iso);
    expect(decoded.w).toBe(new Date(iso).toISOString());
    expect(decoded.k).toEqual([]);
  });

  test('dedupeCandidatesByFeedKey drops duplicate feedKeys', () => {
    const { unique, deduplicatedCount } = dedupeCandidatesByFeedKey([
      cand({ id: '1', type: 'POST' }),
      cand({ id: '1', type: 'POST' }),
      cand({ id: '2', type: 'JOB' })
    ]);
    expect(unique).toHaveLength(2);
    expect(deduplicatedCount).toBe(1);
  });

  test('diversifyFeedCandidates prevents long same-type runs and caps ads', () => {
    const items = [
      cand({ id: 'p1', type: 'POST', score: 100, authorId: 'a' }),
      cand({ id: 'p2', type: 'POST', score: 99, authorId: 'a' }),
      cand({ id: 'p3', type: 'POST', score: 98, authorId: 'a' }),
      cand({ id: 'p4', type: 'POST', score: 97, authorId: 'b' }),
      cand({ id: 'j1', type: 'JOB', score: 95, authorId: 'c' }),
      cand({ id: 'g1', type: 'GIG', score: 94, authorId: 'e' }),
      cand({ id: 'ad1', type: 'AD', score: 90, authorId: '' }),
      cand({ id: 'ad2', type: 'AD', score: 89, authorId: '' }),
      cand({ id: 'm1', type: 'MARKETPLACE_LISTING', score: 93, authorId: 'd' })
    ];
    const page = diversifyFeedCandidates(items as any, 8, {
      maxConsecutiveType: 2,
      maxConsecutiveAuthor: 2,
      maxAdsPerPage: 1,
      minItemsBetweenAds: 7
    });
    expect(page.length).toBeGreaterThan(0);
    expect(page.length).toBeLessThanOrEqual(8);

    // With high-score non-post alternatives, page should mix types (not posts-only).
    const types = new Set(page.map((item) => item.type));
    expect(types.size).toBeGreaterThan(1);

    // No more than 2 consecutive identical types while alternatives remain early in the page.
    for (let i = 2; i < Math.min(page.length, 6); i += 1) {
      if (page[i].type === page[i - 1].type) {
        expect(page[i - 2].type === page[i].type).toBe(false);
      }
    }

    const adCount = page.filter((item) => item.type === 'AD').length;
    expect(adCount).toBeLessThanOrEqual(1);
    if (page[0]) expect(page[0].type).not.toBe('AD');
  });

  test('diversify prefers score order within type buckets', () => {
    const page = diversifyFeedCandidates(
      [
        cand({ id: 'low', type: 'POST', score: 1, authorId: 'a' }),
        cand({ id: 'high', type: 'POST', score: 50, authorId: 'b' }),
        cand({ id: 'job', type: 'JOB', score: 40, authorId: 'c' })
      ] as any,
      3
    );
    const postIds = page.filter((p) => p.type === 'POST').map((p) => p.id);
    if (postIds.length >= 2) {
      expect(postIds.indexOf('high')).toBeLessThan(postIds.indexOf('low'));
    }
  });

  test('diagnostics disabled in production without flag', () => {
    expect(
      shouldIncludeFeedDiagnostics({ NODE_ENV: 'production', FEED_ORCHESTRATOR_DIAGNOSTICS: '' } as any)
    ).toBe(false);
    expect(
      shouldIncludeFeedDiagnostics({
        NODE_ENV: 'production',
        FEED_ORCHESTRATOR_DIAGNOSTICS: 'true'
      } as any)
    ).toBe(true);
    expect(shouldIncludeFeedDiagnostics({ NODE_ENV: 'development' } as any)).toBe(true);
  });

  test('test utils export pure helpers', () => {
    expect(__feedOrchestratorTestUtils.buildFeedKey('GIG', 'x')).toBe('GIG:x');
    const enc = __feedOrchestratorTestUtils.encodeMemberFeedCursor({ v: 1, k: ['A:1'], w: null });
    expect(__feedOrchestratorTestUtils.decodeMemberFeedCursor(enc).k).toEqual(['A:1']);
  });

  test('pagination-style pages do not repeat feedKeys when seen is applied', () => {
    const all = [
      cand({ id: '1', type: 'POST', score: 10 }),
      cand({ id: '2', type: 'POST', score: 9 }),
      cand({ id: '3', type: 'JOB', score: 8 }),
      cand({ id: '4', type: 'GIG', score: 7 }),
      cand({ id: '5', type: 'MARKETPLACE_LISTING', score: 6 })
    ] as any;
    const page1 = diversifyFeedCandidates(all, 2);
    const seen = new Set(page1.map((i) => i.feedKey));
    const remaining = all.filter((i: any) => !seen.has(i.feedKey));
    const page2 = diversifyFeedCandidates(remaining, 2);
    const keys = [...page1, ...page2].map((i) => i.feedKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('empty pool yields empty page (terminal hasMore path)', () => {
    expect(diversifyFeedCandidates([], 12)).toEqual([]);
  });
});
