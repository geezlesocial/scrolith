import { Request, Response } from 'express';
import Stripe from 'stripe';
import prisma from '../utils/prismaClient';
import { initiateHostedCheckout, parseNotification } from '../services/payments/providers/payoneer';
import { findOrderPaymentIntentByReference, settleOrderPaymentIntent } from '../services/orderPayments';
import { encryptSecret, maybeDecryptSecret } from '../utils/secretCipher';
import { getStripeClient, getStripeGatewayConfig, invalidateStripeConfigCache } from '../services/stripeConfig.service';
import { handleStripeConnectWebhookEvent } from './payouts.stripe.controller';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email?: string;
    role?: string;
    country?: string | null;
    kycStatus?: string | null;
  };
}

const nowIso = () => new Date().toISOString();

const serializePayload = (p: unknown) => {
  try {
    return JSON.parse(JSON.stringify(p));
  } catch (e) {
    return null;
  }
};

const ok = <T>(res: Response, data: T) => res.json({ success: true, data, timestamp: nowIso() });

const fail = (res: Response, status: number, message: string, code = 'ERR_WALLET_TOPUP') =>
  res.status(status).json({ success: false, error: message, code, timestamp: nowIso() });

const getAuthUser = (req: Request) => req.user as AuthRequest['user'] | undefined;

const getOrCreateSettings = async () => {
  let settings = await prisma.settings.findFirst({ orderBy: { updatedAt: 'desc' } });
  if (!settings) {
    settings = await prisma.settings.create({ data: {} });
  }
  return settings;
};

const getOrCreateWallet = async (userId: string) => {
  const existing = await prisma.wallet.findUnique({ where: { userId } });
  if (existing) return existing;

  // ensure user exists locally for wallet relation
  const ensureUserExists = async (id: string) => {
    const user = await prisma.user.findUnique({ where: { id } });
    if (user) return user;
    const safeLocal = id.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 32) || 'user';
    const email = `${safeLocal}@local.dev`;
    return prisma.user.create({ data: { id, email, role: 'USER', isActive: true, isVerified: false } });
  };

  await ensureUserExists(userId);

  return prisma.wallet.create({
    data: {
      userId,
      balance: 0,
      pendingClearance: 0,
      escrowBalance: 0,
      frozen: false,
      currency: 'USD'
    }
  });

};

const defaultRouting = [{ country: '*', currency: '*', providers: ['stripe', 'paypal'] }];
const normalizeRouting = (routing: any) => {
  if (Array.isArray(routing)) return routing;
  return defaultRouting;
};

const normalizeProvidersConfig = (settings: any) => {
  if (settings?.walletFundingProviders && typeof settings.walletFundingProviders === 'object') {
    return settings.walletFundingProviders as Record<string, any>;
  }
  return {};
};

const toBoolean = (value: unknown, fallback = false) => {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  }
  return Boolean(value);
};

const getProviderConfig = (provider: string, settings: any) => {
  const config = normalizeProvidersConfig(settings);
  const entry = config?.[provider] || {};

  if (provider === 'stripe') {
    const connectEnabled = toBoolean(
      entry?.connectEnabled ??
        entry?.connect_enabled ??
        (settings as any)?.stripeConnectEnabled ??
        process.env.STRIPE_CONNECT_ENABLED ??
        process.env.STRIPE_CONNECT_PAYOUTS_ENABLED,
      false
    );
    return {
      enabled: entry?.enabled ?? true,
      secretKey: maybeDecryptSecret(entry?.secretKey || process.env.STRIPE_SECRET_KEY),
      webhookSecret: maybeDecryptSecret(entry?.webhookSecret || process.env.STRIPE_WEBHOOK_SECRET),
      connectEnabled,
      connectType:
        String(
          entry?.connectType ||
            entry?.accountType ||
            (settings as any)?.stripeConnectType ||
            process.env.STRIPE_CONNECT_TYPE ||
            'express'
        ).toLowerCase() === 'standard'
          ? 'standard'
          : 'express'
    };
  }

  if (provider === 'paypal') {
    return {
      enabled: entry?.enabled ?? false,
      clientId: entry?.clientId || settings?.paymentPaypalClientId || process.env.PAYPAL_CLIENT_ID,
      clientSecret: maybeDecryptSecret(entry?.clientSecret || settings?.paymentPaypalSecret || process.env.PAYPAL_SECRET),
      environment: entry?.environment || process.env.PAYPAL_ENV || 'sandbox'
    };
  }

  if (provider === 'paystack') {
    return {
      enabled: entry?.enabled ?? false,
      secretKey: maybeDecryptSecret(entry?.secretKey || process.env.PAYSTACK_SECRET_KEY)
    };
  }

  if (provider === 'flutterwave') {
    return {
      enabled: entry?.enabled ?? false,
      secretKey: maybeDecryptSecret(entry?.secretKey || process.env.FLUTTERWAVE_SECRET_KEY)
    };
  }

  if (provider === 'paymongo') {
    return {
      enabled: entry?.enabled ?? false,
      secretKey: maybeDecryptSecret(entry?.secretKey || process.env.PAYMONGO_SECRET_KEY)
    };
  }

  if (provider === 'xendit') {
    return {
      enabled: entry?.enabled ?? false,
      secretKey: maybeDecryptSecret(entry?.secretKey || process.env.XENDIT_SECRET_KEY),
      callbackToken: maybeDecryptSecret(entry?.callbackToken || process.env.XENDIT_CALLBACK_TOKEN)
    };
  }

  if (provider === 'monnify') {
    return {
      enabled: entry?.enabled ?? false,
      apiKey: maybeDecryptSecret(entry?.apiKey || process.env.MONNIFY_API_KEY),
      secretKey: maybeDecryptSecret(entry?.secretKey || process.env.MONNIFY_SECRET_KEY),
      contractCode: maybeDecryptSecret(entry?.contractCode || process.env.MONNIFY_CONTRACT_CODE)
    };
  }

  if (provider === 'opay') {
    return {
      enabled: entry?.enabled ?? false,
      merchantId: maybeDecryptSecret(entry?.merchantId || process.env.OPAY_MERCHANT_ID),
      secretKey: maybeDecryptSecret(entry?.secretKey || process.env.OPAY_SECRET_KEY)
    };
  }

  if (provider === 'dragonpay') {
    return {
      enabled: entry?.enabled ?? false,
      merchantId: maybeDecryptSecret(entry?.merchantId || process.env.DRAGONPAY_MERCHANT_ID),
      secretKey: maybeDecryptSecret(entry?.secretKey || process.env.DRAGONPAY_SECRET_KEY)
    };
  }

  if (provider === 'payoneer') {
    return {
      enabled: entry?.enabled ?? false,
      clientId: entry?.clientId || process.env.PAYONEER_CLIENT_ID,
      clientSecret: maybeDecryptSecret(entry?.clientSecret || process.env.PAYONEER_CLIENT_SECRET),
      programId: entry?.programId || process.env.PAYONEER_PROGRAM_ID,
      apiBaseUrl: entry?.apiBaseUrl || process.env.PAYONEER_API_BASE_URL,
      authToken: maybeDecryptSecret(entry?.authToken || process.env.PAYONEER_AUTH_TOKEN),
      notificationSecret: maybeDecryptSecret(entry?.notificationSecret || process.env.PAYONEER_NOTIFICATION_SECRET),
      createSessionPath: entry?.createSessionPath || process.env.PAYONEER_CREATE_SESSION_PATH || '/checkout/hosted/session'
    };
  }

  return {
    enabled: entry?.enabled ?? false
  };
};

