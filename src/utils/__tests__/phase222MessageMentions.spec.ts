/**
 * Phase 22.2 — frontend @mention helpers.
 */
import { describe, expect, it } from 'vitest';
import { extractMentionUsernames, splitTextWithMentions } from '../messageMentions';

describe('phase222 messageMentions', () => {
  it('extracts unique usernames without @', () => {
    expect(extractMentionUsernames('Hey @Alice check with @bob and @alice')).toEqual([
      'alice',
      'bob'
    ]);
  });

  it('returns empty for no mentions', () => {
    expect(extractMentionUsernames('plain text')).toEqual([]);
  });

  it('splits text into text/mention segments', () => {
    const parts = splitTextWithMentions('Hi @alice!');
    expect(parts).toEqual([
      { type: 'text', value: 'Hi ' },
      { type: 'mention', value: '@alice' },
      { type: 'text', value: '!' }
    ]);
  });

  it('returns single text segment when no mentions', () => {
    expect(splitTextWithMentions('hello')).toEqual([{ type: 'text', value: 'hello' }]);
  });
});
