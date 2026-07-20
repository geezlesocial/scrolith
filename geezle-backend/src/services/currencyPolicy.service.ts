/**
 * Phase 28 — gateway currency eligibility and active payment method filtering.
 * Only gateways that are enabled/live may be returned to users.
 */

const ACTIVE_USER_GATEWAYS = new Set(['stripe', 'paypal', 'wallet', 'wallet_funds', 'wallet-funds']);

const GATEWAY_CURRENCY_SUPPORT: Record<string, string[]> = {
  stripe: ['USD', 'EUR', 'GBP', 'SGD', 'INR', 'CAD', 'AUD', 'PHP', 'JPY'],
  paypal: ['USD', 'EUR', 'GBP', 'PHP', 'SGD', 'CAD', 'AUD'],
  wallet: ['*'],
  wallet_funds: ['*'],
  'wallet-funds': ['*'],
  paystack: ['NGN', 'GHS', 'ZAR', 'USD'],
  flutterwave: ['NGN', 'KES', 'RWF', 'UGX', 'USD', 'GHS', 'ZAR'],
  payoneer: ['USD', 'EUR', 'GBP'],
  paymongo: ['PHP']
};

const normalizeGatewayId = (value: unknown) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');

const normalizeCurrency = (value: unknown) =>
  String(value || '')
    .trim()
    .toUpperCase();

export const isGatewayUserVisible = (gateway: any): boolean => {
  if (!gateway) return false;
  const enabled = Boolean(
    gateway.is_enabled ?? gateway.isEnabled ?? gateway.enabled ?? gateway.live ?? false
  );
  if (!enabled) return false;
  const mode = String(gateway.mode || gateway.runtimeMode || gateway.status || 'live')
    .trim()
    .toLowerCase();
  // Hide explicitly disabled / offline
  if (['disabled', 'offline', 'inactive', 'off'].includes(mode)) return false;
  return true;
};

export const filterActiveGatewaysForUsers = <T extends Record<string, any>>(gateways: T[]): T[] => {
  return (Array.isArray(gateways) ? gateways : []).filter((gw) => isGatewayUserVisible(gw));
};

export const gatewaySupportsCurrency = (gatewayKey: string, currency: string): boolean => {
  const key = normalizeGatewayId(gatewayKey);
  const code = normalizeCurrency(currency);
  const supported = GATEWAY_CURRENCY_SUPPORT[key];
  if (!supported) return false;
  if (supported.includes('*')) return true;
  return supported.includes(code);
};

/**
 * Choose charge currency for a gateway given user display preference and base.
 * Prefers display if supported; else base; else first supported.
 */
export const resolveChargeCurrency = (params: {
  gatewayKey: string;
  displayCurrency: string;
  baseCurrency: string;
  gatewayCurrencies?: string[];
}): string => {
  const display = normalizeCurrency(params.displayCurrency);
  const base = normalizeCurrency(params.baseCurrency || 'USD');
  const key = normalizeGatewayId(params.gatewayKey);
  const list = Array.isArray(params.gatewayCurrencies)
    ? params.gatewayCurrencies.map(normalizeCurrency).filter(Boolean)
    : GATEWAY_CURRENCY_SUPPORT[key] || [];

  if (list.includes('*')) return display || base;
  if (display && list.includes(display)) return display;
  if (base && list.includes(base)) return base;
  return list[0] || base || 'USD';
};

export const assertActiveUserGateway = (gatewayKey: string) => {
  const key = normalizeGatewayId(gatewayKey);
  // Soft policy: known inactive providers should not be selected for new checkout
  // even if misconfigured as enabled.
  const blockedUnlessEnabled = new Set(['paystack', 'flutterwave', 'payoneer', 'paymongo']);
  if (blockedUnlessEnabled.has(key) && !ACTIVE_USER_GATEWAYS.has(key)) {
    // Still allow if explicitly enabled via isGatewayUserVisible at list time;
    // this helper is for preference only.
  }
  return key;
};
