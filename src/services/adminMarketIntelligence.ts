const API_BASE = '/api/admin/market-intelligence';

type ApiResponse<T> = { success: true; data: T } | { success: false; error?: string; message?: string };

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    credentials: 'include',
    cache: 'no-store',
    ...options
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const errorMsg = json?.error || json?.message || `HTTP ${res.status}`;
    throw new Error(errorMsg);
  }
  if (json && typeof json === 'object' && 'success' in json) {
    if (json.success) {
      return json.data;
    }
    throw new Error(json.error || json.message || 'Unexpected response');
  }
  return json;
}

export type HealthResponse = { analytics: string; updatedAt: string };
export type KpiPayload = {
  range: string;
  gmv: { value: number; changePct: number };
  takeRate: { percent: number; netRevenue: number };
  automationRate: { percent: number | null; changePct: number | null; definition: string; note?: string };
  disputeRate: { percent: number; industryAvgPercent: number };
};
export type LtvPrediction = {
  id: string;
  userId: string;
  name: string;
  role: string;
  predictedLtv: number;
  velocity: string;
  churnRiskPercent: number;
  recommendation: string;
  confidence: string;
};
export type LtvPayload = { confidence: string; items: LtvPrediction[] };
export type DemandForecastItem = {
  id: string;
  domain: string;
  skill: string;
  horizon: string;
  growthPct: number;
  suggestedRateMin: number;
  suggestedRateMax: number;
  suggestedRateUnit: string;
  confidencePct: number;
};
export type DemandForecastPayload = { range: string; items: DemandForecastItem[] };
export type RadarSummary = {
  signalsScanned: number;
  summary: string;
  reportRoute: string;
};

export const adminMarketIntelligence = {
  async getHealth(): Promise<HealthResponse> {
    return request<{ success: true; data: HealthResponse }>('/health').then((payload: any) => payload?.data ?? payload);
  },

  async getKpis(range: string = '30d'): Promise<KpiPayload> {
    return request<{ success: true; data: KpiPayload }>(`/kpis?range=${encodeURIComponent(range)}`).then((payload: any) => payload?.data ?? payload);
  },

  async getLtvPredictions(limit = 10): Promise<LtvPayload> {
    return request<{ success: true; data: LtvPayload }>(`/ltv-predictions?limit=${limit}`).then((payload: any) => payload?.data ?? payload);
  },

  async getDemandForecast(range: string): Promise<DemandForecastPayload> {
    return request<{ success: true; data: DemandForecastPayload }>(`/demand-forecast?range=${encodeURIComponent(range)}`).then((payload: any) => payload?.data ?? payload);
  },

  async getRadarSummary(): Promise<RadarSummary> {
    return request<{ success: true; data: RadarSummary }>('/opportunity-radar/summary').then((payload: any) => payload?.data ?? payload);
  }
};
