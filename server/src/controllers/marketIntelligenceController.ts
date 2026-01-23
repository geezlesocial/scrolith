import { Request, Response } from 'express';

const KPI_BY_RANGE: Record<string, any> = {
  '30d': {
    range: '30d',
    gmv: { value: 452300, changePct: 12.3 },
    takeRate: { percent: 12.6, netRevenue: 57032 },
    automationRate: {
      percent: 81.4,
      changePct: 5.2,
      definition: 'AI routing + auto-triage actions',
      note: 'Based on last 30 days'
    },
    disputeRate: { percent: 1.4, industryAvgPercent: 3.5 }
  },
  '90d': {
    range: '90d',
    gmv: { value: 1314500, changePct: 9.5 },
    takeRate: { percent: 12.1, netRevenue: 159115 },
    automationRate: {
      percent: 79.2,
      changePct: 3.8,
      definition: 'AI routing + auto-triage actions',
      note: 'Rolling 90 day window'
    },
    disputeRate: { percent: 1.6, industryAvgPercent: 3.5 }
  }
};

const DEMAND_FORECAST: Record<string, any> = {
  '30d': {
    range: '30d',
    items: [
      {
        id: 'forecast-ai-30',
        domain: 'AI Agent Dev',
        skill: 'Agent Engineering',
        horizon: '30d',
        growthPct: 145,
        suggestedRateMin: 90,
        suggestedRateMax: 160,
        suggestedRateUnit: '/hr',
        confidencePct: 92
      },
      {
        id: 'forecast-marketing-30',
        domain: 'Marketing',
        skill: 'Brand Strategy',
        horizon: '30d',
        growthPct: 82,
        suggestedRateMin: 70,
        suggestedRateMax: 110,
        suggestedRateUnit: '/project',
        confidencePct: 86
      }
    ]
  },
  '90d': {
    range: '90d',
    items: [
      {
        id: 'forecast-backend-90',
        domain: 'Backend',
        skill: 'Go / Rust',
        horizon: '90d',
        growthPct: 95,
        suggestedRateMin: 85,
        suggestedRateMax: 140,
        suggestedRateUnit: '/hr',
        confidencePct: 89
      },
      {
        id: 'forecast-video-90',
        domain: 'Video',
        skill: 'Video UGC',
        horizon: '90d',
        growthPct: 72,
        suggestedRateMin: 65,
        suggestedRateMax: 120,
        suggestedRateUnit: '/project',
        confidencePct: 81
      }
    ]
  }
};

const LTV_PREDICTIONS = {
  confidence: 'high',
  items: [
    {
      id: 'ltv-1',
      userId: 'user-1801',
      name: 'Top Agency',
      role: 'freelancer',
      predictedLtv: 150000,
      velocity: 'high',
      churnRiskPercent: 5,
      recommendation: 'Offer Pro Plan',
      confidence: 'high'
    },
    {
      id: 'ltv-2',
      userId: 'user-2204',
      name: 'Growth Foundry',
      role: 'employer',
      predictedLtv: 98000,
      velocity: 'medium',
      churnRiskPercent: 12,
      recommendation: 'Schedule dedicated account review',
      confidence: 'medium'
    },
    {
      id: 'ltv-3',
      userId: 'user-1953',
      name: 'AI Launch Lab',
      role: 'freelancer',
      predictedLtv: 124500,
      velocity: 'medium',
      churnRiskPercent: 8,
      recommendation: 'Extend milestone support',
      confidence: 'high'
    }
  ]
};

export const getHealth = (_req: Request, res: Response) => {
  return res.json({
    success: true,
    data: {
      analytics: 'operational',
      updatedAt: new Date().toISOString()
    }
  });
};

export const getKpis = (req: Request, res: Response) => {
  const range = (req.query.range as string) || '30d';
  const payload = KPI_BY_RANGE[range] || KPI_BY_RANGE['30d'];
  return res.json({ success: true, data: payload });
};

export const getLtvPredictions = (_req: Request, res: Response) => {
  return res.json({ success: true, data: LTV_PREDICTIONS });
};

export const getDemandForecast = (req: Request, res: Response) => {
  const range = (req.query.range as string) || '30d';
  const payload = DEMAND_FORECAST[range] || DEMAND_FORECAST['30d'];
  return res.json({ success: true, data: payload });
};

export const getRadarSummary = (_req: Request, res: Response) => {
  return res.json({
    success: true,
    data: {
      signalsScanned: 50000,
      summary: 'AI scans macro market signals for growth pockets.',
      reportRoute: '/admin/market-intelligence/report'
    }
  });
};
