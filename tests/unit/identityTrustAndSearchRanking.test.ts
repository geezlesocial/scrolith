import test from 'node:test';
import assert from 'node:assert/strict';
import {
  identityTrustStateLabel,
  resolveIdentityTrustState
} from '../../src/utils/verification';
import { rankSearchItems } from '../../src/utils/searchRanking';

test('identity trust states prioritize review and action-needed statuses', () => {
  assert.equal(resolveIdentityTrustState({ isVerified: true, kycStatus: 'under_review' }), 'pending');
  assert.equal(resolveIdentityTrustState({ isVerified: true, kycStatus: 'requires_updates' }), 'needs_action');
  assert.equal(resolveIdentityTrustState({ kycStatus: 'approved' }), 'verified');
  assert.equal(identityTrustStateLabel('pending'), 'Verification pending');
});

test('search ranking prefers exact and prefix title matches while deduplicating', () => {
  const ranked = rankSearchItems(
    [
      { id: '2', type: 'people', title: 'Remote work tips', url: '/u/2' },
      { id: '1', type: 'people', title: 'Remote', url: '/u/1' },
      { id: '1', type: 'people', title: 'Remote duplicate', url: '/u/1' }
    ],
    'remote'
  );
  assert.deepEqual(ranked.map((item) => item.id), ['1', '2']);
});
