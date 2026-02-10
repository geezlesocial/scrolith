import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { loadCurrencyConfig, getDefaultCurrencyForCountry, convertAmount } from '../utils/currency';

interface AuthRequest extends Request {
  user?: {
    id: string;
    email?: string;
    role?: string;
  };
}

const nowIso = () => new Date().toISOString();

const ok = <T>(res: Response, data: T) => res.json({ success: true, data, timestamp: nowIso() });

const fail = (res: Response, status: number, message: string, code = 'ERR_WALLET') =>
  res.status(status).json({ success: false, error: message, code, timestamp: nowIso() });

const getAuthUser = (req: Request) => req.user as { id: string; role?: string } | undefined;

const isAdminRole = (role?: string) => (role || '').toString().toLowerCase().includes('admin');

const emitAdminEvent = (req: AuthRequest, event: string, payload: any = {}) => {
  const io = req.app.get('io');
  if (io) io.emit(event, { ...payload, timestamp: nowIso() });
};

const getOrCreateSettings = async () => {
  let settings = await prisma.settings.findFirst({ orderBy: { updatedAt: 'desc' } });
  if (!settings) {
    settings = await prisma.settings.create({ data: {} });
  }
  return settings;
};

const ensureUserExists = async (userId: string) => {
  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (existing) return existing;

  const safeLocal = userId.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 32) || 'user';
  const email = `${safeLocal}@local.dev`;

  return prisma.user.create({
    data: {
      id: userId,
      email,
      role: 'USER',
      isActive: true,
      isVerified: false
    }
  });
};

const getOrCreateWallet = async (userId: string) => {
  const existing = await prisma.wallet.findUnique({ where: { userId } });
  if (existing) return existing;

  await ensureUserExists(userId);

  let currency = 'USD';
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { country: true } });
    const currencyConfig = await loadCurrencyConfig();
    const defaultCurrency = getDefaultCurrencyForCountry(user?.country, currencyConfig);
    currency = defaultCurrency || currencyConfig.baseCurrency || currency;
  } catch (e) {
    currency = 'USD';
  }

  return prisma.wallet.create({
    data: {
      userId,
      balance: 0,
      pendingClearance: 0,
      escrowBalance: 0,
      frozen: false,
      currency
    }
  });
};

const mapWallet = (wallet: any) => ({
  id: wallet.id,
  user_id: wallet.userId,
  available_balance: wallet.balance,
  pending_clearance: wallet.pendingClearance,
  escrow_balance: wallet.escrowBalance,
  frozen: wallet.frozen,
  currency: wallet.currency,
  updated_at: wallet.updatedAt ? wallet.updatedAt.toISOString() : nowIso()
});

const mapWalletWithDisplay = async (wallet: any, userCountry?: string | null) => {
  const base = mapWallet(wallet);
  try {
    const config = await loadCurrencyConfig();
    const displayCurrency = getDefaultCurrencyForCountry(userCountry, config) || wallet.currency || config.baseCurrency || 'USD';
    const walletCurrency = (wallet.currency || config.baseCurrency || 'USD').toString().toUpperCase();
    const display = displayCurrency.toString().toUpperCase();
    if (!walletCurrency || walletCurrency === display) {
      return {
        ...base,
        display_currency: display,
        display_available_balance: base.available_balance,
        display_pending_clearance: base.pending_clearance,
        display_escrow_balance: base.escrow_balance,
        fx_rate: 1,
        fx_base: config.baseCurrency
      };
    }
    const available = convertAmount(Number(base.available_balance ?? 0), walletCurrency, display, config);
    const pending = convertAmount(Number(base.pending_clearance ?? 0), walletCurrency, display, config);
    const escrow = convertAmount(Number(base.escrow_balance ?? 0), walletCurrency, display, config);
    return {
      ...base,
      display_currency: display,
      display_available_balance: available.amount,
      display_pending_clearance: pending.amount,
      display_escrow_balance: escrow.amount,
      fx_rate: available.rate,
      fx_base: config.baseCurrency
    };
  } catch (e) {
    return base;
  }
};

