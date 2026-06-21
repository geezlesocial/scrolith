const normalizeCountry = (value?: string | null) => (value || '').toString().trim().toUpperCase();

const COUNTRY_CURRENCY_MAP: Record<string, string> = {
  PH: 'PHP',
  PHILIPPINES: 'PHP',
  NG: 'NGN',
  NIGERIA: 'NGN'
};

export const getDefaultCurrencyForCountry = (country?: string | null) => {
  const key = normalizeCountry(country);
  return key ? COUNTRY_CURRENCY_MAP[key] : undefined;
};

export const isCountryMatch = (a?: string | null, b?: string | null) =>
  normalizeCountry(a) !== '' && normalizeCountry(a) === normalizeCountry(b);

export { normalizeCountry };
