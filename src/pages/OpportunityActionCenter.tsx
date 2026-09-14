import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BadgeCheck,
  BriefcaseBusiness,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Lightbulb,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  X
} from 'lucide-react';
import { useSocket } from '../context/SocketContext';
import { InsightsService, type OpportunityHubData } from '../services/insights';

type Recommendation = NonNullable<OpportunityHubData['actionCenter']>['recommendations'][number];

const priorityClass: Record<Recommendation['priority'], string> = {
  high: 'border-rose-200 bg-rose-50 text-rose-700',
  medium: 'border-amber-200 bg-amber-50 text-amber-700',
  low: 'border-slate-200 bg-slate-50 text-slate-600'
};

const categoryIcon: Record<Recommendation['category'], React.ReactNode> = {
  trust: <ShieldCheck className="h-5 w-5" />,
  profile: <BadgeCheck className="h-5 w-5" />,
  creator: <Sparkles className="h-5 w-5" />,
  hiring: <BriefcaseBusiness className="h-5 w-5" />,
  matching: <Target className="h-5 w-5" />,
  delivery: <CheckCircle2 className="h-5 w-5" />
};

const formatRelativeTime = (value?: string) => {
  const timestamp = value ? new Date(value).getTime() : NaN;
  if (!Number.isFinite(timestamp)) return 'Updated now';
  const minutes = Math.max(0, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 1) return 'Updated just now';
  if (minutes < 60) return `Updated ${minutes}m ago`;
  return `Updated ${Math.round(minutes / 60)}h ago`;
};

