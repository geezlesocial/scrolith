import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';

const nowIso = () => new Date().toISOString();

const ok = <T>(res: Response, data: T, message?: string) =>
  res.json({ success: true, data, message, timestamp: nowIso() });

const fail = (res: Response, status: number, message: string, code = 'ERR_WITHDRAWAL') =>
  res.status(status).json({ success: false, error: message, code, timestamp: nowIso() });

const mapWithdrawal = (req: any) => ({
  id: req.id,
  user_id: req.userId,
  amount: Number(req.amount ?? 0),
  method: req.method,
  details: req.details ?? {},
  status: (req.status || '').toString().toLowerCase(),
  created_at: req.createdAt ? req.createdAt.toISOString() : nowIso(),
  updated_at: req.updatedAt ? req.updatedAt.toISOString() : nowIso()
});

export const requestWithdrawal = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return fail(res, 401, 'Unauthorized', 'ERR_UNAUTHORIZED');

    const payload = req.body || {};
    const rawAmount = Number(payload.amount ?? 0);
    const method = (payload.method || payload.paymentMethodId || 'manual').toString();
    const details =
      payload.details && typeof payload.details === 'object'
        ? payload.details
        : payload.notes
          ? { notes: payload.notes }
          : {};

    if (!rawAmount || Number.isNaN(rawAmount) || rawAmount <= 0) {
      return fail(res, 400, 'Amount must be greater than zero', 'ERR_BAD_REQUEST');
    }

    const wallet = await prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) return fail(res, 404, 'Wallet not found', 'ERR_NOT_FOUND');
    if (wallet.frozen) return fail(res, 403, 'Wallet is frozen', 'ERR_FORBIDDEN');
    if (Number(wallet.balance) < rawAmount) {
      return fail(res, 400, 'Insufficient balance', 'ERR_INSUFFICIENT');
    }

    const result = await prisma.$transaction(async (tx) => {
      const withdrawalRequest = await tx.withdrawalRequest.create({
        data: {
          userId,
          amount: rawAmount,
          method,
          details,
          status: 'PENDING'
        }
      });

      await tx.wallet.update({
        where: { userId },
        data: { balance: { decrement: rawAmount } }
      });

      await tx.transaction.create({
        data: {
          userId,
          walletId: wallet.id,
          type: 'WITHDRAWAL',
          amount: rawAmount,
          status: 'PENDING',
          currency: wallet.currency,
          description: `Withdrawal request via ${method}`,
          referenceId: withdrawalRequest.id
        }
      });

      return withdrawalRequest;
    });

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
