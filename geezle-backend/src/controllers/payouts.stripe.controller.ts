import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';
import { notifyUser } from '../utils/notify';
import {
  getStripeGatewayConfig,
  invalidateStripeConfigCache,
  requireStripeClient,
  StripeConnectType
} from '../services/stripeConfig.service';

type AuthRequest = Request & {
  user?: {
    id: string;
    email?: string;
    role?: string;
  };
};

const nowIso = () => new Date().toISOString();

const ok = <T>(res: Response, data: T, message?: string) =>
  res.json({ success: true, data, message, timestamp: nowIso() });

const fail = (res: Response, status: number, error: string, code = 'ERR_STRIPE_CONNECT') =>
  res.status(status).json({ success: false, error, code, timestamp: nowIso() });

const CONNECT_PROVIDER = 'stripe_connect';
const AUTO_PAYOUT_SCOPE_PREFIX = 'stripe_auto_payout:';

type AutoPayoutFrequency = 'daily' | 'weekly' | 'monthly';

type AutoPayoutSettings = {
  enabled: boolean;
  frequency: AutoPayoutFrequency;
  minimumAmount: number;
  reserveAmount: number;
  dayOfWeek: number;
  dayOfMonth: number;
  timezone: string;
  method: 'stripe';
  updatedAt: string;
};

const normalizeConnectType = (value: unknown): StripeConnectType =>
  String(value || '').toLowerCase() === 'standard' ? 'standard' : 'express';

const normalizeAutoPayoutFrequency = (value: unknown): AutoPayoutFrequency => {
  const raw = String(value || '').toLowerCase();
  if (raw === 'weekly' || raw === 'monthly') return raw;
  return 'daily';
};

const clampInteger = (value: unknown, min: number, max: number, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(parsed)));
};

const toFixedAmount = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Number(parsed.toFixed(2));
};

const buildDefaultAutoPayoutSettings = (timezone?: string | null): AutoPayoutSettings => ({
  enabled: false,
  frequency: 'weekly',
  minimumAmount: 100,
  reserveAmount: 0,
  dayOfWeek: 1,
  dayOfMonth: 1,
  timezone: String(timezone || 'UTC'),
  method: 'stripe',
  updatedAt: nowIso()
});

const buildAutoPayoutScope = (userId: string) => `${AUTO_PAYOUT_SCOPE_PREFIX}${userId}`;

const parseAutoPayoutSettings = (
  payload: any,
  defaults: AutoPayoutSettings
): AutoPayoutSettings => {
  const source = payload && typeof payload === 'object' ? payload : {};
  return {
    enabled: Boolean(source.enabled),
    frequency: normalizeAutoPayoutFrequency(source.frequency),
    minimumAmount: toFixedAmount(source.minimumAmount, defaults.minimumAmount),
    reserveAmount: toFixedAmount(source.reserveAmount, defaults.reserveAmount),
    dayOfWeek: clampInteger(source.dayOfWeek, 0, 6, defaults.dayOfWeek),
    dayOfMonth: clampInteger(source.dayOfMonth, 1, 28, defaults.dayOfMonth),
    timezone: String(source.timezone || defaults.timezone || 'UTC'),
    method: 'stripe',
    updatedAt: String(source.updatedAt || defaults.updatedAt || nowIso())
  };
};

const computeNextAutoPayoutRunAt = (settings: AutoPayoutSettings, fromDate = new Date()) => {
  const from = new Date(fromDate);
  from.setSeconds(0, 0);

  if (settings.frequency === 'daily') {
    const next = new Date(from);
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
    return next.toISOString();
  }

  if (settings.frequency === 'weekly') {
    const next = new Date(from);
    const currentDay = next.getDay();
    let offset = settings.dayOfWeek - currentDay;
    if (offset <= 0) offset += 7;
    next.setDate(next.getDate() + offset);
    next.setHours(0, 0, 0, 0);
    return next.toISOString();
  }

  const next = new Date(from);
  next.setHours(0, 0, 0, 0);
  next.setDate(settings.dayOfMonth);
  if (next <= from) {
    next.setMonth(next.getMonth() + 1);
    next.setDate(settings.dayOfMonth);
  }
  return next.toISOString();
};

