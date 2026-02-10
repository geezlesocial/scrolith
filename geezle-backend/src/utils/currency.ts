import prisma from '../utils/prismaClient';

type SystemCurrencyEntry = {
  code: string;
  name?: string;
  symbol?: string;
  rate?: number;
  isActive?: boolean;
  isDefault?: boolean;
};

type SystemSettings = {
  currency?: {
    baseCurrency?: string;
  };
  currencies?: SystemCurrencyEntry[];
};

export type CurrencyConfig = {
  baseCurrency: string;
  currencies: Array<SystemCurrencyEntry & { code: string; rate: number; isActive: boolean; isDefault: boolean }>;
  rates: Map<string, number>;
};

const DEFAULT_SYSTEM: SystemSettings = {
  currency: { baseCurrency: 'USD' },
  currencies: []
};

const normalizeCurrency = (entry: any, baseCode?: string) => {
  const code = (entry?.code || '').toString().toUpperCase();
  const parsedRate = Number(entry?.rate);
  const rate = Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : 1;
  const isDefault = baseCode ? code === baseCode : Boolean(entry?.isDefault ?? entry?.is_default);
  return {
    code,
    name: entry?.name || code,
    symbol: entry?.symbol || '',
    rate,
    isActive: entry?.isActive !== false,
    isDefault
  };
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
  const record = await prisma.appSetting.findUnique({ where: { scope: 'system' } });
  const data = (record?.data as SystemSettings) || DEFAULT_SYSTEM;
  const baseCurrency = data?.currency?.baseCurrency ? String(data.currency.baseCurrency).toUpperCase() : 'USD';
  const list = Array.isArray(data?.currencies) ? data.currencies : [];
  let active = list
    .filter((c: any) => c && c.isActive !== false)
    .map((entry: any) => normalizeCurrency(entry, baseCurrency));

  if (!active.some((c) => c.code === baseCurrency)) {
    active = [normalizeCurrency({ code: baseCurrency, isActive: true, rate: 1 }, baseCurrency), ...active];
  } else {
    active = active.map((c) => ({ ...c, isDefault: c.code === baseCurrency }));
  }

  const rates = new Map<string, number>();
  active.forEach((c) => {
    if (c.code) rates.set(c.code, c.rate || 1);
  });

  return {
    baseCurrency,
    currencies: active,
    rates
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
