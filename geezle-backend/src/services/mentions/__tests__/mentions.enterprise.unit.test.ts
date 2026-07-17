/**
 * Phase 20.2.4 — mention parser + classification contracts.
 */
import {
  parseMentionTokens,
  classifyMentionToken,
  extractEnterpriseMentionUsernames,
  RESERVED_MENTION_TOKENS,
  SCROLITHA_MENTION_ALIASES
} from '../mentions.enterprise.service';

describe('Phase 20.2.4 enterprise mentions', () => {
  test('parses standard usernames and ignores email-like patterns', () => {
    const tokens = parseMentionTokens('hello @ibrahim and mail me at a@b.com');
    const names = tokens.map((t) => t.token);
    expect(names).toContain('ibrahim');
    expect(names.some((n) => n === 'b.com')).toBe(false);
  });

  test('classifies special collective tokens', () => {
    expect(classifyMentionToken('everyone')).toBe('EVERYONE');
    expect(classifyMentionToken('moderators')).toBe('MODERATORS');
    expect(classifyMentionToken('mods')).toBe('MODERATORS');
    expect(classifyMentionToken('admins')).toBe('ADMINS');
  });

  test('classifies Scrolitha aliases including @ai', () => {
    expect(classifyMentionToken('scrolitha')).toBe('SCROLITHA');
    expect(classifyMentionToken('AI')).toBe('SCROLITHA');
    expect(SCROLITHA_MENTION_ALIASES.has('ai')).toBe(true);
  });

  test('reserves future tokens without treating as users', () => {
    expect(classifyMentionToken('verified')).toBe('RESERVED');
    expect(classifyMentionToken('staff')).toBe('RESERVED');
    expect(RESERVED_MENTION_TOKENS.has('staff')).toBe(true);
  });

  test('extractEnterpriseMentionUsernames excludes collective tokens', () => {
    const names = extractEnterpriseMentionUsernames('hi @everyone and @jamila and @scrolitha');
    expect(names).toContain('jamila');
    expect(names).toContain('scrolitha');
    expect(names).not.toContain('everyone');
  });

  test('parses short @ai token', () => {
    const tokens = parseMentionTokens('ask @ai about this');
    expect(tokens.some((t) => t.token === 'ai' && t.kind === 'SCROLITHA')).toBe(true);
  });
});
