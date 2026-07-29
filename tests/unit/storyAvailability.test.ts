import test from 'node:test';
import assert from 'node:assert/strict';

const load = async () => import('../../src/utils/storyAvailability.ts');

test('filterExistingActiveStories keeps only existing non-expired stories', async () => {
  const { filterExistingActiveStories } = await load();
  const now = Date.parse('2026-07-29T12:00:00.000Z');
  const stories = [
    { id: 'active', expiresAt: '2026-07-29T13:00:00.000Z' },
    { id: 'legacy-no-expiry' },
    { id: 'expired', expiresAt: '2026-07-29T11:59:59.000Z' },
    { id: 'deleted', deletedAt: '2026-07-29T11:00:00.000Z' },
    { id: 'archived', status: 'ARCHIVED' },
    { title: 'missing id', expiresAt: '2026-07-29T13:00:00.000Z' }
  ];

  assert.deepEqual(
    filterExistingActiveStories(stories, now).map((story: any) => story.id),
    ['active', 'legacy-no-expiry']
  );
});

test('findExistingActiveStoryById returns null for expired matching ids', async () => {
  const { findExistingActiveStoryById } = await load();
  const now = Date.parse('2026-07-29T12:00:00.000Z');
  const stories = [
    { id: 'target', expiresAt: '2026-07-29T11:00:00.000Z' },
    { id: 'other', expiresAt: '2026-07-29T13:00:00.000Z' }
  ];

  assert.equal(findExistingActiveStoryById(stories, 'target', now), null);
  assert.equal((findExistingActiveStoryById(stories, 'other', now) as any)?.id, 'other');
});
