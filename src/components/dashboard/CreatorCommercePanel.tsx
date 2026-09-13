import React from 'react';
import { Megaphone, RefreshCw, Sparkles, Trophy } from 'lucide-react';
import { Phase3Service, type Phase3CreatorCommerce } from '../../services/phase3';

const number = (value: unknown) => new Intl.NumberFormat().format(Number(value || 0));
const money = (value: unknown, currency?: string) => `${String(currency || 'USD')} ${Number(value || 0).toFixed(2)}`;

export default function CreatorCommercePanel() {
  const [data, setData] = React.useState<Phase3CreatorCommerce | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [error, setError] = React.useState('');

  const load = React.useCallback(async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      setData(await Phase3Service.getCreatorCommerceCampaigns({ limit: 5 }));
    } catch (cause: any) {
      setError(cause?.response?.data?.error || 'Creator commerce is temporarily unavailable.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const totals = data?.campaigns?.totals || {};
  const campaigns = Array.isArray(data?.campaigns?.items) ? data.campaigns.items : [];
  const challenges = Array.isArray(data?.challenges?.active) ? data.challenges.active : [];

  return (
    <section className="rounded-2xl border border-slate-200 bg-white shadow-sm" aria-labelledby="creator-commerce-title">
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div><h3 id="creator-commerce-title" className="text-sm font-semibold text-slate-900">Creator Commerce</h3><p className="mt-0.5 text-[11px] text-slate-500">Campaign visibility, monetization readiness, and creator opportunities.</p></div>
        <button type="button" onClick={() => void load(true)} disabled={refreshing} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-50" aria-label="Refresh creator commerce"><RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /></button>
      </header>
      <div className="p-4">
        {error ? <div role="alert" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</div> : null}
        {loading ? <div className="grid gap-2 sm:grid-cols-3"><div className="h-16 animate-pulse rounded-xl bg-slate-100" /><div className="h-16 animate-pulse rounded-xl bg-slate-100" /><div className="h-16 animate-pulse rounded-xl bg-slate-100" /></div> : (
          <>
            <div className="grid gap-2 sm:grid-cols-3">
              {[
                ['Campaigns', number(totals.count), Megaphone],
                ['Impressions', number(totals.impressions), Sparkles],
                ['Monetization', data?.monetization?.status || 'not started', Trophy]
              ].map(([label, value, Icon]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-slate-50/70 p-3"><div className="flex items-center gap-2 text-slate-500"><Icon className="h-4 w-4" /><span className="text-[10px] font-semibold uppercase tracking-[0.14em]">{label}</span></div><p className="mt-2 truncate text-sm font-semibold capitalize text-slate-900">{String(value)}</p></div>)}
            </div>
            {campaigns.length ? <div className="mt-4 space-y-2"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Recent campaigns</p>{campaigns.map((campaign: any) => <div key={campaign.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{campaign.title || 'Untitled campaign'}</p><p className="text-[11px] text-slate-500">{campaign.status || 'draft'} · {number(campaign.metrics?.impressions)} impressions</p></div><span className="shrink-0 text-xs font-semibold text-slate-700">{money(campaign.spend, campaign.currency)}</span></div>)}</div> : <div className="mt-4 rounded-xl border border-dashed border-slate-300 px-4 py-5 text-center text-xs text-slate-500">No creator campaigns yet. Your approved campaigns will appear here.</div>}
            {challenges.length ? <div className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/50 px-3 py-2.5"><p className="text-xs font-semibold text-indigo-900">Open creator opportunities</p><p className="mt-1 text-xs text-indigo-700">{challenges.length} active challenge{challenges.length === 1 ? '' : 's'} available for participation.</p></div> : null}
          </>
        )}
      </div>
    </section>
  );
}
