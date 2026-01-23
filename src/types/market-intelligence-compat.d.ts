declare module '@/services/adminMarketIntelligence' {
  export type HealthResponse = { analytics: string; updatedAt: string };
  export type KpiPayload = any;
  export type LtvPayload = any;
  export type DemandForecastPayload = any;
  export type RadarSummary = any;

  export const adminMarketIntelligence: {
    getHealth(): Promise<HealthResponse>;
    getKpis(range?: string): Promise<KpiPayload>;
    getLtvPredictions(limit?: number): Promise<LtvPayload>;
    getDemandForecast(range: string): Promise<DemandForecastPayload>;
    getRadarSummary(): Promise<RadarSummary>;
  };

  export { DemandForecastPayload, KpiPayload, LtvPayload, RadarSummary };
}