export default function OpportunityActionCenter() {
  const { socket } = useSocket();
  const [hub, setHub] = useState<OpportunityHubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Recommendation | null>(null);

  const refresh = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const data = await InsightsService.getOpportunityHub();
      setHub(data);
    } catch (nextError: any) {
      setError(nextError?.response?.data?.message || nextError?.message || 'Unable to load your action center.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleRealtimeUpdate = () => void refresh(true);
    const eventNames = [
      'insights:pgs_updated',
      'insights:opportunity_match_ready',
      'insights:copilot_tip',
      'insights:quests_completed'
    ];
    eventNames.forEach((eventName) => window.addEventListener(eventName, handleRealtimeUpdate));
    return () => eventNames.forEach((eventName) => window.removeEventListener(eventName, handleRealtimeUpdate));
  }, [socket, refresh]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refresh(true);
    };
    window.addEventListener('focus', onVisibility);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onVisibility);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [refresh]);

  const recommendations = hub?.actionCenter?.recommendations || [];
  const matches = hub?.matching?.matches || [];
  const highPriorityCount = useMemo(
    () => recommendations.filter((recommendation) => recommendation.priority === 'high').length,
    [recommendations]
  );

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-slate-950 via-indigo-950 to-slate-900 px-5 py-7 text-white sm:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-200">Opportunity graph</p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Your Action Center</h1>
              <p className="mt-3 text-sm leading-6 text-slate-200">
                Trusted, explainable next steps for your profile, opportunities, delivery work, and business growth.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refresh(true)}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/20 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
              <p className="text-xs text-indigo-100">Trust tier</p>
              <p className="mt-1 text-lg font-semibold">{hub?.trust?.trustTier || 'Building'}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
              <p className="text-xs text-indigo-100">Live opportunities</p>
              <p className="mt-1 text-lg font-semibold">{Number(hub?.matching?.total || 0)}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/10 p-3">
              <p className="text-xs text-indigo-100">Needs attention</p>
              <p className="mt-1 text-lg font-semibold">{highPriorityCount}</p>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Recommended next actions</h2>
              <p className="mt-1 text-sm text-slate-500">{formatRelativeTime(hub?.actionCenter?.generatedAt)}</p>
            </div>
            <Link to="/assistant" className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-700 hover:text-indigo-800">
              Ask Scrolitha <ChevronRight className="h-4 w-4" />
            </Link>
          </div>

          {loading ? <p className="mt-6 text-sm text-slate-500">Loading trusted recommendations...</p> : null}
          {error ? <div className="mt-6 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{error}</div> : null}

          {!loading && !error ? (
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              {recommendations.length ? (
                recommendations.map((recommendation) => (
                  <article key={recommendation.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start gap-3">
                      <div className="rounded-xl bg-indigo-100 p-2 text-indigo-700">{categoryIcon[recommendation.category]}</div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold text-slate-900">{recommendation.title}</h3>
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize ${priorityClass[recommendation.priority]}`}>
                            {recommendation.priority}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-5 text-slate-600">{recommendation.description}</p>
                        <button
                          type="button"
                          onClick={() => setSelected(recommendation)}
                          className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-slate-600 hover:text-indigo-700"
                        >
                          <CircleHelp className="h-3.5 w-3.5" /> Why this action?
                        </button>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {recommendation.approvalRequired ? (
                            <button
                              type="button"
                              onClick={() => setSelected(recommendation)}
                              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                            >
                              Review before continuing <ChevronRight className="h-4 w-4" />
                            </button>
                          ) : (
                            <Link
                              to={recommendation.actionUrl}
                              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                            >
                              {recommendation.actionLabel} <ChevronRight className="h-4 w-4" />
                            </Link>
                          )}
                          {recommendation.approvalRequired ? <span className="text-xs text-slate-500">Approval required</span> : null}
                        </div>
                      </div>
                    </div>
                  </article>
                ))
              ) : (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800 md:col-span-2">
                  Your action center is clear. Keep your profile and delivery activity current to receive new opportunities.
                </div>
              )}
            </div>
          ) : null}

          {!loading && !error ? (
            <section className="mt-8 border-t border-slate-200 pt-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Explainable opportunity matches</h2>
                  <p className="mt-1 text-sm text-slate-500">Ranking reasons are visible so you can make informed decisions.</p>
                </div>
                <Link to="/discovery" className="text-sm font-semibold text-indigo-700 hover:text-indigo-800">Open discovery</Link>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {matches.slice(0, 3).map((match: any) => {
                  const targetType = String(match?.targetType || '').toLowerCase();
                  const targetId = String(match?.targetId || match?.target?.id || '').trim();
                  const href = targetType === 'job' && targetId ? `/jobs/${targetId}` : targetType === 'gig' && targetId ? `/gigs/${targetId}` : '/discovery';
                  const reason = Array.isArray(match?.reasons) && match.reasons.length ? String(match.reasons[0]) : 'Matched from your profile and trusted opportunity signals.';
                  return (
                    <article key={String(match?.id || targetId)} className="rounded-2xl border border-slate-200 bg-white p-4">
                      <div className="flex items-start justify-between gap-3">
                        <h3 className="line-clamp-2 text-sm font-semibold text-slate-900">{match?.target?.title || 'Opportunity match'}</h3>
                        <span className="shrink-0 rounded-full bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">{Number(match?.score || 0).toFixed(0)}%</span>
                      </div>
                      <p className="mt-3 text-sm text-slate-600">{reason}</p>
                      <Link to={href} className="mt-3 inline-flex text-sm font-semibold text-indigo-700 hover:text-indigo-800">Open opportunity</Link>
                    </article>
                  );
                })}
                {!matches.length ? <p className="text-sm text-slate-500">No active matches yet. Improving your profile and trust signals will broaden discovery.</p> : null}
              </div>
            </section>
          ) : null}
        </div>
      </section>

      {selected ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-slate-950/50 p-4 backdrop-blur-sm sm:items-center" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="action-review-title" className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600">Explainable recommendation</p>
                <h2 id="action-review-title" className="mt-2 text-xl font-semibold text-slate-900">{selected.title}</h2>
              </div>
              <button type="button" onClick={() => setSelected(null)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label="Close review">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mt-5 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
              <div className="flex gap-2 text-indigo-800"><Lightbulb className="mt-0.5 h-4 w-4 shrink-0" /><p className="text-sm">{selected.explanation.summary}</p></div>
              <ul className="mt-3 space-y-1 text-sm text-indigo-900">
                {selected.explanation.signals.map((signal) => <li key={signal}>• {signal}</li>)}
              </ul>
            </div>
            <p className="mt-4 text-xs leading-5 text-slate-500">{selected.explanation.privacyNote}</p>
            <div className="mt-5 flex flex-wrap justify-end gap-3">
              <button type="button" onClick={() => setSelected(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">Not now</button>
              <Link to={selected.actionUrl} onClick={() => setSelected(null)} className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                I approve — {selected.actionLabel}
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
