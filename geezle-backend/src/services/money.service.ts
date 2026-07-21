/**
 * Phase 28 — server-authoritative money primitives.
 * Authoritative calculations use fixed-precision decimal strings / minor units.
 * Never use binary floating point for ledger, charge, or settlement amounts.
 */

export type CurrencyCode = string;

export type Money = {
  amountMinor: string;
  currency: CurrencyCode;
};

/** ISO-style minor unit defaults; override per catalog when known. */
const MINOR_UNITS: Record<string, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  PHP: 2,
  NGN: 2,
  SGD: 2,
  INR: 2,
  CAD: 2,
  AUD: 2,
  CNY: 2,
  CHF: 2,
  HKD: 2,
  NZD: 2,
  KES: 2,
  IDR: 2,
  THB: 2,
  MYR: 2,
  MXN: 2,
  BRL: 2,
  ZAR: 2,
  JPY: 0,
  KRW: 0,
  VND: 0
};

const normalizeCode = (value: unknown, fallback = 'USD') =>
  String(value || fallback)
    .trim()
    .toUpperCase() || fallback;

export const getMinorUnits = (currency: CurrencyCode): number => {
  const code = normalizeCode(currency);
  if (Object.prototype.hasOwnProperty.call(MINOR_UNITS, code)) return MINOR_UNITS[code];
  return 2;
};

/** Parse major units (e.g. "10.50") to minor integer string ("1050"). */
export const toMinorUnits = (major: string | number, currency: CurrencyCode): string => {
  const code = normalizeCode(currency);
  const decimals = getMinorUnits(code);
  const raw = String(major ?? '0').trim().replace(/,/g, '');
  if (!raw || !/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new Error(`Invalid monetary amount: ${major}`);
  }
  const negative = raw.startsWith('-');
  const abs = negative ? raw.slice(1) : raw;
  const [wholePart, fracPart = ''] = abs.split('.');
  const whole = wholePart.replace(/^0+(?=\d)/, '') || '0';
  const frac = (fracPart + '0'.repeat(decimals)).slice(0, decimals);
  const minor = `${whole}${frac}`.replace(/^0+(?=\d)/, '') || '0';
  return negative && minor !== '0' ? `-${minor}` : minor;
};

/** Format minor units to major decimal string with exact scale. */
export const fromMinorUnits = (minor: string | number | bigint, currency: CurrencyCode): string => {
  const code = normalizeCode(currency);
  const decimals = getMinorUnits(code);
  let raw = String(minor ?? '0').trim();
  if (!/^-?\d+$/.test(raw)) {
    throw new Error(`Invalid minor amount: ${minor}`);
  }
  const negative = raw.startsWith('-');
  if (negative) raw = raw.slice(1);
  raw = raw.replace(/^0+(?=\d)/, '') || '0';
  if (decimals === 0) return negative && raw !== '0' ? `-${raw}` : raw;
  const padded = raw.padStart(decimals + 1, '0');
  const whole = padded.slice(0, -decimals) || '0';
  const frac = padded.slice(-decimals);
  const major = `${whole}.${frac}`;
  return negative && major !== '0'.padEnd(decimals + 2, '0').replace(/^0/, '0') ? `-${major}` : major;
};

export const money = (amountMinor: string | number | bigint, currency: CurrencyCode): Money => ({
  amountMinor: String(amountMinor),
  currency: normalizeCode(currency)
});

/** Compare absolute minor amounts as bigints. */
export const compareMinor = (a: string, b: string): number => {
  const aa = BigInt(a || '0');
  const bb = BigInt(b || '0');
  if (aa < bb) return -1;
  if (aa > bb) return 1;
  return 0;
};

export const addMinor = (a: string, b: string): string => String(BigInt(a || '0') + BigInt(b || '0'));
export const subMinor = (a: string, b: string): string => String(BigInt(a || '0') - BigInt(b || '0'));

/**
 * Convert minor amount using rate decimal string (quote per 1 base unit).
 * rateDecimal = units of `to` per 1 unit of `from` when both expressed in major units,
 * or equivalently: toMinor = round(fromMinor * rate * 10^(toDec-fromDec)).
 *
 * For rates quoted as "1 FROM = rate TO" in major units:
 * convertedMajor = fromMajor * rate
 */
export const convertMinorWithRate = (params: {
  amountMinor: string;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  /** Major-unit rate: 1 from = rate to */
  rateDecimal: string;
  rounding?: 'half_up' | 'floor' | 'ceil';
}): { amountMinor: string; roundingAdjustmentMinor: string } => {
  const from = normalizeCode(params.fromCurrency);
  const to = normalizeCode(params.toCurrency);
  if (from === to) {
    return { amountMinor: String(params.amountMinor || '0'), roundingAdjustmentMinor: '0' };
  }
  const rate = String(params.rateDecimal || '').trim();
  if (!rate || !/^\d+(\.\d+)?$/.test(rate) || Number(rate) <= 0) {
    throw new Error(`Invalid FX rate: ${params.rateDecimal}`);
  }
  const fromDec = getMinorUnits(from);
  const toDec = getMinorUnits(to);
  // Work in scaled integers: amountMajor * rate = amountMinor/10^fromDec * rate
  // resultMinor = amountMinor * rate * 10^(toDec - fromDec)
  // Represent rate as integer with scale s: rate = R / 10^s
  const rateParts = rate.split('.');
  const rateScale = rateParts[1]?.length || 0;
  const rateInt = BigInt((rateParts[0] || '0') + (rateParts[1] || ''));
  const amount = BigInt(params.amountMinor || '0');
  const scaleDiff = toDec - fromDec;
  // product = amount * rateInt / 10^rateScale * 10^scaleDiff
  let numerator = amount * rateInt;
  let denomExp = rateScale - scaleDiff;
  const rounding = params.rounding || 'half_up';
  if (denomExp > 0) {
    const denom = 10n ** BigInt(denomExp);
    if (rounding === 'floor') {
      return {
        amountMinor: String(numerator / denom),
        roundingAdjustmentMinor: '0'
      };
    }
    if (rounding === 'ceil') {
      const q = numerator / denom;
      const r = numerator % denom;
      return {
        amountMinor: String(r === 0n ? q : q + (numerator >= 0n ? 1n : -1n)),
        roundingAdjustmentMinor: '0'
      };
    }
    // half_up
    const half = denom / 2n;
    const q = numerator / denom;
    const r = numerator % denom;
    const adj = r * 2n >= denom || (r * 2n === denom && false) ? (r >= half ? 1n : 0n) : r >= half ? 1n : 0n;
    // simpler half-up for positive amounts
    const rounded = r * 2n >= denom ? q + 1n : q;
    return { amountMinor: String(rounded), roundingAdjustmentMinor: '0' };
  }
  // denomExp <= 0 → multiply by 10^(-denomExp)
  const mult = 10n ** BigInt(-denomExp);
  return { amountMinor: String(numerator * mult), roundingAdjustmentMinor: '0' };
};

export const formatMoneyMajor = (amountMinor: string, currency: CurrencyCode, locale = 'en-US'): string => {
  const code = normalizeCode(currency);
  const major = Number(fromMinorUnits(amountMinor, code));
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: code,
    minimumFractionDigits: getMinorUnits(code),
    maximumFractionDigits: getMinorUnits(code)
  }).format(Number.isFinite(major) ? major : 0);
};
