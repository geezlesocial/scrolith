/**
 * Phase 20.2.4 — mention token helpers for autocomplete.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findActiveToken,
  applyMentionOrTagSuggestion,
  MENTION_SPECIAL_SUGGESTIONS
} from '../../src/community/components/mentionHashtagTokens';

test('findActiveToken detects bare @ for mention picker', () => {
  const text = 'hello @';
  const token = findActiveToken(text, text.length, { mentionsEnabled: true, hashtagsEnabled: true });
  assert.ok(token);
  assert.equal(token?.kind, 'mention');
  assert.equal(token?.query, '');
});

test('findActiveToken detects short ai query', () => {
  const text = 'ask @ai';
  const token = findActiveToken(text, text.length, { mentionsEnabled: true, hashtagsEnabled: false });
  assert.ok(token);
  assert.equal(token?.query, 'ai');
});

test('applyMentionOrTagSuggestion preserves surrounding text and caret', () => {
  const value = 'hi @ibr more';
  // caret after @ibr
  const caret = value.indexOf('ibr') + 3;
  const active = findActiveToken(value, caret, { mentionsEnabled: true, hashtagsEnabled: false });
  assert.ok(active);
  const result = applyMentionOrTagSuggestion({
    value,
    replaceStart: active!.replaceStart,
    replaceEnd: active!.replaceEnd,
    kind: 'mention',
    tokenBody: 'ibrahim'
  });
  assert.match(result.nextValue, /hi @ibrahim\s+more/);
  assert.ok(result.caret > 0);
});

test('special mention catalog includes everyone and Scrolitha', () => {
  const ids = new Set(MENTION_SPECIAL_SUGGESTIONS.map((s) => s.username.toLowerCase()));
  assert.ok(ids.has('everyone'));
  assert.ok(ids.has('scrolitha'));
  assert.ok(ids.has('moderators'));
  assert.ok(ids.has('admins'));
});
