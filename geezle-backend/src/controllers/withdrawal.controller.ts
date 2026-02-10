import { Request, Response } from 'express';
import Stripe from 'stripe';
import prisma from '../utils/prismaClient';
import { loadCurrencyConfig, getDefaultCurrencyForCountry, convertAmount } from '../utils/currency';
import { notifyAdmins } from '../utils/notify';
import { sendSystemMessage } from '../services/systemMessaging';
import { maybeDecryptSecret } from '../utils/secretCipher';

const nowIso = () => new Date().toISOString();

const ok = <T>(res: Response, data: T, message?: string) =>
  res.json({ success: true, data, message, timestamp: nowIso() });

const fail = (res: Response, status: number, message: string, code = 'ERR_WITHDRAWAL') =>
  res.status(status).json({ success: false, error: message, code, timestamp: nowIso() });

const PAYOUT_SCOPE_PREFIX = 'payout_account:';
const PAYOUT_METHODS_SCOPE = 'payout_methods';

type PayoutMethodField = {
  key: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  description?: string;
};

type PayoutMethodConfig = {
  id: string;
  name: string;
  enabled: boolean;
  note?: string;
  fields?: PayoutMethodField[];
};

type PayoutAccountUserLite = {
  id: string;
  name: string | null;
  email: string | null;
  country: string | null;
};

const normalizeCountry = (value?: string | null) => (value || '').toString().trim().toUpperCase();
const normalizeCountryKey = (value?: string | null) => {
  const raw = normalizeCountry(value);
  if (raw === 'PHILIPPINES') return 'PH';
  if (raw === 'NIGERIA') return 'NG';
  return raw;
};

const enforceCountryAndCurrency = (userCountry: string | null | undefined, details: any, defaultCurrency?: string) => {
  if (!userCountry) return null;
  const normalizedUserCountry = normalizeCountryKey(userCountry);
  if (!details.country) {
    details.country = normalizedUserCountry;
  }
  if (normalizeCountryKey(details.country) !== normalizedUserCountry) {
    return `Payout country must match your account country (${normalizedUserCountry})`;
  }

  const requiredCurrency = defaultCurrency;
  if (requiredCurrency) {
    details.currency = requiredCurrency;
  }
  return null;
};

const sanitizePayoutData = (data: any) => {
  if (!data || typeof data !== 'object') return {};
  const sanitized = { ...data };
  delete (sanitized as any)._history;
  delete (sanitized as any)._meta;
  return sanitized;
};

const mapWithdrawal = (req: any) => ({
  id: req.id,
  user_id: req.userId,
  amount: Number(req.amount ?? 0),
  method: req.method,
  details: req.details ?? {},
  status: (req.status || '').toString().toLowerCase(),
  created_at: req.createdAt ? req.createdAt.toISOString() : nowIso(),
  updated_at: req.updatedAt ? req.updatedAt.toISOString() : nowIso(),
  processed_at: req.processedAt ? req.processedAt.toISOString() : undefined
});

const getWalletAmountFromWithdrawal = (withdrawal: any) => {
  const details = withdrawal?.details && typeof withdrawal.details === 'object' ? withdrawal.details : {};
  const raw = Number(details.walletAmount ?? details.wallet_amount ?? withdrawal?.amount ?? 0);
  return Number.isFinite(raw) && raw > 0 ? raw : Number(withdrawal?.amount ?? 0);
};

const getOrCreateSettings = async () => {
  let settings = await prisma.settings.findFirst({ orderBy: { updatedAt: 'desc' } });
  if (!settings) settings = await prisma.settings.create({ data: {} });
  return settings;
};

const getProviderConfig = (settings: any, provider: string) => {
  const entry =
    settings?.walletFundingProviders && typeof settings.walletFundingProviders === 'object'
      ? (settings.walletFundingProviders as any)[provider] || {}
      : {};
  if (provider === 'stripe') {
    return {
      enabled: entry?.enabled ?? false,
      secretKey: maybeDecryptSecret(entry?.secretKey || settings?.paymentStripeSecret)
    };
  }
  if (provider === 'paypal') {
    return {
      enabled: entry?.enabled ?? false,
      clientId: entry?.clientId || settings?.paymentPaypalClientId,
      clientSecret: maybeDecryptSecret(entry?.clientSecret || settings?.paymentPaypalSecret),
      environment: entry?.environment || (settings?.paymentTestMode ? 'sandbox' : 'live')
    };
  }
  return { enabled: entry?.enabled ?? false };
};

const isPayoutMethodEnabled = (settings: any, method: string) => {
  if (method === 'bank_transfer' || method === 'bank') return true;
  if (method === 'stripe') {
    const cfg = getProviderConfig(settings, 'stripe');
    return Boolean(cfg?.enabled && cfg?.secretKey);
  }
  if (method === 'paypal') {
    const cfg = getProviderConfig(settings, 'paypal');
    return Boolean(cfg?.enabled && cfg?.clientId && cfg?.clientSecret);
  }
  return false;
};

const normalizeMethod = (method: string) => {
  const raw = (method || '').toString().toLowerCase();
  if (raw === 'bank') return 'bank_transfer';
  return raw;
};