const normalizeStatus = (params: {
  disabled: boolean;
  chargesEnabled: boolean;
  payoutsEnabled: boolean;
  hasDueRequirements: boolean;
}) => {
  if (params.disabled) return 'disabled';
  if (params.hasDueRequirements) return 'pending_onboarding';
  if (params.chargesEnabled && params.payoutsEnabled) return 'active';
  if (!params.chargesEnabled && !params.payoutsEnabled) return 'pending_onboarding';
  return 'restricted';
};

const formatRequirements = (requirements: any) => ({
  currentlyDue: Array.isArray(requirements?.currently_due) ? requirements.currently_due : [],
  eventuallyDue: Array.isArray(requirements?.eventually_due) ? requirements.eventually_due : [],
  pastDue: Array.isArray(requirements?.past_due) ? requirements.past_due : [],
  pendingVerification: Array.isArray(requirements?.pending_verification)
    ? requirements.pending_verification
    : [],
  disabledReason: requirements?.disabled_reason || null
});

const emitAccountUpdated = (userId: string, payload: Record<string, any>) => {
  realtime.emitToUser(userId, 'stripe:account_updated', payload);
  realtime.emitToUser(userId, 'payouts:updated', payload);
};

const mapAccount = (account: any) => ({
  id: account.id,
  userId: account.userId,
  provider: account.provider,
  accountType: account.accountType,
  stripeAccountId: account.stripeAccountId,
  chargesEnabled: account.chargesEnabled,
  payoutsEnabled: account.payoutsEnabled,
  requirementsDue: account.requirementsDue || null,
  country: account.country || null,
  currency: account.currency || null,
  status: account.status,
  isDisabledByAdmin: account.isDisabledByAdmin,
  disabledReason: account.disabledReason || null,
  lastSyncedAt: account.lastSyncedAt || null,
  createdAt: account.createdAt,
  updatedAt: account.updatedAt
});

const syncStripeConnectedAccount = async (params: {
  userId: string;
  stripeAccountId: string;
  accountType: StripeConnectType;
  disabledByAdmin?: boolean;
}) => {
  const stripe = await requireStripeClient();
  const account = await stripe.accounts.retrieve(params.stripeAccountId);
  const due = formatRequirements(account.requirements);
  const hasDueRequirements =
    due.currentlyDue.length > 0 || due.eventuallyDue.length > 0 || due.pastDue.length > 0;
  const status = normalizeStatus({
    disabled: Boolean(params.disabledByAdmin),
    chargesEnabled: Boolean((account as any).charges_enabled),
    payoutsEnabled: Boolean((account as any).payouts_enabled),
    hasDueRequirements
  });

  const synced = await prisma.payoutProviderAccount.upsert({
    where: {
      userId_provider: {
        userId: params.userId,
        provider: CONNECT_PROVIDER
      }
    },
    create: {
      userId: params.userId,
      provider: CONNECT_PROVIDER,
      accountType: params.accountType,
      stripeAccountId: params.stripeAccountId,
      chargesEnabled: Boolean((account as any).charges_enabled),
      payoutsEnabled: Boolean((account as any).payouts_enabled),
      requirementsDue: due as any,
      country: account.country || null,
      currency: account.default_currency || null,
      status,
      isDisabledByAdmin: Boolean(params.disabledByAdmin),
      lastSyncedAt: new Date()
    },
    update: {
      accountType: params.accountType,
      chargesEnabled: Boolean((account as any).charges_enabled),
      payoutsEnabled: Boolean((account as any).payouts_enabled),
      requirementsDue: due as any,
      country: account.country || null,
      currency: account.default_currency || null,
      status,
      isDisabledByAdmin: Boolean(params.disabledByAdmin),
      lastSyncedAt: new Date()
    }
  });
  return synced;
};