const normalizeLimits = (settings: any) => {
  if (settings?.walletFundingLimits && typeof settings.walletFundingLimits === 'object') {
    return settings.walletFundingLimits as Record<string, any>;
  }
  return {};
};

const isProviderEnabled = (provider: string, settings: any) => {
  const config = getProviderConfig(provider, settings);
  if (config?.enabled === false) return false;
  if (config?.enabled === true) return true;
  if (provider === 'stripe') return Boolean(config?.secretKey || settings?.paymentStripeSecret);
  if (provider === 'paypal') return Boolean(config?.clientId && config?.clientSecret);
  if (provider === 'paystack') return Boolean(config?.secretKey);
  if (provider === 'flutterwave') return Boolean(config?.secretKey);
  if (provider === 'paymongo') return Boolean(config?.secretKey);
  if (provider === 'xendit') return Boolean(config?.secretKey);
  if (provider === 'monnify') return Boolean(config?.apiKey && config?.secretKey && config?.contractCode);
  if (provider === 'opay') return Boolean(config?.merchantId && config?.secretKey);
  if (provider === 'dragonpay') return Boolean(config?.merchantId && config?.secretKey);
  if (provider === 'payoneer') return Boolean(config?.clientId && config?.clientSecret);
  return false;
};

const selectProvider = (country: string, currency: string, settings: any) => {
  const routing = normalizeRouting(settings?.walletFundingRouting);
  const normalizedCountry = (country || '*').toUpperCase();
  const normalizedCurrency = (currency || '*').toUpperCase();

  const candidates = routing.filter((rule: any) => {
    const ruleCountry = (rule.country || '*').toUpperCase();
    const ruleCurrency = (rule.currency || '*').toUpperCase();
    const countryMatch = ruleCountry === '*' || ruleCountry === normalizedCountry;
    const currencyMatch = ruleCurrency === '*' || ruleCurrency === normalizedCurrency;
    return countryMatch && currencyMatch;
  });

  for (const rule of candidates) {
    const providers = Array.isArray(rule.providers) ? rule.providers : [];
    for (const provider of providers) {
      if (isProviderEnabled(provider, settings)) {
        return provider;
      }
    }
  }
  return null;
};

const paymentGatewayCatalog = [
  {
    id: 'stripe',
    name: 'Stripe',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/b/ba/Stripe_Logo%2C_revised_2016.svg',
    supported_currencies: ['USD', 'EUR', 'GBP', 'SGD', 'INR']
  },
  {
    id: 'paypal',
    name: 'PayPal',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/b/b5/PayPal.svg',
    supported_currencies: ['USD', 'EUR', 'GBP', 'PHP', 'SGD']
  },
  {
    id: 'paystack',
    name: 'Paystack',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/0/01/Paystack_Logo.png',
    supported_currencies: ['NGN', 'GHS', 'ZAR']
  },
  {
    id: 'flutterwave',
    name: 'Flutterwave',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/2/23/Flutterwave_Logo.png',
    supported_currencies: ['NGN', 'KES', 'RWF', 'UGX', 'USD']
  },
  {
    id: 'payoneer',
    name: 'Payoneer',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/3/37/Payoneer_logo.svg',
    supported_currencies: ['USD', 'EUR', 'GBP']
  },
  {
    id: 'paymongo',
    name: 'PayMongo',
    logo: 'https://images.crunchbase.com/image/upload/c_lpad,f_auto,q_auto:eco,dpr_1/vqw48yd4k3z5b9x8x3x8',
    supported_currencies: ['PHP']
  },
  {
    id: 'monnify',
    name: 'Monnify',
    logo: 'https://monnify.com/images/logo.svg',
    supported_currencies: ['NGN']
  },
  {
    id: 'opay',
    name: 'OPay Checkout',
    logo: 'https://opayweb.com/static/img/logo.png',
    supported_currencies: ['NGN', 'EGP']
  },
  {
    id: 'xendit',
    name: 'Xendit',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/9/9a/Xendit_logo.png',
    supported_currencies: ['IDR', 'PHP', 'VND']
  },
  {
    id: 'dragonpay',
    name: 'Dragonpay',
    logo: 'https://www.dragonpay.ph/wp-content/uploads/2018/05/Dragonpay-Logo-Small.png',
    supported_currencies: ['PHP']
  }
];

const secretFieldMap: Record<string, string[]> = {
  stripe: ['secretKey', 'webhookSecret'],
  paypal: ['clientSecret'],
  paystack: ['secretKey'],
  flutterwave: ['secretKey'],
  paymongo: ['secretKey'],
  xendit: ['secretKey', 'callbackToken'],
  monnify: ['apiKey', 'secretKey', 'contractCode'],
  opay: ['merchantId', 'secretKey'],
  dragonpay: ['merchantId', 'secretKey'],
  payoneer: ['clientSecret', 'authToken', 'notificationSecret']
};

const sanitizeConfigForAdmin = (providerId: string, entry: any) => {
  const secretFields = secretFieldMap[providerId] || [];
  const sanitized: any = { ...(entry || {}) };
  secretFields.forEach((key) => {
    const value = entry?.[key];
    if (value) {
      sanitized[key] = '';
      sanitized[`has_${key}`] = true;
      sanitized[`has${key.charAt(0).toUpperCase()}${key.slice(1)}`] = true;
    } else {
      sanitized[`has_${key}`] = false;
      sanitized[`has${key.charAt(0).toUpperCase()}${key.slice(1)}`] = false;
    }
  });
  return sanitized;
};

const mapGateway = (gateway: any, settings: any) => {
  const config = normalizeProvidersConfig(settings);
  const entry = config?.[gateway.id] || {};
  const enabled = entry?.enabled ?? false;
  const explicitEnv = entry?.environment || entry?.mode;
  const resolvedMode = explicitEnv ? (explicitEnv === 'live' ? 'live' : 'test') : (settings?.paymentTestMode ? 'test' : 'live');
  const sanitizedConfig = sanitizeConfigForAdmin(gateway.id, entry);

  if (gateway.id === 'stripe') {
    const rawConnectEnabled = sanitizedConfig.connectEnabled ?? sanitizedConfig.connect_enabled;
    sanitizedConfig.environment =
      sanitizedConfig.environment || sanitizedConfig.mode || (resolvedMode === 'live' ? 'live' : 'sandbox');
    sanitizedConfig.connectEnabled = toBoolean(rawConnectEnabled, false);
    sanitizedConfig.connectType =
      String(
        sanitizedConfig.connectType ||
          sanitizedConfig.accountType ||
          (settings as any)?.stripeConnectType ||
          process.env.STRIPE_CONNECT_TYPE ||
          'express'
      ).toLowerCase() === 'standard'
        ? 'standard'
        : 'express';
  }

  return {
    ...gateway,
    logo: entry?.logo || gateway.logo,
    is_enabled: Boolean(enabled),
    isEnabled: Boolean(enabled),
    mode: resolvedMode,
    config: sanitizedConfig
  };
};