const normalizeMethodId = (value: string) =>
  (value || '')
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

const buildDefaultPayoutMethods = (settings: any): PayoutMethodConfig[] => [
  {
    id: 'bank_transfer',
    name: 'Bank Transfer',
    enabled: true,
    note: '',
    fields: [
      { key: 'bankName', label: 'Bank Name', type: 'text', required: true },
      { key: 'accountName', label: 'Account Name', type: 'text', required: true },
      { key: 'accountNumber', label: 'Account Number', type: 'text', required: true },
      { key: 'routingNumber', label: 'Routing Number', type: 'text', required: false },
      { key: 'iban', label: 'IBAN', type: 'text', required: false },
      { key: 'swiftBic', label: 'SWIFT/BIC', type: 'text', required: false }
    ]
  },
  {
    id: 'paypal',
    name: 'PayPal',
    enabled: isPayoutMethodEnabled(settings, 'paypal'),
    note: '',
    fields: [{ key: 'paypalEmail', label: 'PayPal Email', type: 'email', required: true }]
  },
  {
    id: 'stripe',
    name: 'Stripe',
    enabled: isPayoutMethodEnabled(settings, 'stripe'),
    note: '',
    fields: [{ key: 'stripeAccountId', label: 'Stripe Account ID', type: 'text', required: true }]
  }
];

const sanitizeField = (field: any, index: number): PayoutMethodField | null => {
  if (!field || typeof field !== 'object') return null;
  const key = String(field.key || '').trim();
  const label = String(field.label || field.name || '').trim();
  const type = String(field.type || 'text').toLowerCase();
  const allowedTypes = new Set(['text', 'textarea', 'email', 'number', 'select', 'note']);
  const safeType = allowedTypes.has(type) ? type : 'text';
  if (!key && safeType !== 'note') return null;
  return {
    key: key || `note_${index}`,
    label: label || key || `Field ${index + 1}`,
    type: safeType,
    required: Boolean(field.required),
    placeholder: field.placeholder ? String(field.placeholder) : undefined,
    options: Array.isArray(field.options) ? field.options.map((opt: any) => String(opt)) : undefined,
    description: field.description ? String(field.description) : undefined
  };
};

const sanitizePayoutMethods = (input: any, fallback: PayoutMethodConfig[]): PayoutMethodConfig[] => {
  const raw = Array.isArray(input) ? input : [];
  const normalized: PayoutMethodConfig[] = [];
  const seen = new Set<string>();

  raw.forEach((item: any, index: number) => {
    if (!item || typeof item !== 'object') return;
    const rawId = String(item.id || item.key || item.code || '').trim();
    const id = normalizeMethodId(rawId);
    if (!id) return;
    if (seen.has(id)) return;
    seen.add(id);

    const name = String(item.name || item.label || rawId || id).trim() || id;
    const enabled = typeof item.enabled === 'boolean' ? item.enabled : true;
    const note = item.note ? String(item.note) : '';
    const fields = Array.isArray(item.fields)
      ? item.fields
          .map((field, fieldIndex) => sanitizeField(field, fieldIndex))
          .filter(Boolean) as PayoutMethodField[]
      : [];

    normalized.push({ id, name, enabled, note, fields });
  });

  if (normalized.length === 0) return fallback;
  return normalized;
};

const applyProviderAvailability = (methods: PayoutMethodConfig[], settings: any) =>
  methods.map((method) => {
    if (method.id === 'paypal' || method.id === 'stripe') {
      const providerEnabled = isPayoutMethodEnabled(settings, method.id);
      if (!providerEnabled) {
        return {
          ...method,
          enabled: false,
          note: method.note || `${method.name} is not configured yet.`
        };
      }
    }
    return method;
  });

const loadPayoutMethodsConfig = async (
  settings: any,
  options: { applyProviderGate?: boolean } = {}
): Promise<{ methods: PayoutMethodConfig[]; meta: any | null }> => {
  const record = await prisma.appSetting.findUnique({ where: { scope: PAYOUT_METHODS_SCOPE } });
  const fallback = buildDefaultPayoutMethods(settings);
  const storedMethods =
    record?.data && typeof record.data === 'object' && Array.isArray((record.data as any).methods)
      ? (record.data as any).methods
      : null;
  let methods = sanitizePayoutMethods(storedMethods, fallback);
  if (options.applyProviderGate) {
    methods = applyProviderAvailability(methods, settings);
  }
  return {
    methods,
    meta: record?.data && typeof record.data === 'object' ? (record.data as any).meta ?? null : null
  };
};