const getReturnUrls = (req: Request) => {
  const appUrl =
    process.env.PUBLIC_APP_URL ||
    process.env.FRONTEND_URL ||
    `${req.protocol}://${req.get('host')}`.replace(/\/$/, '');
  const refreshUrl = `${appUrl}/dashboard?tab=wallet&stripe=refresh`;
  const returnUrl = `${appUrl}/dashboard?tab=wallet&stripe=return`;
  return { refreshUrl, returnUrl };
};

type ConnectConfigCheck =
  | { ok: true; config: Awaited<ReturnType<typeof getStripeGatewayConfig>> }
  | { ok: false; status: number; error: string; code: string };

const ensureConnectEnabled = async (): Promise<ConnectConfigCheck> => {
  const config = await getStripeGatewayConfig();
  if (!config.enabled) {
    return {
      ok: false,
      status: 400,
      error: 'Stripe is disabled in payment settings',
      code: 'ERR_STRIPE_DISABLED'
    };
  }
  if (!config.secretKey) {
    return {
      ok: false,
      status: 400,
      error: 'Stripe secret key is not configured',
      code: 'ERR_STRIPE_NOT_CONFIGURED'
    };
  }
  if (!config.connectEnabled) {
    return {
      ok: false,
      status: 400,
      error: 'Stripe Connect payouts are disabled by admin',
      code: 'ERR_STRIPE_CONNECT_DISABLED'
    };
  }
  return { ok: true, config };
};

const getUserStripeConnectAccount = async (userId: string) =>
  prisma.payoutProviderAccount.findUnique({
    where: {
      userId_provider: {
        userId,
        provider: CONNECT_PROVIDER
      }
    }
  });

const loadAutoPayoutSettings = async (userId: string, timezone?: string | null) => {
  const defaults = buildDefaultAutoPayoutSettings(timezone);
  const row = await prisma.appSetting.findUnique({
    where: { scope: buildAutoPayoutScope(userId) }
  });
  return parseAutoPayoutSettings(row?.data, defaults);
};

const saveAutoPayoutSettings = async (userId: string, settings: AutoPayoutSettings) => {
  const scope = buildAutoPayoutScope(userId);
  await prisma.appSetting.upsert({
    where: { scope },
    create: {
      scope,
      data: settings as any
    },
    update: {
      data: settings as any
    }
  });
  return settings;
};

export const getMyStripePayoutStatus = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized', 'ERR_UNAUTHORIZED');
    const config = await getStripeGatewayConfig();
    const record = await prisma.payoutProviderAccount.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: CONNECT_PROVIDER
        }
      }
    });
    if (!record) {
      return ok(res, {
        stripe: {
          configured: config.enabled && Boolean(config.secretKey),
          connectEnabled: config.connectEnabled,
          connectType: config.connectType
        },
        account: null
      });
    }

    const shouldSync = !record.lastSyncedAt || Date.now() - new Date(record.lastSyncedAt).getTime() > 90_000;
    const synced = shouldSync
      ? await syncStripeConnectedAccount({
          userId,
          stripeAccountId: record.stripeAccountId,
          accountType: normalizeConnectType(record.accountType),
          disabledByAdmin: record.isDisabledByAdmin
        })
      : record;

    return ok(res, {
      stripe: {
        configured: config.enabled && Boolean(config.secretKey),
        connectEnabled: config.connectEnabled,
        connectType: config.connectType
      },
      account: mapAccount(synced)
    });
  } catch (error: any) {
    console.error('[stripe-connect] get status failed', error);
    return fail(res, 500, error?.message || 'Failed to load Stripe payout status', 'ERR_STRIPE_STATUS');
  }
};

