/**
 * Phase 28F — Full currency surface helpers for Ads, Jobs, Gigs & Marketplace.
 * Extends Phase 28E foundation without replacing FX engine, snapshots, or base USD governance.
 *
 * Rules:
 * - Platform base: USD (via resolveEffectiveCurrencies)
 * - Settlement / validation: fail closed on missing FX
 * - Display conversion: fail closed (keep source currency, never symbol-only)
 * - Marketplace commission: only for online payment methods (never COD)
 */

import { resolveEffectiveCurrencies } from './fx.service';
import { convertMoney, convertMajorPreview } from './currencyConversion.service';
import { computeCommissionBreakdown, normalizeCommissionSettings } from '../utils/commission';

export const PLATFORM_PRICING_CURRENCY = 'USD';

const normalizeCode = (value: unknown, fallback = 'USD') =>
  String(value || fallback)
    .trim()
    .toUpperCase() || fallback;

/** Online payment methods that may take platform commission / gateway fees. */
const ONLINE_PAYMENT_METHODS = new Set([
  'stripe',
  'paypal',
  'payoneer',
  'dragonpay',
  'wallet',
  'balance',
  'card',
  'credit_card',
  'debit_card',
  'apple_pay',
  'google_pay',
  'gcash',
  'grabpay',
  'bank_transfer',
  'online',
  'checkout'
]);

/** Cash / offline methods — seller delivers personally; no platform commission. */
const COD_PAYMENT_METHODS = new Set([
  'cash_on_delivery',
  'cod',
  'cash',
  'cash_on_meetup',
  'meetup_cash',
  'in_person',
  'offline'
]);

export const isCodPaymentMethod = (method: unknown): boolean => {
  const key = String(method || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!key) return false;
  if (COD_PAYMENT_METHODS.has(key)) return true;
  return key.includes('cash_on_delivery') || key === 'cod' || key.endsWith('_cod');
};

export const isOnlinePaymentMethod = (method: unknown): boolean => {
  const key = String(method || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!key) return false;
  if (isCodPaymentMethod(key)) return false;
  if (ONLINE_PAYMENT_METHODS.has(key)) return true;
  // Treat unknown non-COD methods as online when they look like gateways.
  return !key.includes('cash') && !key.includes('meetup');
};

export type ConvertFailClosed =
  | { ok: true; amount: number; rate: number; fromCurrency: string; toCurrency: string }
  | { ok: false; error: string; fromCurrency: string; toCurrency: string; amount: number };

/**
 * Convert major units using live effective rates (fail closed).
 */
export const convertMajorFailClosed = async (params: {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
}): Promise<ConvertFailClosed> => {
  const from = normalizeCode(params.fromCurrency);
  const to = normalizeCode(params.toCurrency);
  const amount = Number(params.amount);
  if (!Number.isFinite(amount)) {
    return { ok: false, error: 'Invalid amount', fromCurrency: from, toCurrency: to, amount: 0 };
  }
  if (from === to) {
    return { ok: true, amount, rate: 1, fromCurrency: from, toCurrency: to };
  }
  const preview = await convertMajorPreview(amount, from, to);
  if (!preview.ok) {
    return {
      ok: false,
      error: preview.error || `FX rate unavailable for ${from}/${to}`,
      fromCurrency: from,
      toCurrency: to,
      amount
    };
  }
  return {
    ok: true,
    amount: preview.amount,
    rate: preview.rate,
    fromCurrency: from,
    toCurrency: to
  };
};

/** Convert any amount into platform base (USD) for validation / ledger. */
export const toPlatformBaseAmount = async (
  amount: number,
  fromCurrency: string
): Promise<ConvertFailClosed> => {
  const resolved = await resolveEffectiveCurrencies();
  const base = normalizeCode(resolved.baseCurrency || PLATFORM_PRICING_CURRENCY);
  return convertMajorFailClosed({ amount, fromCurrency, toCurrency: base });
};

/** Convert platform base amount into a display currency. */
export const fromPlatformBaseAmount = async (
  amountBase: number,
  toCurrency: string
): Promise<ConvertFailClosed> => {
  const resolved = await resolveEffectiveCurrencies();
  const base = normalizeCode(resolved.baseCurrency || PLATFORM_PRICING_CURRENCY);
  return convertMajorFailClosed({ amount: amountBase, fromCurrency: base, toCurrency });
};

/**
 * Convert a map of placement rates (stored in pricingCurrency, usually USD)
 * into a target display currency. Fail closed per-key (omits unconvertible keys).
 */