const validatePayoutDetails = (method: string, details: any, methodConfig?: PayoutMethodConfig | null) => {
  if (!details || typeof details !== 'object') return 'Payout details are required';
  if (!details.country || !details.currency) return 'Country and currency are required';
  if (details.currency) details.currency = String(details.currency).toUpperCase();
  const hasConfigFields = Boolean(methodConfig?.fields && methodConfig.fields.length > 0);
  if (hasConfigFields) {
    const missing = methodConfig.fields
      .filter((field) => field.required && field.type !== 'note')
      .filter((field) => {
        const value = details[field.key];
        return value === undefined || value === null || String(value).trim() === '';
      })
      .map((field) => field.label || field.key);
    if (missing.length > 0) {
      return `Missing required payout fields: ${missing.join(', ')}`;
    }
  }
  if (!hasConfigFields) {
    if (method === 'bank_transfer' || method === 'bank') {
      if (!details.accountName || !details.accountNumber || !details.bankName) {
        return 'Bank name, account name, and account number are required';
      }
    }
    if (method === 'paypal') {
      if (!details.paypalEmail) return 'PayPal email is required';
    }
    if (method === 'stripe') {
      if (!details.stripeAccountId) return 'Stripe account ID is required';
    }
  }
  return null;
};

const loadPayoutAccount = async (userId: string) => {
  const scope = `${PAYOUT_SCOPE_PREFIX}${userId}`;
  const record = await prisma.appSetting.findUnique({ where: { scope } });
  return record?.data ?? null;
};

const attachConnectedStripeAccountId = async (userId: string, details: any) => {
  if (!details || typeof details !== 'object') return;
  if (details.stripeAccountId) return;
  const connected = await prisma.payoutProviderAccount.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: 'stripe_connect'
      }
    }
  });
  if (!connected) return;
  if (connected.isDisabledByAdmin || connected.status === 'disabled') return;
  details.stripeAccountId = connected.stripeAccountId;
};

const savePayoutAccount = async (userId: string, data: any) => {
  const scope = `${PAYOUT_SCOPE_PREFIX}${userId}`;
  await prisma.appSetting.upsert({
    where: { scope },
    create: { scope, data },
    update: { data }
  });
  return data;
};

const buildPayoutHistoryEntry = (payload: any, updatedBy: string) => ({
  updatedAt: nowIso(),
  updatedBy,
  data: payload
});

const getPaypalBaseUrl = (environment: string) =>
  environment === 'live' ? 'https://api-m.paypal.com' : 'https://api-m.sandbox.paypal.com';

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

const attemptStripePayout = async (settings: any, amount: number, currency: string, destination: string) => {
  const cfg = getProviderConfig(settings, 'stripe');
  if (!cfg?.secretKey) throw new Error('Stripe is not configured');
  const stripe = new Stripe(cfg.secretKey, { apiVersion: '2023-10-16' as any });
  const payout = await stripe.transfers.create({
    amount: Math.round(amount * 100),
    currency: currency.toLowerCase(),
    destination,
    description: 'Scrolith withdrawal payout'
  });
  return payout?.id || null;
};

const attemptPaypalPayout = async (settings: any, amount: number, currency: string, email: string) => {
  const cfg = getProviderConfig(settings, 'paypal');
  if (!cfg?.clientId || !cfg?.clientSecret) throw new Error('PayPal is not configured');
  const baseUrl = getPaypalBaseUrl(cfg.environment || 'sandbox');
  const payoutCurrency = String(currency || 'USD').toUpperCase();
  const token = await fetchJson(`${baseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${cfg.clientSecret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  const batchId = `PAYOUT-${Date.now()}`;
  const result = await fetchJson(`${baseUrl}/v1/payments/payouts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      sender_batch_header: {
        sender_batch_id: batchId,
        email_subject: 'You have a payout from Scrolith'
      },
      items: [
        {
          recipient_type: 'EMAIL',
          amount: { value: amount.toFixed(2), currency: payoutCurrency },
          receiver: email,
          note: 'Scrolith withdrawal payout'
        }
      ]
    })
  });
  return result?.batch_header?.payout_batch_id || batchId;
};