export const listFundingGatewaysAdmin = async (req: Request, res: Response) => {
  try {
    const settings = await getOrCreateSettings();
    const data = paymentGatewayCatalog.map((gw) => mapGateway(gw, settings));
    return ok(res, data);
  } catch (error: any) {
    console.error('Failed to load payment gateways:', error);
    return fail(res, 500, error?.message || 'Failed to load gateways', 'ERR_GATEWAYS');
  }
};

export const listFundingGatewaysPublic = async (req: Request, res: Response) => {
  try {
    const settings = await getOrCreateSettings();
    const data = paymentGatewayCatalog
      .map((gw) => mapGateway(gw, settings))
      .filter((gw) => Boolean(gw.is_enabled ?? gw.isEnabled))
      .map((gw) => {
        const { config, ...rest } = gw as any;
        return rest;
      });
    return ok(res, data);
  } catch (error: any) {
    console.error('Failed to load public gateways:', error);
    return fail(res, 500, error?.message || 'Failed to load gateways', 'ERR_GATEWAYS_PUBLIC');
  }
};

export const saveFundingGatewaysAdmin = async (req: Request, res: Response) => {
  try {
    const settings = await getOrCreateSettings();
    const payload = req.body || {};
    const incoming = Array.isArray(payload) ? payload : Array.isArray(payload.gateways) ? payload.gateways : [payload];
    const existing = normalizeProvidersConfig(settings);

    const allowedFields: Record<string, string[]> = {
      stripe: ['enabled', 'publishableKey', 'secretKey', 'webhookSecret', 'logo', 'environment', 'connectEnabled', 'connectType'],
      paypal: ['enabled', 'clientId', 'clientSecret', 'environment', 'logo'],
      paystack: ['enabled', 'secretKey', 'logo'],
      flutterwave: ['enabled', 'secretKey', 'logo'],
      paymongo: ['enabled', 'secretKey', 'logo'],
      xendit: ['enabled', 'secretKey', 'callbackToken', 'logo'],
      monnify: ['enabled', 'apiKey', 'secretKey', 'contractCode', 'logo'],
      opay: ['enabled', 'merchantId', 'secretKey', 'logo', 'environment'],
      dragonpay: ['enabled', 'merchantId', 'secretKey', 'logo'],
      payoneer: ['enabled', 'clientId', 'clientSecret', 'programId', 'apiBaseUrl', 'authToken', 'notificationSecret', 'createSessionPath', 'logo']
    };
    const requiredFields: Record<string, string[]> = {
      stripe: ['secretKey'],
      paypal: ['clientId', 'clientSecret'],
      paystack: ['secretKey'],
      flutterwave: ['secretKey'],
      paymongo: ['secretKey'],
      xendit: ['secretKey'],
      monnify: ['apiKey', 'secretKey', 'contractCode'],
      opay: ['merchantId', 'secretKey'],
      dragonpay: ['merchantId', 'secretKey'],
      payoneer: ['clientId', 'clientSecret', 'apiBaseUrl', 'authToken']
    };

    const updatedProviders = { ...existing };
    for (const item of incoming) {
      if (!item?.id) continue;
      const providerId = item.id;
      const allow = allowedFields[providerId] || ['enabled', 'logo'];
      const current = existing[providerId] || {};
      const next = { ...current };

      const enabled = Boolean(item.isEnabled ?? item.is_enabled ?? item.enabled ?? current.enabled ?? false);
      next.enabled = enabled;

      const config = item.config && typeof item.config === 'object' ? item.config : {};
      const payloadConfig = { ...item, ...config };

      for (const key of allow) {
        if (key === 'enabled') continue;
        if (payloadConfig[key] === undefined) continue;
        if (typeof payloadConfig[key] === 'string' && payloadConfig[key].trim() === '') continue;
        const rawValue = payloadConfig[key];
        const shouldEncrypt = (secretFieldMap[providerId] || []).includes(key) && typeof rawValue === 'string';
        next[key] = shouldEncrypt ? encryptSecret(rawValue) : rawValue;
      }

      if (next.enabled) {
        const required = requiredFields[providerId] || [];
        const legacyFallbacks: Record<string, any> = {
          stripe: {
            secretKey: settings?.paymentStripeSecret,
            publishableKey: settings?.paymentStripeKey
          },
          paypal: {
            clientId: settings?.paymentPaypalClientId,
            clientSecret: settings?.paymentPaypalSecret
          }
        };
        const legacy = legacyFallbacks[providerId] || {};
        const missing = required.filter((field) => !next[field] && !legacy[field]);
        if (missing.length) {
          return fail(res, 400, `Missing required credentials for ${providerId}: ${missing.join(', ')}`, 'ERR_GATEWAY_CONFIG');
        }
      }

      updatedProviders[providerId] = next;
    }

    await prisma.settings.update({
      where: { id: settings.id },
      data: { walletFundingProviders: updatedProviders }
    });
    invalidateStripeConfigCache();

    const data = paymentGatewayCatalog.map((gw) => mapGateway(gw, { ...settings, walletFundingProviders: updatedProviders }));
    return ok(res, data);
  } catch (error: any) {
    console.error('Failed to save payment gateways:', error);
    return fail(res, 500, error?.message || 'Failed to save gateways', 'ERR_GATEWAYS_SAVE');
  }
};

const validateLimits = (amount: number, settings: any, user: AuthRequest['user']) => {
  const limits = normalizeLimits(settings);
  const min = Number(limits?.minTopup ?? 1);
  const max = Number(limits?.maxTopup ?? 100000);
  const kycThreshold = Number(limits?.kycRequiredAbove ?? 0);

  if (amount < min) return `Minimum top-up is ${min}`;
  if (amount > max) return `Maximum top-up is ${max}`;
  if (kycThreshold > 0 && amount >= kycThreshold) {
    if ((user?.kycStatus || '').toString().toUpperCase() !== 'VERIFIED') {
      return 'KYC verification required for this amount';
    }
  }
  return null;
};

const getPaypalBaseUrl = (environment: string) =>
  environment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

const getPaymongoBaseUrl = () => 'https://api.paymongo.com';
const getXenditBaseUrl = () => 'https://api.xendit.co';
const getMonnifyBaseUrl = () => 'https://api.monnify.com';
const getOpayBaseUrl = () => process.env.OPAY_BASE_URL || 'https://api.opaycheckout.com';
const getDragonpayBaseUrl = () => process.env.DRAGONPAY_BASE_URL || 'https://gw.dragonpay.ph/Pay.aspx';

