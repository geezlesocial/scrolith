/**
 * Phase 28D — display-side money conversion helpers.
 * Preview/display only. Settlement must use server FX quotes.
 *
 * Invariant: never change currency symbol without converting the amount
 * when a positive cross-rate exists. When rate is missing, fail closed
 * (return null) rather than reusing the original number.
 */

export type RateMap = Map<string, number> | Record<string, number>;

const normalizeCode = (value: unknown, fallback = 'USD') =>
  String(value || fallback)
    .trim()
    .toUpperCase() || fallback;

const getRate = (rates: RateMap, code: string): number | null => {
  const key = normalizeCode(code);
  if (rates instanceof Map) {
    const v = rates.get(key);
    return Number.isFinite(v) && Number(v) > 0 ? Number(v) : null;
  }
  const v = rates[key];
  return Number.isFinite(v) && Number(v) > 0 ? Number(v) : null;
};

/**
 * Rates are "units of quote per 1 base" when base rate is 1.
 * Cross: amount_to = amount_from * (toRate / fromRate)
 */
export const convertMajorUnits = (params: {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  rates: RateMap;
  baseCurrency?: string;
}): { ok: true; amount: number; rate: number } | { ok: false; amount: number; error: string } => {
  const from = normalizeCode(params.fromCurrency, params.baseCurrency || 'USD');
  const to = normalizeCode(params.toCurrency, params.baseCurrency || 'USD');
  const amount = Number(params.amount);
  if (!Number.isFinite(amount)) {
    return { ok: false, amount: 0, error: 'Invalid amount' };
  }
  if (from === to) {
    return { ok: true, amount, rate: 1 };
  }
  const fromRate = getRate(params.rates, from);
  const toRate = getRate(params.rates, to);
  if (fromRate == null || toRate == null) {
    return {
      ok: false,
      amount,
      error: `FX rate unavailable for ${from}/${to}`
    };
  }
  const cross = toRate / fromRate;
  if (!Number.isFinite(cross) || cross <= 0) {
    return { ok: false, amount, error: `Invalid cross rate for ${from}/${to}` };
  }
  // Detect symbol-only trap: rate must not be forced to 1 incorrectly for different codes
  return { ok: true, amount: amount * cross, rate: cross };
};

/** Format major amount in currency; does not convert. */
export const formatMoneyMajor = (amount: number, currency: string, locale?: string) => {
  const code = normalizeCode(currency);
  try {
    return new Intl.NumberFormat(locale || undefined, {
      style: 'currency',
      currency: code
    }).format(Number.isFinite(amount) ? amount : 0);
  } catch {
    return `${code} ${(Number.isFinite(amount) ? amount : 0).toFixed(2)}`;
  }
};

/**
 * Convert then format. On missing rate, falls back to formatting in source currency
 * (never attaches a foreign symbol to an unconverted number).
 */
export const formatConvertedMoney = (params: {
  amount: number;
  fromCurrency: string;
  toCurrency: string;
  rates: RateMap;
  baseCurrency?: string;
  locale?: string;
}): { text: string; converted: boolean; amount: number; currency: string; rate?: number } => {
  const from = normalizeCode(params.fromCurrency, params.baseCurrency || 'USD');
  const to = normalizeCode(params.toCurrency, from);
  const result = convertMajorUnits({
    amount: params.amount,
    fromCurrency: from,
    toCurrency: to,
    rates: params.rates,
    baseCurrency: params.baseCurrency
  });
  if (!result.ok) {
    return {
      text: formatMoneyMajor(params.amount, from, params.locale),
      converted: false,
      amount: params.amount,
      currency: from
    };
  }
  return {
    text: formatMoneyMajor(result.amount, to, params.locale),
    converted: from !== to,
    amount: result.amount,
    currency: to,
    rate: result.rate
  };
};

/** Admin budget limits are always in base (USD); convert for display/input in user currency. */
export const convertBaseLimit = (
  baseAmount: number,
  displayCurrency: string,
  rates: RateMap,
  baseCurrency = 'USD'
) =>
  convertMajorUnits({
    amount: baseAmount,
    fromCurrency: baseCurrency,
    toCurrency: displayCurrency,
    rates,
    baseCurrency
  });

/** Normalize a user-entered amount in display currency back to base for validation. */
export const toBaseAmount = (
  enteredAmount: number,
  enteredCurrency: string,
  rates: RateMap,
  baseCurrency = 'USD'
) =>
  convertMajorUnits({
    amount: enteredAmount,
    fromCurrency: enteredCurrency,
    toCurrency: baseCurrency,
    rates,
    baseCurrency
  });