export const getMyStripeAutoPayoutSettings = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized', 'ERR_UNAUTHORIZED');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, timezone: true }
    });
    if (!user) return fail(res, 404, 'User not found', 'ERR_USER_NOT_FOUND');

    const [config, account, settings] = await Promise.all([
      getStripeGatewayConfig(),
      getUserStripeConnectAccount(userId),
      loadAutoPayoutSettings(userId, user.timezone)
    ]);

    const accountActive = Boolean(
      account &&
        account.chargesEnabled &&
        account.payoutsEnabled &&
        !account.isDisabledByAdmin &&
        account.status !== 'disabled'
    );

    const blockingReason = !config.enabled
      ? 'Stripe is disabled in payment settings'
      : !config.secretKey
        ? 'Stripe secret key is missing'
        : !config.connectEnabled
          ? 'Stripe Connect payouts are disabled by admin'
          : account?.isDisabledByAdmin
            ? account.disabledReason || 'Your Stripe payout access is disabled by admin'
            : !account
              ? 'Connect your Stripe account first'
              : !accountActive
                ? 'Complete Stripe onboarding to enable auto payouts'
                : null;

    return ok(res, {
      stripe: {
        configured: config.enabled && Boolean(config.secretKey),
        connectEnabled: config.connectEnabled,
        connectType: config.connectType
      },
      account: account ? mapAccount(account) : null,
      settings: {
        ...settings,
        nextRunAt: settings.enabled ? computeNextAutoPayoutRunAt(settings) : null
      },
      canEnable: !blockingReason,
      blockingReason
    });
  } catch (error: any) {
    console.error('[stripe-connect] get auto payout settings failed', error);
    return fail(
      res,
      500,
      error?.message || 'Failed to load auto payout settings',
      'ERR_STRIPE_AUTO_PAYOUT_SETTINGS'
    );
  }
};

export const saveMyStripeAutoPayoutSettings = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized', 'ERR_UNAUTHORIZED');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, timezone: true }
    });
    if (!user) return fail(res, 404, 'User not found', 'ERR_USER_NOT_FOUND');

    const defaults = buildDefaultAutoPayoutSettings(user.timezone);
    const incoming = parseAutoPayoutSettings(req.body, defaults);

    if (incoming.minimumAmount < 1) {
      return fail(res, 400, 'Minimum payout amount must be at least 1', 'ERR_STRIPE_AUTO_PAYOUT_VALIDATION');
    }
    if (incoming.reserveAmount < 0) {
      return fail(res, 400, 'Reserve amount cannot be negative', 'ERR_STRIPE_AUTO_PAYOUT_VALIDATION');
    }

    const [config, account] = await Promise.all([
      getStripeGatewayConfig(),
      getUserStripeConnectAccount(userId)
    ]);

    if (incoming.enabled) {
      if (!config.enabled || !config.secretKey) {
        return fail(
          res,
          400,
          'Stripe is not configured by admin',
          'ERR_STRIPE_AUTO_PAYOUT_NOT_CONFIGURED'
        );
      }
      if (!config.connectEnabled) {
        return fail(
          res,
          400,
          'Stripe Connect payouts are disabled by admin',
          'ERR_STRIPE_AUTO_PAYOUT_CONNECT_DISABLED'
        );
      }
      if (!account) {
        return fail(
          res,
          400,
          'Connect your Stripe account first',
          'ERR_STRIPE_AUTO_PAYOUT_ACCOUNT_REQUIRED'
        );
      }
      if (account.isDisabledByAdmin) {
        return fail(
          res,
          403,
          account.disabledReason || 'Stripe payout access is disabled by admin',
          'ERR_STRIPE_AUTO_PAYOUT_ACCOUNT_DISABLED'
        );
      }
      if (!account.chargesEnabled || !account.payoutsEnabled) {
        return fail(
          res,
          400,
          'Complete Stripe onboarding before enabling auto payouts',
          'ERR_STRIPE_AUTO_PAYOUT_ONBOARDING'
        );
      }
    }

    const nextSettings: AutoPayoutSettings = {
      ...incoming,
      updatedAt: nowIso()
    };

    const saved = await saveAutoPayoutSettings(userId, nextSettings);
    const payload = {
      settings: {
        ...saved,
        nextRunAt: saved.enabled ? computeNextAutoPayoutRunAt(saved) : null
      }
    };

    realtime.emitToUser(userId, 'payouts:auto_settings_updated', payload);
    realtime.emitToUser(userId, 'payouts:updated', payload);

    return ok(res, payload, 'Auto payout settings updated');
  } catch (error: any) {
    console.error('[stripe-connect] save auto payout settings failed', error);
    return fail(
      res,
      500,
      error?.message || 'Failed to save auto payout settings',
      'ERR_STRIPE_AUTO_PAYOUT_SETTINGS'
    );
  }
};