export const requestWithdrawal = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized', 'ERR_UNAUTHORIZED');

    const payload = req.body || {};
    const rawAmount = Number(payload.amount ?? 0);
    const method = normalizeMethod(payload.method || payload.paymentMethodId || 'manual');
    const details =
      payload.details && typeof payload.details === 'object'
        ? payload.details
        : payload.notes
          ? { notes: payload.notes }
          : {};
    if (method === 'stripe') {
      await attachConnectedStripeAccountId(userId, details);
    }

    if (!rawAmount || Number.isNaN(rawAmount) || rawAmount <= 0) {
      return fail(res, 400, 'Amount must be greater than zero', 'ERR_BAD_REQUEST');
    }

    const userRecord = await prisma.user.findUnique({ where: { id: userId }, select: { country: true } });
    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) return fail(res, 404, 'Wallet not found', 'ERR_NOT_FOUND');
    if (wallet.frozen) return fail(res, 403, 'Wallet is frozen', 'ERR_FORBIDDEN');
    const settings = await getOrCreateSettings();
    const payoutConfig = await loadPayoutMethodsConfig(settings, { applyProviderGate: true });
    const methodConfig = payoutConfig.methods.find((m) => m.id === method);
    if (!methodConfig) {
      return fail(res, 400, 'Unsupported payout method', 'ERR_PAYOUT_METHOD');
    }
    if (!methodConfig.enabled) {
      return fail(
        res,
        400,
        methodConfig.note || 'This payout method is currently unavailable',
        'ERR_PAYOUT_METHOD'
      );
    }

    const currencyConfig = await loadCurrencyConfig();
    const defaultCurrency = getDefaultCurrencyForCountry(userRecord?.country, currencyConfig);
    const countryError = enforceCountryAndCurrency(userRecord?.country, details, defaultCurrency);
    if (countryError) return fail(res, 400, countryError, 'ERR_PAYOUT_DETAILS');
    const validationError = validatePayoutDetails(method, details, methodConfig);
    if (validationError) return fail(res, 400, validationError, 'ERR_PAYOUT_DETAILS');

    const payoutCurrency = (details.currency || defaultCurrency || wallet.currency || currencyConfig.baseCurrency || 'USD')
      .toString()
      .toUpperCase();
    const walletCurrency = (wallet.currency || currencyConfig.baseCurrency || 'USD').toString().toUpperCase();
    const conversion = convertAmount(rawAmount, payoutCurrency, walletCurrency, currencyConfig);
    const walletAmount = Number(conversion.amount ?? rawAmount);
    if (Number(wallet.balance) < walletAmount) {
      return fail(res, 400, 'Insufficient balance', 'ERR_INSUFFICIENT');
    }

    const result = await prisma.$transaction(async (tx) => {
      const withdrawalRequest = await tx.withdrawalRequest.create({
        data: {
          userId,
          amount: rawAmount,
          method,
          details: {
            ...details,
            payoutAmount: rawAmount,
            payoutCurrency,
            walletAmount,
            walletCurrency,
            fxRate: conversion.rate,
            fxBase: currencyConfig.baseCurrency
          },
          status: 'PENDING'
        }
      });

      await tx.wallet.update({
        where: { userId },
        data: {
          balance: { decrement: walletAmount },
          pendingClearance: { increment: walletAmount }
        }
      });

      await tx.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          type: 'WITHDRAWAL',
          amount: walletAmount,
          status: 'PENDING',
          currency: walletCurrency,
          description: `Withdrawal request via ${method}`,
          referenceId: withdrawalRequest.id
        }
      });

      return withdrawalRequest;
    });

    notifyAdmins({
      type: 'withdrawal',
      title: 'Withdrawal request',
      body: `New withdrawal request for ${rawAmount} via ${method}.`,
      link: '/admin/dashboard?tab=finance',
      meta: { withdrawalId: result.id, userId, amount: rawAmount, method }
    });
    try {
      const withdrawalLink = '/freelancer/dashboard?tab=wallet';
      void sendSystemMessage({
        templateKey: 'wallet_withdrawal_update',
        userId,
        context: {
          withdrawal: {
            amount: rawAmount,
            currency: walletCurrency,
            status: 'PENDING',
            link: withdrawalLink
          }
        },
        actionUrl: withdrawalLink,
        typeOverride: 'withdrawal'
      });
    } catch (notifyError) {
      console.warn('Withdrawal request notification failed', notifyError);
    }

    return ok(res, mapWithdrawal(result), 'Withdrawal requested successfully');
  } catch (error: any) {
    console.error('Withdrawal request error:', error);
    return fail(res, 500, error?.message || 'Failed to request withdrawal', 'ERR_INTERNAL');
  }
};

export const getMyWithdrawals = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized', 'ERR_UNAUTHORIZED');

    const page = Math.max(1, Number(req.query.page ?? 1));
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20)));
    const status = (req.query.status || '').toString().toUpperCase();
    const where: any = { userId };
    if (status) where.status = status;

    const [total, rows] = await Promise.all([
      prisma.withdrawalRequest.count({ where }),
      prisma.withdrawalRequest.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: (page - 1) * limit
      })
    ]);

    return ok(res, {
      withdrawals: rows.map(mapWithdrawal),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error: any) {
    console.error('Get withdrawals error:', error);
    return fail(res, 500, error?.message || 'Failed to load withdrawals', 'ERR_INTERNAL');
  }
};

export const getPayoutAccount = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized', 'ERR_UNAUTHORIZED');
    const [data, userRecord, currencyConfig] = await Promise.all([
      loadPayoutAccount(userId),
      prisma.user.findUnique({ where: { id: userId }, select: { country: true } }),
      loadCurrencyConfig()
    ]);
    const sanitized = sanitizePayoutData(data) || {};
    const defaultCurrency = getDefaultCurrencyForCountry(userRecord?.country, currencyConfig);
    const payload = {
      ...sanitized,
      country: sanitized?.country || userRecord?.country || '',
      currency: defaultCurrency || sanitized?.currency || currencyConfig.baseCurrency || 'USD'
    };
    return ok(res, payload);
  } catch (error: any) {
    console.error('Get payout account error:', error);
    return fail(res, 500, error?.message || 'Failed to load payout account', 'ERR_INTERNAL');
  }
};