const mapTransaction = (tx: any) => ({
  id: tx.id,
  wallet_id: tx.walletId,
  user_id: tx.userId,
  type: tx.type,
  amount: tx.amount,
  status: (tx.status || '').toString().toLowerCase(),
  description: tx.description,
  reference_id: tx.referenceId ?? null,
  admin_note: tx.adminNote ?? null,
  created_at: tx.createdAt ? tx.createdAt.toISOString() : nowIso()
});

export const getWallet = async (req: AuthRequest, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.id) return fail(res, 401, 'Unauthorized', 'ERR_UNAUTHORIZED');

    const wallet = await getOrCreateWallet(user.id);
    const userRecord = await prisma.user.findUnique({ where: { id: user.id }, select: { country: true } });
    const payload = await mapWalletWithDisplay(wallet, userRecord?.country);
    return ok(res, payload);
  } catch (error: any) {
    console.error('Get wallet error:', error);
    return fail(res, 500, error?.message || 'Failed to load wallet', 'ERR_INTERNAL');
  }
};

export const getWalletByUserId = async (req: AuthRequest, res: Response) => {
  try {
    const user = getAuthUser(req);
    const { userId } = req.params;
    if (!userId) return fail(res, 400, 'Missing userId', 'ERR_BAD_REQUEST');
    if (!user?.id) return fail(res, 401, 'Unauthorized', 'ERR_UNAUTHORIZED');
    if (!isAdminRole(user.role) && user.id !== userId) {
      return fail(res, 403, 'Not authorized', 'ERR_FORBIDDEN');
    }

    const wallet = await getOrCreateWallet(userId);
    const userRecord = await prisma.user.findUnique({ where: { id: userId }, select: { country: true } });
    const payload = await mapWalletWithDisplay(wallet, userRecord?.country);
    return ok(res, payload);
  } catch (error: any) {
    console.error('Get wallet by userId error:', error);
    return fail(res, 500, error?.message || 'Failed to load wallet', 'ERR_INTERNAL');
  }
};

export const getTransactions = async (req: AuthRequest, res: Response) => {
  try {
    const user = getAuthUser(req);
    if (!user?.id) return fail(res, 401, 'Unauthorized', 'ERR_UNAUTHORIZED');

    const { limit = 50, offset = 0, type } = req.query;
    const wallet = await getOrCreateWallet(user.id);

    const where: any = { userId: user.id, walletId: wallet.id };
    if (type) where.type = type;

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset)
    });

    return ok(res, transactions.map(mapTransaction));
  } catch (error: any) {
    console.error('Get transactions error:', error);
    return fail(res, 500, error?.message || 'Failed to load transactions', 'ERR_INTERNAL');
  }
};

export const getTransactionsByUserId = async (req: AuthRequest, res: Response) => {
  try {
    const requester = getAuthUser(req);
    const { userId } = req.params;
    const { limit = 50, offset = 0, type } = req.query;
    if (!requester?.id) return fail(res, 401, 'Unauthorized', 'ERR_UNAUTHORIZED');
    if (!isAdminRole(requester.role) && requester.id !== userId) {
      return fail(res, 403, 'Not authorized', 'ERR_FORBIDDEN');
    }

    const wallet = await getOrCreateWallet(userId);

    const where: any = { userId, walletId: wallet.id };
    if (type) where.type = type;

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset)
    });

    return ok(res, transactions.map(mapTransaction));
  } catch (error: any) {
    console.error('Get transactions by userId error:', error);
    return fail(res, 500, error?.message || 'Failed to load transactions', 'ERR_INTERNAL');
  }
};

