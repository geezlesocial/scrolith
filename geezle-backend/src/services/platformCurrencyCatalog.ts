/**
 * Phase 28D — platform currency catalog (admin-governed, USD base).
 * Frankfurter support is audited; unsupported codes require manual rates.
 */

export type CatalogCurrency = {
  code: string;
  name: string;
  symbol: string;
  minorUnit: number;
  /** Supported by Frankfurter ECB endpoint (live provider). */
  frankfurterSupported: boolean;
  /** Seed/default major rate vs USD for bootstrap only (admin may override). */
  seedRateVsUsd: number;
};

/** Exactly 23 active platform currencies including USD (base). */
export const PLATFORM_CURRENCY_CATALOG: CatalogCurrency[] = [
  { code: 'USD', name: 'US Dollar', symbol: '$', minorUnit: 2, frankfurterSupported: true, seedRateVsUsd: 1 },
  { code: 'EUR', name: 'Euro', symbol: '€', minorUnit: 2, frankfurterSupported: true, seedRateVsUsd: 0.92 },
  { code: 'GBP', name: 'British Pound', symbol: '£', minorUnit: 2, frankfurterSupported: true, seedRateVsUsd: 0.79 },
  { code: 'JPY', name: 'Japanese Yen', symbol: '¥', minorUnit: 0, frankfurterSupported: true, seedRateVsUsd: 150.5 },
  { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', minorUnit: 2, frankfurterSupported: true, seedRateVsUsd: 7.19 },
  { code: 'CHF', name: 'Swiss Franc', symbol: 'Fr', minorUnit: 2, frankfurterSupported: true, seedRateVsUsd: 0.88 },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', minorUnit: 2, frankfurterSupported: true, seedRateVsUsd: 1.35 },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', minorUnit: 2, frankfurterSupported: true, seedRateVsUsd: 1.52 },
  { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', minorUnit: 2, frankfurterSupported: true, seedRateVsUsd: 1.34 },
  { code: 'HKD', name: 'Hong Kong Dollar', symbol: 'HK$', minorUnit: 2, frankfurterSupported: true, seedRateVsUsd: 7.82 },
  { code: 'NZD', name: 'New Zealand Dollar', symbol: 'NZ$', minorUnit: 2, frankfurterSupported: true, seedRateVsUsd: 1.63 },
  // Not returned by Frankfurter — manual/catalog rate required
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', minorUnit: 2, frankfurterSupported: false, seedRateVsUsd: 1500 },
  { code: 'KRW', name: 'South Korean Won', symbol: '₩', minorUnit: 0, frankfurterSupported: true, seedRateVsUsd: 1330 },
  { code: 'INR', name: 'Indian Rupee', symbol: '₹', minorUnit: 2, frankfurterSupported: true, seedRateVsUsd: 83.5 },
  { code: 'PHP', name: 'Philippine Peso', symbol: '₱', minorUnit: 2, frankfurterSupported: true, seedRateVsUsd: 57.25 },
  { code: 'KES', name: 'Kenyan Shilling', symbol: 'KSh', minorUnit: 2, frankfurterSupported: false, seedRateVsUsd: 135 },
  { code: 'IDR', name: 'Indonesian Rupiah', symbol: 'Rp', minorUnit: 2, frankfurterSupported: true, seedRateVsUsd: 15600 },
  { code: 'THB', name: 'Thai Baht', symbol: '฿', minorUnit: 2, frankfurterSupported: true, seedRateVsUsd: 36.1 },
  { code: 'MYR', name: 'Malaysian Ringgit', symbol: 'RM', minorUnit: 2, frankfurterSupported: true, seedRateVsUsd: 4.75 },
  { code: 'VND', name: 'Vietnamese Dong', symbol: '₫', minorUnit: 0, frankfurterSupported: false, seedRateVsUsd: 24600 },
  { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$', minorUnit: 2, frankfurterSupported: true, seedRateVsUsd: 16.8 },
  { code: 'BRL', name: 'Brazilian Real', symbol: 'R$', minorUnit: 2, frankfurterSupported: true, seedRateVsUsd: 5.05 },
  { code: 'ZAR', name: 'South African Rand', symbol: 'R', minorUnit: 2, frankfurterSupported: true, seedRateVsUsd: 18.9 }
];

export const PLATFORM_BASE_CURRENCY = 'USD';

export const PLATFORM_CURRENCY_CODES = PLATFORM_CURRENCY_CATALOG.map((c) => c.code);

export const FRANKFURTER_UNSUPPORTED_CODES = PLATFORM_CURRENCY_CATALOG.filter((c) => !c.frankfurterSupported).map(
  (c) => c.code
);

export const getCatalogEntry = (code: string) =>
  PLATFORM_CURRENCY_CATALOG.find((c) => c.code === String(code || '').trim().toUpperCase()) || null;

/** Build AppSetting currencies[] entries (idempotent merge helpers). */
export const buildCatalogCurrencyRecords = () =>
  PLATFORM_CURRENCY_CATALOG.map((c) => ({
    code: c.code,
    name: c.name,
    symbol: c.symbol,
    rate: c.seedRateVsUsd,
    isActive: true,
    isDefault: c.code === PLATFORM_BASE_CURRENCY,
    minorUnit: c.minorUnit,
    frankfurterSupported: c.frankfurterSupported,
    rateSourceHint: c.frankfurterSupported ? 'snapshot_or_manual' : 'manual_required'
  }));