export const savePayoutAccountDetails = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized', 'ERR_UNAUTHORIZED');
    const payload = req.body || {};
    const userRecord = await prisma.user.findUnique({ where: { id: userId }, select: { country: true } });
    if (!payload.country && !userRecord?.country) {
      return fail(res, 400, 'Country is required', 'ERR_PAYOUT_DETAILS');
    }
    const currencyConfig = await loadCurrencyConfig();
    const defaultCurrency = getDefaultCurrencyForCountry(userRecord?.country, currencyConfig);
    const countryError = enforceCountryAndCurrency(userRecord?.country, payload, defaultCurrency);
    if (countryError) return fail(res, 400, countryError, 'ERR_PAYOUT_DETAILS');
    const preferredMethod = normalizeMethod(payload.preferredMethod || payload.preferred_method || '');
    if (preferredMethod) {
      if (preferredMethod === 'stripe') {
        await attachConnectedStripeAccountId(userId, payload);
      }
      const settings = await getOrCreateSettings();
      const payoutConfig = await loadPayoutMethodsConfig(settings);
      const methodConfig = payoutConfig.methods.find((m) => m.id === preferredMethod);
      if (methodConfig) {
        const validationError = validatePayoutDetails(preferredMethod, payload, methodConfig);
        if (validationError) return fail(res, 400, validationError, 'ERR_PAYOUT_DETAILS');
      }
    }
    const existing = await prisma.appSetting.findUnique({ where: { scope: `${PAYOUT_SCOPE_PREFIX}${userId}` } });
    const prevData = existing?.data && typeof existing.data === 'object' ? existing.data : {};
    const cleanPrev = sanitizePayoutData(prevData);
    const history = Array.isArray((prevData as any)?._history) ? (prevData as any)._history : [];
    if (existing && Object.keys(cleanPrev).length > 0) {
      history.push(buildPayoutHistoryEntry(cleanPrev, userId));
    }

    const nextPayload = {
      ...payload,
      _meta: { updatedAt: nowIso(), updatedBy: userId },
      _history: history
    };

    const saved = await savePayoutAccount(userId, nextPayload);
    return ok(res, sanitizePayoutData(saved), 'Payout account saved');
  } catch (error: any) {
    console.error('Save payout account error:', error);
    return fail(res, 500, error?.message || 'Failed to save payout account', 'ERR_INTERNAL');
  }
};

export const getPayoutMethods = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized', 'ERR_UNAUTHORIZED');
    const settings = await getOrCreateSettings();
    const config = await loadPayoutMethodsConfig(settings, { applyProviderGate: true });
    return ok(res, { methods: config.methods });
  } catch (error: any) {
    console.error('Get payout methods error:', error);
    return fail(res, 500, error?.message || 'Failed to load payout methods', 'ERR_INTERNAL');
  }
};

export const getPayoutMethodsAdmin = async (req: Request, res: Response) => {
  try {
    if (!req.user?.role || !req.user.role.toString().toLowerCase().includes('admin')) {
      return fail(res, 403, 'Forbidden', 'ERR_FORBIDDEN');
    }
    const settings = await getOrCreateSettings();
    const config = await loadPayoutMethodsConfig(settings);
    return ok(res, { methods: config.methods, meta: config.meta });
  } catch (error: any) {
    console.error('Get payout methods admin error:', error);
    return fail(res, 500, error?.message || 'Failed to load payout methods', 'ERR_INTERNAL');
  }
};

export const savePayoutMethodsAdmin = async (req: Request, res: Response) => {
  try {
    if (!req.user?.role || !req.user.role.toString().toLowerCase().includes('admin')) {
      return fail(res, 403, 'Forbidden', 'ERR_FORBIDDEN');
    }
    const payload = req.body || {};
    const settings = await getOrCreateSettings();
    const existing = await loadPayoutMethodsConfig(settings);
    const fallback = buildDefaultPayoutMethods(settings);

    let nextMethods: PayoutMethodConfig[] | null = null;
    if (Array.isArray(payload.methods)) {
      nextMethods = sanitizePayoutMethods(payload.methods, fallback);
    } else if (payload.method) {
      const incoming = sanitizePayoutMethods([payload.method], fallback);
      nextMethods = existing.methods.slice();
      incoming.forEach((method) => {
        const idx = nextMethods!.findIndex((m) => m.id === method.id);
        if (idx >= 0) {
          nextMethods![idx] = {
            ...nextMethods![idx],
            ...method,
            fields: method.fields && method.fields.length > 0 ? method.fields : nextMethods![idx].fields
          };
        } else {
          nextMethods!.push(method);
        }
      });
    }

    if (!nextMethods) {
      return fail(res, 400, 'Missing payout methods payload', 'ERR_BAD_REQUEST');
    }

    const data = {
      methods: nextMethods,
      meta: {
        updatedAt: nowIso(),
        updatedBy: req.user?.id || null
      }
    };

    await prisma.appSetting.upsert({
      where: { scope: PAYOUT_METHODS_SCOPE },
      create: { scope: PAYOUT_METHODS_SCOPE, data },
      update: { data }
    });

    return ok(res, { methods: nextMethods }, 'Payout methods saved');
  } catch (error: any) {
    console.error('Save payout methods admin error:', error);
    return fail(res, 500, error?.message || 'Failed to save payout methods', 'ERR_INTERNAL');
  }
};

