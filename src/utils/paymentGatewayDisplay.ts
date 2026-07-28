type GatewayLike = {
  id?: string;
  name?: string;
  label?: string;
};

const SPECIAL_GATEWAY_LABELS: Record<string, string> = {
  stripe: 'Stripe Payment',
  antom: 'Antom (Alipay+)'
};

const normalizeText = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();

const titleCase = (value: string): string =>
  value
    .split(' ')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

export const getUserFacingPaymentMethodName = (gateway?: GatewayLike | null): string => {
  const gatewayId = normalizeText(gateway?.id).toLowerCase();
  if (gatewayId && SPECIAL_GATEWAY_LABELS[gatewayId]) return SPECIAL_GATEWAY_LABELS[gatewayId];

  const rawName = normalizeText(gateway?.name || gateway?.label);
  if (/^stripe(d)?$/i.test(rawName)) return 'Stripe Payment';
  if (rawName) return rawName;

  if (gatewayId) {
    return titleCase(gatewayId.replace(/[_-]+/g, ' '));
  }

  return 'Payment Method';
};

export const withUserFacingPaymentMethodName = <T extends GatewayLike>(gateway: T): T & { name: string } => ({
  ...gateway,
  name: getUserFacingPaymentMethodName(gateway)
});
