import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminMarketIntelligence, DemandForecastPayload, KpiPayload, LtvPayload, RadarSummary } from '@/services/adminMarketIntelligence';
import { useCurrency } from '@/context/CurrencyContext';
import { Loader2, PieChart, Zap, ChartBar } from 'lucide-react';

const formatPercent = (value: number | null | undefined) =>
  value === null || value === undefined ? 'N/A' : `${value.toFixed(1)}%`;

const SectionCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
    <div className="px-6 py-4 border-b border-gray-100 text-sm font-semibold uppercase text-gray-500 tracking-wide">{title}</div>
    <div className="p-6 space-y-4">{children}</div>
  </div>
);

const SkeletonCard = () => (
  <div className="h-32 bg-gray-100 animate-pulse rounded-xl border border-gray-200"></div>
);

const MarketIntelligence = () => {
  const { formatPrice } = useCurrency();
  const [health, setHealth] = useState<{ analytics: string; updatedAt: string } | null>(null);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<KpiPayload | null>(null);
  const [kpiError, setKpiError] = useState<string | null>(null);
  const [ltv, setLtv] = useState<LtvPayload | null>(null);
  const [ltvError, setLtvError] = useState<string | null>(null);
  const [forecast30, setForecast30] = useState<DemandForecastPayload | null>(null);
  const [forecast90, setForecast90] = useState<DemandForecastPayload | null>(null);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [radar, setRadar] = useState<RadarSummary | null>(null);
  const [radarError, setRadarError] = useState<string | null>(null);

  const loadHealth = useCallback(async () => {
    try {
      const data = await adminMarketIntelligence.getHealth();
      setHealth(data);
      setHealthError(null);
    } catch (error: any) {
      setHealthError(error.message || 'Failed to load health');
    }
  }, []);

  const loadKpis = useCallback(async () => {
    try {
      const payload = await adminMarketIntelligence.getKpis('30d');
      setKpis(payload);
      setKpiError(null);
    } catch (error: any) {
      setKpiError(error.message || 'Failed to load KPIs');
    }
  }, []);

  const loadLtv = useCallback(async () => {
    try {
      const payload = await adminMarketIntelligence.getLtvPredictions(10);
      setLtv(payload);
      setLtvError(null);
    } catch (error: any) {
      setLtvError(error.message || 'Failed to load LTV predictions');
    }
  }, []);

  const loadForecast = useCallback(async () => {
    try {
      const [f30, f90] = await Promise.all([
        adminMarketIntelligence.getDemandForecast('30d'),
        adminMarketIntelligence.getDemandForecast('90d')
      ]);
      setForecast30(f30);
      setForecast90(f90);
      setForecastError(null);
    } catch (error: any) {
      setForecastError(error.message || 'Failed to load demand forecast');
    }
  }, []);

  const loadRadar = useCallback(async () => {
    try {
      const summary = await adminMarketIntelligence.getRadarSummary();
      setRadar(summary);
      setRadarError(null);
    } catch (error: any) {
      setRadarError(error.message || 'Failed to load radar summary');
    }
  }, []);

  const refreshAll = useCallback(() => {
    loadHealth();
    loadKpis();
    loadLtv();
    loadForecast();
    loadRadar();
  }, [loadHealth, loadKpis, loadLtv, loadForecast, loadRadar]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const sortedLtv = useMemo(() => {
    if (!ltv?.items) return [];
    return [...ltv.items].sort((a, b) => b.predictedLtv - a.predictedLtv);
  }, [ltv]);

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between flex-wrap gap-4">
        <h2 className="text-2xl font-bold text-gray-900 gap-2 flex items-center">
          <PieChart className="w-6 h-6 text-sky-600" />
          Market Intelligence
        </h2>
        <button onClick={refreshAll} className="px-4 py-2 bg-blue-600 text-white rounded-xl shadow hover:bg-blue-700 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin" />
          Refresh insights
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {health ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 space-y-2">
            <p className="text-xs uppercase tracking-wide text-gray-500">System status</p>
            <p className="text-lg font-semibold text-gray-900">{health.analytics}</p>
            <p className="text-xs text-gray-500">Updated {new Date(health.updatedAt).toLocaleString()}</p>
          </div>
        ) : healthError ? (
          <SectionCard title="System status">
            <p className="text-sm text-red-600">{healthError}</p>
          </SectionCard>
        ) : (
          <SkeletonCard />
        )}

        {kpis ? (
          <>
            <SectionCard title="GMV">
              <div className="text-3xl font-bold text-gray-900">{formatPrice(kpis.gmv.value)}</div>
              <p className={`text-sm ${kpis.gmv.changePct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {kpis.gmv.changePct >= 0 ? '+' : ''}
                {kpis.gmv.changePct.toFixed(1)}%
              </p>
            </SectionCard>
            <SectionCard title="Take Rate">
              <div className="text-xl font-semibold text-gray-900">{kpis.takeRate.percent.toFixed(1)}%</div>
              <p className="text-sm text-gray-500">Net revenue {formatPrice(kpis.takeRate.netRevenue)}</p>
            </SectionCard>
          </>
        ) : kpiError ? (
          <SectionCard title="KPIs">
            <p className="text-sm text-red-600">{kpiError}</p>
          </SectionCard>
        ) : (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard title="Automation & Dispute Rates">
          {kpis ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase text-gray-500">Automation rate</p>
                  <p className="text-lg font-semibold text-gray-900">{formatPercent(kpis.automationRate.percent)}</p>
                </div>
                <span className="text-xs text-gray-500">{kpis.automationRate.note || 'AI-managed actions'}</span>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase text-gray-500">Delta</p>
                  <p className={`text-sm ${kpis.automationRate.changePct && kpis.automationRate.changePct > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                    {kpis.automationRate.changePct !== null ? `${kpis.automationRate.changePct > 0 ? '+' : ''}${kpis.automationRate.changePct.toFixed(1)}%` : '—'}
                  </p>
                </div>
                <div className="text-xs text-gray-500 max-w-xs">{kpis.automationRate.definition}</div>
              </div>
              <div className="pt-4 border-t border-dashed border-gray-200">
                <p className="text-xs uppercase text-gray-500">Dispute rate</p>
                <p className="text-lg font-semibold text-gray-900">{formatPercent(kpis.disputeRate.percent)}</p>
                <p className="text-xs text-gray-500">Industry avg {formatPercent(kpis.disputeRate.industryAvgPercent)}</p>
              </div>
            </div>
          ) : (
            <SkeletonCard />
          )}
        </SectionCard>
        <SectionCard title="Opportunity Radar">
          {radar ? (
            <>
              <p className="text-base text-gray-900">{radar.summary}</p>
              <p className="text-xs text-gray-500">{radar.signalsScanned.toLocaleString()} signals scanned</p>
              <Link to={radar.reportRoute || '/admin/market-intelligence/report'} className="inline-flex items-center gap-2 text-blue-600 font-semibold">
                <ChartBar className="w-4 h-4" />
                View full report
              </Link>
            </>
          ) : radarError ? (
            <p className="text-sm text-red-600">{radarError}</p>
          ) : (
            <SkeletonCard />
          )}
        </SectionCard>
      </div>

      <SectionCard title="LTV Predictions">
        {ltvError && <p className="text-sm text-red-600">{ltvError}</p>}
        {ltv ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr>
                  {['User', 'Role', 'Predicted LTV', 'Velocity', 'Churn Risk', 'Recommendation'].map((header) => (
                    <th key={header} className="px-3 py-2 font-semibold text-gray-600 uppercase text-xs tracking-wider">{header}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedLtv.map((item) => (
                  <tr key={item.id} className="border-t border-gray-100">
                    <td className="px-3 py-2 text-gray-900">{item.name}</td>
                    <td className="px-3 py-2 text-gray-600 capitalize">{item.role}</td>
                    <td className="px-3 py-2 font-semibold text-gray-900">{formatPrice(item.predictedLtv)}</td>
                    <td className="px-3 py-2 text-gray-600">{item.velocity}</td>
                    <td className="px-3 py-2 text-gray-600">{formatPercent(item.churnRiskPercent)}</td>
                    <td className="px-3 py-2 text-gray-600">{item.recommendation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <SkeletonCard />
        )}
      </SectionCard>

      <SectionCard title="Demand Forecast">
        {forecastError && <p className="text-sm text-red-600">{forecastError}</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[forecast30, forecast90].map((forecast) =>
            forecast ? (
              <div key={forecast.range} className="border border-gray-100 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-gray-500">
                  <Zap className="w-4 h-4 text-yellow-500" />
                  {forecast.range} forecast
                </div>
                {forecast.items.length === 0 && (
                  <p className="text-sm text-gray-500">No forecasts for {forecast.range} yet.</p>
                )}
                {forecast.items.map((item) => (
                  <div key={item.id} className="p-3 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                    <div className="flex justify-between text-sm font-semibold text-gray-900">
                      <span>{item.domain}</span>
                      <span>{item.skill}</span>
                    </div>
                    <p className="text-xs text-gray-500">
                      Horizon: {item.horizon}  Growth {item.growthPct.toFixed(1)}%
                    </p>
                    <p className="text-sm font-medium text-gray-900">
                      Suggested {item.suggestedRateMin}-{item.suggestedRateMax} {item.suggestedRateUnit}
                    </p>
                    <p className="text-xs text-gray-500">Confidence {item.confidencePct.toFixed(1)}%</p>
                  </div>
                ))}
              </div>
            ) : (
              <SkeletonCard key={`loading-${forecast ? forecast.range : Math.random()}`} />
            )
          )}
        </div>
      </SectionCard>
    </div>
  );
};

export default MarketIntelligence;