const fetchJson = async (url: string, options: any) => {
  const response = await fetch(url, options);
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const message = data?.message || data?.error_description || data?.error || `Request failed (${response.status})`;
    throw new Error(message);
  }
  return data;
};

const findIntentByReference = async (provider: string, providerReferenceId: string) => {
  return prisma.walletFundingIntent.findFirst({
    where: {
      provider,
      providerReferenceId
    }
  });
};

const settleWalletFundingIntent = async (
  intentId: string,
  provider: string,
  providerReferenceId: string,
  status: 'succeeded' | 'failed',
  rawEvent: any
) => {
  return prisma.$transaction(async (tx) => {
    const intent = await tx.walletFundingIntent.findUnique({ where: { id: intentId } });
    if (!intent) {
      throw new Error('Funding intent not found');
    }

    if (intent.status === 'succeeded') {
      return intent;
    }

    const existingSettlement = await tx.paymentSettlement.findUnique({
      where: {
        provider_providerReferenceId: {
          provider,
          providerReferenceId
        }
      }
    });
    if (existingSettlement) {
      return intent;
    }

    await tx.paymentSettlement.create({
      data: {
        provider,
        providerReferenceId,
        intentId
      }
    });

    const updatedIntent = await tx.walletFundingIntent.update({
      where: { id: intentId },
      data: {
        status,
        providerReferenceId,
        providerPayload: rawEvent
      }
    });

    if (status === 'succeeded') {
      const wallet = await tx.wallet.update({
        where: { id: intent.walletId },
        data: { balance: { increment: intent.amount } }
      });

      await tx.transaction.create({
        data: {
          userId: intent.userId,
          walletId: wallet.id,
          type: 'DEPOSIT',
          amount: intent.amount,
          status: 'CLEARED',
          currency: intent.currency,
          description: `Wallet top-up via ${provider}`,
          referenceId: `${provider}:${providerReferenceId}`
        }
      });
    }

    return updatedIntent;
  });
};

export const listWalletTopupProviders = async (req: AuthRequest, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.id) return fail(res, 401, 'Unauthorized', 'ERR_UNAUTHORIZED');

    const settings = await getOrCreateSettings();
    if (settings.walletFundingEnabled === false) {
      return ok(res, { providers: [], recommended: null });
    }

    const currency = (req.query.currency as string) || settings.paymentCurrency || 'USD';
    const country = (req.query.country as string) || user.country || 'US';
    const config = normalizeProvidersConfig(settings);
    const configuredIds = Object.keys(config || {});

    if (configuredIds.length > 0) {
      const enabledProviders = configuredIds.filter((id) => isProviderEnabled(id, settings));
      const recommended = enabledProviders[0] || null;
      return ok(res, {
        providers: enabledProviders,
        recommended
      });
    }

    const routing = normalizeRouting(settings.walletFundingRouting);
    const recommended = selectProvider(country, currency, settings);

    const providers = routing
      .filter((rule: any) => {
        const ruleCountry = (rule.country || '*').toUpperCase();
        const ruleCurrency = (rule.currency || '*').toUpperCase();
        const countryMatch = ruleCountry === '*' || ruleCountry === country.toUpperCase();
        const currencyMatch = ruleCurrency === '*' || ruleCurrency === currency.toUpperCase();
        return countryMatch && currencyMatch;
      })
      .flatMap((rule: any) => (Array.isArray(rule.providers) ? rule.providers : []))
      .filter((provider: string) => isProviderEnabled(provider, settings));

    const uniqueProviders = Array.from(new Set(providers));

    return ok(res, {
      providers: uniqueProviders,
      recommended
    });
  } catch (error: any) {
    console.error('List wallet topup providers error:', error);
    return fail(res, 500, error?.message || 'Failed to load providers', 'ERR_INTERNAL');
  }
};