export const createStripeConnectAccount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized', 'ERR_UNAUTHORIZED');
    const cfgResult = await ensureConnectEnabled();
    if (!('config' in cfgResult)) {
      return fail(res, cfgResult.status, cfgResult.error, cfgResult.code);
    }
    const cfg = cfgResult.config;

    const existing = await prisma.payoutProviderAccount.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: CONNECT_PROVIDER
        }
      }
    });
    if (existing && existing.stripeAccountId) {
      const synced = await syncStripeConnectedAccount({
        userId,
        stripeAccountId: existing.stripeAccountId,
        accountType: normalizeConnectType(existing.accountType),
        disabledByAdmin: existing.isDisabledByAdmin
      });
      return ok(res, { account: mapAccount(synced) }, 'Stripe Connect account already exists');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, country: true, name: true, username: true }
    });
    if (!user) return fail(res, 404, 'User not found', 'ERR_USER_NOT_FOUND');

    const body = req.body || {};
    const accountType = normalizeConnectType(body.accountType || cfg.connectType);
    const country = String(body.country || user.country || 'US').toUpperCase();
    const stripe = await requireStripeClient();
    const created = await stripe.accounts.create({
      type: accountType,
      country,
      email: user.email || undefined,
      capabilities: {
        transfers: { requested: true }
      },
      metadata: {
        platform: 'scrolith',
        userId: user.id,
        username: user.username || '',
        name: user.name || ''
      }
    } as any);

    const record = await syncStripeConnectedAccount({
      userId,
      stripeAccountId: created.id,
      accountType,
      disabledByAdmin: false
    });
    emitAccountUpdated(userId, { account: mapAccount(record) });
    return ok(res, { account: mapAccount(record) }, 'Stripe Connect account created');
  } catch (error: any) {
    console.error('[stripe-connect] create account failed', error);
    return fail(res, 500, error?.message || 'Failed to create Stripe Connect account', 'ERR_STRIPE_CREATE');
  }
};

export const createStripeOnboardingLink = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized', 'ERR_UNAUTHORIZED');
    const cfgResult = await ensureConnectEnabled();
    if (!('config' in cfgResult)) {
      return fail(res, cfgResult.status, cfgResult.error, cfgResult.code);
    }

    const account = await prisma.payoutProviderAccount.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: CONNECT_PROVIDER
        }
      }
    });
    if (!account) return fail(res, 404, 'Connect account not found', 'ERR_ACCOUNT_NOT_FOUND');
    if (account.isDisabledByAdmin) {
      return fail(res, 403, 'Payout account disabled by admin', 'ERR_PAYOUT_DISABLED');
    }

    const stripe = await requireStripeClient();
    const { refreshUrl, returnUrl } = getReturnUrls(req);
    const link = await stripe.accountLinks.create({
      account: account.stripeAccountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: 'account_onboarding'
    });
    return ok(res, { url: link.url, expiresAt: link.expires_at || null });
  } catch (error: any) {
    console.error('[stripe-connect] onboarding link failed', error);
    return fail(res, 500, error?.message || 'Failed to create onboarding link', 'ERR_STRIPE_ONBOARDING');
  }
};

