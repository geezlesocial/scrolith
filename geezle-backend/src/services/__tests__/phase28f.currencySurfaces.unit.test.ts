import {
  computeMarketplaceCommission,
  isCodPaymentMethod,
  isOnlinePaymentMethod,
  parseMoneyBudgetString
} from '../currencySurface.service';
import {
  computeCommissionBreakdownForPayment,
  isCommissionExemptPaymentMethod
} from '../../utils/commission';

describe('Phase 28F payment method classification', () => {
  test('COD methods are detected and not online', () => {
    expect(isCodPaymentMethod('cash_on_delivery')).toBe(true);
    expect(isCodPaymentMethod('COD')).toBe(true);
    expect(isCodPaymentMethod('cash on delivery')).toBe(true);
    expect(isOnlinePaymentMethod('cash_on_delivery')).toBe(false);
  });

  test('Stripe/PayPal/wallet are online', () => {
    expect(isOnlinePaymentMethod('stripe')).toBe(true);
    expect(isOnlinePaymentMethod('paypal')).toBe(true);
    expect(isOnlinePaymentMethod('wallet')).toBe(true);
    expect(isCodPaymentMethod('stripe')).toBe(false);
  });
});

describe('Phase 28F marketplace commission', () => {
  const settings = {
    commission: { enabled: true, percentage: 10, flatFee: 1 }
  };

  test('online payment takes percentage + flat fee', () => {
    const quote = computeMarketplaceCommission({
      amount: 100,
      paymentMethod: 'stripe',
      marketplaceSettings: settings
    });
    expect(quote.applies).toBe(true);
    expect(quote.commissionAmount).toBe(11); // 10% + 1
    expect(quote.sellerEarnings).toBe(89);
    expect(quote.reason).toBe('online_payment');
  });

  test('COD takes zero commission', () => {
    const quote = computeMarketplaceCommission({
      amount: 100,
      paymentMethod: 'cash_on_delivery',
      marketplaceSettings: settings
    });
    expect(quote.applies).toBe(false);
    expect(quote.commissionAmount).toBe(0);
    expect(quote.sellerEarnings).toBe(100);
    expect(quote.reason).toBe('cod_no_commission');
  });

  test('disabled marketplace commission stays zero online', () => {
    const quote = computeMarketplaceCommission({
      amount: 100,
      paymentMethod: 'paypal',
      marketplaceSettings: { commission: { enabled: false, percentage: 15, flatFee: 5 } }
    });
    expect(quote.applies).toBe(false);
    expect(quote.commissionAmount).toBe(0);
    expect(quote.sellerEarnings).toBe(100);
  });
});

describe('Phase 28F gig commission payment exemption', () => {
  test('COD zeros platform gig commission', () => {
    const settings = {
      walletFundingLimits: {
        commissionSettings: {
          freelancer_fee_type: 'percentage',
          freelancer_fee_value: 20,
          employer_fee_type: 'percentage',
          employer_fee_value: 5,
          minimum_fee: 0
        }
      }
    };
    expect(isCommissionExemptPaymentMethod('cash_on_delivery')).toBe(true);
    const cod = computeCommissionBreakdownForPayment(100, settings, 'cash_on_delivery');
    expect(cod.totalFee).toBe(0);
    expect(cod.applies).toBe(false);

    const online = computeCommissionBreakdownForPayment(100, settings, 'stripe');
    expect(online.freelancerFee).toBe(20);
    expect(online.employerFee).toBe(5);
    expect(online.applies).toBe(true);
  });
});

describe('Phase 28F job budget parse', () => {
  test('parses amount and currency tokens', () => {
    expect(parseMoneyBudgetString('PHP 1500')).toEqual(
      expect.objectContaining({ amount: 1500, currency: 'PHP', hourly: false })
    );
    expect(parseMoneyBudgetString('50/hr USD')).toEqual(
      expect.objectContaining({ amount: 50, currency: 'USD', hourly: true })
    );
    expect(parseMoneyBudgetString('Negotiable')).toEqual(
      expect.objectContaining({ amount: null, text: 'Negotiable' })
    );
  });
});

describe('Phase 28F ads placement rate arithmetic', () => {
  test('USD CPM 5 → PHP 286.25 at 57.25', () => {
    const fromRate = 1;
    const toRate = 57.25;
    const cross = toRate / fromRate;
    expect(Number((5 * cross).toFixed(2))).toBe(286.25);
  });

  test('budget estimate uses converted CPC (same currency units)', () => {
    // 10 USD budget / 0.4 USD CPC = 25 clicks; ratio preserved after FX (within float epsilon).
    const budgetUsd = 10;
    const cpcUsd = 0.4;
    const rate = 57.25;
    const budgetPhp = budgetUsd * rate;
    const cpcPhp = cpcUsd * rate;
    expect(Number(cpcPhp.toFixed(2))).toBe(22.9);
    expect(Math.floor(budgetUsd / cpcUsd)).toBe(25);
    expect(budgetPhp / cpcPhp).toBeCloseTo(budgetUsd / cpcUsd, 10);
    expect(Math.floor(budgetPhp / cpcPhp + 1e-9)).toBe(25);
  });
});