export const initiateWalletTopup = async (req: AuthRequest, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.id) return fail(res, 401, 'Unauthorized', 'ERR_UNAUTHORIZED');

    const settings = await getOrCreateSettings();
    if (settings.walletFundingEnabled === false) {
      return fail(res, 403, 'Wallet funding is disabled', 'ERR_DISABLED');
    }

    const amount = Number(req.body?.amount ?? 0);
    if (!amount || Number.isNaN(amount) || amount <= 0) {
      return fail(res, 400, 'Amount must be greater than zero', 'ERR_BAD_REQUEST');
    }

    const wallet = await getOrCreateWallet(user.id);
    if (wallet.frozen) {
      return fail(res, 403, 'Wallet is frozen', 'ERR_FORBIDDEN');
    }

    const currency = (req.body?.currency || wallet.currency || settings.paymentCurrency || 'USD').toString().toUpperCase();
    const country = (req.body?.country || user.country || 'US').toString().toUpperCase();
    const requestedProvider = (req.body?.provider || 'auto').toString().toLowerCase();

    const limitError = validateLimits(amount, settings, user);
    if (limitError) {
      return fail(res, 400, limitError, 'ERR_LIMIT');
    }

    let provider = requestedProvider;
    if (requestedProvider === 'auto') {
      provider = selectProvider(country, currency, settings) || '';
    }

    if (!provider) {
      return fail(res, 400, 'No payment provider available for this region/currency', 'ERR_NO_PROVIDER');
    }

    if (!isProviderEnabled(provider, settings)) {
      return fail(res, 400, 'Selected provider is not enabled', 'ERR_PROVIDER_DISABLED');
    }

    const intent = await prisma.walletFundingIntent.create({
      data: {
        userId: user.id,
        walletId: wallet.id,
        provider,
        amount,
        currency,
        country,
        status: 'initiated'
      }
    });

    if (provider === 'stripe') {
      const frontendBase = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';
      const role = (user.role || '').toString().toLowerCase();
      const dashboardPath = role.includes('freelancer') || role.includes('seller')
        ? '/freelancer/dashboard'
        : '/client/dashboard';
      const successUrl = `${frontendBase}${dashboardPath}?tab=wallet&topup_intent=${intent.id}&topup_status=success`;
      const cancelUrl = `${frontendBase}${dashboardPath}?tab=wallet&topup_intent=${intent.id}&topup_status=cancel`;

      const stripeClient = await getStripeClient();
      if (!stripeClient) {
        return fail(res, 400, 'Stripe is not configured', 'ERR_PROVIDER_CONFIG');
      }
      const session = await stripeClient.checkout.sessions.create({
        mode: 'payment',
        success_url: successUrl,
        cancel_url: cancelUrl,
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: currency.toLowerCase(),
              unit_amount: Math.round(amount * 100),
              product_data: {
                name: 'Scrolith Wallet Top-up'
              }
            },
            quantity: 1
          }
        ],
        metadata: {
          walletFundingIntentId: intent.id,
          userId: user.id
        }
      });

      await prisma.walletFundingIntent.update({
        where: { id: intent.id },
        data: {
          status: 'pending',
          providerReferenceId: session.id,
          providerCheckoutUrl: session.url || null,
          providerPayload: serializePayload(session)
        }
      });

      return ok(res, {
        intent_id: intent.id,
        provider,
        redirect_url: session.url
      });
    }

    if (provider === 'paypal') {
      const config = getProviderConfig('paypal', settings);
      if (!config?.clientId || !config?.clientSecret) {
        return fail(res, 400, 'PayPal is not configured', 'ERR_PROVIDER_CONFIG');
      }

      const baseUrl = getPaypalBaseUrl(config.environment || 'sandbox');
      const token = await fetchJson(`${baseUrl}/v1/oauth2/token`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
      });

      const frontendBase = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';
      const role = (user.role || '').toString().toLowerCase();
      const dashboardPath = role.includes('freelancer') || role.includes('seller')
        ? '/freelancer/dashboard'
        : '/client/dashboard';
      const successUrl = `${frontendBase}${dashboardPath}?tab=wallet&topup_intent=${intent.id}&topup_status=success`;
      const cancelUrl = `${frontendBase}${dashboardPath}?tab=wallet&topup_intent=${intent.id}&topup_status=cancel`;

      const order = await fetchJson(`${baseUrl}/v2/checkout/orders`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [
            {
              amount: {
                currency_code: currency,
                value: amount.toFixed(2)
              },
              custom_id: intent.id
            }
          ],
          application_context: {
            return_url: successUrl,
            cancel_url: cancelUrl
          }
        })
      });

      const approveLink = (order.links || []).find((link: any) => link.rel === 'approve');
      await prisma.walletFundingIntent.update({
        where: { id: intent.id },
        data: {
          status: 'pending',
          providerReferenceId: order.id,
          providerCheckoutUrl: approveLink?.href || null,
          providerPayload: serializePayload(order)
        }
      });

      return ok(res, {
        intent_id: intent.id,
        provider,
        redirect_url: approveLink?.href || null
      });
    }

    if (provider === 'paystack') {
      const config = getProviderConfig('paystack', settings);
      if (!config?.secretKey) {
        return fail(res, 400, 'Paystack is not configured', 'ERR_PROVIDER_CONFIG');
      }

      const frontendBase = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';
      const role = (user.role || '').toString().toLowerCase();
      const dashboardPath = role.includes('freelancer') || role.includes('seller')
        ? '/freelancer/dashboard'
        : '/client/dashboard';
      const callbackUrl = `${frontendBase}${dashboardPath}?tab=wallet&topup_intent=${intent.id}&topup_status=processing`;

      const init = await fetchJson('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.secretKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: user.email || 'user@example.com',
          amount: Math.round(amount * 100),
          currency,
          reference: intent.id,
          callback_url: callbackUrl,
          metadata: {
            walletFundingIntentId: intent.id,
            userId: user.id
          }
        })
      });

      await prisma.walletFundingIntent.update({
        where: { id: intent.id },
        data: {
          status: 'pending',
          providerReferenceId: init.data?.reference || intent.id,
          providerCheckoutUrl: init.data?.authorization_url || null,
          providerPayload: serializePayload(init)
        }
      });

      return ok(res, {
        intent_id: intent.id,
        provider,
        redirect_url: init.data?.authorization_url || null
      });
    }

    if (provider === 'flutterwave') {
      const config = getProviderConfig('flutterwave', settings);
      if (!config?.secretKey) {
        return fail(res, 400, 'Flutterwave is not configured', 'ERR_PROVIDER_CONFIG');
      }

      const frontendBase = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';
      const role = (user.role || '').toString().toLowerCase();
      const dashboardPath = role.includes('freelancer') || role.includes('seller')
        ? '/freelancer/dashboard'
        : '/client/dashboard';
      const redirectUrl = `${frontendBase}${dashboardPath}?tab=wallet&topup_intent=${intent.id}&topup_status=processing`;

      const init = await fetchJson('https://api.flutterwave.com/v3/payments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.secretKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tx_ref: intent.id,
          amount,
          currency,
          redirect_url: redirectUrl,
          customer: {
            email: user.email || 'user@example.com',
            name: user.email ? user.email.split('@')[0] : 'Scrolith User'
          },
          meta: {
            walletFundingIntentId: intent.id,
            userId: user.id
          }
        })
      });

      await prisma.walletFundingIntent.update({
        where: { id: intent.id },
        data: {
          status: 'pending',
          providerReferenceId: init.data?.tx_ref || intent.id,
          providerCheckoutUrl: init.data?.link || null,
          providerPayload: serializePayload(init)
        }
      });

      return ok(res, {
        intent_id: intent.id,
        provider,
        redirect_url: init.data?.link || null
      });
    }

    if (provider === 'paymongo') {
      const config = getProviderConfig('paymongo', settings);
      if (!config?.secretKey) {
        return fail(res, 400, 'PayMongo is not configured', 'ERR_PROVIDER_CONFIG');
      }

      const init = await fetchJson(`${getPaymongoBaseUrl()}/v1/links`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.secretKey}:`).toString('base64')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          data: {
            attributes: {
              amount: Math.round(amount * 100),
              description: 'Scrolith Wallet Top-up',
              remarks: intent.id,
              currency
            }
          }
        })
      });

      const checkoutUrl = init?.data?.attributes?.checkout_url || null;
      const referenceId = init?.data?.id || null;

      await prisma.walletFundingIntent.update({
        where: { id: intent.id },
        data: {
          status: 'pending',
          providerReferenceId: referenceId,
          providerCheckoutUrl: checkoutUrl,
          providerPayload: serializePayload(init)
        }
      });

      return ok(res, {
        intent_id: intent.id,
        provider,
        redirect_url: checkoutUrl
      });
    }

    if (provider === 'xendit') {
      const config = getProviderConfig('xendit', settings);
      if (!config?.secretKey) {
        return fail(res, 400, 'Xendit is not configured', 'ERR_PROVIDER_CONFIG');
      }

      const init = await fetchJson(`${getXenditBaseUrl()}/v2/invoices`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.secretKey}:`).toString('base64')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          external_id: intent.id,
          amount,
          payer_email: user.email || 'user@example.com',
          description: 'Scrolith Wallet Top-up',
          currency
        })
      });

      const checkoutUrl = init?.invoice_url || null;
      const referenceId = init?.id || null;

      await prisma.walletFundingIntent.update({
        where: { id: intent.id },
        data: {
          status: 'pending',
          providerReferenceId: referenceId,
          providerCheckoutUrl: checkoutUrl,
          providerPayload: serializePayload(init)
        }
      });

      return ok(res, {
        intent_id: intent.id,
        provider,
        redirect_url: checkoutUrl
      });
    }

    if (provider === 'monnify') {
      const config = getProviderConfig('monnify', settings);
      if (!config?.apiKey || !config?.secretKey || !config?.contractCode) {
        return fail(res, 400, 'Monnify is not configured', 'ERR_PROVIDER_CONFIG');
      }

      const token = await fetchJson(`${getMonnifyBaseUrl()}/api/v1/auth/login`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.apiKey}:${config.secretKey}`).toString('base64')}`
        }
      });

      const frontendBase = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';
      const role = (user.role || '').toString().toLowerCase();
      const dashboardPath = role.includes('freelancer') || role.includes('seller')
        ? '/freelancer/dashboard'
        : '/client/dashboard';
      const redirectUrl = `${frontendBase}${dashboardPath}?tab=wallet&topup_intent=${intent.id}&topup_status=processing`;

      const init = await fetchJson(`${getMonnifyBaseUrl()}/api/v1/merchant/transactions/init-transaction`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.responseBody?.accessToken || token.accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount,
          customerName: user.email ? user.email.split('@')[0] : 'Scrolith User',
          customerEmail: user.email || 'user@example.com',
          paymentReference: intent.id,
          currencyCode: currency,
          contractCode: config.contractCode,
          redirectUrl
        })
      });

      const checkoutUrl = init?.responseBody?.checkoutUrl || init?.responseBody?.paymentUrl || null;
      const referenceId = init?.responseBody?.transactionReference || intent.id;

      await prisma.walletFundingIntent.update({
        where: { id: intent.id },
        data: {
          status: 'pending',
          providerReferenceId: referenceId,
          providerCheckoutUrl: checkoutUrl,
          providerPayload: init as any
        }
      });

      return ok(res, {
        intent_id: intent.id,
        provider,
        redirect_url: checkoutUrl
      });
    }

    if (provider === 'opay') {
      const config = getProviderConfig('opay', settings);
      if (!config?.merchantId || !config?.secretKey) {
        return fail(res, 400, 'OPay is not configured', 'ERR_PROVIDER_CONFIG');
      }

      const frontendBase = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';
      const role = (user.role || '').toString().toLowerCase();
      const dashboardPath = role.includes('freelancer') || role.includes('seller')
        ? '/freelancer/dashboard'
        : '/client/dashboard';
      const redirectUrl = `${frontendBase}${dashboardPath}?tab=wallet&topup_intent=${intent.id}&topup_status=processing`;

      const init = await fetchJson(`${getOpayBaseUrl()}/api/v1/international/cashier`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          merchantId: config.merchantId,
          amount,
          currency,
          reference: intent.id,
          callbackUrl: redirectUrl,
          customerEmail: user.email || 'user@example.com'
        })
      });

      const checkoutUrl = init?.data?.cashierUrl || init?.data?.checkoutUrl || null;
      const referenceId = init?.data?.reference || intent.id;

      await prisma.walletFundingIntent.update({
        where: { id: intent.id },
        data: {
          status: 'pending',
          providerReferenceId: referenceId,
          providerCheckoutUrl: checkoutUrl,
          providerPayload: init as any
        }
      });

      return ok(res, {
        intent_id: intent.id,
        provider,
        redirect_url: checkoutUrl
      });
    }

    if (provider === 'dragonpay') {
      const config = getProviderConfig('dragonpay', settings);
      if (!config?.merchantId || !config?.secretKey) {
        return fail(res, 400, 'Dragonpay is not configured', 'ERR_PROVIDER_CONFIG');
      }

      const email = user.email || 'user@example.com';
      const description = encodeURIComponent('Scrolith Wallet Top-up');
      const redirectUrl = `${getDragonpayBaseUrl()}?merchantid=${encodeURIComponent(config.merchantId)}&txnid=${encodeURIComponent(intent.id)}&amount=${encodeURIComponent(amount.toFixed(2))}&ccy=${encodeURIComponent(currency)}&description=${description}&email=${encodeURIComponent(email)}`;

      await prisma.walletFundingIntent.update({
        where: { id: intent.id },
        data: {
          status: 'pending',
          providerReferenceId: intent.id,
          providerCheckoutUrl: redirectUrl,
          providerPayload: serializePayload({
            merchantId: config.merchantId,
            txnid: intent.id,
            amount,
            currency
          })
        }
      });

      return ok(res, {
        intent_id: intent.id,
        provider,
        redirect_url: redirectUrl
      });
    }

    if (provider === 'payoneer') {
      const config = getProviderConfig('payoneer', settings);
      if (!config?.apiBaseUrl || !config?.authToken) {
        return fail(res, 400, 'Payoneer is not configured', 'ERR_PROVIDER_CONFIG');
      }

      const frontendBase = process.env.FRONTEND_URL || process.env.APP_URL || 'http://localhost:3000';
      const role = (user.role || '').toString().toLowerCase();
      const dashboardPath = role.includes('freelancer') || role.includes('seller')
        ? '/freelancer/dashboard'
        : '/client/dashboard';
      const successUrl = `${frontendBase}${dashboardPath}?tab=wallet&topup_intent=${intent.id}&topup_status=success`;
      const cancelUrl = `${frontendBase}${dashboardPath}?tab=wallet&topup_intent=${intent.id}&topup_status=cancel`;
      const notifyUrl = `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/payments/payoneer/notify?token=${encodeURIComponent(config.notificationSecret || '')}`;

      const session = await initiateHostedCheckout({
        amount,
        currency,
        country,
        customerEmail: user.email || 'user@example.com',
        intentId: intent.id,
        successUrl,
        cancelUrl,
        notifyUrl,
        apiBaseUrl: config.apiBaseUrl,
        authToken: config.authToken,
        createSessionPath: config.createSessionPath
      });

      await prisma.walletFundingIntent.update({
        where: { id: intent.id },
        data: {
          status: 'pending',
          providerReferenceId: session.providerReferenceId,
          providerCheckoutUrl: session.redirectUrl,
          providerPayload: serializePayload(session.raw)
        }
      });

      return ok(res, {
        intent_id: intent.id,
        provider,
        redirect_url: session.redirectUrl
      });
    }

    return fail(res, 400, `Provider ${provider} is not implemented yet`, 'ERR_PROVIDER_UNSUPPORTED');
  } catch (error: any) {
    console.error('Initiate wallet topup error:', error);
    return fail(res, 500, error?.message || 'Failed to initiate top-up', 'ERR_INTERNAL');
  }
};

