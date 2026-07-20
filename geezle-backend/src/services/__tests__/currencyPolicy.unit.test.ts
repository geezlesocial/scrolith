import {
  filterActiveGatewaysForUsers,
  gatewaySupportsCurrency,
  isGatewayUserVisible,
  resolveChargeCurrency
} from '../currencyPolicy.service';

describe('Phase 28 currencyPolicy', () => {
  test('hides disabled gateways', () => {
    const list = filterActiveGatewaysForUsers([
      { id: 'stripe', isEnabled: true, mode: 'live' },
      { id: 'paystack', isEnabled: false, mode: 'live' },
      { id: 'paypal', is_enabled: true, mode: 'live' },
      { id: 'flutterwave', isEnabled: true, mode: 'disabled' }
    ]);
    expect(list.map((g) => g.id)).toEqual(['stripe', 'paypal']);
  });

  test('gateway currency support', () => {
    expect(gatewaySupportsCurrency('stripe', 'USD')).toBe(true);
    expect(gatewaySupportsCurrency('wallet', 'PHP')).toBe(true);
    expect(gatewaySupportsCurrency('paymongo', 'USD')).toBe(false);
  });

  test('resolve charge currency prefers display when supported', () => {
    expect(
      resolveChargeCurrency({
        gatewayKey: 'stripe',
        displayCurrency: 'PHP',
        baseCurrency: 'USD'
      })
    ).toBe('PHP');
    expect(
      resolveChargeCurrency({
        gatewayKey: 'paymongo',
        displayCurrency: 'USD',
        baseCurrency: 'USD'
      })
    ).toBe('PHP');
  });

  test('isGatewayUserVisible', () => {
    expect(isGatewayUserVisible({ isEnabled: true })).toBe(true);
    expect(isGatewayUserVisible({ isEnabled: false })).toBe(false);
  });
});