export const listPayoutAccountsAdmin = async (req: Request, res: Response) => {
  try {
    if (!req.user?.role || !req.user.role.toString().toLowerCase().includes('admin')) {
      return fail(res, 403, 'Forbidden', 'ERR_FORBIDDEN');
    }
    const settings = await getOrCreateSettings();
    const payoutConfig = await loadPayoutMethodsConfig(settings);
    const records = await prisma.appSetting.findMany({
      where: { scope: { startsWith: PAYOUT_SCOPE_PREFIX } },
      orderBy: { updatedAt: 'desc' }
    });
    const userIds = records.map((r) => r.scope.replace(PAYOUT_SCOPE_PREFIX, '')).filter(Boolean);
    const users = (await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true, country: true }
    })) as PayoutAccountUserLite[];
    const userMap = new Map<string, PayoutAccountUserLite>(users.map((u) => [u.id, u]));

    const list = records.map((rec) => {
      const userId = rec.scope.replace(PAYOUT_SCOPE_PREFIX, '');
      const data = rec.data && typeof rec.data === 'object' ? rec.data : {};
      const payload = sanitizePayoutData(data);
      const history = Array.isArray((data as any)?._history) ? (data as any)._history : [];
      const meta = (data as any)?._meta || {};
      const methods: string[] = [];
      const preferred = normalizeMethod((payload as any).preferredMethod || (payload as any).preferred_method || '');
      payoutConfig.methods.forEach((method) => {
        const fields = Array.isArray(method.fields) ? method.fields : [];
        const hasValue = fields
          .filter((field) => field.type !== 'note')
          .some((field) => {
            const value = (payload as any)[field.key];
            return value !== undefined && value !== null && String(value).trim() !== '';
          });
        if (hasValue || (preferred && preferred === method.id)) {
          methods.push(method.id);
        }
      });
      if (payload.bankName || payload.accountNumber) {
        if (!methods.includes('bank_transfer')) methods.push('bank_transfer');
      }
      if (payload.paypalEmail) {
        if (!methods.includes('paypal')) methods.push('paypal');
      }
      if (payload.stripeAccountId) {
        if (!methods.includes('stripe')) methods.push('stripe');
      }

      const payoutUser = userMap.get(userId);
      return {
        user_id: userId,
        user_name: payoutUser?.name || payoutUser?.email || userId,
        user_email: payoutUser?.email || '',
        user_country: payoutUser?.country || '',
        country: payload.country || '',
        currency: payload.currency || '',
        methods,
        details: payload,
        updated_at: rec.updatedAt.toISOString(),
        created_at: rec.createdAt.toISOString(),
        updated_by: meta?.updatedBy || null,
        history_count: history.length
      };
    });

    return ok(res, list);
  } catch (error: any) {
    console.error('List payout accounts admin error:', error);
    return fail(res, 500, error?.message || 'Failed to load payout accounts', 'ERR_INTERNAL');
  }
};

export const getPayoutAccountAdmin = async (req: Request, res: Response) => {
  try {
    if (!req.user?.role || !req.user.role.toString().toLowerCase().includes('admin')) {
      return fail(res, 403, 'Forbidden', 'ERR_FORBIDDEN');
    }
    const { userId } = req.params;
    if (!userId) return fail(res, 400, 'Missing userId', 'ERR_BAD_REQUEST');
    const record = await prisma.appSetting.findUnique({ where: { scope: `${PAYOUT_SCOPE_PREFIX}${userId}` } });
    if (!record) return fail(res, 404, 'Payout account not found', 'ERR_NOT_FOUND');
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, country: true } });
    const data = record.data && typeof record.data === 'object' ? record.data : {};
    const payload = sanitizePayoutData(data);
    const history = Array.isArray((data as any)?._history) ? (data as any)._history : [];
    const meta = (data as any)?._meta || {};
    return ok(res, {
      user,
      details: payload,
      meta,
      history,
      updated_at: record.updatedAt.toISOString(),
      created_at: record.createdAt.toISOString()
    });
  } catch (error: any) {
    console.error('Get payout account admin error:', error);
    return fail(res, 500, error?.message || 'Failed to load payout account', 'ERR_INTERNAL');
  }
};

export const listWithdrawalsAdmin = async (req: Request, res: Response) => {
  try {
    if (!req.user?.role || !req.user.role.toString().toLowerCase().includes('admin')) {
      return fail(res, 403, 'Forbidden', 'ERR_FORBIDDEN');
    }
    const status = (req.query.status || '').toString().toUpperCase();
    const where: any = {};
    if (status) where.status = status;

    const list = await prisma.withdrawalRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { id: true, name: true, email: true, role: true } } }
    });

    return ok(
      res,
      list.map((reqItem) => ({
        ...mapWithdrawal(reqItem),
        user_name: reqItem.user?.name || reqItem.user?.email || reqItem.userId,
        user_role: reqItem.user?.role || 'USER'
      }))
    );
  } catch (error: any) {
    console.error('List withdrawals admin error:', error);
    return fail(res, 500, error?.message || 'Failed to load withdrawals', 'ERR_INTERNAL');
  }
};

