/**
 * Phase 28 — centralized conversion using approved FX resolution from fx.service.
 * Rate precedence (via resolveEffectiveCurrencies):
 *   1. Active pair-specific manual override
 *   2. Approved snapshot rates
 *   3. Stored/manual catalog rates
 *   4. Fail closed when rate missing
 */

import { resolveEffectiveCurrencies, type EffectiveCurrencyEntry } from './fx.service';
import {
  convertMinorWithRate,
  formatMoneyMajor,
  fromMinorUnits,
  getMinorUnits,
  toMinorUnits,
  type CurrencyCode,
  type Money
} from './money.service';

export type RateSource = 'identity' | 'base' | 'snapshot' | 'override' | 'manual' | 'fallback';

export type ResolvedFxRate = {
  baseCurrency: CurrencyCode;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
  /** 1 from (major) = rate to (major) */
  rateDecimal: string;
  source: RateSource;
  snapshotId?: string | null;
  overrideId?: string | null;
  stale: boolean;
  isFrozenSnapshot: boolean;
  effectiveAt: string;
};

export type ConversionResult = {
  from: Money;
  to: Money;
  fromMajor: string;
  toMajor: string;
  rate: ResolvedFxRate;
  roundingAdjustmentMinor: string;
  formatted: string;
};

const normalizeCode = (value: unknown, fallback = 'USD') =>
  String(value || fallback)
    .trim()
    .toUpperCase() || fallback;

/**
 * Resolve FX rate for a pair using platform-effective currencies.
 * Rates in catalog are "units of quote per 1 base".
 * Cross rate: from→to = (toRate / fromRate) when both rates are vs base.
 */
export const resolveFxRate = async (params: {
  from: CurrencyCode;
  to: CurrencyCode;
  effectiveAt?: Date;
}): Promise<ResolvedFxRate> => {
  const from = normalizeCode(params.from);
  const to = normalizeCode(params.to);
  const resolved = await resolveEffectiveCurrencies();
  const now = (params.effectiveAt || new Date()).toISOString();

  if (from === to) {
    return {
      baseCurrency: resolved.baseCurrency,
      fromCurrency: from,
      toCurrency: to,
      rateDecimal: '1',
      source: 'identity',
      snapshotId: resolved.snapshot?.id || null,
      overrideId: null,
      stale: Boolean(resolved.snapshot?.stale),
      isFrozenSnapshot: Boolean(resolved.snapshot?.isFrozen),
      effectiveAt: now
    };
  }

  const byCode = new Map(resolved.currencies.map((c) => [c.code, c]));
  const fromEntry = byCode.get(from);
  const toEntry = byCode.get(to);
  const fromRate = resolved.rates.get(from);
  const toRate = resolved.rates.get(to);

  if (!fromRate || !toRate || fromRate <= 0 || toRate <= 0) {
    throw new Error(`FX rate unavailable for ${from}/${to}`);
  }

  // Cross rate in major units
  const cross = toRate / fromRate;
  if (!Number.isFinite(cross) || cross <= 0) {
    throw new Error(`Invalid cross rate for ${from}/${to}`);
  }

  const source = pickSource(fromEntry, toEntry);
  return {
    baseCurrency: resolved.baseCurrency,
    fromCurrency: from,
    toCurrency: to,
    rateDecimal: Number(cross.toFixed(12)).toString(),
    source,
    snapshotId: resolved.snapshot?.id || null,
    overrideId: null,
    stale: Boolean(resolved.snapshot?.stale || fromEntry?.stale || toEntry?.stale),
    isFrozenSnapshot: Boolean(resolved.snapshot?.isFrozen),
    effectiveAt: now
  };
};

const pickSource = (
  fromEntry?: EffectiveCurrencyEntry,
  toEntry?: EffectiveCurrencyEntry
): RateSource => {
  const sources = [fromEntry?.rateSource, toEntry?.rateSource].filter(Boolean) as string[];
  if (sources.includes('override')) return 'override';
  if (sources.includes('snapshot')) return 'snapshot';
  if (sources.includes('manual')) return 'manual';
  if (sources.every((s) => s === 'base')) return 'base';
  return 'manual';
};

export const convertMoney = async (params: {
  amountMajor?: string | number;
  amountMinor?: string;
  fromCurrency: CurrencyCode;
  toCurrency: CurrencyCode;
}): Promise<ConversionResult> => {
  const from = normalizeCode(params.fromCurrency);
  const to = normalizeCode(params.toCurrency);
  const amountMinor =
    params.amountMinor != null
      ? String(params.amountMinor)
      : toMinorUnits(params.amountMajor ?? 0, from);

  const rate = await resolveFxRate({ from, to });
  const converted = convertMinorWithRate({
    amountMinor,
    fromCurrency: from,
    toCurrency: to,
    rateDecimal: rate.rateDecimal
  });

  return {
    from: { amountMinor, currency: from },
    to: { amountMinor: converted.amountMinor, currency: to },
    fromMajor: fromMinorUnits(amountMinor, from),
    toMajor: fromMinorUnits(converted.amountMinor, to),
    rate,
    roundingAdjustmentMinor: converted.roundingAdjustmentMinor,
    formatted: formatMoneyMajor(converted.amountMinor, to)
  };
};

/** Preview-only major conversion (does not create quotes). */
export const convertMajorPreview = async (
  amount: number | string,
  fromCurrency: string,
  toCurrency: string
) => {
  try {
    const result = await convertMoney({
      amountMajor: amount,
      fromCurrency,
      toCurrency
    });
    return {
      ok: true as const,
      amount: Number(result.toMajor),
      amountMinor: result.to.amountMinor,
      rate: Number(result.rate.rateDecimal),
      rateDecimal: result.rate.rateDecimal,
      source: result.rate.source,
      snapshotId: result.rate.snapshotId,
      stale: result.rate.stale,
      formatted: result.formatted,
      baseCurrency: result.rate.baseCurrency
    };
  } catch (error: any) {
    return {
      ok: false as const,
      amount: Number(amount) || 0,
      rate: 1,
      error: error?.message || 'Conversion failed'
    };
  }
};

export const listActiveCurrenciesForUsers = async () => {
  const resolved = await resolveEffectiveCurrencies();
  return {
    baseCurrency: resolved.baseCurrency,
    snapshot: resolved.snapshot,
    currencies: resolved.currencies
      .filter((c) => c.isActive !== false)
      .map((c) => ({
        code: c.code,
        name: c.name,
        symbol: c.symbol,
        rate: c.rate,
        isActive: c.isActive,
        isDefault: c.isDefault || c.code === resolved.baseCurrency,
        minorUnit: getMinorUnits(c.code),
        rateSource: c.rateSource,
        stale: c.stale,
        snapshotId: c.snapshotId
      }))
  };
};
