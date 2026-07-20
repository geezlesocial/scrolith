import {
  addMinor,
  convertMinorWithRate,
  fromMinorUnits,
  getMinorUnits,
  toMinorUnits
} from '../money.service';

describe('Phase 28 money.service', () => {
  test('USD minor units', () => {
    expect(getMinorUnits('USD')).toBe(2);
    expect(toMinorUnits('10.00', 'USD')).toBe('1000');
    expect(toMinorUnits(10.5, 'USD')).toBe('1050');
    expect(fromMinorUnits('1000', 'USD')).toBe('10.00');
  });

  test('JPY zero decimal', () => {
    expect(getMinorUnits('JPY')).toBe(0);
    expect(toMinorUnits('1000', 'JPY')).toBe('1000');
    expect(fromMinorUnits('1500', 'JPY')).toBe('1500');
  });

  test('convert USD to PHP with rate 57.25', () => {
    const tenUsd = toMinorUnits('10', 'USD');
    const result = convertMinorWithRate({
      amountMinor: tenUsd,
      fromCurrency: 'USD',
      toCurrency: 'PHP',
      rateDecimal: '57.25'
    });
    // 10 * 57.25 = 572.50 → 57250 minor
    expect(result.amountMinor).toBe('57250');
    expect(fromMinorUnits(result.amountMinor, 'PHP')).toBe('572.50');
  });

  test('addMinor uses bigint', () => {
    expect(addMinor('1000', '250')).toBe('1250');
  });
});