export const approveWithdrawalAdmin = async (req: Request, res: Response) => {
  try {
    if (!req.user?.role || !req.user.role.toString().toLowerCase().includes('admin')) {
      return fail(res, 403, 'Forbidden', 'ERR_FORBIDDEN');
    }
    const { id } = req.params;
    if (!id) return fail(res, 400, 'Missing withdrawal id', 'ERR_BAD_REQUEST');

    const withdrawal = await prisma.withdrawalRequest.findUnique({ where: { id } });
    if (!withdrawal) return fail(res, 404, 'Withdrawal not found', 'ERR_NOT_FOUND');
    if (withdrawal.status !== 'PENDING') {
      return fail(res, 400, 'Withdrawal already processed', 'ERR_ALREADY_PROCESSED');
    }

    const userRecord = await prisma.user.findUnique({ where: { id: withdrawal.userId }, select: { country: true } });
    const wallet = await prisma.wallet.findUnique({ where: { userId: withdrawal.userId } });
    if (!wallet) return fail(res, 404, 'Wallet not found', 'ERR_NOT_FOUND');

    const method = normalizeMethod(withdrawal.method);
    const details = (withdrawal.details || {}) as any;

    const settings = await getOrCreateSettings();
    const payoutConfig = await loadPayoutMethodsConfig(settings);
    const currencyConfig = await loadCurrencyConfig();
    const defaultCurrency = getDefaultCurrencyForCountry(userRecord?.country, currencyConfig);
    const countryError = enforceCountryAndCurrency(userRecord?.country, details, defaultCurrency);
    if (countryError) return fail(res, 400, countryError, 'ERR_PAYOUT_DETAILS');

    const methodConfig = payoutConfig.methods.find((m) => m.id === method);
    const validationError = validatePayoutDetails(method, details, methodConfig);
    if (validationError) return fail(res, 400, validationError, 'ERR_PAYOUT_DETAILS');
    let providerReferenceId: string | null = null;
    let nextStatus: 'PROCESSING' | 'COMPLETED' = 'PROCESSING';

    if (method === 'stripe') {
      providerReferenceId = await attemptStripePayout(settings, withdrawal.amount, details.currency || wallet.currency, details.stripeAccountId);
      nextStatus = 'COMPLETED';
    } else if (method === 'paypal') {
      providerReferenceId = await attemptPaypalPayout(settings, withdrawal.amount, details.currency || wallet.currency, details.paypalEmail);
      nextStatus = 'COMPLETED';
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedWithdrawal = await tx.withdrawalRequest.update({
        where: { id },
        data: { status: nextStatus, processedAt: new Date() }
      });

      if (nextStatus === 'COMPLETED') {
        const walletAmount = getWalletAmountFromWithdrawal(withdrawal);
        await tx.wallet.update({
          where: { userId: withdrawal.userId },
          data: { pendingClearance: { decrement: walletAmount } }
        });
      }

      const txRecord = await tx.transaction.findFirst({
        where: { referenceId: withdrawal.id, type: 'WITHDRAWAL' },
        orderBy: { createdAt: 'desc' }
      });
      const txUpdate: any = { status: nextStatus };
      if (providerReferenceId) {
        txUpdate.description = `Withdrawal payout ${method} (${providerReferenceId})`;
        txUpdate.metadata = {
          ...(txRecord as any)?.metadata,
          providerReferenceId
        };
      }
      if (txRecord) {
        await tx.transaction.update({
          where: { id: txRecord.id },
          data: txUpdate
        });
      } else {
        await tx.transaction.create({
          data: {
            userId: withdrawal.userId,
            walletId: wallet.id,
            type: 'WITHDRAWAL',
            amount: getWalletAmountFromWithdrawal(withdrawal),
            status: nextStatus,
            currency: wallet.currency,
            description: providerReferenceId
              ? `Withdrawal payout ${method} (${providerReferenceId})`
              : `Withdrawal request via ${method}`,
            referenceId: withdrawal.id,
            metadata: providerReferenceId ? { providerReferenceId } : undefined
          }
        });
      }
      return updatedWithdrawal;
    });

    if (updated?.userId) {
      try {
        const withdrawalLink = '/freelancer/dashboard?tab=wallet';
        void sendSystemMessage({
          templateKey: 'wallet_withdrawal_update',
          userId: updated.userId,
          context: {
            withdrawal: {
              amount: updated.amount,
              currency: updated.currency || wallet.currency,
              status: 'APPROVED',
              link: withdrawalLink
            }
          },
          actionUrl: withdrawalLink,
          typeOverride: 'withdrawal'
        });
      } catch (notifyError) {
        console.warn('Withdrawal approved notification failed', notifyError);
      }
    }
    return ok(res, { ...mapWithdrawal(updated), providerReferenceId }, 'Withdrawal approved');
  } catch (error: any) {
    console.error('Approve withdrawal error:', error);
    return fail(res, 500, error?.message || 'Failed to approve withdrawal', 'ERR_INTERNAL');
  }
};