export const createStripeDashboardLoginLink = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized', 'ERR_UNAUTHORIZED');
    const cfgResult = await ensureConnectEnabled();
    if (!('config' in cfgResult)) {
      return fail(res, cfgResult.status, cfgResult.error, cfgResult.code);
    }

    const account = await prisma.payoutProviderAccount.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: CONNECT_PROVIDER
        }
      }
    });
    if (!account) return fail(res, 404, 'Connect account not found', 'ERR_ACCOUNT_NOT_FOUND');
    if (account.isDisabledByAdmin) {
      return fail(res, 403, 'Payout account disabled by admin', 'ERR_PAYOUT_DISABLED');
    }
    if (normalizeConnectType(account.accountType) !== 'express') {
      return fail(
        res,
        400,
        'Dashboard login links are available for Stripe Express accounts only',
        'ERR_STRIPE_LOGIN_LINK'
      );
    }

    const stripe = await requireStripeClient();
    const link = await stripe.accounts.createLoginLink(account.stripeAccountId);
    return ok(res, { url: link.url, createdAt: nowIso() });
  } catch (error: any) {
    console.error('[stripe-connect] login link failed', error);
    return fail(res, 500, error?.message || 'Failed to create Stripe dashboard link', 'ERR_STRIPE_LOGIN_LINK');
  }
};

export const disconnectStripeConnectAccount = async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized', 'ERR_UNAUTHORIZED');
    const account = await prisma.payoutProviderAccount.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: CONNECT_PROVIDER
        }
      }
    });
    if (!account) return fail(res, 404, 'Connect account not found', 'ERR_ACCOUNT_NOT_FOUND');

    const updated = await prisma.payoutProviderAccount.update({
      where: { id: account.id },
      data: {
        status: 'disabled',
        payoutsEnabled: false,
        isDisabledByAdmin: false,
        disabledReason: 'Disconnected by user',
        lastSyncedAt: new Date()
      }
    });
    emitAccountUpdated(userId, { account: mapAccount(updated) });
    return ok(res, { account: mapAccount(updated) }, 'Stripe Connect account disconnected');
  } catch (error: any) {
    console.error('[stripe-connect] disconnect failed', error);
    return fail(res, 500, error?.message || 'Failed to disconnect Stripe account', 'ERR_STRIPE_DISCONNECT');
  }
};

export const listStripePayoutAccountsAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const statusFilter = String(req.query.status || '').trim().toLowerCase();
    const where = statusFilter && statusFilter !== 'all' ? { status: statusFilter } : {};
    const rows = await prisma.payoutProviderAccount.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            email: true,
            username: true,
            name: true,
            role: true,
            kycStatus: true
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    });

    const data = await Promise.all(
      rows.map(async (row) => {
        const wallet = await prisma.wallet.findUnique({
          where: { userId: row.userId },
          select: { balance: true, pendingClearance: true, currency: true }
        });
        return {
          ...mapAccount(row),
          user: row.user,
          wallet: {
            balance: Number(wallet?.balance || 0),
            pendingClearance: Number(wallet?.pendingClearance || 0),
            currency: wallet?.currency || 'USD'
          }
        };
      })
    );
    return ok(res, { accounts: data });
  } catch (error: any) {
    console.error('[stripe-connect] admin list failed', error);
    return fail(res, 500, error?.message || 'Failed to list Stripe payout accounts', 'ERR_STRIPE_ADMIN_LIST');
  }
};

export const disableStripePayoutForUserAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!userId) return fail(res, 400, 'Missing userId', 'ERR_BAD_REQUEST');
    const reason = String(req.body?.reason || 'Disabled by admin').trim();

    const account = await prisma.payoutProviderAccount.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: CONNECT_PROVIDER
        }
      }
    });
    if (!account) return fail(res, 404, 'Connect account not found', 'ERR_ACCOUNT_NOT_FOUND');

    const updated = await prisma.payoutProviderAccount.update({
      where: { id: account.id },
      data: {
        isDisabledByAdmin: true,
        disabledReason: reason,
        status: 'disabled',
        payoutsEnabled: false,
        lastSyncedAt: new Date()
      }
    });
    notifyUser(userId, {
      type: 'stripe_payouts_disabled',
      title: 'Stripe payouts disabled',
      body: `Your Stripe payout access was disabled by admin. Reason: ${reason}`,
      actionUrl: '/dashboard?tab=wallet'
    });
    emitAccountUpdated(userId, { account: mapAccount(updated) });
    return ok(res, { account: mapAccount(updated) });
  } catch (error: any) {
    console.error('[stripe-connect] admin disable failed', error);
    return fail(res, 500, error?.message || 'Failed to disable Stripe payouts', 'ERR_STRIPE_ADMIN_DISABLE');
  }
};

