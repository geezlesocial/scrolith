import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, Sparkles, TrendingUp } from 'lucide-react';
import { InsightsService, type ProfessionalScore } from '../../services/insights';

type CreatorAnalyticsCardProps = {
  className?: string;
  compact?: boolean;
};

const formatMetric = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
  return String(Math.round(n * 100) / 100);
};

/**
 * Creator self-serve analytics surface over existing insights APIs
 * (professional growth score + revenue). Non-breaking, no new schema.
 */
export default function CreatorAnalyticsCard({ className = '', compact = false }: CreatorAnalyticsCardProps) {
  const [score, setScore] = useState<ProfessionalScore | null>(null);
  const [revenue, setRevenue] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void Promise.allSettled([InsightsService.getMyPgs(), InsightsService.getRevenue()])
      .then(([pgsResult, revenueResult]) => {
        if (cancelled) return;
        if (pgsResult.status === 'fulfilled') setScore(pgsResult.value);
        if (revenueResult.status === 'fulfilled') setRevenue(revenueResult.value);
        if (pgsResult.status === 'rejected' && revenueResult.status === 'rejected') {
          setError('Insights unavailable right now.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pgs = Number(score?.score);
  const earnings =
    revenue?.totalEarnings ??
    revenue?.total ??
    revenue?.earnings ??
    revenue?.gcoinBalance ??
    revenue?.balance ??
    null;
  const impressions = revenue?.impressions ?? revenue?.views ?? revenue?.contentViews ?? null;
  const engagement = revenue?.engagementRate ?? revenue?.engagement ?? null;

  return (
    <section
      className={`rounded-2xl border border-indigo-100 bg-gradient-to-br from-white via-indigo-50/40 to-slate-50 p-4 shadow-sm ${className}`.trim()}
      aria-label="Creator analytics"
      data-testid="creator-analytics-card"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-indigo-600" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-slate-900">Creator analytics</h3>
        </div>
        <Link to="/scrolitha?intent=career" className="text-[11px] font-semibold text-indigo-700 hover:underline">
          Ask Scrolitha
        </Link>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 gap-2" aria-busy="true">
          <div className="h-16 animate-pulse rounded-xl bg-white/80" />
          <div className="h-16 animate-pulse rounded-xl bg-white/80" />
        </div>
      ) : error && !score && !revenue ? (
        <p className="text-sm text-slate-600">{error}</p>
      ) : (
        <>
          <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
            <div className="rounded-xl border border-white/80 bg-white/90 p-3">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <TrendingUp className="h-3 w-3" aria-hidden="true" />
                Growth score
              </div>
              <div className="mt-1 text-xl font-bold text-slate-900">
                {Number.isFinite(pgs) ? Math.round(pgs) : '—'}
              </div>
            </div>
            <div className="rounded-xl border border-white/80 bg-white/90 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Earnings signal</div>
              <div className="mt-1 text-xl font-bold text-slate-900">{formatMetric(earnings)}</div>
            </div>
            {!compact ? (
              <div className="rounded-xl border border-white/80 bg-white/90 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Reach / engagement</div>
                <div className="mt-1 text-sm font-bold text-slate-900">
                  {impressions != null ? `${formatMetric(impressions)} views` : engagement != null ? formatMetric(engagement) : 'Build with posts'}
                </div>
              </div>
            ) : null}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              to="/my-ads"
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
            >
              Ads performance
            </Link>
            <Link
              to="/scroll"
              className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[11px] font-semibold text-indigo-700 hover:bg-indigo-100"
            >
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              Grow with Scroll
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
