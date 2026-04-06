import { resolveEffectiveCurrencies } from '../services/fx.service';

type SystemCurrencyEntry = {
  code: string;
  name?: string;
  symbol?: string;
  rate?: number;
  isActive?: boolean;
  isDefault?: boolean;
};

export type CurrencyConfig = {
  baseCurrency: string;
  currencies: Array<SystemCurrencyEntry & { code: string; rate: number; isActive: boolean; isDefault: boolean }>;
  rates: Map<string, number>;
};

const normalizeCountry = (value?: string | null) => (value || '').toString().trim().toUpperCase();
const normalizeCountryKey = (value?: string | null) => {
  const raw = normalizeCountry(value);
  if (raw === 'PHILIPPINES') return 'PH';
  if (raw === 'NIGERIA') return 'NG';
  return raw;
};

const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  PH: 'PHP',
  NG: 'NGN'
};

export const loadCurrencyConfig = async (): Promise<CurrencyConfig> => {
  const resolved = await resolveEffectiveCurrencies();
  return {
    baseCurrency: resolved.baseCurrency,
    currencies: resolved.currencies.map((entry) => ({
      code: entry.code,
      name: entry.name,
      symbol: entry.symbol,
      rate: entry.rate,
      isActive: entry.isActive,
      isDefault: entry.isDefault
    })),
    rates: resolved.rates
  };
};

export const getDefaultCurrencyForCountry = (country?: string | null, config?: CurrencyConfig) => {
  const key = normalizeCountryKey(country);
  const mapped = key ? COUNTRY_CURRENCY_MAP[key] : undefined;
  if (!config) return mapped;
  if (mapped && config.rates.has(mapped)) return mapped;
  return config.baseCurrency || mapped;
};

export const convertAmount = (
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  config: CurrencyConfig
) => {
  const from = (fromCurrency || '').toUpperCase();
  const to = (toCurrency || '').toUpperCase();
  if (!from || !to || from === to) {
    return { amount, rate: 1, ok: true };
  }
  const fromRate = config.rates.get(from);
  const toRate = config.rates.get(to);
  if (!fromRate || !toRate) {
    return { amount, rate: 1, ok: false };
  }
  const amountInBase = amount / fromRate;
  const converted = amountInBase * toRate;
  const rate = toRate / fromRate;
  return { amount: converted, rate, ok: true };
};