export const markWithdrawalPaidAdmin = async (req: Request, res: Response) => {
  try {
    if (!req.user?.role || !req.user.role.toString().toLowerCase().includes('admin')) {
      return fail(res, 403, 'Forbidden', 'ERR_FORBIDDEN');
    }
    const { id } = req.params;
    if (!id) return fail(res, 400, 'Missing withdrawal id', 'ERR_BAD_REQUEST');
    const withdrawal = await prisma.withdrawalRequest.findUnique({ where: { id } });
    if (!withdrawal) return fail(res, 404, 'Withdrawal not found', 'ERR_NOT_FOUND');
    if (withdrawal.status === 'COMPLETED') return ok(res, mapWithdrawal(withdrawal), 'Already completed');

    const updated = await prisma.$transaction(async (tx) => {
      const updatedWithdrawal = await tx.withdrawalRequest.update({
        where: { id },
        data: { status: 'COMPLETED', processedAt: new Date() }
      });

      const walletAmount = getWalletAmountFromWithdrawal(withdrawal);
      await tx.wallet.update({
        where: { userId: withdrawal.userId },
        data: { pendingClearance: { decrement: walletAmount } }
      });

      const txRecord = await tx.transaction.findFirst({
        where: { referenceId: withdrawal.id, type: 'WITHDRAWAL' },
        orderBy: { createdAt: 'desc' }
      });
      if (txRecord) {
        await tx.transaction.update({
          where: { id: txRecord.id },
          data: { status: 'COMPLETED' }
        });
      }
      return updatedWithdrawal;
    });

    if (updated?.userId) {
      try {
        const withdrawalLink = '/freelancer/dashboard?tab=wallet';
        void sendSystemMessage({
          templateKey: 'wallet_withdrawal_update',
          userId: updated.userId,
          context: {
            withdrawal: {
              amount: updated.amount,
              currency: updated.currency || withdrawal.currency,
              status: 'COMPLETED',
              link: withdrawalLink
            }
          },
          actionUrl: withdrawalLink,
          typeOverride: 'withdrawal'
        });
      } catch (notifyError) {
        console.warn('Withdrawal paid notification failed', notifyError);
      }
    }
    return ok(res, mapWithdrawal(updated), 'Withdrawal marked as paid');
  } catch (error: any) {
    console.error('Mark withdrawal paid error:', error);
    return fail(res, 500, error?.message || 'Failed to mark withdrawal paid', 'ERR_INTERNAL');
  }
};

export const rejectWithdrawalAdmin = async (req: Request, res: Response) => {
  try {
    if (!req.user?.role || !req.user.role.toString().toLowerCase().includes('admin')) {
      return fail(res, 403, 'Forbidden', 'ERR_FORBIDDEN');
    }
    const { id } = req.params;
    if (!id) return fail(res, 400, 'Missing withdrawal id', 'ERR_BAD_REQUEST');

    const withdrawal = await prisma.withdrawalRequest.findUnique({ where: { id } });
    if (!withdrawal) return fail(res, 404, 'Withdrawal not found', 'ERR_NOT_FOUND');
    if (withdrawal.status !== 'PENDING' && withdrawal.status !== 'PROCESSING') {
      return fail(res, 400, 'Withdrawal already processed', 'ERR_ALREADY_PROCESSED');
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId: withdrawal.userId } });
    if (!wallet) return fail(res, 404, 'Wallet not found', 'ERR_NOT_FOUND');

    const updated = await prisma.$transaction(async (tx) => {
      const updatedWithdrawal = await tx.withdrawalRequest.update({
        where: { id },
        data: { status: 'CANCELLED', processedAt: new Date() }
      });

      const walletAmount = getWalletAmountFromWithdrawal(withdrawal);
      await tx.wallet.update({
        where: { userId: withdrawal.userId },
        data: {
          balance: { increment: walletAmount },
          pendingClearance: { decrement: walletAmount }
        }
      });

      const txRecord = await tx.transaction.findFirst({
        where: { referenceId: withdrawal.id, type: 'WITHDRAWAL' },
        orderBy: { createdAt: 'desc' }
      });
      if (txRecord) {
        await tx.transaction.update({
          where: { id: txRecord.id },
          data: { status: 'CANCELLED' }
        });
      }
      await tx.transaction.create({
        data: {
          userId: withdrawal.userId,
          walletId: wallet.id,
          type: 'ADJUSTMENT',
          amount: walletAmount,
          status: 'COMPLETED',
          currency: wallet.currency,
          description: `Withdrawal ${withdrawal.id} rejected`,
          adminNote: `Reversed withdrawal ${withdrawal.id}`
        }
      });
      return updatedWithdrawal;
    });

    if (updated?.userId) {
      try {
        const withdrawalLink = '/freelancer/dashboard?tab=wallet';
        void sendSystemMessage({
          templateKey: 'wallet_withdrawal_update',
          userId: updated.userId,
          context: {
            withdrawal: {
              amount: updated.amount,
              currency: updated.currency || withdrawal.currency,
              status: 'REJECTED',
              link: withdrawalLink
            }
          },
          actionUrl: withdrawalLink,
          typeOverride: 'withdrawal'
        });
      } catch (notifyError) {
        console.warn('Withdrawal rejected notification failed', notifyError);
      }
    }
    return ok(res, mapWithdrawal(updated), 'Withdrawal rejected');
  } catch (error: any) {
    console.error('Reject withdrawal error:', error);
    return fail(res, 500, error?.message || 'Failed to reject withdrawal', 'ERR_INTERNAL');
  }
};

