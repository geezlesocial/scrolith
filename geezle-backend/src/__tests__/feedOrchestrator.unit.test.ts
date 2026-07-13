import {
  buildFeedKey,
  decodeMemberFeedCursor,
  diversifyFeedCandidates,
  dedupeCandidatesByFeedKey,
  encodeMemberFeedCursor,
  shouldIncludeFeedDiagnostics,
  extractCandidateText,
  normalizeFeedTextForFingerprint,
  buildNearDuplicateFingerprint,
  isNearDuplicateText,
  deriveMemberFeedWatermark,
  isEligibleUnderMemberFeedCursor,
  looksLikeFeedTemplateSkeleton,
  normalizeFeedTextBasic,
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
  payload: partial.payload ?? {},
  _source: partial._source || 'test',
  _authorKey: String(partial.authorId || partial.author?.id || 'u1')
});

const templatePost = (id: string, authorId: string, score: number, role: string, place: string, skills: string) =>
  cand({
    id,
    type: 'POST',
    authorId,
    score,
    payload: {
      content: `${role} update from ${place}: improving delivery quality with ${skills} while keeping client communication clear and proactive.`
    }
  });

describe('feedOrchestrator pure helpers', () => {
  test('buildFeedKey is stable type:id', () => {
    expect(buildFeedKey('POST', 'abc')).toBe('POST:abc');
    expect(buildFeedKey('JOB', 'abc')).toBe('JOB:abc');
  });

  test('opaque cursor round-trips keys and watermark (v1)', () => {
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
      cand({ id: 'p1', type: 'POST', score: 100, authorId: 'a', payload: { content: 'unique alpha post content here' } }),
      cand({ id: 'p2', type: 'POST', score: 99, authorId: 'a', payload: { content: 'unique beta post content here' } }),
      cand({ id: 'p3', type: 'POST', score: 98, authorId: 'a', payload: { content: 'unique gamma post content here' } }),
      cand({ id: 'p4', type: 'POST', score: 97, authorId: 'b', payload: { content: 'unique delta post content here' } }),
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
      minItemsBetweenAds: 7,
      maxPostsPerAuthor: 1
    });
    expect(page.length).toBeGreaterThan(0);
    expect(page.length).toBeLessThanOrEqual(8);

    const types = new Set(page.map((item) => item.type));
    expect(types.size).toBeGreaterThan(1);

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
        cand({ id: 'low', type: 'POST', score: 1, authorId: 'a', payload: { content: 'low score unique wording' } }),
        cand({ id: 'high', type: 'POST', score: 50, authorId: 'b', payload: { content: 'high score unique wording' } }),
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
    expect(typeof __feedOrchestratorTestUtils.buildNearDuplicateFingerprint).toBe('function');
  });

  test('pagination-style pages do not repeat feedKeys when seen is applied', () => {
    const all = [
      cand({ id: '1', type: 'POST', score: 10, authorId: 'a', payload: { content: 'page one post a' } }),
      cand({ id: '2', type: 'POST', score: 9, authorId: 'b', payload: { content: 'page one post b' } }),
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

  test('near-duplicate fingerprint is deterministic and collapses templates', () => {
    const a =
      'Revenue Operations Analyst update from Taiwan: improving delivery quality with RevOps and Pipeline Analytics while keeping client communication clear and proactive.';
    const b =
      'Mobile Product Manager update from South Korea: improving delivery quality with Mobile Strategy and Growth Experiments while keeping client communication clear and proactive.';
    expect(looksLikeFeedTemplateSkeleton(normalizeFeedTextBasic(a))).toBe(true);
    const fpA = buildNearDuplicateFingerprint(a);
    const fpB = buildNearDuplicateFingerprint(b);
    expect(fpA).toBeTruthy();
    expect(fpA).toBe(fpB);
    expect(buildNearDuplicateFingerprint(a)).toBe(fpA);
    expect(isNearDuplicateText(a, b)).toBe(true);
    expect(
      isNearDuplicateText(
        'Completely different essay about sailing and woodworking hobbies.',
        'Unrelated recipe for sourdough bread with long fermentation.'
      )
    ).toBe(false);
  });

  test('near-dup normalizer is conservative for distinct professional posts', () => {
    const p1 =
      'Closed three enterprise deals this week while keeping client communication clear across the APAC region and partner channel.';
    const p2 =
      'Shipped the escrow dispute workflow while keeping client communication clear for marketplace sellers and support agents.';
    // Shared phrase must NOT force near-dup on distinct long professional posts.
    expect(isNearDuplicateText(p1, p2)).toBe(false);

    // Short posts require exact equality only.
    expect(isNearDuplicateText('Great work team!', 'Great work everyone!')).toBe(false);
    expect(isNearDuplicateText('Great work team!', 'Great work team!')).toBe(true);

    // Exact / template-equivalent still suppressed.
    const t1 =
      'Role A update from Place A: improving delivery quality with Skill A while keeping client communication clear and proactive.';
    const t2 =
      'Role B update from Place B: improving delivery quality with Skill B while keeping client communication clear and proactive.';
    expect(isNearDuplicateText(t1, t2)).toBe(true);
  });

  test('extractCandidateText prefers content then title/description', () => {
    expect(extractCandidateText({ payload: { content: 'hello', title: 't' } })).toBe('hello');
    expect(extractCandidateText({ payload: { title: 'only title' } })).toBe('only title');
    expect(normalizeFeedTextForFingerprint('Hello, WORLD!! https://x.test/a')).toContain('hello world');
  });

  test('repeated authors: max one POST per author when alternatives exist', () => {
    const items = [
      cand({ id: 'a1', type: 'POST', score: 100, authorId: 'isaac', payload: { content: 'isaac first unique post body' } }),
      cand({ id: 'a2', type: 'POST', score: 99, authorId: 'isaac', payload: { content: 'isaac second unique post body' } }),
      cand({ id: 'a3', type: 'POST', score: 98, authorId: 'isaac', payload: { content: 'isaac third unique post body' } }),
      cand({ id: 'b1', type: 'POST', score: 90, authorId: 'sam', payload: { content: 'sam first unique post body' } }),
      cand({ id: 'c1', type: 'POST', score: 80, authorId: 'caleb', payload: { content: 'caleb first unique post body' } }),
      cand({ id: 'j1', type: 'JOB', score: 70, authorId: 'jobber' })
    ];
    // Page sized so alternatives fill remaining slots (no fallback second-author post).
    const page = diversifyFeedCandidates(items as any, 4, { maxPostsPerAuthor: 1, minAuthorPostGap: 4 });
    const isaacPosts = page.filter((item) => item.type === 'POST' && item._authorKey === 'isaac');
    expect(isaacPosts).toHaveLength(1);
    expect(isaacPosts[0].id).toBe('a1'); // highest score kept
    expect(page.some((item) => item.id === 'b1')).toBe(true);
    expect(page.some((item) => item.id === 'a2')).toBe(false);
  });

  test('deferred author posts appear on a later page (not permanently removed)', () => {
    const items = [
      cand({ id: 'a1', type: 'POST', score: 100, authorId: 'isaac', payload: { content: 'isaac first unique post body' } }),
      cand({ id: 'a2', type: 'POST', score: 99, authorId: 'isaac', payload: { content: 'isaac second unique post body' } }),
      cand({ id: 'b1', type: 'POST', score: 50, authorId: 'sam', payload: { content: 'sam first unique post body' } })
    ] as any;
    const page1 = diversifyFeedCandidates(items, 2, { maxPostsPerAuthor: 1 });
    const seen = new Set(page1.map((i) => i.feedKey));
    expect(seen.has('POST:a1')).toBe(true);
    expect(seen.has('POST:a2')).toBe(false);
    const remaining = items.filter((i: any) => !seen.has(i.feedKey));
    const page2 = diversifyFeedCandidates(remaining, 2, { maxPostsPerAuthor: 1 });
    expect(page2.some((i) => i.id === 'a2')).toBe(true);
  });

  test('duplicate templates: keep highest-ranked only on page', () => {
    const items = [
      templatePost('t1', 'isaac', 100, 'Revenue Operations Analyst', 'Taiwan', 'RevOps and Pipeline Analytics'),
      templatePost('t2', 'sam', 90, 'Mobile Product Manager', 'South Korea', 'Mobile Strategy and Growth'),
      templatePost('t3', 'caleb', 80, 'Business Systems Administrator', 'Qatar', 'CRM Admin and Automation'),
      cand({
        id: 'unique',
        type: 'POST',
        score: 70,
        authorId: 'other',
        payload: { content: 'Shipping a brand new marketplace feature for escrow and dispute workflows today.' }
      }),
      cand({ id: 'job1', type: 'JOB', score: 60, authorId: 'employer' })
    ];
    const page = diversifyFeedCandidates(items as any, 5, { maxPostsPerAuthor: 1 });
    const templateIds = ['t1', 't2', 't3'];
    const templatesOnPage = page.filter((item) => templateIds.includes(item.id));
    expect(templatesOnPage).toHaveLength(1);
    expect(templatesOnPage[0].id).toBe('t1');
    expect(page.some((item) => item.id === 'unique')).toBe(true);
  });

  test('recommendation caps: person 2, page 1, marketplace 2, scroll 2, ad 1', () => {
    const items = [
      ...Array.from({ length: 6 }, (_, i) =>
        cand({
          id: `post${i}`,
          type: 'POST',
          score: 100 - i,
          authorId: `author${i}`,
          payload: { content: `distinct post number ${i} about topic ${i} with unique wording` }
        })
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        cand({ id: `person${i}`, type: 'PERSON_RECOMMENDATION', score: 50 - i, authorId: `person${i}` })
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        cand({ id: `page${i}`, type: 'PAGE_RECOMMENDATION', score: 40 - i, authorId: `page${i}` })
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        cand({ id: `m${i}`, type: 'MARKETPLACE_LISTING', score: 35 - i, authorId: `seller${i}` })
      ),
      ...Array.from({ length: 4 }, (_, i) =>
        cand({ id: `s${i}`, type: 'SCROLL_VIDEO', score: 30 - i, authorId: `creator${i}` })
      ),
      cand({ id: 'ad1', type: 'AD', score: 25, authorId: '' }),
      cand({ id: 'ad2', type: 'AD', score: 24, authorId: '' })
    ];
    const page = diversifyFeedCandidates(items as any, 20, {
      maxPersonRecommendations: 2,
      maxPageRecommendations: 1,
      maxMarketplaceListings: 2,
      maxScrollVideos: 2,
      maxAdsPerPage: 1
    });
    expect(page.filter((i) => i.type === 'PERSON_RECOMMENDATION').length).toBeLessThanOrEqual(2);
    expect(page.filter((i) => i.type === 'PAGE_RECOMMENDATION').length).toBeLessThanOrEqual(1);
    expect(page.filter((i) => i.type === 'MARKETPLACE_LISTING').length).toBeLessThanOrEqual(2);
    expect(page.filter((i) => i.type === 'SCROLL_VIDEO').length).toBeLessThanOrEqual(2);
    expect(page.filter((i) => i.type === 'AD').length).toBeLessThanOrEqual(1);
  });

  test('never recommends a person who already appears as a content author on the page', () => {
    const items = [
      cand({
        id: 'p1',
        type: 'POST',
        score: 100,
        authorId: 'isaac',
        payload: { content: 'isaac authored this unique long-form post for the feed' }
      }),
      cand({ id: 'rec-isaac', type: 'PERSON_RECOMMENDATION', score: 95, authorId: 'isaac' }),
      cand({ id: 'rec-other', type: 'PERSON_RECOMMENDATION', score: 90, authorId: 'stranger' }),
      cand({ id: 'job1', type: 'JOB', score: 80, authorId: 'boss' })
    ];
    const page = diversifyFeedCandidates(items as any, 4);
    expect(page.some((i) => i.id === 'p1')).toBe(true);
    expect(page.some((i) => i.id === 'rec-isaac')).toBe(false);
    expect(page.some((i) => i.id === 'rec-other')).toBe(true);
  });

  test('type quotas soft balance prefers posts without starving other sources', () => {
    const topics = [
      'shipping escrow dispute resolution workflows for marketplace sellers',
      'community meetup planning checklist for organizers in manila',
      'wallet ledger reconciliation tips for finance operators',
      'gig proposal templates that convert freelancers into clients',
      'live studio bitrate guidance for outdoor creators',
      'hiring funnel metrics for talent cloud recruiters',
      'scroll video captions that improve retention curves',
      'page branding refresh with logo and cover assets',
      'notification journey experiments for re-engagement',
      'ads auction pacing controls for campaign managers',
      'kyc document review queue for compliance analysts',
      'support ticket triage macros for customer success',
      'contract milestone automation for agency delivery',
      'inventory restock alerts for marketplace vendors',
      'event rsvp reminders with calendar deep links'
    ];
    const items = [
      ...topics.map((content, i) =>
        cand({
          id: `post${i}`,
          type: 'POST',
          score: 100 - i,
          authorId: `u${i}`,
          payload: { content }
        })
      ),
      ...Array.from({ length: 6 }, (_, i) =>
        cand({ id: `person${i}`, type: 'PERSON_RECOMMENDATION', score: 40 - i, authorId: `p${i}` })
      ),
      cand({ id: 'm1', type: 'MARKETPLACE_LISTING', score: 55, authorId: 'seller' }),
      cand({ id: 'j1', type: 'JOB', score: 54, authorId: 'client' }),
      cand({ id: 'g1', type: 'GIG', score: 53, authorId: 'freelancer' }),
      cand({ id: 's1', type: 'SCROLL_VIDEO', score: 52, authorId: 'creator' })
    ];
    const page = diversifyFeedCandidates(items as any, 12);
    const posts = page.filter((i) => i.type === 'POST').length;
    const recs = page.filter((i) =>
      ['PERSON_RECOMMENDATION', 'PAGE_RECOMMENDATION', 'COMMUNITY_RECOMMENDATION'].includes(i.type)
    ).length;
    expect(posts).toBeGreaterThanOrEqual(Math.floor(12 * 0.4));
    expect(recs).toBeLessThanOrEqual(2);
    expect(page.length).toBeGreaterThan(0);
    expect(new Set(page.map((i) => i.feedKey)).size).toBe(page.length);
  });

  test('cursor compatibility: selected keys encode as v1 and do not include deferred items', () => {
    const items = [
      templatePost('t1', 'a', 100, 'Role A', 'Place A', 'Skill A'),
      templatePost('t2', 'b', 90, 'Role B', 'Place B', 'Skill B'),
      cand({
        id: 'u1',
        type: 'POST',
        score: 80,
        authorId: 'c',
        payload: { content: 'A totally different unique post about community events.' }
      })
    ] as any;
    const page = diversifyFeedCandidates(items, 3);
    const keys = page.map((i) => i.feedKey);
    const encoded = encodeMemberFeedCursor({ v: 1, k: keys, w: '2026-07-01T00:00:00.000Z' });
    const decoded = decodeMemberFeedCursor(encoded);
    expect(decoded.v).toBe(1);
    expect(decoded.k).toEqual(keys);
    expect(decoded.k).not.toContain('POST:t2'); // deferred near-dup not on page / not in cursor
    expect(decoded.k).toContain('POST:t1');
  });

  test('fallback fills page when pool is thin and unique content remains', () => {
    const items = [
      cand({ id: 'only1', type: 'POST', score: 10, authorId: 'solo', payload: { content: 'only one author post alpha' } }),
      cand({ id: 'only2', type: 'POST', score: 9, authorId: 'solo', payload: { content: 'only one author post beta distinct' } })
    ];
    const page = diversifyFeedCandidates(items as any, 2, {
      maxPostsPerAuthor: 1,
      minAuthorPostGap: 4
    });
    // No alternatives → fallback may include second post when gap allows; if gap blocks, at least 1.
    expect(page.length).toBeGreaterThanOrEqual(1);
    expect(page.every((i) => i._authorKey === 'solo')).toBe(true);
  });

  test('feedKey uniqueness on assembled page', () => {
    const items = Array.from({ length: 30 }, (_, i) =>
      cand({
        id: `id${i}`,
        type: i % 3 === 0 ? 'POST' : i % 3 === 1 ? 'JOB' : 'PERSON_RECOMMENDATION',
        score: 100 - i,
        authorId: `auth${i}`,
        payload: { content: i % 3 === 0 ? `unique post content ${i} with details` : undefined }
      })
    );
    const page = diversifyFeedCandidates(items as any, 15);
    const keys = page.map((i) => i.feedKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('deriveMemberFeedWatermark uses post-like items only (not marketplace)', () => {
    const selected = [
      cand({
        id: 'p-new',
        type: 'POST',
        score: 90,
        authorId: 'a',
        createdAt: '2026-07-13T10:00:00.000Z',
        payload: { content: 'new unique post content about launch' }
      }),
      cand({
        id: 'm-old',
        type: 'MARKETPLACE_LISTING',
        score: 80,
        authorId: 'seller',
        createdAt: '2026-01-01T00:00:00.000Z'
      })
    ];
    const w = deriveMemberFeedWatermark(selected as any, null);
    expect(w).toBe('2026-07-13T10:00:00.000Z');
    // Non-post-only page preserves previous watermark.
    expect(
      deriveMemberFeedWatermark(
        [cand({ id: 'm1', type: 'MARKETPLACE_LISTING', createdAt: '2020-01-01T00:00:00.000Z' })] as any,
        '2026-06-01T00:00:00.000Z'
      )
    ).toBe('2026-06-01T00:00:00.000Z');
  });

  /**
   * Multi-page simulation of production cursor logic:
   * diversify → encode v1 cursor (k + post-derived w) → filter pool with soft eligibility.
   * Proves deferred candidates survive older marketplace watermarks.
   */
  test('multi-page: deferred posts remain eligible; hard watermark would drop them', () => {
    const pool = [
      // Same author, high-scoring newer posts (diversity defers extras)
      cand({
        id: 'isaac-1',
        type: 'POST',
        score: 100,
        authorId: 'isaac',
        createdAt: '2026-07-13T12:00:00.000Z',
        payload: { content: 'Isaac shipped wallet reconciliation for enterprise finance teams this week.' }
      }),
      cand({
        id: 'isaac-2',
        type: 'POST',
        score: 99,
        authorId: 'isaac',
        createdAt: '2026-07-13T11:30:00.000Z',
        payload: { content: 'Isaac published a follow-up on multi-currency settlement edge cases.' }
      }),
      cand({
        id: 'isaac-3',
        type: 'POST',
        score: 98,
        authorId: 'isaac',
        createdAt: '2026-07-13T11:00:00.000Z',
        payload: { content: 'Isaac shared runbooks for ledger anomaly investigation playbooks.' }
      }),
      // Near-duplicate template cluster (keep highest only on page 1)
      templatePost('tmpl-1', 'sam', 97, 'Revenue Ops', 'Taiwan', 'RevOps Analytics'),
      templatePost('tmpl-2', 'nate', 96, 'Mobile PM', 'Korea', 'Growth Experiments'),
      // Distinct other content
      cand({
        id: 'aria-1',
        type: 'POST',
        score: 88,
        authorId: 'aria',
        createdAt: '2026-07-13T10:00:00.000Z',
        payload: { content: 'Aria documented payments ops reconciliation for Romanian merchants.' }
      }),
      // Older marketplace that previously poisoned global watermark
      cand({
        id: 'market-old',
        type: 'MARKETPLACE_LISTING',
        score: 95,
        authorId: 'seller',
        createdAt: '2026-01-15T00:00:00.000Z'
      }),
      cand({ id: 'person-1', type: 'PERSON_RECOMMENDATION', score: 40, authorId: 'stranger-1' }),
      cand({ id: 'person-2', type: 'PERSON_RECOMMENDATION', score: 39, authorId: 'stranger-2' }),
      cand({ id: 'person-3', type: 'PERSON_RECOMMENDATION', score: 38, authorId: 'stranger-3' }),
      cand({ id: 'page-1', type: 'PAGE_RECOMMENDATION', score: 37, authorId: 'biz-page' }),
      cand({ id: 'job-1', type: 'JOB', score: 70, authorId: 'employer', createdAt: '2026-07-10T00:00:00.000Z' }),
      cand({ id: 'scroll-1', type: 'SCROLL_VIDEO', score: 60, authorId: 'creator', createdAt: '2026-07-12T00:00:00.000Z' })
    ] as any;

    const pageSize = 6;
    const page1 = diversifyFeedCandidates(pool, pageSize, {
      maxPostsPerAuthor: 1,
      minAuthorPostGap: 4,
      maxPersonRecommendations: 2,
      maxPageRecommendations: 1,
      maxMarketplaceListings: 2,
      maxScrollVideos: 2,
      maxAdsPerPage: 1
    });
    expect(page1.length).toBeGreaterThan(0);
    expect(page1.length).toBeLessThanOrEqual(pageSize);

    const page1Keys = page1.map((i) => i.feedKey);
    expect(new Set(page1Keys).size).toBe(page1Keys.length);

    // Page 1 should include marketplace and at most one isaac post / one template.
    expect(page1.filter((i) => i._authorKey === 'isaac' && i.type === 'POST').length).toBeLessThanOrEqual(1);
    expect(page1.filter((i) => i.id === 'tmpl-1' || i.id === 'tmpl-2').length).toBeLessThanOrEqual(1);
    expect(page1.some((i) => i.id === 'market-old')).toBe(true);

    const deferred = pool.filter((i: any) => !page1Keys.includes(i.feedKey));
    expect(deferred.length).toBeGreaterThan(0);
    expect(deferred.some((i: any) => i.id === 'isaac-2' || i.id === 'isaac-3')).toBe(true);

    // Production cursor encoding (v1)
    const w1 = deriveMemberFeedWatermark(page1, null);
    // Must not equal old marketplace timestamp
    expect(w1).not.toBe('2026-01-15T00:00:00.000Z');
    if (w1) {
      expect(Date.parse(w1)).toBeGreaterThan(Date.parse('2026-01-15T00:00:00.000Z'));
    }

    const nextSeen = page1Keys.slice(-120);
    const hasMore1 = pool.length - page1.length > 0 || page1.length >= pageSize;
    expect(hasMore1).toBe(true);
    const cursor1 = encodeMemberFeedCursor({ v: 1, k: nextSeen, w: w1 });
    const decoded1 = decodeMemberFeedCursor(cursor1);
    expect(decoded1.v).toBe(1);
    expect(decoded1.k).toEqual(nextSeen);
    expect(decoded1.w).toBe(w1);

    // Soft eligibility (production): every deferred candidate remains eligible
    for (const item of deferred) {
      expect(isEligibleUnderMemberFeedCursor(item, decoded1, 'soft')).toBe(true);
    }

    // Hard eligibility (previous bug): older marketplace-as-global-w would drop newer deferred posts
    const poisonedW = '2026-01-15T00:00:00.000Z';
    const hardLost = deferred.filter(
      (item: any) =>
        item.type === 'POST' &&
        !isEligibleUnderMemberFeedCursor(item, { k: decoded1.k, w: poisonedW }, 'hard')
    );
    expect(hardLost.length).toBeGreaterThan(0);
    expect(hardLost.some((i: any) => i.id.startsWith('isaac-'))).toBe(true);

    // Soft collection for page 2 using cursor.k + cursor.w
    const eligible2 = pool.filter((item: any) => isEligibleUnderMemberFeedCursor(item, decoded1, 'soft'));
    expect(eligible2.length).toBe(deferred.length);
    expect(eligible2.length).toBeGreaterThan(0);

    const page2 = diversifyFeedCandidates(eligible2, pageSize, {
      maxPostsPerAuthor: 1,
      minAuthorPostGap: 4,
      maxPersonRecommendations: 2,
      maxPageRecommendations: 1,
      maxMarketplaceListings: 2,
      maxScrollVideos: 2
    });
    expect(page2.length).toBeGreaterThan(0);
    expect(page2.some((i) => i.id === 'isaac-2' || i.id === 'isaac-3' || i.id === 'tmpl-2' || i.id === 'aria-1')).toBe(
      true
    );

    const allKeys = [...page1, ...page2].map((i) => i.feedKey);
    expect(new Set(allKeys).size).toBe(allKeys.length);

    const w2 = deriveMemberFeedWatermark(page2, decoded1.w);
    const cursor2 = encodeMemberFeedCursor({
      v: 1,
      k: [...decoded1.k, ...page2.map((i) => i.feedKey)].slice(-120),
      w: w2
    });
    const decoded2 = decodeMemberFeedCursor(cursor2);
    expect(decoded2.k.length).toBeGreaterThan(decoded1.k.length);
    // Cursors advance (different payload)
    expect(cursor2).not.toBe(cursor1);

    const remainingAfter2 = pool.filter((item: any) => isEligibleUnderMemberFeedCursor(item, decoded2, 'soft'));
    const hasMore2 = remainingAfter2.length > 0 || page2.length >= pageSize;
    if (remainingAfter2.length > 0) {
      expect(hasMore2).toBe(true);
    }
  });

  test('multi-page thin pool terminates cleanly with hasMore false path', () => {
    const pool = [
      cand({
        id: 'only-1',
        type: 'POST',
        score: 10,
        authorId: 'solo',
        createdAt: '2026-07-13T12:00:00.000Z',
        payload: { content: 'solo unique post alpha content here' }
      }),
      cand({
        id: 'only-2',
        type: 'POST',
        score: 9,
        authorId: 'solo',
        createdAt: '2026-07-13T11:00:00.000Z',
        payload: { content: 'solo unique post beta content here' }
      })
    ] as any;

    const page1 = diversifyFeedCandidates(pool, 2, { maxPostsPerAuthor: 1, minAuthorPostGap: 4 });
    expect(page1.length).toBeGreaterThanOrEqual(1);
    const cursorState = {
      v: 1 as const,
      k: page1.map((i) => i.feedKey),
      w: deriveMemberFeedWatermark(page1, null)
    };
    const encoded = encodeMemberFeedCursor(cursorState);
    const decoded = decodeMemberFeedCursor(encoded);
    const remaining = pool.filter((item: any) => isEligibleUnderMemberFeedCursor(item, decoded, 'soft'));
    const page2 = diversifyFeedCandidates(remaining, 2, { maxPostsPerAuthor: 1, minAuthorPostGap: 4 });
    // After consuming deferred solo posts (if any), pool empties
    const after = pool.filter(
      (item: any) =>
        isEligibleUnderMemberFeedCursor(item, {
          k: [...decoded.k, ...page2.map((i) => i.feedKey)],
          w: deriveMemberFeedWatermark(page2, decoded.w)
        }, 'soft')
    );
    expect(after).toHaveLength(0);
    const hasMoreTerminal = after.length > 0 || page2.length >= 2;
    // Thin terminal: either page2 partial/empty remainder or no more after
    if (after.length === 0 && page2.length < 2) {
      expect(hasMoreTerminal).toBe(false);
    }
  });
});
