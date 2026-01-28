import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { ok } from '../../utils/apiResponse';
import { OrdersService } from './orders.service';

export const getFreelancerOrders = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user!.id;
  const page = Number(req.query.page ?? 1);
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  const status = req.query.status as string | undefined;

  const result = await OrdersService.listForFreelancer({ userId, page, limit, status });
  res.json(ok(result.items, { page, limit, total: result.total }));
});

export default getFreelancerOrders;
