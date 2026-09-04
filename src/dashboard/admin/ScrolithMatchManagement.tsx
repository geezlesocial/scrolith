import React, { useEffect, useState } from 'react';
import { CheckCircle2, RefreshCw, Save, Shield } from 'lucide-react';
import { ScrolithMatchService, type ScrolithMatchConfig } from '../../services/scrolithMatch';

const DEFAULT_CONFIG: ScrolithMatchConfig = {
  enabled: true, filtersEnabled: true, insightsEnabled: true, minimumScore: 0.2, maxCandidates: 30, dailyInterestLimit: 30, dismissCooldownDays: 30,
  weights: { skills: 0.45, experience: 0.1, location: 0.15, completeness: 0.2, activity: 0.1 }
};

const ScrolithMatchManagement: React.FC = () => {
  const [config, setConfig] = useState<ScrolithMatchConfig>(DEFAULT_CONFIG);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [nextConfig, nextAnalytics] = await Promise.all([ScrolithMatchService.getAdminConfig(), ScrolithMatchService.getAdminAnalytics()]);
      setConfig(nextConfig); setAnalytics(nextAnalytics);
    } catch (cause: any) { setError(cause?.response?.data?.error || cause?.message || 'Unable to load Match controls.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  const save = async () => {
    setSaving(true); setMessage(''); setError('');
    try { setConfig(await ScrolithMatchService.updateAdminConfig(config)); setMessage('Scrolith Match configuration saved.'); }
    catch (cause: any) { setError(cause?.response?.data?.error || cause?.message || 'Unable to save Match configuration.'); }
    finally { setSaving(false); }
  };
  const update = (patch: Partial<ScrolithMatchConfig>) => setConfig((current) => ({ ...current, ...patch }));
  const updateWeight = (key: keyof ScrolithMatchConfig['weights'], value: number) => setConfig((current) => ({ ...current, weights: { ...current.weights, [key]: value } }));

  return <section className="space-y-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><Shield className="h-5 w-5 text-blue-600" /><h1 className="text-xl font-bold text-slate-900">Scrolith Match</h1></div><p className="mt-1 text-sm text-slate-600">Operate mutual opportunity matching independently from hiring statuses and existing recommendations.</p></div><button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh</button></div>
    {message && <div role="status" className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><CheckCircle2 className="mr-2 inline h-4 w-4" />{message}</div>}
    {error && <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <div className="rounded-lg border border-slate-200 bg-white p-5"><h2 className="font-semibold text-slate-900">Runtime controls</h2><div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="flex items-center gap-3 rounded-md border border-slate-200 p-3 sm:col-span-2"><input type="checkbox" checked={config.enabled} onChange={(event) => update({ enabled: event.target.checked })} className="h-4 w-4" /><span><span className="block text-sm font-semibold text-slate-900">Enable Scrolith Match</span><span className="block text-xs text-slate-500">Kill switch only; Available for Hire and We Are Hiring are unchanged.</span></span></label>
        <label className="flex items-center gap-3 rounded-md border border-slate-200 p-3"><input type="checkbox" checked={config.filtersEnabled} onChange={(event) => update({ filtersEnabled: event.target.checked })} className="h-4 w-4" /><span><span className="block text-sm font-semibold text-slate-900">Enable smart filters</span><span className="block text-xs text-slate-500">Disable only the advanced list filters.</span></span></label>
        <label className="flex items-center gap-3 rounded-md border border-slate-200 p-3"><input type="checkbox" checked={config.insightsEnabled} onChange={(event) => update({ insightsEnabled: event.target.checked })} className="h-4 w-4" /><span><span className="block text-sm font-semibold text-slate-900">Enable Match Insights</span><span className="block text-xs text-slate-500">Show deterministic reasons from disclosed data.</span></span></label>
        {([['minimumScore', 'Minimum score', 0, 1, 0.01], ['maxCandidates', 'Maximum candidates', 1, 100, 1], ['dailyInterestLimit', 'Daily interest limit', 1, 1000, 1], ['dismissCooldownDays', 'Dismiss cooldown (days)', 1, 365, 1]] as const).map(([key, label, min, max, step]) => <label key={key} className="text-sm font-medium text-slate-700">{label}<input type="number" min={min} max={max} step={step} value={config[key]} onChange={(event) => update({ [key]: Number(event.target.value) } as Partial<ScrolithMatchConfig>)} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" /></label>)}
      </div></div>
      <div className="rounded-lg border border-slate-200 bg-white p-5"><h2 className="font-semibold text-slate-900">Deterministic weights</h2><p className="mt-1 text-xs text-slate-500">Values are normalized by the backend before use.</p><div className="mt-4 space-y-3">{(Object.keys(config.weights) as Array<keyof ScrolithMatchConfig['weights']>).map((key) => <label key={key} className="block text-sm font-medium capitalize text-slate-700">{key}<input type="number" min="0" max="1" step="0.01" value={config.weights[key]} onChange={(event) => updateWeight(key, Number(event.target.value))} className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm" /></label>)}</div></div>
    </div>
    <div className="rounded-lg border border-slate-200 bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold text-slate-900">Last 30 days</h2><p className="text-xs text-slate-500">Operational counters from the Match event stream.</p></div><button type="button" onClick={() => void save()} disabled={saving || loading} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Save className="h-4 w-4" />{saving ? 'Saving...' : 'Save controls'}</button></div><div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-7">{[['Shown', analytics?.shown ?? 0], ['Interests', analytics?.interests ?? 0], ['Dismissals', analytics?.dismissals ?? 0], ['Mutual', analytics?.mutualConnections ?? 0], ['Conversion', `${Math.round((analytics?.conversionRate ?? 0) * 100)}%`], ['Filters used', analytics?.filtersUsed ?? 0], ['Insights shown', analytics?.insightsShown ?? 0]].map(([label, value]) => <div key={String(label)} className="rounded-md bg-slate-50 p-3"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-lg font-bold text-slate-900">{value}</p></div>)}</div></div>
  </section>;
};

export default ScrolithMatchManagement;