export const convertPlacementRateMap = async (
  rateMap: Record<string, number> | null | undefined,
  pricingCurrency: string,
  displayCurrency: string
): Promise<{
  pricingCurrency: string;
  displayCurrency: string;
  ratesBase: Record<string, number>;
  ratesDisplay: Record<string, number>;
  converted: boolean;
  errors: string[];
}> => {
  const from = normalizeCode(pricingCurrency, PLATFORM_PRICING_CURRENCY);
  const to = normalizeCode(displayCurrency, from);
  const ratesBase: Record<string, number> = {};
  const ratesDisplay: Record<string, number> = {};
  const errors: string[] = [];
  const source = rateMap && typeof rateMap === 'object' ? rateMap : {};

  for (const [key, raw] of Object.entries(source)) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) continue;
    ratesBase[key] = n;
    if (from === to) {
      ratesDisplay[key] = n;
      continue;
    }
    const converted = await convertMajorFailClosed({ amount: n, fromCurrency: from, toCurrency: to });
    if (converted.ok === false) {
      errors.push(`${key}: ${converted.error}`);
      continue;
    }
    ratesDisplay[key] = Number(converted.amount.toFixed(6));
  }

  return {
    pricingCurrency: from,
    displayCurrency: to,
    ratesBase,
    ratesDisplay,
    converted: from !== to && errors.length === 0,
    errors
  };
};

/**
 * Build ads config enrichment for campaign UI:
 * - canonical USD rates preserved
 * - display rates for campaign currency
 * - min/max converted for display
 */
export const buildAdsConfigCurrencyView = async (params: {
  adsConfig: any;
  displayCurrency?: string | null;
}) => {
  const pricingCurrency = normalizeCode(
    params.adsConfig?.pricingCurrency || PLATFORM_PRICING_CURRENCY,
    PLATFORM_PRICING_CURRENCY
  );
  const displayCurrency = normalizeCode(params.displayCurrency || pricingCurrency, pricingCurrency);
  const minBudgetBase = Math.max(0, Number(params.adsConfig?.minBudget ?? 10));
  const maxBudgetBase = Math.max(minBudgetBase, Number(params.adsConfig?.maxBudget ?? 10000));

  const [cpm, cpc, minDisplay, maxDisplay] = await Promise.all([
    convertPlacementRateMap(params.adsConfig?.cpmByPlacement, pricingCurrency, displayCurrency),
    convertPlacementRateMap(params.adsConfig?.cpcByPlacement, pricingCurrency, displayCurrency),
    fromPlatformBaseAmount(minBudgetBase, displayCurrency),
    fromPlatformBaseAmount(maxBudgetBase, displayCurrency)
  ]);

  return {
    pricingCurrency,
    displayCurrency,
    minBudgetBase,
    maxBudgetBase,
    minBudgetDisplay: minDisplay.ok ? minDisplay.amount : null,
    maxBudgetDisplay: maxDisplay.ok ? maxDisplay.amount : null,
    cpmByPlacement: cpm.ratesBase,
    cpcByPlacement: cpc.ratesBase,
    cpmByPlacementDisplay: cpm.ratesDisplay,
    cpcByPlacementDisplay: cpc.ratesDisplay,
    conversion: {
      ok: minDisplay.ok && maxDisplay.ok && cpm.errors.length === 0 && cpc.errors.length === 0,
      minError: minDisplay.ok === false ? minDisplay.error : null,
      maxError: maxDisplay.ok === false ? maxDisplay.error : null,
      cpmErrors: cpm.errors,
      cpcErrors: cpc.errors
    }
  };
};

/**
 * Gig/job money: treat stored package/base prices as pricingCurrency (USD default).
 * Convert to charge currency for checkout; fail closed if rate missing.
 */
export const resolveChargeAmount = async (params: {
  amountSource: number;
  sourceCurrency?: string | null;
  chargeCurrency: string;
}): Promise<
  | {
      ok: true;
      sourceAmount: number;
      sourceCurrency: string;
      chargeAmount: number;
      chargeCurrency: string;
      rate: number;
    }
  | { ok: false; error: string }
> => {
  const sourceCurrency = normalizeCode(params.sourceCurrency || PLATFORM_PRICING_CURRENCY);
  const chargeCurrency = normalizeCode(params.chargeCurrency || sourceCurrency);
  const sourceAmount = Number(params.amountSource);
  if (!Number.isFinite(sourceAmount) || sourceAmount < 0) {
    return { ok: false, error: 'Invalid source amount' };
  }
  const converted = await convertMajorFailClosed({
    amount: sourceAmount,
    fromCurrency: sourceCurrency,
    toCurrency: chargeCurrency
  });
  if (converted.ok === false) return { ok: false, error: converted.error };
  return {
    ok: true,
    sourceAmount,
    sourceCurrency,
    chargeAmount: Number(converted.amount.toFixed(2)),
    chargeCurrency,
    rate: converted.rate
  };
};

