import React, { useEffect, useState } from 'react';
import { Eye, RotateCcw, Save, ShieldCheck } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import { HiringRecommendationsService } from '../../services/hiringRecommendations';
import HiringRecommendationCard, { buildHiringRecommendationPreview } from '../../components/hiring/HiringRecommendationCard';

const updatePath = (source: any, path: string, value: any) => {
  const next = { ...source };
  const keys = path.split('.');
  let pointer = next;
  keys.slice(0, -1).forEach((key) => { pointer[key] = { ...(pointer[key] || {}) }; pointer = pointer[key]; });
  pointer[keys[keys.length - 1]] = value;
  return next;
};

const HiringRecommendationsManagement: React.FC = () => {
  const { showNotification } = useNotification();
  const [config, setConfig] = useState<any>(null);
  const [analytics, setAnalytics] = useState<any>(null);
  const [preview, setPreview] = useState<'FREELANCER' | 'CLIENT' | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [nextConfig, nextAnalytics] = await Promise.all([
        HiringRecommendationsService.getAdminConfig(),
        HiringRecommendationsService.getAdminAnalytics(30)
      ]);
      setConfig(nextConfig);
      setAnalytics(nextAnalytics);
    } catch (error: any) {
      showNotification('error', 'Hiring recommendations', error?.message || 'Unable to load controls.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const save = async () => {
    if (!config) return;
    setSaving(true);
    try {
      setConfig(await HiringRecommendationsService.updateAdminConfig(config));
      showNotification('success', 'Hiring recommendations', 'Configuration saved.');
    } catch (error: any) {
      showNotification('error', 'Hiring recommendations', error?.message || 'Unable to save configuration.');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    setSaving(true);
    try {
      setConfig(await HiringRecommendationsService.resetAdminConfig());
      showNotification('success', 'Hiring recommendations', 'Defaults restored.');
    } catch (error: any) {
      showNotification('error', 'Hiring recommendations', error?.message || 'Unable to restore defaults.');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !config) return <div className="rounded-xl border border-gray-200 bg-white p-6 text-sm text-gray-500">Loading hiring recommendation controls...</div>;
  if (!config) return null;
  const freelancer = analytics?.freelancer || {};
  const client = analytics?.client || {};
  const field = (label: string, path: string, type: 'text' | 'number' = 'text', max?: number) => (
    <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
      {label}
      <input type={type} maxLength={max} value={path.split('.').reduce((value, key) => value?.[key], config) ?? ''} onChange={(event) => setConfig(updatePath(config, path, type === 'number' ? Number(event.target.value) : event.target.value))} className="mt-1 min-h-10 w-full rounded-lg border border-slate-300 px-3 text-sm font-normal normal-case tracking-normal text-slate-800" />
    </label>
  );
  const toggle = (label: string, path: string) => (
    <label className="flex min-h-10 items-center gap-2 text-sm text-slate-700"><input type="checkbox" checked={Boolean(path.split('.').reduce((value, key) => value?.[key], config))} onChange={(event) => setConfig(updatePath(config, path, event.target.checked))} className="h-4 w-4 accent-blue-600" />{label}</label>
  );

  return (
    <div className="space-y-5" data-testid="hiring-recommendations-admin">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-600">Scrolitha AI</p><h2 className="mt-1 text-xl font-semibold text-slate-950">Hiring Recommendations</h2><p className="mt-1 max-w-2xl text-sm text-slate-600">Advisory prompts for Available for Hire and We Are Hiring. Status activation remains controlled by the existing profile settings.</p></div>
          <div className="flex flex-wrap gap-2"><button type="button" onClick={() => setPreview('FREELANCER')} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700"><Eye size={16} />Preview freelancer</button><button type="button" onClick={() => setPreview('CLIENT')} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700"><Eye size={16} />Preview client</button></div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-4 rounded-lg border border-amber-200 bg-amber-50 p-3">{toggle('Recommendation system enabled', 'enabled')}<span className="text-xs text-amber-800">This switch never disables either hiring-status feature.</span></div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        {(['freelancer', 'client'] as const).map((kind) => (
          <div key={kind} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between gap-3"><h3 className="text-base font-semibold text-slate-900">{kind === 'freelancer' ? 'Freelancer recommendation' : 'Client recommendation'}</h3>{toggle('Enabled', `${kind}.enabled`)}</div><div className="mt-4 space-y-3">{field('Title', `${kind}.title`, 'text', 90)}{field('Description', `${kind}.description`, 'text', 240)}{field('Primary action', `${kind}.ctaLabel`, 'text', 60)}{field('Secondary action', `${kind}.secondaryLabel`, 'text', 30)}{field('Eligibility threshold', `${kind}.eligibilityThreshold`, 'number')}</div></div>
        ))}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-base font-semibold text-slate-900">Timing and frequency</h3><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{toggle('Show after login', 'timing.showAfterLogin')}{toggle('Show after account switch', 'timing.showAfterAccountSwitch')}{toggle('Show after profile completion', 'timing.showAfterProfileCompletion')}{toggle('Show after professional activity', 'timing.showAfterProfessionalActivity')}{field('Initial delay (seconds)', 'timing.initialDelaySeconds', 'number')}{field('Cooldown (days)', 'timing.cooldownDays', 'number')}{field('Second dismissal cooldown (days)', 'timing.secondDismissCooldownDays', 'number')}{field('Maximum impressions', 'timing.maxImpressions', 'number')}{field('Maximum per session', 'timing.maxPerSession', 'number')}</div></section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2"><ShieldCheck size={18} className="text-emerald-600" /><h3 className="text-base font-semibold text-slate-900">AI and fallback safety</h3></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{toggle('AI personalization', 'ai.personalizationEnabled')}{toggle('AI recommendation scoring', 'ai.scoringEnabled')}{toggle('AI message personalization', 'ai.messagePersonalizationEnabled')}{toggle('Deterministic fallback engine', 'ai.fallbackEnabled')}{field('Minimum score', 'ai.minimumRecommendationScore', 'number')}{field('Evaluation frequency (minutes)', 'ai.evaluationFrequencyMinutes', 'number')}</div></section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-base font-semibold text-slate-900">Actual events, last 30 days</h3>{analytics?.dataAvailable ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700"><strong className="block text-slate-950">Freelancer</strong>Shown {freelancer.shown || 0} · Clicked {freelancer.clicked || 0} · Activated {freelancer.activated || 0}<span className="mt-1 block text-xs text-slate-500">Conversion {((freelancer.conversionRate || 0) * 100).toFixed(1)}%</span></div><div className="rounded-lg bg-slate-50 p-4 text-sm text-slate-700"><strong className="block text-slate-950">Client</strong>Shown {client.shown || 0} · Clicked {client.clicked || 0} · Activated {client.activated || 0}<span className="mt-1 block text-xs text-slate-500">Conversion {((client.conversionRate || 0) * 100).toFixed(1)}%</span></div></div> : <p className="mt-3 text-sm text-slate-500">No data available.</p>}</section>

      <div className="flex flex-wrap justify-end gap-2"><button type="button" onClick={() => void reset()} disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700"><RotateCcw size={16} />Reset defaults</button><button type="button" onClick={() => void save()} disabled={saving} className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-60"><Save size={16} />{saving ? 'Saving...' : 'Save configuration'}</button></div>
      {preview ? <HiringRecommendationCard recommendation={buildHiringRecommendationPreview(preview)} preview onPrimary={() => setPreview(null)} onDismiss={() => setPreview(null)} /> : null}
    </div>
  );
};

export default HiringRecommendationsManagement;
