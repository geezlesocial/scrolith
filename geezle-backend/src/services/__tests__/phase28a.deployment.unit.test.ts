/**
 * Phase 28A — deployment-critical multi-currency certification tests.
 */
import {
  addMinor,
  compareMinor,
  convertMinorWithRate,
  fromMinorUnits,
  getMinorUnits,
  subMinor,
  toMinorUnits
} from '../money.service';
import {
  filterActiveGatewaysForUsers,
  gatewaySupportsCurrency,
  isGatewayUserVisible,
  resolveChargeCurrency
} from '../currencyPolicy.service';

describe('Phase 28A money arithmetic certification', () => {
  test('USD→PHP 10.00 @ 57.25 = 572.50 (minor 1000 → 57250)', () => {
    const minor = toMinorUnits('10.00', 'USD');
    expect(minor).toBe('1000');
    const result = convertMinorWithRate({
      amountMinor: minor,
      fromCurrency: 'USD',
      toCurrency: 'PHP',
      rateDecimal: '57.25'
    });
    expect(result.amountMinor).toBe('57250');
    expect(fromMinorUnits(result.amountMinor, 'PHP')).toBe('572.50');
    // No float residue
    expect(result.amountMinor).not.toMatch(/\./);
    expect(fromMinorUnits(result.amountMinor, 'PHP')).not.toMatch(/9999|0001/);
  });

  test('same-currency conversion is identity', () => {
    const r = convertMinorWithRate({
      amountMinor: '12345',
      fromCurrency: 'USD',
      toCurrency: 'USD',
      rateDecimal: '1'
    });
    expect(r.amountMinor).toBe('12345');
  });

  test('JPY zero-decimal', () => {
    expect(getMinorUnits('JPY')).toBe(0);
    expect(toMinorUnits('1500', 'JPY')).toBe('1500');
    const r = convertMinorWithRate({
      amountMinor: '1000',
      fromCurrency: 'USD',
      toCurrency: 'JPY',
      rateDecimal: '150.5'
    });
    // 10.00 USD * 150.5 = 1505 JPY
    expect(r.amountMinor).toBe('1505');
    expect(fromMinorUnits(r.amountMinor, 'JPY')).toBe('1505');
  });

  test('very small amount rounds half_up', () => {
    const r = convertMinorWithRate({
      amountMinor: '1', // $0.01
      fromCurrency: 'USD',
      toCurrency: 'PHP',
      rateDecimal: '57.25'
    });
    // 0.01 * 57.25 = 0.5725 → half_up → 0.57 PHP = 57 minor
    expect(r.amountMinor).toBe('57');
  });

  test('very large amount stays integer string', () => {
    const r = convertMinorWithRate({
      amountMinor: '99999999900',
      fromCurrency: 'USD',
      toCurrency: 'PHP',
      rateDecimal: '57.25'
    });
    expect(/^\d+$/.test(r.amountMinor)).toBe(true);
    expect(BigInt(r.amountMinor) > 0n).toBe(true);
  });

  test('rejects non-positive rates', () => {
    expect(() =>
      convertMinorWithRate({
        amountMinor: '1000',
        fromCurrency: 'USD',
        toCurrency: 'PHP',
        rateDecimal: '0'
      })
    ).toThrow(/Invalid FX rate/);
    expect(() =>
      convertMinorWithRate({
        amountMinor: '1000',
        fromCurrency: 'USD',
        toCurrency: 'PHP',
        rateDecimal: '-1'
      })
    ).toThrow(/Invalid FX rate/);
  });

  test('rejects invalid major amounts', () => {
    expect(() => toMinorUnits('abc', 'USD')).toThrow(/Invalid monetary amount/);
    expect(() => toMinorUnits('', 'USD')).toThrow(/Invalid monetary amount/);
  });

  test('bigint add/sub/compare for ledger', () => {
    expect(addMinor('1000', '250')).toBe('1250');
    expect(subMinor('1000', '250')).toBe('750');
    expect(compareMinor('1000', '999')).toBe(1);
    expect(compareMinor('1000', '1000')).toBe(0);
  });

  test('percentage fee on minor units stays integer', () => {
    // 10% of 1000 minor = 100
    const feeBps = 1000; // 10%
    const amount = 1000n;
    const fee = (amount * BigInt(feeBps)) / 10000n;
    expect(String(fee)).toBe('100');
  });
});

describe('Phase 28A gateway eligibility certification', () => {
  test('active Stripe/PayPal/Wallet only when enabled', () => {
    const list = filterActiveGatewaysForUsers([
      { id: 'stripe', isEnabled: true, mode: 'live' },
      { id: 'paypal', is_enabled: true, mode: 'live' },
      { id: 'wallet', isEnabled: true, mode: 'live' },
      { id: 'paystack', isEnabled: false },
      { id: 'flutterwave', isEnabled: true, mode: 'disabled' },
      { id: 'payoneer', isEnabled: false },
      { id: 'paymongo', isEnabled: false }
    ]);
    expect(list.map((g) => g.id).sort()).toEqual(['paypal', 'stripe', 'wallet']);
  });

  test('inactive gateways hidden from users', () => {
    expect(isGatewayUserVisible({ id: 'paystack', isEnabled: false })).toBe(false);
    expect(isGatewayUserVisible({ id: 'flutterwave', enabled: false })).toBe(false);
    expect(isGatewayUserVisible({ id: 'payoneer', isEnabled: true, mode: 'offline' })).toBe(false);
  });

  test('Stripe/PayPal/Wallet currency support', () => {
    expect(gatewaySupportsCurrency('stripe', 'USD')).toBe(true);
    expect(gatewaySupportsCurrency('stripe', 'PHP')).toBe(true);
    expect(gatewaySupportsCurrency('paypal', 'PHP')).toBe(true);
    expect(gatewaySupportsCurrency('wallet', 'PHP')).toBe(true);
    expect(gatewaySupportsCurrency('paymongo', 'USD')).toBe(false);
  });

  test('charge currency prefers display when gateway supports it', () => {
    expect(
      resolveChargeCurrency({ gatewayKey: 'stripe', displayCurrency: 'PHP', baseCurrency: 'USD' })
    ).toBe('PHP');
    expect(
      resolveChargeCurrency({ gatewayKey: 'paypal', displayCurrency: 'NGN', baseCurrency: 'USD' })
    ).toBe('USD');
  });
});

describe('Phase 28A historical immutability policy', () => {
  test('conversion does not mutate input minor string reference semantics', () => {
    const original = '1000';
    const r = convertMinorWithRate({
      amountMinor: original,
      fromCurrency: 'USD',
      toCurrency: 'PHP',
      rateDecimal: '57.25'
    });
    expect(original).toBe('1000');
    expect(r.amountMinor).toBe('57250');
  });
});
