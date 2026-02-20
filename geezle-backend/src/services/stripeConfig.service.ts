import Stripe from 'stripe';
import prisma from '../utils/prismaClient';
import { maybeDecryptSecret } from '../utils/secretCipher';

type StripeMode = 'test' | 'live';
export type StripeConnectType = 'express' | 'standard';

export type StripeGatewayConfig = {
  enabled: boolean;
  mode: StripeMode;
  publishableKey: string;
  secretKey: string;
  webhookSecret: string;
  connectEnabled: boolean;
  connectType: StripeConnectType;
};

const CACHE_TTL_MS = 60_000;
let cache: { value: StripeGatewayConfig; expiresAt: number } | null = null;

const normalizeMode = (value: unknown): StripeMode => {
  const v = String(value || '').toLowerCase();
  return v === 'live' ? 'live' : 'test';
};

const normalizeConnectType = (value: unknown): StripeConnectType => {
  const v = String(value || '').toLowerCase();
  return v === 'standard' ? 'standard' : 'express';
};

const toObject = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {};

const toBoolean = (value: unknown, fallback = false) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  }
  return Boolean(value);
};

const loadFromSettings = async (): Promise<StripeGatewayConfig> => {
  const settings = await prisma.settings.findFirst({ orderBy: { updatedAt: 'desc' } });
  const providers = toObject(settings?.walletFundingProviders);
  const stripeProvider = toObject(providers.stripe);
  const legacyStripeConnectEnabled = (settings as any)?.stripeConnectEnabled;
  const legacyStripeConnectType = (settings as any)?.stripeConnectType;

  const mode = normalizeMode(
    stripeProvider.environment || stripeProvider.mode || (settings?.paymentTestMode ? 'test' : 'live')
  );
  const secretKey = maybeDecryptSecret(stripeProvider.secretKey || settings?.paymentStripeSecret || '');
  const webhookSecret = maybeDecryptSecret(stripeProvider.webhookSecret || '');
  const publishableKey = String(stripeProvider.publishableKey || settings?.paymentStripeKey || '');
  const enabled = toBoolean(stripeProvider.enabled, Boolean(secretKey));
  const connectEnabledEnvFallback = toBoolean(
    process.env.STRIPE_CONNECT_ENABLED ?? process.env.STRIPE_CONNECT_PAYOUTS_ENABLED,
    false
  );
  const connectEnabled = toBoolean(
    stripeProvider.connectEnabled ?? stripeProvider.connect_enabled ?? legacyStripeConnectEnabled,
    connectEnabledEnvFallback
  );
  const connectType = normalizeConnectType(
    stripeProvider.connectType ||
      stripeProvider.accountType ||
      legacyStripeConnectType ||
      process.env.STRIPE_CONNECT_TYPE ||
      'express'
  );

  return {
    enabled,
    mode,
    publishableKey,
    secretKey,
    webhookSecret,
    connectEnabled,
    connectType
  };
};

export const invalidateStripeConfigCache = () => {
  cache = null;
};

export const getStripeGatewayConfig = async (): Promise<StripeGatewayConfig> => {
  if (cache && cache.expiresAt > Date.now()) return cache.value;
  const value = await loadFromSettings();
  cache = { value, expiresAt: Date.now() + CACHE_TTL_MS };
  return value;
};

export const getStripeClient = async (): Promise<Stripe | null> => {
  const cfg = await getStripeGatewayConfig();
  if (!cfg.enabled || !cfg.secretKey) return null;
  return new Stripe(cfg.secretKey, { apiVersion: '2023-10-16' as any });
};

export const requireStripeClient = async (): Promise<Stripe> => {
  const client = await getStripeClient();
  if (!client) {
    throw new Error('Stripe is not configured or disabled');
  }
  return client;
};