export const getEscrowsByUserId = async (req: AuthRequest, res: Response) => {
  try {
    const requester = getAuthUser(req);
    const { userId } = req.params;
    if (!requester?.id) return fail(res, 401, 'Unauthorized', 'ERR_UNAUTHORIZED');
    if (!isAdminRole(requester.role) && requester.id !== userId) {
      return fail(res, 403, 'Not authorized', 'ERR_FORBIDDEN');
    }

    const escrows = await prisma.escrow.findMany({
      where: { OR: [{ clientId: userId }, { freelancerId: userId }] },
      orderBy: { createdAt: 'desc' }
    });

    return ok(res, escrows);
  } catch (error: any) {
    console.error('Get escrows by userId error:', error);
    return fail(res, 500, error?.message || 'Failed to load escrows', 'ERR_INTERNAL');
  }
};

export const getEscrows = async (req: AuthRequest, res: Response) => {
  try {
    const user = getAuthUser(req);
    const { role } = req.query;
    if (!user?.id) return fail(res, 401, 'Unauthorized', 'ERR_UNAUTHORIZED');

    const escrows = await prisma.escrow.findMany({
      where: role === 'client' ? { clientId: user.id } : { freelancerId: user.id },
      include: {
        order: {
          include: {
            client: { select: { id: true, name: true, email: true } },
            freelancer: { select: { id: true, name: true, email: true } }
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return ok(
      res,
      escrows.map((escrow) => ({
        id: escrow.id,
        order_id: escrow.orderId,
        client_id: escrow.clientId,
        client_name: escrow.order?.client?.name || 'Client',
        freelancer_id: escrow.freelancerId,
        freelancer_name: escrow.order?.freelancer?.name || 'Freelancer',
        amount: escrow.amount,
        commission: escrow.commission,
        status: escrow.status,
        funded_at: escrow.fundedAt?.toISOString(),
        released_at: escrow.releasedAt?.toISOString()
      }))
    );
  } catch (error: any) {
    console.error('Get escrows error:', error);
    return fail(res, 500, error?.message || 'Failed to load escrows', 'ERR_INTERNAL');
  }
};

export const getCommissionSettings = async (_req: AuthRequest, res: Response) => {
  try {
    const settings = await getOrCreateSettings();
    const limits = settings?.walletFundingLimits && typeof settings.walletFundingLimits === 'object'
      ? (settings.walletFundingLimits as Record<string, any>)
      : {};
    const stored = limits.commissionSettings || limits.commission_settings || {};

    return ok(res, {
      freelancer_fee_type: stored.freelancer_fee_type ?? stored.freelancerFeeType ?? 'percentage',
      freelancer_fee_value: stored.freelancer_fee_value ?? stored.freelancerFeeValue ?? 20,
      employer_fee_type: stored.employer_fee_type ?? stored.employerFeeType ?? 'percentage',
      employer_fee_value: stored.employer_fee_value ?? stored.employerFeeValue ?? 0,
      minimum_fee: stored.minimum_fee ?? stored.minimumFee ?? 2,
      max_adjustment: stored.max_adjustment ?? stored.maxAdjustment ?? 100000
    });
  } catch (error: any) {
    console.error('Get commission settings error:', error);
    return fail(res, 500, error?.message || 'Failed to load commission settings', 'ERR_INTERNAL');
  }
};

export const saveCommissionSettings = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return fail(res, 403, 'Forbidden', 'ERR_FORBIDDEN');
    }

    const payload = req.body || {};
    const normalized = {
      freelancer_fee_type: payload.freelancer_fee_type ?? payload.freelancerFeeType ?? 'percentage',
      freelancer_fee_value: Number(payload.freelancer_fee_value ?? payload.freelancerFeeValue ?? 0),
      employer_fee_type: payload.employer_fee_type ?? payload.employerFeeType ?? 'percentage',
      employer_fee_value: Number(payload.employer_fee_value ?? payload.employerFeeValue ?? 0),
      minimum_fee: Number(payload.minimum_fee ?? payload.minimumFee ?? 0),
      max_adjustment: Number(payload.max_adjustment ?? payload.maxAdjustment ?? 100000)
    };

    const settings = await getOrCreateSettings();
    const existingLimits = settings?.walletFundingLimits && typeof settings.walletFundingLimits === 'object'
      ? (settings.walletFundingLimits as Record<string, any>)
      : {};

    const updated = await prisma.settings.update({
      where: { id: settings.id },
      data: {
        walletFundingLimits: {
          ...existingLimits,
          commissionSettings: normalized
        }
      }
    });
    // Keep any duplicate Settings rows in sync so refresh reads consistent values
    await prisma.settings.updateMany({
      where: { id: { not: settings.id } },
      data: {
        walletFundingLimits: {
          ...existingLimits,
          commissionSettings: normalized
        }
      }
    });

    emitAdminEvent(req, 'admin:commission_updated', { settings: normalized });
    return ok(res, normalized);
  } catch (error: any) {
    console.error('Save commission settings error:', error);
    return fail(res, 500, error?.message || 'Failed to save commission settings', 'ERR_INTERNAL');
  }
};

export const getPlatformFinancials = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return fail(res, 403, 'Forbidden', 'ERR_FORBIDDEN');
    }

    const wallets = await prisma.wallet.findMany();
    const escrows = await prisma.escrow.findMany({ where: { status: 'FUNDED' } });

    const totalEscrow = escrows.reduce((sum, e) => sum + Number(e.amount), 0);
    const totalClearedUserFunds = wallets.reduce((sum, w) => sum + Number(w.balance), 0);
    const totalPendingClearance = wallets.reduce((sum, w) => sum + Number(w.pendingClearance), 0);

    const revenueTransactions = await prisma.transaction.findMany({ where: { type: 'COMMISSION' } });
    const platformRevenue = revenueTransactions.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);

    emitAdminEvent(req, 'admin:financials_updated');
    return ok(res, {
      total_escrow: totalEscrow,
      total_cleared_user_funds: totalClearedUserFunds,
      total_pending_clearance: totalPendingClearance,
      platform_revenue: platformRevenue,
      refund_pool: 0
    });
  } catch (error: any) {
    console.error('Get platform financials error:', error);
    return fail(res, 500, error?.message || 'Failed to load platform financials', 'ERR_INTERNAL');
  }
};

