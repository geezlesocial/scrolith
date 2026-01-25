import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AdminRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

const emitAdminAnalyticsEvent = (req: AdminRequest, event: string, payload: any = {}) => {
  const io = req.app.get('io');
  if (io) {
    io.emit(event, { ...payload, timestamp: new Date().toISOString() });
  }
};

const respondEmpty = (res: Response, fallback: any[] = [], message = 'No analytics data available') =>
  res.json({ success: true, data: fallback, message });

const parseRangeDays = (range: string | undefined, fallback: number) => {
  if (!range) return fallback;
  const match = range.match(/(\d+)/);
  if (!match) return fallback;
  const days = Number(match[1]);
  if (Number.isNaN(days) || days <= 0) return fallback;
  return Math.min(Math.max(days, 1), 90);
};

const buildDateSeries = (days: number) => {
  const series: string[] = [];
  const anchor = new Date();
  anchor.setHours(0, 0, 0, 0);
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(anchor);
    date.setDate(anchor.getDate() - offset);
    series.push(date.toISOString().split('T')[0]);
  }
  return series;
};

export const getActivityMetrics = async (req: AdminRequest, res: Response) => {
  try {
    const rangeParam = req.query.range as string | undefined;
    const days = parseRangeDays(rangeParam, 7);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const [orders, messages, users] = await Promise.all([
      prisma.order.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      prisma.communityMessage.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      prisma.user.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } })
    ]);

    const buckets = buildDateSeries(days).reduce<Record<string, { date: string; messages: number; newUsers: number; orders: number }>>((acc, date) => {
      acc[date] = { date, messages: 0, newUsers: 0, orders: 0 };
      return acc;
    }, {});

    orders.forEach((order) => {
      const key = order.createdAt.toISOString().split('T')[0];
      if (buckets[key]) buckets[key].orders += 1;
    });

    messages.forEach((msg) => {
      const key = msg.createdAt.toISOString().split('T')[0];
      if (buckets[key]) buckets[key].messages += 1;
    });

    users.forEach((user) => {
      const key = user.createdAt.toISOString().split('T')[0];
      if (buckets[key]) buckets[key].newUsers += 1;
    });

    const activity = Object.values(buckets);
    emitAdminAnalyticsEvent(req, 'admin:activity_updated', { rangeDays: days });
    return res.json({ success: true, data: activity });
  } catch (error: any) {
    console.error('Get activity metrics error:', error);
    return respondEmpty(res, [], 'Activity metrics unavailable');
  }
};

export const getRevenueBreakdown = async (req: AdminRequest, res: Response) => {
  try {
    const rangeParam = req.query.range as string | undefined;
    const days = parseRangeDays(rangeParam, 30);
    const since = new Date();
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - (days - 1));

    const transactions = await prisma.transaction.findMany({
      where: { createdAt: { gte: since } },
      select: { amount: true, type: true }
    });

    const categories = [
      { name: 'Gig commissions', types: ['COMMISSION'] },
      { name: 'Featured listings', types: ['FEE'] },
      { name: 'Ads', types: ['ADJUSTMENT'] }
    ];

    const totals = transactions.reduce(
      (acc, tx) => {
        const amount = Math.abs(Number(tx.amount));
        const found = categories.find((cat) => cat.types.includes(tx.type));
        if (found) {
          acc[found.name] = (acc[found.name] || 0) + amount;
        } else {
          acc.other += amount;
        }
        return acc;
      },
      { other: 0 } as Record<string, number>
    );

    const breakdown = categories.map((cat) => ({
      name: cat.name,
      value: Number((totals[cat.name] || 0).toFixed(2))
    }));

    if (totals.other > 0) {
      breakdown.push({ name: 'Other', value: Number(totals.other.toFixed(2)) });
    }

    emitAdminAnalyticsEvent(req, 'admin:revenue_updated', { rangeDays: days });
    return res.json({ success: true, data: breakdown });
  } catch (error: any) {
    console.error('Get revenue breakdown error:', error);
    return respondEmpty(res, [], 'Revenue metrics unavailable');
  }
};
