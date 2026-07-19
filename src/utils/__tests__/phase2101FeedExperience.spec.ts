import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildStreamFromMemberFeedPage,
  buildStreamFromPosts,
  mergeStreamEntries,
  resolveStreamKind,
  toStreamEntry,
  FEED_STREAM_VERSION
} from '../feedStream';
import { shouldPrefetchNextPage, resolveAdaptivePageSize, classifyFeedNetwork } from '../enterpriseFeedEngine';
import { collectEntryMediaUrls } from '../feedMediaPrefetch';

test('feed stream version is 21.0.1', () => {
  assert.equal(FEED_STREAM_VERSION, '21.0.1');
});

test('resolveStreamKind maps orchestrator types', () => {
  assert.equal(resolveStreamKind('POST'), 'post');
  assert.equal(resolveStreamKind('JOB'), 'job');
  assert.equal(resolveStreamKind('MARKETPLACE_LISTING'), 'marketplace');
  assert.equal(resolveStreamKind('PERSON_RECOMMENDATION'), 'person');
  assert.equal(resolveStreamKind('AD'), 'ad');
});

test('buildStreamFromMemberFeedPage preserves orchestrator order', () => {
  const page = {
    items: [
      { type: 'POST', id: 'p1', payload: { id: 'p1', content: 'hello' } },
      { type: 'JOB', id: 'j1', payload: { id: 'j1', title: 'Engineer' } },
      { type: 'AD', id: 'a1', payload: { id: 'a1', title: 'Sponsored' } },
      { type: 'POST', id: 'p2', payload: { id: 'p2', content: 'world' } }
    ],
    posts: [],
    jobs: [],
    gigs: [],
    marketplace: [],
    people: [],
    pages: [],
    communities: [],
    ads: [],
    stories: [],
    scrollVideos: [],
    events: [],
    nextCursor: 'c1',
    hasMore: true,
    source: 'orchestrated' as const
  };
  const stream = buildStreamFromMemberFeedPage(page as any);
  assert.equal(stream.length, 4);
  assert.deepEqual(
    stream.map((e) => e.kind),
    ['post', 'job', 'ad', 'post']
  );
  assert.equal(stream[0].post?.id, 'p1');
  assert.equal(stream[1].data?.title, 'Engineer');
});

test('mergeStreamEntries dedupes by key and can prepend', () => {
  const a = buildStreamFromPosts([{ id: '1', content: 'a' }, { id: '2', content: 'b' }]);
  const b = buildStreamFromPosts([{ id: '0', content: 'z' }, { id: '1', content: 'a-dup' }]);
  const { merged, addedCount } = mergeStreamEntries(a, b, { prepend: true });
  assert.equal(merged[0].post?.id, '0');
  assert.ok(merged.some((e) => e.post?.id === '1'));
  assert.ok(addedCount >= 1);
});

test('toStreamEntry rejects empty posts', () => {
  assert.equal(toStreamEntry({ type: 'POST', payload: {} }), null);
});

test('prefetch helper continuity with adaptive engine', () => {
  assert.equal(
    shouldPrefetchNextPage({
      loadedCount: 10,
      renderedCount: 9,
      remainingItemThreshold: 3,
      hasCursor: true,
      isTerminal: false,
      loadMoreInFlight: false,
      initialLoading: false
    }),
    true
  );
  assert.ok(resolveAdaptivePageSize({ basePageSize: 12, networkClass: 'fast' }) >= 12);
  assert.equal(classifyFeedNetwork({ onLine: false }), 'offline');
});

test('collectEntryMediaUrls pulls avatar and image fields', () => {
  const entry = toStreamEntry({
    type: 'JOB',
    id: 'j9',
    payload: { id: 'j9', title: 'Role', clientAvatar: '/uploads/a.png', image: '/uploads/b.png' }
  });
  assert.ok(entry);
  const urls = collectEntryMediaUrls(entry!);
  assert.ok(urls.length >= 1);
});
