import {
  PLATFORM_CURRENCY_CATALOG,
  PLATFORM_BASE_CURRENCY,
  FRANKFURTER_UNSUPPORTED_CODES
} from '../platformCurrencyCatalog';
import { convertMinorWithRate, toMinorUnits, fromMinorUnits } from '../money.service';

describe('Phase 28D platform catalog', () => {
  test('exactly 23 currencies including USD base', () => {
    expect(PLATFORM_CURRENCY_CATALOG).toHaveLength(23);
    expect(PLATFORM_BASE_CURRENCY).toBe('USD');
    expect(PLATFORM_CURRENCY_CATALOG.filter((c) => c.code === 'USD')).toHaveLength(1);
    expect(PLATFORM_CURRENCY_CATALOG.find((c) => c.code === 'USD')?.seedRateVsUsd).toBe(1);
  });

  test('Frankfurter unsupported codes require manual rates', () => {
    expect(FRANKFURTER_UNSUPPORTED_CODES).toEqual(expect.arrayContaining(['NGN', 'KES', 'VND']));
    expect(FRANKFURTER_UNSUPPORTED_CODES).not.toContain('PHP');
    expect(FRANKFURTER_UNSUPPORTED_CODES).not.toContain('USD');
  });

  test('no duplicate codes', () => {
    const codes = PLATFORM_CURRENCY_CATALOG.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe('Phase 28D ads budget arithmetic (minor units)', () => {
  test('10 USD → 572.50 PHP at 57.25', () => {
    const minor = toMinorUnits('10', 'USD');
    expect(minor).toBe('1000');
    const out = convertMinorWithRate({
      amountMinor: minor,
      fromCurrency: 'USD',
      toCurrency: 'PHP',
      rateDecimal: '57.25'
    });
    expect(out.amountMinor).toBe('57250');
    expect(fromMinorUnits(out.amountMinor, 'PHP')).toBe('572.50');
  });

  test('10000 USD → 572500.00 PHP', () => {
    const minor = toMinorUnits('10000', 'USD');
    const out = convertMinorWithRate({
      amountMinor: minor,
      fromCurrency: 'USD',
      toCurrency: 'PHP',
      rateDecimal: '57.25'
    });
    expect(fromMinorUnits(out.amountMinor, 'PHP')).toBe('572500.00');
  });
});
