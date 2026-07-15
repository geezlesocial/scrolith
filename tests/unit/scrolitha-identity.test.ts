import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isScrolithaComment,
  isScrolithaUsername,
  mentionsScrolitha
} from '../../src/utils/scrolithaIdentity';

describe('scrolitha identity (frontend)', () => {
  it('matches reserved scrolitha usernames', () => {
    assert.equal(isScrolithaUsername('scrolitha'), true);
    assert.equal(isScrolithaUsername('@SCROLITHA'), true);
  });

  it('flags AI comments via username or explicit flags', () => {
    assert.equal(isScrolithaComment({ isAiGenerated: true }), true);
    assert.equal(isScrolithaComment({ author: { isScrolitha: true } }), true);
    assert.equal(isScrolithaComment({ userUsername: 'member1' }), false);
  });

  it('parses mention triggers safely', () => {
    assert.equal(mentionsScrolitha('hey @scrolitha summarize'), true);
    assert.equal(mentionsScrolitha('plain text scrolitha'), false);
    assert.equal(mentionsScrolitha('email scrolitha@example.com'), false);
    assert.equal(mentionsScrolitha('@scrolithafan'), false);
  });
});
