import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isScrolithaComment,
  isScrolithaUsername,
  mentionsScrolitha
} from '../scrolithaIdentity';

describe('scrolithaIdentity helpers', () => {
  it('detects scrolitha usernames', () => {
    assert.equal(isScrolithaUsername('Scrolitha'), true);
    assert.equal(isScrolithaUsername('@scrolitha'), true);
    assert.equal(isScrolithaUsername('alice'), false);
  });

  it('detects scrolitha comments', () => {
    assert.equal(isScrolithaComment({ isScrolitha: true }), true);
    assert.equal(isScrolithaComment({ userUsername: 'scrolitha' }), true);
    assert.equal(isScrolithaComment({ author: { username: 'bob' } }), false);
  });

  it('detects @Scrolitha mentions without false positives', () => {
    assert.equal(mentionsScrolitha('@Scrolitha is this true?'), true);
    assert.equal(mentionsScrolitha('email scrolitha@example.com'), false);
    assert.equal(mentionsScrolitha('@scrolithafan hello'), false);
  });
});
