/**
 * Phase 33.0 — User AI settings & consent (/settings/ai)
 * Privacy-preserving defaults. Clear disclosure. Accessible controls.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  Bot,
  History,
  Info,
  Loader2,
  RefreshCw,
  Save,
  Shield,
  Trash2
} from 'lucide-react';
import {
  ScrolithaAIService,
  type AIConsentState,
  type AIStatus
} from '../../services/scrolithaAi';
import { useNotification } from '../../context/NotificationContext';
import { useUser } from '../../context/UserContext';

const Toggle: React.FC<{
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  id: string;
}> = ({ checked, onChange, label, description, disabled, id }) => (
  <div className="flex items-start justify-between gap-4 py-3 border-b border-slate-100 last:border-0">
    <div className="min-w-0">
      <label htmlFor={id} className="block text-sm font-medium text-slate-900">
        {label}
      </label>
      {description ? <p className="mt-0.5 text-xs text-slate-500">{description}</p> : null}
    </div>
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:opacity-50 motion-reduce:transition-none ${
        checked ? 'bg-blue-600' : 'bg-slate-300'
      }`}
    >
      <span
        className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform motion-reduce:transition-none ${
          checked ? 'left-5' : 'left-0.5'
        }`}
        aria-hidden
      />
    </button>
  </div>
);

const AISettings: React.FC = () => {
  const { showNotification } = useNotification();
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<AIStatus | null>(null);
  const [prefs, setPrefs] = useState<AIConsentState | null>(null);
  const [usage, setUsage] = useState<any>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [liveMsg, setLiveMsg] = useState('');

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [st, pr, us, hi] = await Promise.all([
        ScrolithaAIService.getStatus().catch(() => null),
        ScrolithaAIService.getPreferences().catch(() => null),
        ScrolithaAIService.getUsage().catch(() => null),
        ScrolithaAIService.getHistory(20).catch(() => [])
      ]);
      setStatus(st);
      setPrefs(pr);
      setUsage(us);
      setHistory(Array.isArray(hi) ? hi : []);
      setLiveMsg('AI settings loaded');
    } catch {
      showNotification('alert', 'AI Settings', 'Unable to load AI preferences.');
      setLiveMsg('Failed to load AI settings');
    } finally {
      setLoading(false);
    }
  }, [user?.id, showNotification]);

  useEffect(() => {
    load();
  }, [load]);

  const updatePref = (key: keyof AIConsentState, value: boolean) => {
    setPrefs((p) => (p ? { ...p, [key]: value } : p));
  };

  const save = async () => {
    if (!prefs) return;
    setSaving(true);
    try {
      const next = await ScrolithaAIService.updatePreferences(prefs);
      setPrefs(next);
      showNotification('success', 'AI Settings', 'Preferences saved.');
      setLiveMsg('Preferences saved');
      const st = await ScrolithaAIService.getStatus().catch(() => null);
      if (st) setStatus(st);
    } catch (err: any) {
      showNotification('alert', 'AI Settings', err?.message || 'Save failed');
      setLiveMsg('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const reset = async () => {
    if (!window.confirm('Reset AI preferences to privacy-preserving defaults?')) return;
    setSaving(true);
    try {
      const next = await ScrolithaAIService.resetPreferences();
      setPrefs(next);
      showNotification('success', 'AI Settings', 'Preferences reset.');
      setLiveMsg('Preferences reset to defaults');
    } catch {
      showNotification('alert', 'AI Settings', 'Reset failed');
    } finally {
      setSaving(false);
    }
  };

  const clearHistory = async () => {
    if (!window.confirm('Delete your AI activity history? This cannot be undone.')) return;
    try {
      await ScrolithaAIService.deleteHistory();
      setHistory([]);
      showNotification('success', 'AI Settings', 'History deleted.');
      setLiveMsg('AI history deleted');
    } catch {
      showNotification('alert', 'AI Settings', 'Delete failed');
    }
  };

  if (!user?.id) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-slate-600">Sign in to manage AI settings.</p>
        <Link to="/login" className="text-blue-600 underline">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <div className="sr-only" role="status" aria-live="polite">
        {liveMsg}
      </div>

      <header className="mb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
            <Bot className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Scrolitha AI</h1>
            <p className="text-sm text-slate-500">Control how AI features work for your account</p>
          </div>
        </div>
      </header>

      {/* Disclosure */}
      <div
        className="mb-6 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
        role="note"
      >
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
        <div>
          <p className="font-medium">AI outputs can be wrong</p>
          <p className="mt-1 text-amber-900/90">
            {status?.disclosure ||
              'Suggestions from Scrolitha AI may be incorrect. Always review before acting. Security and emergency notifications are never overridden by AI.'}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-600" role="status">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
          Loading AI settings…
        </div>
      ) : (
        <div className="space-y-6">
          {/* Status */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="ai-status-heading">
            <h2 id="ai-status-heading" className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-900">
              <Info className="h-4 w-4" aria-hidden />
              Feature status
            </h2>
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">Platform</dt>
                <dd className="font-medium">{status?.platform || 'Scrolitha AI'} (Phase {status?.phase || '33.0'})</dd>
              </div>
              <div>
                <dt className="text-slate-500">Platform AI</dt>
                <dd className="font-medium">
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs ${
                      status?.masterEnabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${status?.masterEnabled ? 'bg-emerald-600' : 'bg-slate-400'}`}
                      aria-hidden
                    />
                    {status?.masterEnabled ? 'Available' : 'Disabled on platform'}
                  </span>
                </dd>
              </div>
            </dl>
            {status?.capabilities?.length ? (
              <ul className="mt-3 space-y-1 text-xs text-slate-600" aria-label="Capabilities">
                {status.capabilities.map((c) => (
                  <li key={c.id}>
                    {c.id}: {c.availableToUser ? 'available' : 'not available'}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          {/* Consent */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="ai-consent-heading">
            <h2 id="ai-consent-heading" className="mb-1 flex items-center gap-2 text-base font-semibold text-slate-900">
              <Shield className="h-4 w-4" aria-hidden />
              Consent controls
            </h2>
            <p className="mb-3 text-xs text-slate-500">
              Version {prefs?.consentVersion || '33.0.0'}. All options default off for privacy.
            </p>
            {prefs ? (
              <>
                <Toggle
                  id="ai-features"
                  label="Enable AI features"
                  description="Allow Scrolitha AI features on your account when the platform enables them."
                  checked={prefs.aiFeaturesEnabled}
                  onChange={(v) => updatePref('aiFeaturesEnabled', v)}
                />
                <Toggle
                  id="ai-suggestions"
                  label="AI-generated suggestions"
                  description="Allow AI to suggest summaries, rewrites, and notification digests (never auto-applied)."
                  checked={prefs.aiSuggestionsAllowed}
                  onChange={(v) => updatePref('aiSuggestionsAllowed', v)}
                />
                <Toggle
                  id="ai-external"
                  label="External provider processing"
                  description="Allow non-local providers (e.g. Gemini/OpenAI) when the platform routes to them. Sensitive content stays local when possible."
                  checked={prefs.externalProviderProcessingAllowed}
                  onChange={(v) => updatePref('externalProviderProcessingAllowed', v)}
                />
                <Toggle
                  id="ai-personalization"
                  label="Personalization"
                  description="Allow AI to use limited preference signals for more relevant suggestions."
                  checked={prefs.personalizationAllowed}
                  onChange={(v) => updatePref('personalizationAllowed', v)}
                />
                <Toggle
                  id="ai-private"
                  label="Private content analysis"
                  description="Allow analysis of private messages or similar content when you explicitly use an AI feature that needs it."
                  checked={prefs.privateMessageAnalysisAllowed}
                  onChange={(v) => updatePref('privateMessageAnalysisAllowed', v)}
                />
                <Toggle
                  id="ai-history"
                  label="AI activity history"
                  description="Store a limited activity log (no full private prompts) so you can review past AI use."
                  checked={prefs.aiActivityHistoryEnabled}
                  onChange={(v) => updatePref('aiActivityHistoryEnabled', v)}
                />
                <Toggle
                  id="ai-product"
                  label="Product improvement data"
                  description="Allow anonymized metadata (not private content) to improve Scrolitha AI. Off by default."
                  checked={prefs.productImprovementDataAllowed}
                  onChange={(v) => updatePref('productImprovementDataAllowed', v)}
                />
              </>
            ) : (
              <p className="text-sm text-slate-500">Preferences unavailable.</p>
            )}

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={save}
                disabled={saving || !prefs}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save preferences
              </button>
              <button
                type="button"
                onClick={reset}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <RefreshCw className="h-4 w-4" />
                Reset to defaults
              </button>
            </div>
          </section>

          {/* Usage */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="ai-usage-heading">
            <h2 id="ai-usage-heading" className="mb-3 text-base font-semibold text-slate-900">
              Usage summary
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm" role="table">
                <caption className="sr-only">AI usage summary</caption>
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Period
                    </th>
                    <th scope="col" className="py-2 pr-4 font-medium">
                      Requests
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Tokens
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-slate-100">
                    <td className="py-2 pr-4">Today</td>
                    <td className="py-2 pr-4">{usage?.today?.requests ?? 0}</td>
                    <td className="py-2">{usage?.today?.tokens ?? 0}</td>
                  </tr>
                  <tr>
                    <td className="py-2 pr-4">Last 30 days</td>
                    <td className="py-2 pr-4">{usage?.last30Days?.requests ?? 0}</td>
                    <td className="py-2">{usage?.last30Days?.tokens ?? 0}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {usage?.limits ? (
              <p className="mt-2 text-xs text-slate-500">
                Daily limit: {usage.limits.dailyRequests} requests · Monthly token ceiling:{' '}
                {usage.limits.monthlyTokens}
              </p>
            ) : null}
          </section>

          {/* History */}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-labelledby="ai-history-heading">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 id="ai-history-heading" className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <History className="h-4 w-4" aria-hidden />
                Activity history
              </h2>
              <button
                type="button"
                onClick={clearHistory}
                className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Delete history
              </button>
            </div>
            {!prefs?.aiActivityHistoryEnabled ? (
              <p className="text-sm text-slate-500">Enable “AI activity history” to store a limited log.</p>
            ) : history.length === 0 ? (
              <p className="text-sm text-slate-500">No AI activity recorded yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {history.map((h) => (
                  <li key={h.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span className="font-medium text-slate-800">{h.capability}</span>
                    <span className="text-xs text-slate-500">
                      {h.lifecycle} · {h.provider || '—'} ·{' '}
                      {h.createdAt ? new Date(h.createdAt).toLocaleString() : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <p className="text-center text-xs text-slate-400">
            <Link to="/settings/notifications" className="text-blue-600 underline">
              Notification settings
            </Link>
            {' · '}
            Related privacy controls may also appear under Scrolitha assistant settings.
          </p>
        </div>
      )}
    </div>
  );
};

export default AISettings;