export const getAllTransactionsAdmin = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return fail(res, 403, 'Forbidden', 'ERR_FORBIDDEN');
    }

    const { limit = 200, offset = 0, type, status, userId } = req.query;
    const where: any = {};
    if (type) where.type = String(type).toUpperCase();
    if (status) where.status = String(status).toUpperCase();
    if (userId) where.userId = String(userId);

    const transactions = await prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      skip: Number(offset)
    });

    return ok(res, transactions.map(mapTransaction));
  } catch (error: any) {
    console.error('Get all transactions error:', error);
    return fail(res, 500, error?.message || 'Failed to load transactions', 'ERR_INTERNAL');
  }
};

export const adjustWalletBalance = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return fail(res, 403, 'Forbidden', 'ERR_FORBIDDEN');
    }

    const { userId } = req.params;
    const amount = Number(req.body?.amount ?? 0);
    const reason = String(req.body?.reason ?? 'Admin adjustment');

    if (!userId) return fail(res, 400, 'Missing userId', 'ERR_BAD_REQUEST');
    if (!Number.isFinite(amount) || amount === 0) {
      return fail(res, 400, 'Amount must be a non-zero number', 'ERR_BAD_REQUEST');
    }

    const wallet = await getOrCreateWallet(userId);

    await prisma.wallet.update({
      where: { userId },
      data: { balance: Number(wallet.balance) + amount }
    });

    const transaction = await prisma.transaction.create({
      data: {
        userId,
        walletId: wallet.id,
        type: 'ADJUSTMENT',
        amount,
        status: 'COMPLETED',
        description: reason,
        adminNote: `Adjusted by admin ${req.user?.id || ''}`.trim()
      }
    });

    emitAdminEvent(req, 'admin:financials_updated');
    return ok(res, mapTransaction(transaction));
  } catch (error: any) {
    console.error('Adjust wallet balance error:', error);
    return fail(res, 500, error?.message || 'Failed to adjust wallet', 'ERR_INTERNAL');
  }
};

