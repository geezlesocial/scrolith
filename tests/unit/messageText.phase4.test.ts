import test from 'node:test';
import assert from 'node:assert/strict';
import {
  countMessageWords,
  MAX_MESSAGE_WORDS,
  truncateMessageWords
} from '../../src/utils/messageText';

test('message text allows the requested 500-word boundary without truncation', () => {
  const text = Array.from({ length: MAX_MESSAGE_WORDS }, (_, index) => `word${index}`).join(' ');
  assert.equal(countMessageWords(text), MAX_MESSAGE_WORDS);
  assert.equal(truncateMessageWords(text), text);
});

test('older messages over the boundary remain accessible through a bounded disclosure', () => {
  const text = Array.from({ length: MAX_MESSAGE_WORDS + 2 }, (_, index) => `word${index}`).join(' ');
  const preview = truncateMessageWords(text);
  assert.equal(countMessageWords(preview.replace(/…$/u, '')), MAX_MESSAGE_WORDS);
  assert.equal(preview.endsWith('…'), true);
});
