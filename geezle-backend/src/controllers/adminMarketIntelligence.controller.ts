import { Request, Response } from 'express';
import { OrderStatus } from '@prisma/client';
import prisma from '../utils/prismaClient';
const INDUSTRY_DISPUTE_AVG = Number(process.env.INDUSTRY_DISPUTE_AVG ?? 3.5);

const round = (value: number) => Number(value.toFixed(2));

interface AdminRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

const parseRangeDays = (range: string | undefined, fallback = 30) => {
  if (!range) return fallback;
  const match = range.match(/(\d+)/);
  if (!match) return fallback;
  const days = Number(match[1]);
  if (Number.isNaN(days) || days <= 0) return fallback;
  return Math.min(Math.max(days, 1), 365);
};

const buildRangeWindow = (days: number) => {
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setDate(start.getDate() - (days - 1));
  start.setHours(0, 0, 0, 0);
  return { start, end };
};

const buildPreviousWindow = (currentStart: Date, days: number) => {
  const prevEnd = new Date(currentStart);
  prevEnd.setMilliseconds(prevEnd.getMilliseconds() - 1);
  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevEnd.getDate() - (days - 1));
  prevStart.setHours(0, 0, 0, 0);
  return { start: prevStart, end: prevEnd };
};

export const getHealth = async (req: AdminRequest, res: Response) => {
  try {
    return res.json({
      success: true,
      data: {
        analytics: 'operational',
        updatedAt: new Date().toISOString()
      }
    });
  } catch (error: any) {
    console.error('Market intelligence health error:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const getKpis = async (req: AdminRequest, res: Response) => {
  try {
    const rangeParam = req.query.range as string | undefined;
    const days = parseRangeDays(rangeParam, 30);
    const currentWindow = buildRangeWindow(days);
    const previousWindow = buildPreviousWindow(currentWindow.start, days);

    const gmvStatuses = ['PAID', 'COMPLETED'];
    const activeStatuses = ['PAID', 'IN_PROGRESS', 'UNDER_REVIEW', 'COMPLETED', 'DISPUTED'];

    const [currentOrders, previousOrders] = await Promise.all([
      prisma.order.findMany({
          where: {
            status: { in: gmvStatuses as OrderStatus[] },
            createdAt: { gte: currentWindow.start, lte: currentWindow.end }
          },
        select: { amount: true }
      }),
      prisma.order.findMany({
        where: {
            status: { in: gmvStatuses as OrderStatus[] },
          createdAt: { gte: previousWindow.start, lte: previousWindow.end }
        },
        select: { amount: true }
      })
    ]);

    const currentGmv = currentOrders.reduce((sum, order) => sum + order.amount, 0);
    const previousGmv = previousOrders.reduce((sum, order) => sum + order.amount, 0);
    const changePct = round(((currentGmv - previousGmv) / Math.max(previousGmv, 1)) * 100);

    const currentEscrowSum = await prisma.escrow.aggregate({
      _sum: { commission: true },
      where: {
        order: {
          createdAt: { gte: currentWindow.start, lte: currentWindow.end }
        }
      }
    });
    const platformRevenue = currentEscrowSum._sum.commission ?? 0;
    const takeRatePercent = currentGmv > 0 ? round((platformRevenue / Math.max(currentGmv, 1)) * 100) : 0;
    const netRevenue = round(platformRevenue);

    const [autoTotal, autoHandled, prevAutoTotal, prevAutoHandled] = await Promise.all([
      prisma.aiAutomationLog.count({
        where: { createdAt: { gte: currentWindow.start, lte: currentWindow.end } }
      }),
      prisma.aiAutomationLog.count({
        where: {
          handledByAI: true,
          createdAt: { gte: currentWindow.start, lte: currentWindow.end }
        }
      }),
      prisma.aiAutomationLog.count({
        where: { createdAt: { gte: previousWindow.start, lte: previousWindow.end } }
      }),
      prisma.aiAutomationLog.count({
        where: {
          handledByAI: true,
          createdAt: { gte: previousWindow.start, lte: previousWindow.end }
        }
      })
    ]);

    let automationPercent: number | null = null;
    let automationChange: number | null = null;
    let automationNote: string | undefined;
    if (autoTotal === 0) {
      automationNote = 'Not enough data';
    } else {
      automationPercent = round((autoHandled / autoTotal) * 100);
      if (prevAutoTotal > 0) {
        const prevPercent = round((prevAutoHandled / prevAutoTotal) * 100);
        automationChange = round(automationPercent - prevPercent);
      }
    }

    const disputeCount = await prisma.order.count({
      where: {
        status: 'DISPUTED',
        createdAt: { gte: currentWindow.start, lte: currentWindow.end }
      }
    });
    const totalRelevantOrders = await prisma.order.count({
      where: {
        status: { in: activeStatuses as OrderStatus[] },
        createdAt: { gte: currentWindow.start, lte: currentWindow.end }
      }
    });
    const disputePercent = totalRelevantOrders === 0 ? 0 : round((disputeCount / totalRelevantOrders) * 100);

    return res.json({
      success: true,
      data: {
        range: `${days}d`,
        gmv: {
          value: round(currentGmv),
          changePct
        },
        takeRate: {
          percent: takeRatePercent,
          netRevenue
        },
        automationRate: {
          percent: automationPercent,
          changePct: automationChange,
          definition: 'Automation Rate = (auto-handled events / total events) * 100',
          note: automationNote
        },
        disputeRate: {
          percent: disputePercent,
          industryAvgPercent: INDUSTRY_DISPUTE_AVG
        }
      }
    });
  } catch (error: any) {
    console.error('Market intelligence KPIs error:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const getLtvPredictions = async (req: AdminRequest, res: Response) => {
  try {
    const limit = Number(req.query.limit ?? 10);
    const items = await prisma.ltvPrediction.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 50)
    });
    const confidence = items[0]?.confidence ?? 'unknown';
    return res.json({ success: true, data: { confidence, items } });
  } catch (error: any) {
    console.error('Market intelligence LTV error:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const getDemandForecast = async (req: AdminRequest, res: Response) => {
  try {
    const range = (req.query.range as string | undefined) ?? '30d';
    const items = await prisma.demandForecast.findMany({
      where: { horizon: range },
      orderBy: { createdAt: 'desc' }
    });
    return res.json({ success: true, data: { range, items } });
  } catch (error: any) {
    console.error('Market intelligence demand forecast error:', error);
    return res.status(500).json({ error: error.message });
  }
};

export const getRadarSummary = async (req: AdminRequest, res: Response) => {
  try {
    const snapshot = await prisma.opportunityRadarSnapshot.findFirst({
      orderBy: { createdAt: 'desc' }
    });
    if (!snapshot) {
      return res.json({
        success: true,
        data: {
          signalsScanned: 0,
          summary: 'Insights not available yet.',
          reportRoute: '/admin/market-intelligence/report'
        }
      });
    }
    return res.json({ success: true, data: snapshot });
  } catch (error: any) {
    console.error('Market intelligence radar error:', error);
    return res.status(500).json({ error: error.message });
  }
};