export const enableStripePayoutForUserAdmin = async (req: AuthRequest, res: Response) => {
  try {
    const userId = String(req.params.userId || '').trim();
    if (!userId) return fail(res, 400, 'Missing userId', 'ERR_BAD_REQUEST');
    const account = await prisma.payoutProviderAccount.findUnique({
      where: {
        userId_provider: {
          userId,
          provider: CONNECT_PROVIDER
        }
      }
    });
    if (!account) return fail(res, 404, 'Connect account not found', 'ERR_ACCOUNT_NOT_FOUND');

    const synced = await syncStripeConnectedAccount({
      userId,
      stripeAccountId: account.stripeAccountId,
      accountType: normalizeConnectType(account.accountType),
      disabledByAdmin: false
    });
    notifyUser(userId, {
      type: 'stripe_payouts_enabled',
      title: 'Stripe payouts enabled',
      body: 'Your Stripe payout access has been enabled by admin.',
      actionUrl: '/dashboard?tab=wallet'
    });
    emitAccountUpdated(userId, { account: mapAccount(synced) });
    return ok(res, { account: mapAccount(synced) });
  } catch (error: any) {
    console.error('[stripe-connect] admin enable failed', error);
    return fail(res, 500, error?.message || 'Failed to enable Stripe payouts', 'ERR_STRIPE_ADMIN_ENABLE');
  }
};

export const handleStripeConnectWebhookEvent = async (event: any) => {
  try {
    if (!event || !event.type) return;
    if (event.type === 'account.updated') {
      const acct = event.data?.object;
      const stripeAccountId = String(acct?.id || '');
      if (!stripeAccountId) return;
      const record = await prisma.payoutProviderAccount.findUnique({
        where: { stripeAccountId }
      });
      if (!record) return;
      const due = formatRequirements(acct.requirements);
      const hasDue =
        due.currentlyDue.length > 0 || due.eventuallyDue.length > 0 || due.pastDue.length > 0;
      const status = normalizeStatus({
        disabled: record.isDisabledByAdmin,
        chargesEnabled: Boolean(acct.charges_enabled),
        payoutsEnabled: Boolean(acct.payouts_enabled),
        hasDueRequirements: hasDue
      });
      const updated = await prisma.payoutProviderAccount.update({
        where: { id: record.id },
        data: {
          chargesEnabled: Boolean(acct.charges_enabled),
          payoutsEnabled: Boolean(acct.payouts_enabled),
          requirementsDue: due as any,
          country: acct.country || null,
          currency: acct.default_currency || null,
          status,
          lastSyncedAt: new Date()
        }
      });
      emitAccountUpdated(updated.userId, { account: mapAccount(updated), source: 'webhook', event: event.type });
    }

    if (['payout.paid', 'payout.failed', 'payout.updated', 'transfer.created', 'transfer.updated'].includes(event.type)) {
      const accountId =
        String((event as any).account || '') ||
        String(event.data?.object?.destination || '') ||
        String(event.data?.object?.account || '');
      if (!accountId) return;
      const record = await prisma.payoutProviderAccount.findUnique({
        where: { stripeAccountId: accountId }
      });
      if (!record) return;
      realtime.emitToUser(record.userId, 'stripe:payout_updated', {
        type: event.type,
        payload: event.data?.object || null,
        receivedAt: nowIso()
      });
      realtime.emitToUser(record.userId, 'wallet:updated', { source: 'stripe-webhook', event: event.type });
    }
  } catch (error) {
    console.error('[stripe-connect] webhook event handler failed', error);
  }
};

export const invalidateStripeRuntimeConfigAdmin = async (_req: AuthRequest, res: Response) => {
  invalidateStripeConfigCache();
  return ok(res, { invalidated: true });
};
