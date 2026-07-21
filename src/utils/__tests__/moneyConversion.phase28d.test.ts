import { describe, expect, test } from 'vitest';
import {
  convertMajorUnits,
  formatConvertedMoney,
  convertBaseLimit,
  toBaseAmount
} from '../moneyConversion';

const rates = new Map<string, number>([
  ['USD', 1],
  ['PHP', 57.25],
  ['EUR', 0.92]
]);

describe('Phase 28D money conversion invariants', () => {
  test('USD→PHP 10.00 becomes 572.50 (not 10.00 PHP)', () => {
    const r = convertMajorUnits({
      amount: 10,
      fromCurrency: 'USD',
      toCurrency: 'PHP',
      rates
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.amount).toBeCloseTo(572.5, 5);
      expect(r.rate).toBeCloseTo(57.25, 5);
    }
  });

  test('USD→PHP max 10000 becomes 572500', () => {
    const r = convertBaseLimit(10000, 'PHP', rates, 'USD');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.amount).toBeCloseTo(572500, 2);
  });

  test('formatConvertedMoney never symbols-only when rate exists', () => {
    const f = formatConvertedMoney({
      amount: 10,
      fromCurrency: 'USD',
      toCurrency: 'PHP',
      rates
    });
    expect(f.converted).toBe(true);
    expect(f.amount).toBeCloseTo(572.5, 5);
    expect(f.currency).toBe('PHP');
    // Must not format as ₱10
    expect(f.text.includes('10.00') && f.currency === 'PHP' && f.amount === 10).toBe(false);
  });

  test('missing rate fails closed — keeps source currency formatting', () => {
    const f = formatConvertedMoney({
      amount: 10,
      fromCurrency: 'USD',
      toCurrency: 'NGN',
      rates
    });
    expect(f.converted).toBe(false);
    expect(f.currency).toBe('USD');
    expect(f.amount).toBe(10);
  });

  test('PHP entry normalizes back to base USD for validation', () => {
    const r = toBaseAmount(572.5, 'PHP', rates, 'USD');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.amount).toBeCloseTo(10, 5);
  });

  test('same currency is identity', () => {
    const r = convertMajorUnits({
      amount: 42,
      fromCurrency: 'USD',
      toCurrency: 'USD',
      rates
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.amount).toBe(42);
  });
});
