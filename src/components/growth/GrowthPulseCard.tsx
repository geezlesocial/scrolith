import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Compass, Sparkles, TrendingUp } from 'lucide-react';
import { GrowthIntelligenceService, type GrowthPulse, emptyGrowthPulse } from '../../services/growthIntelligence';

type GrowthPulseCardProps = {
  className?: string;
  compact?: boolean;
};

/**
 * Phase 20.3 — personalized growth pulse over existing preference + discovery signals.
 */
export default function GrowthPulseCard({ className = '', compact = false }: GrowthPulseCardProps) {
  const [pulse, setPulse] = useState<GrowthPulse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    void GrowthIntelligenceService.getPulse()
      .then((data) => {
        if (!cancelled) setPulse(data || emptyGrowthPulse());
      })
      .catch(() => {
        if (!cancelled) {
          setPulse(emptyGrowthPulse());
          setError(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [retryToken]);

  const data = pulse || emptyGrowthPulse();
  const actions = (data.actions || []).slice(0, compact ? 3 : 4);

  return (
    <section
      className={`rounded-2xl border border-emerald-100 bg-gradient-to-br from-white via-emerald-50/40 to-slate-50 p-4 shadow-sm ${className}`.trim()}
      aria-label="Growth pulse"
      data-testid="growth-pulse-card"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-emerald-600" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-slate-900">Growth pulse</h3>
        </div>
        <Link
          to="/scrolitha?intent=growth"
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
        >
          <Sparkles className="h-3 w-3" aria-hidden="true" />
          Ask Scrolitha
        </Link>
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true">
          <div className="h-12 animate-pulse rounded-xl bg-white/80" />
          <div className="h-12 animate-pulse rounded-xl bg-white/80" />
        </div>
      ) : error && !actions.length ? (
        <div role="status" className="text-sm text-slate-600">
          <p>Growth insights unavailable right now.</p>
          <button
            type="button"
            onClick={() => setRetryToken((n) => n + 1)}
            className="mt-2 text-xs font-semibold text-emerald-700 hover:underline"
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <p className="text-sm font-medium text-slate-800">{data.discovery?.headline || 'Grow this week'}</p>
          <p className="mt-1 text-[11px] text-slate-500">
            Focus: <span className="font-semibold text-slate-700">{data.feedIntent || 'for_you'}</span>
            {data.roleContext && data.roleContext !== 'unknown' ? (
              <>
                {' '}
                · Role: <span className="font-semibold text-slate-700">{data.roleContext}</span>
              </>
            ) : null}
          </p>

          {!compact && data.postingGuidance?.bestWindowsLocal?.length ? (
            <div className="mt-3 rounded-xl border border-white/80 bg-white/90 p-3">
              <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <Compass className="h-3 w-3" aria-hidden="true" />
                Best posting windows
              </div>
              <p className="mt-1 text-xs text-slate-700">{data.postingGuidance.bestWindowsLocal.join(' · ')}</p>
              <p className="mt-1 text-[11px] text-slate-500">{data.postingGuidance.tip}</p>
            </div>
          ) : null}

          {data.creator?.suggestedFormats?.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {data.creator.suggestedFormats.slice(0, 3).map((format) => (
                <span
                  key={format}
                  className="rounded-full border border-emerald-100 bg-white px-2.5 py-1 text-[10px] font-semibold text-emerald-800"
                >
                  {format}
                </span>
              ))}
            </div>
          ) : null}

          <ul className="mt-3 space-y-2">
            {actions.map((action) => (
              <li key={action.id}>
                <Link
                  to={action.href}
                  className="flex items-center justify-between gap-2 rounded-xl border border-slate-100 bg-white/90 px-3 py-2 text-sm hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-slate-900">{action.title}</span>
                    <span className="block truncate text-[11px] text-slate-500">{action.caption}</span>
                  </span>
                  <span className="shrink-0 text-[11px] font-semibold text-emerald-700">Go</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
