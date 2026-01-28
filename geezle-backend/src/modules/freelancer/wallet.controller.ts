import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/apiResponse';
import { WalletService } from './wallet.service';

export const getWalletSummary = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const summary = await WalletService.getSummary(userId);
  res.json(ok(summary));
});

export const getWalletTransactions = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const page = Number(req.query.page ?? 1);
  const limit = Math.min(Number(req.query.limit ?? 20), 100);

  const result = await WalletService.getTransactions({ userId, page, limit });
  res.json(ok(result.items, { page, limit, total: result.total }));
});

export default { getWalletSummary, getWalletTransactions };