export const getWalletTopupStatus = async (req: AuthRequest, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.id) return fail(res, 401, 'Unauthorized', 'ERR_UNAUTHORIZED');

    const { intentId } = req.params;
    const intent = await prisma.walletFundingIntent.findUnique({ where: { id: intentId } });
    if (!intent) return fail(res, 404, 'Funding intent not found', 'ERR_NOT_FOUND');
    if (intent.userId !== user.id) {
      return fail(res, 403, 'Not authorized', 'ERR_FORBIDDEN');
    }

    return ok(res, {
      id: intent.id,
      status: intent.status,
      provider: intent.provider,
      amount: intent.amount,
      currency: intent.currency,
      provider_reference_id: intent.providerReferenceId
    });
  } catch (error: any) {
    console.error('Get wallet topup status error:', error);
    return fail(res, 500, error?.message || 'Failed to load top-up status', 'ERR_INTERNAL');
  }
};

export const handleStripeWalletWebhook = async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;
  let event: Stripe.Event;

  try {
    const stripeConfig = await getStripeGatewayConfig();
    if (!stripeConfig.webhookSecret) {
      return res.status(400).json({ success: false, error: 'Stripe webhook secret not configured' });
    }
    const stripeClient = await getStripeClient();
    if (!stripeClient) {
      return res.status(400).json({ success: false, error: 'Stripe secret key not configured' });
    }
    event = stripeClient.webhooks.constructEvent(req.body, sig, stripeConfig.webhookSecret);
  } catch (err: any) {
    console.error('Stripe webhook signature error:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const intentId = session.metadata?.walletFundingIntentId;
      const providerReference = session.id;

      if (intentId) {
        await settleWalletFundingIntent(intentId, 'stripe', providerReference, 'succeeded', session);
      }

      const orderIntentId = session.metadata?.orderPaymentIntentId;
      if (orderIntentId) {
        try {
          await settleOrderPaymentIntent({
            provider: 'stripe',
            providerReferenceId: providerReference,
            status: 'succeeded',
            rawEvent: session,
            intentId: orderIntentId,
            stripeIntentId: session.payment_intent?.toString() || null
          });
        } catch (e) {
          console.warn('Stripe order payment settlement failed', e);
        }
      }
    }

    if (event.type === 'payment_intent.payment_failed') {
      const intent = event.data.object as Stripe.PaymentIntent;
      const intentId = intent.metadata?.walletFundingIntentId;
      const providerReference = intent.id;
      if (intentId) {
        await settleWalletFundingIntent(intentId, 'stripe', providerReference, 'failed', intent);
      }

      const orderIntentId = intent.metadata?.orderPaymentIntentId;
      if (orderIntentId) {
        try {
          await settleOrderPaymentIntent({
            provider: 'stripe',
            providerReferenceId: providerReference,
            status: 'failed',
            rawEvent: intent,
            intentId: orderIntentId,
            stripeIntentId: providerReference
          });
        } catch (e) {
          console.warn('Stripe order payment failure settlement failed', e);
        }
      }
    }

    await handleStripeConnectWebhookEvent(event);
  } catch (error: any) {
    console.error('Stripe wallet webhook processing error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Webhook processing failed' });
  }

  return res.json({ received: true });
};