/**
 * Marketplace commission — applies only to online payment methods.
 * COD / cash meetup: zero platform commission (seller delivers themselves).
 */
export const computeMarketplaceCommission = (params: {
  amount: number;
  paymentMethod?: string | null;
  marketplaceSettings?: any;
  /** Optional platform commission settings (wallet/gigs) as fallback */
  platformSettings?: any;
}) => {
  const amount = Math.max(0, Number(params.amount) || 0);
  const method = String(params.paymentMethod || '').trim();
  const cod = isCodPaymentMethod(method);
  const online = isOnlinePaymentMethod(method);

  const mkt = params.marketplaceSettings?.commission || params.marketplaceSettings?.commissionSettings || {};
  const enabled = mkt.enabled !== false && (Number(mkt.percentage) > 0 || Number(mkt.flatFee) > 0 || Number(mkt.flat_fee) > 0);

  if (cod || !online || !enabled) {
    return {
      applies: false,
      reason: cod ? 'cod_no_commission' : !online ? 'offline_or_unknown_method' : 'commission_disabled',
      paymentMethod: method || null,
      isCod: cod,
      isOnline: online,
      percentage: 0,
      flatFee: 0,
      commissionAmount: 0,
      sellerEarnings: Number(amount.toFixed(2)),
      platformFee: 0,
      buyerTotal: Number(amount.toFixed(2))
    };
  }

  const percentage = Math.max(0, Number(mkt.percentage ?? mkt.percent ?? 0) || 0);
  const flatFee = Math.max(0, Number(mkt.flatFee ?? mkt.flat_fee ?? 0) || 0);
  const percentFee = Number(((amount * percentage) / 100).toFixed(2));
  const commissionAmount = Number(Math.min(amount, percentFee + flatFee).toFixed(2));
  const sellerEarnings = Number(Math.max(0, amount - commissionAmount).toFixed(2));

  return {
    applies: true,
    reason: 'online_payment',
    paymentMethod: method || null,
    isCod: false,
    isOnline: true,
    percentage,
    flatFee,
    commissionAmount,
    sellerEarnings,
    platformFee: commissionAmount,
    buyerTotal: Number(amount.toFixed(2))
  };
};

/**
 * Gig/jobs commission for online checkout (Stripe/PayPal/wallet).
 * Payment method COD is not used for gigs orders typically; still zero if COD-like.
 */
export const computeGigOrderCommission = (params: {
  amount: number;
  paymentMethod?: string | null;
  settings: any;
}) => {
  if (isCodPaymentMethod(params.paymentMethod)) {
    return {
      ...computeCommissionBreakdown(params.amount, params.settings),
      freelancerFee: 0,
      employerFee: 0,
      totalFee: 0,
      applies: false,
      reason: 'cod_no_commission' as const
    };
  }
  const breakdown = computeCommissionBreakdown(params.amount, params.settings);
  return {
    ...breakdown,
    applies: breakdown.totalFee > 0,
    reason: 'online_payment' as const
  };
};

/**
 * Parse job budget strings that may include currency codes ("500 USD", "PHP 1200", "50/hr").
 * Returns null amount when not parseable (preserves free-text budgets).
 */
export const parseMoneyBudgetString = (
  raw: unknown
): { amount: number | null; currency: string | null; hourly: boolean; text: string } => {
  const text = String(raw || '').trim();
  if (!text) return { amount: null, currency: null, hourly: false, text: '' };
  const hourly = /\/\s*hr|per\s*hour|hourly/i.test(text);
  const codeMatch = text.match(/\b([A-Z]{3})\b/);
  const currency = codeMatch ? codeMatch[1] : null;
  const numberMatch = text.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  const amount = numberMatch ? Number(numberMatch[1]) : null;
  return {
    amount: Number.isFinite(amount as number) ? (amount as number) : null,
    currency,
    hourly,
    text
  };
};

export const getPlatformBaseCurrency = async () => {
  const resolved = await resolveEffectiveCurrencies();
  return normalizeCode(resolved.baseCurrency || PLATFORM_PRICING_CURRENCY);
};

/** Precise conversion using minor units path (for refunds / settlements). */
export const convertMoneyStrict = async (params: {
  amountMajor: number | string;
  fromCurrency: string;
  toCurrency: string;
}) => convertMoney(params);

export { normalizeCommissionSettings };
