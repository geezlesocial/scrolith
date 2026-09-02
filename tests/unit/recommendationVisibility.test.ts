import test from 'node:test';
import assert from 'node:assert/strict';
import {
  filterUnfollowedRecommendations,
  recommendationIsFollowing
} from '../../src/utils/recommendationVisibility';

test('recommendation visibility excludes followed accounts and duplicate ids', () => {
  const visible = filterUnfollowedRecommendations([
    { entityId: 'user-1', account: { name: 'Followed', isFollowing: true } },
    { entityId: 'user-2', account: { name: 'Visible', isFollowing: false } },
    { entityId: 'user-2', account: { name: 'Duplicate', isFollowing: false } },
    { entityId: 'user-3', account: { name: 'Visible without state' } }
  ]);

  assert.deepEqual(visible.map((item) => item.entityId), ['user-2', 'user-3']);
  assert.equal(recommendationIsFollowing({ is_following: 'true' }), true);
  assert.equal(recommendationIsFollowing({ account: { isFollowing: false } }), false);
});
