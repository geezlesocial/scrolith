/**
 * Phase 20.2.3 — emoji phrase suggestion engine contracts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collapseRepeatedLetters,
  findEmojiSuggestionQuery,
  insertEmojiAtCaret,
  suggestEmojisForText,
  EMOJI_PHRASE_GROUPS
} from '../../src/utils/emojiPhraseSuggestions';

test('phrase groups cover required expression families', () => {
  const ids = new Set(EMOJI_PHRASE_GROUPS.map((g) => g.id));
  for (const required of ['celebrate', 'funny', 'love', 'fire', 'support']) {
    assert.ok(ids.has(required), `missing group ${required}`);
  }
  assert.ok(EMOJI_PHRASE_GROUPS.length >= 5);
});

test('collapseRepeatedLetters normalizes hahaha and elongated letters', () => {
  assert.equal(collapseRepeatedLetters('hahahaha'), 'haha');
  assert.equal(collapseRepeatedLetters('sooo'), 'soo');
  assert.equal(collapseRepeatedLetters('lol'), 'lol');
});

test('congrats suggests celebration emoji without auto-insert', () => {
  const text = 'congrats';
  const { suggestions, range } = suggestEmojisForText(text, text.length);
  assert.ok(range);
  assert.ok(suggestions.some((s) => s.emoji === '🎉' || s.emoji === '🥳' || s.emoji === '👏'));
});

test('haha / lol suggest laugh emoji', () => {
  for (const phrase of ['haha', 'hahaha', 'lol', 'funny']) {
    const { suggestions } = suggestEmojisForText(phrase, phrase.length);
    assert.ok(
      suggestions.some((s) => ['😂', '🤣', '😆', '😹'].includes(s.emoji)),
      `expected laugh emoji for ${phrase}`
    );
  }
});

test('love / amazing suggest heart emoji', () => {
  for (const phrase of ['love', 'amazing', 'beautiful']) {
    const { suggestions } = suggestEmojisForText(phrase, phrase.length);
    assert.ok(suggestions.some((s) => ['❤️', '😍', '🥰', '💖'].includes(s.emoji)), phrase);
  }
});

test('fire / awesome suggest fire rocket stars', () => {
  for (const phrase of ['fire', 'awesome', 'great']) {
    const { suggestions } = suggestEmojisForText(phrase, phrase.length);
    assert.ok(suggestions.some((s) => ['🔥', '🚀', '⭐', '💯'].includes(s.emoji)), phrase);
  }
});

test('sad / sorry / condolences suggest respectful emoji', () => {
  for (const phrase of ['sad', 'sorry', 'condolences']) {
    const { suggestions } = suggestEmojisForText(phrase, phrase.length);
    assert.ok(suggestions.length > 0, phrase);
    assert.ok(
      suggestions.some((s) => ['💙', '🙏', '🤍', '🕊️'].includes(s.emoji)),
      `expected support emoji for ${phrase}`
    );
  }
});

test('colon search finds fire suggestions', () => {
  const text = 'this is :fir';
  const { suggestions } = suggestEmojisForText(text, text.length);
  assert.ok(suggestions.some((s) => s.emoji === '🔥' || s.label.toLowerCase().includes('fire')));
});

test('insertEmojiAtCaret preserves surrounding text and caret', () => {
  const { value, caret } = insertEmojiAtCaret('hello world', 5, '🎉');
  assert.ok(value.includes('🎉'));
  assert.ok(value.startsWith('hello'));
  assert.ok(value.includes('world'));
  assert.ok(caret > 5);
});

test('insertEmojiAtCaret can replace :colon token range', () => {
  const text = 'nice :fire';
  const range = findEmojiSuggestionQuery(text, text.length);
  assert.ok(range);
  const { value } = insertEmojiAtCaret(text, text.length, '🔥', range);
  assert.ok(value.includes('🔥'));
  assert.ok(!value.includes(':fire'));
});

test('short incomplete query does not force suggestions', () => {
  const { suggestions } = suggestEmojisForText('c', 1);
  assert.equal(suggestions.length, 0);
});
