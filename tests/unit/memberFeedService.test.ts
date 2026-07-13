import test from 'node:test';
import assert from 'node:assert/strict';

// Pure partition helpers must not require Vite env (api is lazy-loaded on fetch only).
const load = async () => import('../../src/services/memberFeed.ts');

test('partitionUnifiedFeedItems maps posts jobs gigs ads people pages', async () => {
  const { partitionUnifiedFeedItems } = await load();
  const partitioned = partitionUnifiedFeedItems([
    {
      type: 'POST',
      id: 'p1',
      payload: { id: 'p1', content: 'hello', author: { id: 'u1', displayName: 'Ada' } },
      score: 12,
      why: 'Fresh'
    },
    { type: 'JOB', id: 'j1', payload: { id: 'j1', title: 'Engineer' } },
    { type: 'GIG', id: 'g1', payload: { id: 'g1', title: 'Logo' } },
    { type: 'MARKETPLACE_LISTING', id: 'm1', payload: { id: 'm1', title: 'Laptop' } },
    { type: 'PERSON_RECOMMENDATION', id: 'u2', payload: { id: 'u2', name: 'Bob' } },
    { type: 'PAGE_RECOMMENDATION', id: 'pg1', payload: { id: 'pg1', name: 'Acme' } },
    { type: 'AD', id: 'ad1', payload: { id: 'ad1', title: 'Sponsored' }, media: { url: 'https://cdn.example.com/a.jpg' } }
  ] as any);

  assert.equal(partitioned.posts.length, 1);
  assert.equal(partitioned.posts[0].id, 'p1');
  assert.equal(partitioned.posts[0].ranking?.score, 12);
  assert.equal(partitioned.jobs.length, 1);
  assert.equal(partitioned.gigs.length, 1);
  assert.equal(partitioned.marketplace.length, 1);
  assert.equal(partitioned.people.length, 1);
  assert.equal(partitioned.pages.length, 1);
  assert.equal(partitioned.ads.length, 1);
  assert.equal(partitioned.ads[0].sponsored, true);
});

test('toPostLikePayload only accepts post types and preserves media file ids', async () => {
  const { toPostLikePayload } = await load();
  assert.equal(toPostLikePayload({ type: 'JOB', id: 'j1', payload: { id: 'j1' } } as any), null);
  const post = toPostLikePayload({
    type: 'COMMUNITY_POST',
    id: 'p2',
    media: [{ fileId: 'file_abc123456789' }],
    payload: { id: 'p2', content: 'page post', attachments: [{ fileId: 'file_abc123456789' }] }
  } as any);
  assert.ok(post);
  assert.equal(post.id, 'p2');
  assert.equal(post.attachments[0].fileId, 'file_abc123456789');
});

test('partition ignores empty/malformed items without throwing', async () => {
  const { partitionUnifiedFeedItems } = await load();
  const partitioned = partitionUnifiedFeedItems([null, undefined, { type: 'POST' }, { type: 'UNKNOWN' }] as any);
  assert.equal(partitioned.posts.length, 0);
});
