/**
 * Phase 33.0 — Admin → Scrolitha AI foundation console.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Bot,
  Flag,
  HeartPulse,
  Loader2,
  RefreshCw,
  Server,
  Shield,
  FileText
} from 'lucide-react';
import { ScrolithaAIService } from '../../services/scrolithaAi';
import { ScrolithaDiscoveryService } from '../../services/scrolithaDiscovery';
import { useNotification } from '../../context/NotificationContext';

type TabId =
  | 'overview'
  | 'providers'
  | 'models'
  | 'capabilities'
  | 'prompts'
  | 'usage'
  | 'discovery'
  | 'safety'
  | 'health'
  | 'flags'
  | 'audit'
  | 'settings';

const TABS: Array<{ id: TabId; label: string; icon: React.ElementType }> = [
  { id: 'overview', label: 'Overview', icon: Bot },
  { id: 'providers', label: 'Providers', icon: Server },
  { id: 'models', label: 'Models', icon: Activity },
  { id: 'capabilities', label: 'Capabilities', icon: Flag },
  { id: 'prompts', label: 'Prompts', icon: FileText },
  { id: 'usage', label: 'Usage', icon: Activity },
  { id: 'discovery', label: 'Discovery Analytics', icon: Activity },
  { id: 'safety', label: 'Safety', icon: Shield },
  { id: 'health', label: 'Health', icon: HeartPulse },
  { id: 'flags', label: 'Feature Flags', icon: Flag },
  { id: 'audit', label: 'Audit Logs', icon: FileText },
  { id: 'settings', label: 'Settings', icon: AlertTriangle }
];

const ScrolithaAIFoundation: React.FC = () => {
  const { showNotification } = useNotification();
  const [tab, setTab] = useState<TabId>('overview');
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<any>(null);
  const [providers, setProviders] = useState<any>(null);
  const [models, setModels] = useState<any[]>([]);
  const [prompts, setPrompts] = useState<any[]>([]);
  const [usage, setUsage] = useState<any>(null);
  const [health, setHealth] = useState<any>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [discovery, setDiscovery] = useState<any>(null);
  const [liveMsg, setLiveMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ov, pr, mo, pm, us, he, au, fl, disc] = await Promise.all([
        ScrolithaAIService.adminOverview().catch(() => null),
        ScrolithaAIService.adminProviders().catch(() => null),
        ScrolithaAIService.adminModels().catch(() => []),
        ScrolithaAIService.adminPrompts().catch(() => []),
        ScrolithaAIService.adminUsage().catch(() => null),
        ScrolithaAIService.adminHealth().catch(() => null),
        ScrolithaAIService.adminAudit(40).catch(() => []),
        ScrolithaAIService.adminGetFlags().catch(() => ({})),
        ScrolithaDiscoveryService.adminAnalytics().catch(() => null)
      ]);
      setOverview(ov);
      setProviders(pr);
      setModels(Array.isArray(mo) ? mo : []);
      setPrompts(Array.isArray(pm) ? pm : []);
      setUsage(us);
      setHealth(he);
      setAudit(Array.isArray(au) ? au : []);
      setFlags(fl || {});
      setDiscovery(disc);
      setLiveMsg('Scrolitha AI admin data loaded');
    } catch {
      showNotification('alert', 'Scrolitha AI', 'Failed to load admin data');
      setLiveMsg('Load failed');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleFlag = async (key: string, value: boolean) => {
    const risk = key === 'enableProviderCalls' || key === 'killSwitch';
    if (risk && value) {
      if (!window.confirm(`Confirm high-risk change: set ${key} = true?`)) return;
    }
    try {
      const next = await ScrolithaAIService.adminPutFlags({ [key]: value }, risk);
      setFlags(next || { ...flags, [key]: value });
      showNotification('success', 'Feature flags', `Updated ${key}`);
      setLiveMsg(`Flag ${key} set to ${value}`);
    } catch (err: any) {
      showNotification('alert', 'Feature flags', err?.message || 'Update failed');
    }
  };

  const testProvider = async (provider: string) => {
    try {
      const result = await ScrolithaAIService.adminTestProvider(provider);
      showNotification('success', 'Provider test', `${provider}: ${result?.health?.status || 'ok'}`);
    } catch (err: any) {
      showNotification('alert', 'Provider test', err?.message || 'Failed');
    }
  };

  const statusBadge = (status: string) => {
    const s = String(status || '').toLowerCase();
    const color =
      s === 'operational'
        ? 'bg-emerald-100 text-emerald-800'
        : s === 'degraded'
          ? 'bg-amber-100 text-amber-900'
          : s === 'disabled'
            ? 'bg-slate-100 text-slate-700'
            : 'bg-red-100 text-red-800';
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${color}`}>
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            s === 'operational' ? 'bg-emerald-600' : s === 'degraded' ? 'bg-amber-600' : s === 'disabled' ? 'bg-slate-400' : 'bg-red-600'
          }`}
          aria-hidden
        />
        {status || 'unknown'}
      </span>
    );
  };

  return (
    <div className="space-y-4 p-1">
      <div className="sr-only" role="status" aria-live="polite">
        {liveMsg}
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Scrolitha AI Platform</h2>
          <p className="text-sm text-slate-500">
            Phase 33.0 foundation — provider-neutral gateway, consent, safety, prompts. No autonomous actions.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div
        className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"
        role="note"
      >
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
        <p>
          Production AI provider calls remain disabled by default. Feature flags default off. Do not enable
          production AI without an explicit Phase 33.x approval.
        </p>
      </div>

      <div
        role="tablist"
        aria-label="Scrolitha AI admin sections"
        className="flex flex-wrap gap-1 border-b border-slate-200 pb-2"
      >
        {TABS.map((t) => {
          const Icon = t.icon;
          const selected = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={selected}
              id={`ai-tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                selected ? 'bg-violet-100 text-violet-900' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {t.label}
            </button>
          );
        })}
      </div>

      {loading && !overview ? (
        <div className="flex items-center gap-2 py-8 text-slate-600" role="status">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading…
        </div>
      ) : (
        <div role="tabpanel" aria-labelledby={`ai-tab-${tab}`} className="rounded-xl border border-slate-200 bg-white p-4">
          {tab === 'overview' && (
            <div className="space-y-3 text-sm">
              <p>
                <strong>Phase:</strong> {overview?.phase || '33.0'}
              </p>
              <p>
                <strong>Master enabled:</strong> {String(overview?.flags?.masterEnabled ?? false)} ·{' '}
                <strong>Kill switch:</strong> {String(overview?.flags?.killSwitch ?? false)} ·{' '}
                <strong>Provider calls:</strong> {String(overview?.flags?.enableProviderCalls ?? false)}
              </p>
              <p>
                <strong>Requests (process):</strong> {overview?.metrics?.requests ?? 0} · Success:{' '}
                {overview?.metrics?.successes ?? 0} · Blocks: {overview?.metrics?.blocks ?? 0}
              </p>
              <ul className="list-disc pl-5 text-slate-600">
                <li>No autonomous messaging, payments, moderation enforcement, or job applications</li>
                <li>All capabilities individually feature-flagged</li>
                <li>Privacy classification + redaction before provider routing</li>
              </ul>
            </div>
          )}

          {tab === 'providers' && (
            <div className="space-y-3">
              {(providers?.health || []).map((h: any) => (
                <div
                  key={h.provider}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 p-3"
                >
                  <div>
                    <div className="font-medium">{h.provider}</div>
                    <div className="text-xs text-slate-500">{h.message || '—'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {statusBadge(h.status)}
                    <button
                      type="button"
                      onClick={() => testProvider(h.provider)}
                      className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
                    >
                      Test
                    </button>
                  </div>
                </div>
              ))}
              {!providers?.health?.length ? <p className="text-sm text-slate-500">No provider health data.</p> : null}
            </div>
          )}

          {tab === 'models' && (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-slate-500">
                    <th className="py-2 pr-3">Provider</th>
                    <th className="py-2 pr-3">Model</th>
                    <th className="py-2">Enabled</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m, i) => (
                    <tr key={m.id || i} className="border-b border-slate-50">
                      <td className="py-2 pr-3">{m.provider}</td>
                      <td className="py-2 pr-3">{m.modelId || m.model}</td>
                      <td className="py-2">{String(m.enabled ?? true)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === 'capabilities' && (
            <ul className="space-y-2 text-sm">
              {(overview?.capabilities || Object.keys(flags).filter((k) => k === k.toUpperCase())).map(
                (c: string) => (
                  <li key={c} className="flex justify-between rounded border border-slate-100 px-3 py-2">
                    <span>{c}</span>
                    <span className="text-xs text-slate-500">
                      flag: {String(flags[c] ?? overview?.flags?.[c] ?? false)}
                    </span>
                  </li>
                )
              )}
            </ul>
          )}

          {tab === 'prompts' && (
            <ul className="space-y-2 text-sm">
              {prompts.map((p) => (
                <li key={p.id} className="rounded border border-slate-100 p-3">
                  <div className="font-medium">
                    {p.promptKey} v{p.version}
                  </div>
                  <div className="text-xs text-slate-500">
                    {p.capability} · {p.status} · locale={p.locale}
                  </div>
                </li>
              ))}
              {!prompts.length ? <p className="text-slate-500">No prompts loaded.</p> : null}
            </ul>
          )}

          {tab === 'usage' && (
            <div className="text-sm space-y-2">
              <p>Process metrics: {JSON.stringify(usage?.metrics || overview?.metrics || {}, null, 0)}</p>
              <p className="text-xs text-slate-500">Recent ledger rows: {(usage?.recent || []).length}</p>
            </div>
          )}

          {tab === 'discovery' && (
            <div className="space-y-3 text-sm">
              <p className="text-xs text-slate-500">
                Phase 33.2 discovery analytics (proxies only — not production fairness certification).
              </p>
              {discovery ? (
                <>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="rounded border border-slate-100 p-2">
                      <div className="text-xs text-slate-500">Acceptance rate</div>
                      <div className="font-semibold">
                        {((discovery.recommendation?.acceptanceRate || 0) * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="rounded border border-slate-100 p-2">
                      <div className="text-xs text-slate-500">Dismissal rate</div>
                      <div className="font-semibold">
                        {((discovery.recommendation?.dismissalRate || 0) * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="rounded border border-slate-100 p-2">
                      <div className="text-xs text-slate-500">CTR proxy</div>
                      <div className="font-semibold">
                        {((discovery.recommendation?.ctrProxy || 0) * 100).toFixed(1)}%
                      </div>
                    </div>
                    <div className="rounded border border-slate-100 p-2">
                      <div className="text-xs text-slate-500">Diversity score</div>
                      <div className="font-semibold">{discovery.diversity?.diversityScore ?? '—'}</div>
                    </div>
                  </div>
                  <p className="text-xs">
                    Fairness proxy: {discovery.diversity?.fairnessProxy} · Learning signals:{' '}
                    {discovery.learningSignals}
                  </p>
                  <pre className="max-h-48 overflow-auto rounded bg-slate-50 p-2 text-xs">
                    {JSON.stringify(
                      {
                        byEntityType: discovery.diversity?.byEntityType,
                        flags: discovery.flags,
                        recommendationsIssued: discovery.aiUsage?.recommendationsIssued,
                        feedScoresIssued: discovery.aiUsage?.feedScoresIssued
                      },
                      null,
                      2
                    )}
                  </pre>
                </>
              ) : (
                <p className="text-slate-500">Analytics unavailable.</p>
              )}
            </div>
          )}

          {tab === 'safety' && (
            <div className="text-sm space-y-2 text-slate-700">
              <p>Safety policy version 33.0.0</p>
              <ul className="list-disc pl-5">
                <li>Pre/post content evaluation (injection, unsafe content, forbidden actions)</li>
                <li>Untrusted content boundaries on all user input</li>
                <li>PROHIBITED classification never routes externally</li>
                <li>No full moderation enforcement in Phase 33.0</li>
              </ul>
            </div>
          )}

          {tab === 'health' && (
            <div className="space-y-2 text-sm">
              {(health?.health || []).map((h: any) => (
                <div key={h.provider} className="flex justify-between rounded border p-2">
                  <span>{h.provider}</span>
                  {statusBadge(h.status)}
                </div>
              ))}
              <pre className="mt-2 overflow-auto rounded bg-slate-50 p-2 text-xs">
                {JSON.stringify(health?.circuits || {}, null, 2)}
              </pre>
            </div>
          )}

          {tab === 'flags' && (
            <div className="space-y-2">
              {Object.entries(flags).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between gap-3 border-b border-slate-50 py-2 text-sm">
                  <span className="font-mono text-xs">{key}</span>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={Boolean(value)}
                    aria-label={key}
                    onClick={() => toggleFlag(key, !value)}
                    className={`relative h-7 w-12 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      value ? 'bg-violet-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow ${
                        value ? 'left-5' : 'left-0.5'
                      }`}
                    />
                  </button>
                </div>
              ))}
            </div>
          )}

          {tab === 'audit' && (
            <ul className="max-h-96 space-y-2 overflow-y-auto text-xs">
              {audit.map((a, i) => (
                <li key={a.id || i} className="rounded border border-slate-100 p-2">
                  <div className="font-medium">{a.action}</div>
                  <div className="text-slate-500">
                    {a.capability || '—'} · {a.provider || '—'} · {a.createdAt || ''}
                  </div>
                </li>
              ))}
              {!audit.length ? <p className="text-sm text-slate-500">No audit entries.</p> : null}
            </ul>
          )}

          {tab === 'settings' && (
            <div className="text-sm space-y-2 text-slate-700">
              <p>Credentials are never stored via this UI. Use Secret Manager / env:</p>
              <ul className="list-disc pl-5 font-mono text-xs">
                <li>SCROLITHA_OLLAMA_MODEL / core host</li>
                <li>GOOGLE_GEMINI_KEY</li>
                <li>OPENAI_API_KEY</li>
                <li>SCROLITHA_AI_ENABLE_PROVIDER_CALLS</li>
                <li>SCROLITHA_AI_KILL_SWITCH</li>
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ScrolithaAIFoundation;