export const handlePaystackWebhook = async (req: Request, res: Response) => {
  try {
    const event = req.body;
    const reference = event?.data?.reference || event?.data?.metadata?.walletFundingIntentId;
    if (!reference) return res.status(400).json({ success: false, error: 'Missing reference' });

    const orderIntent = await findOrderPaymentIntentByReference('paystack', reference);
    if (orderIntent) {
      const status = event?.data?.status === 'success' ? 'succeeded' : 'failed';
      await settleOrderPaymentIntent({
        provider: 'paystack',
        providerReferenceId: reference,
        status,
        rawEvent: event,
        intentId: orderIntent.id
      });
      return res.json({ received: true });
    }

    const settings = await getOrCreateSettings();
    const config = getProviderConfig('paystack', settings);
    if (!config?.secretKey) return res.status(400).json({ success: false, error: 'Paystack not configured' });

    const verify = await fetchJson(`https://api.paystack.co/transaction/verify/${reference}`, {
      headers: {
        Authorization: `Bearer ${config.secretKey}`
      }
    });

    const status = verify?.data?.status === 'success' ? 'succeeded' : 'failed';
    await settleWalletFundingIntent(reference, 'paystack', reference, status, verify);
    return res.json({ received: true });
  } catch (error: any) {
    console.error('Paystack webhook error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Webhook error' });
  }
};

export const handleFlutterwaveWebhook = async (req: Request, res: Response) => {
  try {
    const event = req.body;
    const txRef = event?.data?.tx_ref;
    const transactionId = event?.data?.id;
    if (!txRef || !transactionId) {
      return res.status(400).json({ success: false, error: 'Missing transaction reference' });
    }

    const orderIntent = await findOrderPaymentIntentByReference('flutterwave', txRef);
    if (orderIntent) {
      const status = event?.data?.status === 'successful' ? 'succeeded' : 'failed';
      await settleOrderPaymentIntent({
        provider: 'flutterwave',
        providerReferenceId: String(transactionId),
        status,
        rawEvent: event,
        intentId: orderIntent.id
      });
      return res.json({ received: true });
    }

    const settings = await getOrCreateSettings();
    const config = getProviderConfig('flutterwave', settings);
    if (!config?.secretKey) return res.status(400).json({ success: false, error: 'Flutterwave not configured' });

    const verify = await fetchJson(`https://api.flutterwave.com/v3/transactions/${transactionId}/verify`, {
      headers: {
        Authorization: `Bearer ${config.secretKey}`
      }
    });

    const status = verify?.data?.status === 'successful' ? 'succeeded' : 'failed';
    await settleWalletFundingIntent(txRef, 'flutterwave', String(transactionId), status, verify);
    return res.json({ received: true });
  } catch (error: any) {
    console.error('Flutterwave webhook error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Webhook error' });
  }
};

