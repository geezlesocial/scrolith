import { isSafeObjectKey, setSafeObjectValue } from './safeObjectKey';
import { isLikelyEmail } from './boundedInput';

describe('safe request-derived object keys', () => {
  it.each(['__proto__', 'prototype', 'constructor', '', 'x'.repeat(129)])('rejects unsafe key %j', (key) => {
    expect(isSafeObjectKey(key)).toBe(false);
  });

  it('preserves ordinary keys without changing the record prototype', () => {
    const record: Record<string, string> = {};
    expect(setSafeObjectValue(record, 'token', 'redacted')).toBe(true);
    expect(record.token).toBe('redacted');
    expect(Object.getPrototypeOf(record)).toBe(Object.prototype);
  });

  it('does not allow prototype pollution through a parsed key', () => {
    const record: Record<string, unknown> = {};
    expect(setSafeObjectValue(record, '__proto__', { polluted: true })).toBe(false);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it('enforces finite domain allowlists in addition to prototype-key checks', () => {
    const record: Record<string, number> = {};
    const allowed = new Set(['homepage', 'community_feed']);
    expect(setSafeObjectValue(record, 'homepage', 1, allowed)).toBe(true);
    expect(setSafeObjectValue(record, 'unapproved', 2, allowed)).toBe(false);
    expect(setSafeObjectValue(record, 'constructor', 3, allowed)).toBe(false);
    expect(record).toEqual({ homepage: 1 });
  });
});

describe('bounded email validation', () => {
  it('accepts normal addresses and rejects oversized adversarial input quickly', () => {
    expect(isLikelyEmail('member@example.test')).toBe(true);
    expect(isLikelyEmail(`${'a'.repeat(10_000)}@example.test`)).toBe(false);
    expect(isLikelyEmail('not-an-email')).toBe(false);
  });
});