export const reverseTransaction = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return fail(res, 403, 'Forbidden', 'ERR_FORBIDDEN');
    }

    const { id } = req.params;
    if (!id) return fail(res, 400, 'Missing transaction id', 'ERR_BAD_REQUEST');

    const tx = await prisma.transaction.findUnique({ where: { id } });
    if (!tx) return fail(res, 404, 'Transaction not found', 'ERR_NOT_FOUND');
    if ((tx.status || '').toString().toUpperCase() === 'REVERSED') {
      return ok(res, mapTransaction(tx));
    }

    const wallet = tx.walletId
      ? await prisma.wallet.findUnique({ where: { id: tx.walletId } })
      : await getOrCreateWallet(tx.userId);

    if (wallet) {
      await prisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: Number(wallet.balance) - Number(tx.amount) }
      });
    }

    const updated = await prisma.transaction.update({
      where: { id },
      data: { status: 'REVERSED' }
    });

    await prisma.transaction.create({
      data: {
        userId: tx.userId,
        walletId: wallet?.id,
        type: 'ADJUSTMENT',
        amount: Number(tx.amount) * -1,
        status: 'COMPLETED',
        description: `Reversal of transaction ${tx.id}`,
        adminNote: `Reversed by admin ${req.user?.id || ''}`.trim()
      }
    });

    emitAdminEvent(req, 'admin:financials_updated');
    return ok(res, mapTransaction(updated));
  } catch (error: any) {
    console.error('Reverse transaction error:', error);
    return fail(res, 500, error?.message || 'Failed to reverse transaction', 'ERR_INTERNAL');
  }
};
export const getAllWalletsAdmin = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return fail(res, 403, 'Forbidden', 'ERR_FORBIDDEN');
    }

    const wallets = await prisma.wallet.findMany({
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: { updatedAt: 'desc' }
    });

    return ok(
      res,
      wallets.map((wallet) => ({
        ...mapWallet(wallet),
        user: wallet.user
      }))
    );
  } catch (error: any) {
    console.error('Get all wallets error:', error);
    return fail(res, 500, error?.message || 'Failed to load wallets', 'ERR_INTERNAL');
  }
};

export const freezeWallet = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return fail(res, 403, 'Forbidden', 'ERR_FORBIDDEN');
    }

    const { userId } = req.params;
    const { reason } = req.body;

    const wallet = await prisma.wallet.update({
      where: { userId },
      data: { frozen: true }
    });

    await prisma.transaction.create({
      data: {
        userId,
        type: 'ADJUSTMENT',
        amount: 0,
        status: 'COMPLETED',
        description: 'Wallet frozen by admin',
        adminNote: reason || 'No reason provided'
      }
    });

    emitAdminEvent(req, 'admin:financials_updated');
    return ok(res, wallet);
  } catch (error: any) {
    console.error('Freeze wallet error:', error);
    return fail(res, 500, error?.message || 'Failed to freeze wallet', 'ERR_INTERNAL');
  }
};

export const unfreezeWallet = async (req: AuthRequest, res: Response) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return fail(res, 403, 'Forbidden', 'ERR_FORBIDDEN');
    }

    const { userId } = req.params;
    const wallet = await prisma.wallet.update({
      where: { userId },
      data: { frozen: false }
    });

    emitAdminEvent(req, 'admin:financials_updated');
    return ok(res, wallet);
  } catch (error: any) {
    console.error('Unfreeze wallet error:', error);
    return fail(res, 500, error?.message || 'Failed to unfreeze wallet', 'ERR_INTERNAL');
  }
};