export const handlePaypalWebhook = async (req: Request, res: Response) => {
  try {
    const event = req.body;
    const resource = event?.resource;
    const orderId = resource?.id;
    if (!orderId) return res.status(400).json({ success: false, error: 'Missing order id' });

    const settings = await getOrCreateSettings();
    const config = getProviderConfig('paypal', settings);
    if (!config?.clientId || !config?.clientSecret) {
      return res.status(400).json({ success: false, error: 'PayPal not configured' });
    }

    const baseUrl = getPaypalBaseUrl(config.environment || 'sandbox');
    const token = await fetchJson(`${baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    const order = await fetchJson(`${baseUrl}/v2/checkout/orders/${orderId}`, {
      headers: {
        Authorization: `Bearer ${token.access_token}`
      }
    });

    const customId = order?.purchase_units?.[0]?.custom_id;
    if (!customId) return res.status(400).json({ success: false, error: 'Missing intent reference' });

    const orderIntent = await findOrderPaymentIntentByReference('paypal', customId);
    if (orderIntent) {
      const status = order?.status === 'COMPLETED' ? 'succeeded' : 'failed';
      await settleOrderPaymentIntent({
        provider: 'paypal',
        providerReferenceId: orderId,
        status,
        rawEvent: order,
        intentId: orderIntent.id
      });
      return res.json({ received: true });
    }

    const status = order?.status === 'COMPLETED' ? 'succeeded' : 'failed';
    await settleWalletFundingIntent(customId, 'paypal', orderId, status, order);
    return res.json({ received: true });
  } catch (error: any) {
    console.error('PayPal webhook error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Webhook error' });
  }
};

export const handlePaymongoWebhook = async (req: Request, res: Response) => {
  try {
    const event = req.body;
    const referenceId = event?.data?.id;
    if (!referenceId) return res.status(400).json({ success: false, error: 'Missing reference' });

    const orderIntent = await findOrderPaymentIntentByReference('paymongo', referenceId);
    if (orderIntent) {
      const status = event?.type === 'payment.paid' || event?.type === 'link.paid' ? 'succeeded' : 'failed';
      await settleOrderPaymentIntent({
        provider: 'paymongo',
        providerReferenceId: referenceId,
        status,
        rawEvent: event,
        intentId: orderIntent.id
      });
      return res.json({ received: true });
    }

    const intent = await findIntentByReference('paymongo', referenceId);
    if (!intent) return res.status(404).json({ success: false, error: 'Intent not found' });

    const status = event?.type === 'payment.paid' || event?.type === 'link.paid' ? 'succeeded' : 'failed';
    await settleWalletFundingIntent(intent.id, 'paymongo', referenceId, status, event);
    return res.json({ received: true });
  } catch (error: any) {
    console.error('PayMongo webhook error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Webhook error' });
  }
};

export const handleXenditWebhook = async (req: Request, res: Response) => {
  try {
    const token = req.headers['x-callback-token'] as string | undefined;
    const settings = await getOrCreateSettings();
    const config = getProviderConfig('xendit', settings);
    if (config?.callbackToken && token !== config.callbackToken) {
      return res.status(401).json({ success: false, error: 'Invalid callback token' });
    }

    const event = req.body;
    const referenceId = event?.id;
    if (!referenceId) return res.status(400).json({ success: false, error: 'Missing reference' });

    const orderIntent = await findOrderPaymentIntentByReference('xendit', referenceId);
    if (orderIntent) {
      const status = event?.status === 'PAID' ? 'succeeded' : 'failed';
      await settleOrderPaymentIntent({
        provider: 'xendit',
        providerReferenceId: referenceId,
        status,
        rawEvent: event,
        intentId: orderIntent.id
      });
      return res.json({ received: true });
    }

    const intent = await findIntentByReference('xendit', referenceId);
    if (!intent) return res.status(404).json({ success: false, error: 'Intent not found' });

    const status = event?.status === 'PAID' ? 'succeeded' : 'failed';
    await settleWalletFundingIntent(intent.id, 'xendit', referenceId, status, event);
    return res.json({ received: true });
  } catch (error: any) {
    console.error('Xendit webhook error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Webhook error' });
  }
};

export const handleMonnifyWebhook = async (req: Request, res: Response) => {
  try {
    const event = req.body;
    const paymentReference = event?.eventData?.paymentReference;
    const transactionReference = event?.eventData?.transactionReference;
    const referenceId = transactionReference || paymentReference;
    if (!referenceId) return res.status(400).json({ success: false, error: 'Missing reference' });

    const orderIntent = await findOrderPaymentIntentByReference('monnify', referenceId);
    if (orderIntent) {
      const status = event?.eventType === 'SUCCESSFUL_TRANSACTION' ? 'succeeded' : 'failed';
      await settleOrderPaymentIntent({
        provider: 'monnify',
        providerReferenceId: referenceId,
        status,
        rawEvent: event,
        intentId: orderIntent.id
      });
      return res.json({ received: true });
    }

    const intent = await findIntentByReference('monnify', referenceId);
    if (!intent) return res.status(404).json({ success: false, error: 'Intent not found' });

    const status = event?.eventType === 'SUCCESSFUL_TRANSACTION' ? 'succeeded' : 'failed';
    await settleWalletFundingIntent(intent.id, 'monnify', referenceId, status, event);
    return res.json({ received: true });
  } catch (error: any) {
    console.error('Monnify webhook error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Webhook error' });
  }
};

export const handleOpayWebhook = async (req: Request, res: Response) => {
  try {
    const event = req.body;
    const referenceId = event?.reference || event?.data?.reference;
    if (!referenceId) return res.status(400).json({ success: false, error: 'Missing reference' });

    const orderIntent = await findOrderPaymentIntentByReference('opay', referenceId);
    if (orderIntent) {
      const status = event?.status === 'SUCCESS' ? 'succeeded' : 'failed';
      await settleOrderPaymentIntent({
        provider: 'opay',
        providerReferenceId: referenceId,
        status,
        rawEvent: event,
        intentId: orderIntent.id
      });
      return res.json({ received: true });
    }

    const intent = await findIntentByReference('opay', referenceId);
    if (!intent) return res.status(404).json({ success: false, error: 'Intent not found' });

    const status = event?.status === 'SUCCESS' ? 'succeeded' : 'failed';
    await settleWalletFundingIntent(intent.id, 'opay', referenceId, status, event);
    return res.json({ received: true });
  } catch (error: any) {
    console.error('OPay webhook error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Webhook error' });
  }
};

export const handleDragonpayCallback = async (req: Request, res: Response) => {
  try {
    const { txnid, status } = req.query as { txnid?: string; status?: string };
    if (!txnid) return res.status(400).json({ success: false, error: 'Missing txnid' });

    const orderIntent = await findOrderPaymentIntentByReference('dragonpay', txnid);
    if (orderIntent) {
      const finalStatus = status === 'S' ? 'succeeded' : 'failed';
      await settleOrderPaymentIntent({
        provider: 'dragonpay',
        providerReferenceId: txnid,
        status: finalStatus,
        rawEvent: req.query,
        intentId: orderIntent.id
      });
      return res.json({ received: true });
    }

    const intent = await prisma.walletFundingIntent.findUnique({ where: { id: txnid } });
    if (!intent) return res.status(404).json({ success: false, error: 'Intent not found' });

    const finalStatus = status === 'S' ? 'succeeded' : 'failed';
    await settleWalletFundingIntent(intent.id, 'dragonpay', txnid, finalStatus, req.query);
    return res.json({ received: true });
  } catch (error: any) {
    console.error('Dragonpay callback error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Callback error' });
  }
};

export const handlePayoneerNotify = async (req: Request, res: Response) => {
  try {
    const settings = await getOrCreateSettings();
    const config = getProviderConfig('payoneer', settings);
    const token = (req.query.token as string) || (req.headers['x-payoneer-token'] as string);
    if (config.notificationSecret && token !== config.notificationSecret) {
      return res.status(401).json({ success: false, error: 'Invalid notification token' });
    }

    const parsed = parseNotification(req.body);
    const orderIntent = await findOrderPaymentIntentByReference('payoneer', parsed.intentId);
    if (orderIntent) {
      await settleOrderPaymentIntent({
        provider: 'payoneer',
        providerReferenceId: parsed.providerReferenceId,
        status: parsed.status as any,
        rawEvent: parsed.raw,
        intentId: orderIntent.id
      });
      return res.json({ received: true });
    }
    await settleWalletFundingIntent(parsed.intentId, 'payoneer', parsed.providerReferenceId, parsed.status as any, parsed.raw);
    return res.json({ received: true });
  } catch (error: any) {
    console.error('Payoneer notify error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Notify error' });
  }
};

