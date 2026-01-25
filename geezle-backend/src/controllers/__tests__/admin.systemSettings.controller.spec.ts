import { deepMergeReplaceArrays, validateSystem } from '../admin.systemSettings.controller';

describe('deepMergeReplaceArrays', () => {
  test('merges nested objects and preserves existing keys when not provided', () => {
    const existing = { a: { b: 1, c: 2 }, x: 5 };
    const incoming = { a: { b: 3 } };
    const result = deepMergeReplaceArrays(existing, incoming);
    expect(result).toEqual({ a: { b: 3, c: 2 }, x: 5 });
  });

  test('replaces arrays when provided', () => {
    const existing = { currencies: [{ code: 'USD' }, { code: 'EUR' }], other: [1,2,3] };
    const incoming = { currencies: [{ code: 'BTC' }], other: [] };
    const result = deepMergeReplaceArrays(existing, incoming);
    expect(result.currencies).toEqual([{ code: 'BTC' }]);
    expect(result.other).toEqual([]);
  });

  test('incoming primitive replaces existing', () => {
    const existing = { a: 1, b: { x: 5 } };
    const incoming = { a: 2, b: 10 };
    const result = deepMergeReplaceArrays(existing, incoming);
    expect(result).toEqual({ a: 2, b: 10 });
  });

  test('undefined incoming preserves existing', () => {
    const existing = { a: 1, b: { c: 2 } };
    const result = deepMergeReplaceArrays(existing, undefined);
    expect(result).toEqual(existing);
  });
});

describe('validateSystem', () => {
  test('returns errors for non-boolean flags', () => {
    const obj: any = { maintenanceMode: 'yes', registrationsEnabled: 'no', kycEnforced: 1, admin2FA: null };
    const errors = validateSystem(obj);
    expect(errors).toEqual(expect.arrayContaining([
      'maintenanceMode must be boolean',
      'registrationsEnabled must be boolean',
      'kycEnforced must be boolean',
      'admin2FA must be boolean'
    ]));
  });

  test('detects duplicate currency codes', () => {
    const obj: any = { currencies: [{ code: 'USD' }, { code: 'usd' }] };
    const errors = validateSystem(obj);
    expect(errors).toEqual(expect.arrayContaining([expect.stringContaining('duplicate currency code')]));
  });

  test('flags baseCurrency missing from active currencies', () => {
    const obj: any = { currency: { baseCurrency: 'GBP' }, currencies: [{ code: 'USD', isActive: true }] };
    const errors = validateSystem(obj);
    expect(errors).toEqual(expect.arrayContaining(['currency.baseCurrency must exist in active currencies']));
  });

  test('valid config returns empty array', () => {
    const obj: any = {
      maintenanceMode: false,
      registrationsEnabled: true,
      kycEnforced: false,
      admin2FA: false,
      currencies: [{ code: 'USD', isActive: true }],
      currency: { baseCurrency: 'USD' },
      email: { port: 587 },
      aiConfig: { safety: { maxTokens: 2048 } }
    };
    const errors = validateSystem(obj);
    expect(errors).toHaveLength(0);
  });
});
