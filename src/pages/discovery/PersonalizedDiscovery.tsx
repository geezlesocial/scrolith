/**
 * Phase 33.2 — Personalized Discovery & AI Memory UI
 * Explainable recommendations, feedback, memory controls.
 * Suggestions only — never auto-act.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Brain,
  Download,
  Eye,
  Loader2,
  Search,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X
} from 'lucide-react';
import { ScrolithaDiscoveryService } from '../../services/scrolithaDiscovery';
import { useNotification } from '../../context/NotificationContext';
import { useUser } from '../../context/UserContext';

type TabId = 'for-you' | 'dashboard' | 'search' | 'memory';

const PersonalizedDiscovery: React.FC = () => {
  const { user } = useUser();
  const { showNotification } = useNotification();
  const [tab, setTab] = useState<TabId>('for-you');
  const [status, setStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [recos, setRecos] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [memory, setMemory] = useState<any>(null);
  const [topicInput, setTopicInput] = useState('');
  const [muteInput, setMuteInput] = useState('');
  const [searchQ, setSearchQ] = useState('');
  const [searchAssist, setSearchAssist] = useState<any>(null);
  const [whyCard, setWhyCard] = useState<any>(null);
  const [live, setLive] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const st = await ScrolithaDiscoveryService.getStatus().catch(() => null);
      setStatus(st);
      const [r, d, m] = await Promise.all([
        ScrolithaDiscoveryService.getRecommendations({ limit: 16 }).catch(() => null),
        ScrolithaDiscoveryService.getDashboard().catch(() => null),
        ScrolithaDiscoveryService.getMemory().catch(() => null)
      ]);
      setRecos(r?.items || []);
      setSections(d?.sections || []);
      setMemory(m);
      setLive('Discovery data loaded');
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const feedback = async (item: any, action: 'useful' | 'not_interested' | 'hide_similar') => {
    setBusy(true);
    try {
      await ScrolithaDiscoveryService.feedback({
        entityType: item.entityType,
        entityId: item.entityId,
        action,
        topic: item.reasons?.[0],
        recommendationId: item.id
      });
      if (action !== 'useful') {
        setRecos((list) => list.filter((x) => x.id !== item.id));
      }
      showNotification('success', 'Feedback', 'Preference signal updated (no model retrain).');
      setLive(`Feedback: ${action}`);
    } catch (err: any) {
      showNotification('alert', 'Feedback', err?.message || 'Failed (flags may be off)');
    } finally {
      setBusy(false);
    }
  };

  const saveTopics = async () => {
    if (!topicInput.trim()) return;
    const preferredTopics = Array.from(
      new Set([...(memory?.preferredTopics || []), ...topicInput.split(',').map((t) => t.trim()).filter(Boolean)])
    );
    try {
      const m = await ScrolithaDiscoveryService.updateMemory({ preferredTopics });
      setMemory(m);
      setTopicInput('');
      setLive('Topics saved');
      showNotification('success', 'Memory', 'Preferred topics updated');
    } catch (err: any) {
      showNotification('alert', 'Memory', err?.message || 'Save failed');
    }
  };

  const saveMuted = async () => {
    if (!muteInput.trim()) return;
    const mutedTopics = Array.from(
      new Set([...(memory?.mutedTopics || []), ...muteInput.split(',').map((t) => t.trim()).filter(Boolean)])
    );
    try {
      const m = await ScrolithaDiscoveryService.updateMemory({ mutedTopics });
      setMemory(m);
      setMuteInput('');
      setLive('Muted topics saved');
    } catch (err: any) {
      showNotification('alert', 'Memory', err?.message || 'Save failed');
    }
  };

  const runSearchAssist = async () => {
    setBusy(true);
    try {
      const data = await ScrolithaDiscoveryService.searchAssist(searchQ);
      setSearchAssist(data);
      setLive(data?.enabled ? 'Search suggestions ready' : data?.reason || 'Disabled');
    } catch (err: any) {
      showNotification('alert', 'Search', err?.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const exportMem = async () => {
    try {
      const data = await ScrolithaDiscoveryService.exportMemory();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scrolitha-ai-memory-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      showNotification('alert', 'Export', 'Failed');
    }
  };

  const clearMem = async () => {
    if (!window.confirm('Delete all AI discovery memory?')) return;
    await ScrolithaDiscoveryService.deleteMemory();
    setMemory(null);
    load();
    setLive('Memory deleted');
  };

  if (!user?.id) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-slate-600">Sign in to use personalized discovery.</p>
        <Link to="/login" className="text-blue-600 underline">
          Sign in
        </Link>
      </div>
    );
  }

  const RecoCard = ({ item }: { item: any }) => (
    <article className="flex flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-violet-700">{item.entityType}</div>
      <h3 className="text-sm font-semibold text-slate-900">{item.title}</h3>
      {item.subtitle ? <p className="text-xs text-slate-500">{item.subtitle}</p> : null}
      <p className="mt-2 text-xs text-slate-600">{item.explanation || item.whyAmISeeingThis}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          onClick={() => setWhyCard(item)}
        >
          <Eye className="h-3.5 w-3.5" /> Why am I seeing this?
        </button>
        <button
          type="button"
          disabled={busy}
          aria-label="Useful"
          className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2 py-1 text-xs text-emerald-800 hover:bg-emerald-50"
          onClick={() => feedback(item, 'useful')}
        >
          <ThumbsUp className="h-3.5 w-3.5" /> Useful
        </button>
        <button
          type="button"
          disabled={busy}
          aria-label="Not interested"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50"
          onClick={() => feedback(item, 'not_interested')}
        >
          <ThumbsDown className="h-3.5 w-3.5" /> Not interested
        </button>
        <button
          type="button"
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-lg border border-red-100 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
          onClick={() => feedback(item, 'hide_similar')}
        >
          <X className="h-3.5 w-3.5" /> Hide similar
        </button>
      </div>
      <p className="mt-2 text-[10px] text-slate-400">Suggestion only · score {item.score}</p>
    </article>
  );

  return (
    <div className="mx-auto max-w-5xl px-3 py-6 sm:px-6">
      <div className="sr-only" role="status" aria-live="polite">
        {live}
      </div>

      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-700">
            <Sparkles className="h-6 w-6" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Personalized Discovery</h1>
            <p className="text-sm text-slate-500">Phase 33.2 · Explainable recommendations</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Link to="/settings/ai" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            AI settings
          </Link>
          <Link to="/assistant" className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-50">
            Assistant
          </Link>
        </div>
      </header>

      <div className="mb-4 flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950" role="note">
        <Brain className="h-5 w-5 shrink-0 text-amber-600" aria-hidden />
        <p>
          {status?.disclosure ||
            'AI scores and recommendations are suggestions only. Feed order and search execution stay deterministic. Security alerts are never deprioritized by AI.'}
        </p>
      </div>

      {!status?.surfaces?.recommendations && !loading ? (
        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700" role="status">
          Discovery surfaces are disabled by feature flags or consent. Enable personalization in{' '}
          <Link to="/settings/ai" className="text-violet-700 underline">
            AI settings
          </Link>{' '}
          when the platform allows it.
        </div>
      ) : null}

      <div role="tablist" aria-label="Discovery sections" className="mb-4 flex flex-wrap gap-1 border-b border-slate-200 pb-2">
        {(
          [
            { id: 'for-you' as const, label: 'For you' },
            { id: 'dashboard' as const, label: 'Home sections' },
            { id: 'search' as const, label: 'Search assist' },
            { id: 'memory' as const, label: 'AI memory' }
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            id={`disc-tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
              tab === t.id ? 'bg-violet-100 text-violet-900' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-600" role="status">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading…
        </div>
      ) : (
        <div role="tabpanel" aria-labelledby={`disc-tab-${tab}`}>
          {tab === 'for-you' && (
            <div className="grid gap-3 sm:grid-cols-2">
              {recos.map((item) => (
                <RecoCard key={item.id} item={item} />
              ))}
              {!recos.length ? (
                <p className="text-sm text-slate-500 sm:col-span-2">No recommendations (flags off or empty).</p>
              ) : null}
            </div>
          )}

          {tab === 'dashboard' && (
            <div className="space-y-6">
              {sections.map((sec) => (
                <section key={sec.id} aria-labelledby={`sec-${sec.id}`}>
                  <h2 id={`sec-${sec.id}`} className="mb-1 text-base font-semibold text-slate-900">
                    {sec.title}
                  </h2>
                  <p className="mb-3 text-xs text-slate-500">{sec.explanation}</p>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {(sec.items || []).map((item: any) => (
                      <RecoCard key={item.id} item={item} />
                    ))}
                  </div>
                </section>
              ))}
              {!sections.length ? <p className="text-sm text-slate-500">No dashboard sections available.</p> : null}
            </div>
          )}

          {tab === 'search' && (
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <label htmlFor="disc-search" className="block text-sm font-medium text-slate-800">
                Query to improve
              </label>
              <div className="mt-2 flex flex-wrap gap-2">
                <input
                  id="disc-search"
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  className="min-w-[200px] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  placeholder="e.g. reac remote jobs"
                />
                <button
                  type="button"
                  onClick={runSearchAssist}
                  disabled={busy || !searchQ.trim()}
                  className="inline-flex items-center gap-1 rounded-lg bg-violet-600 px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  <Search className="h-4 w-4" /> Suggest
                </button>
              </div>
              {searchAssist ? (
                <div className="mt-4 space-y-2 text-sm">
                  <p>
                    <strong>Intent:</strong> {searchAssist.detectedIntent} ·{' '}
                    <strong>Corrected:</strong> {searchAssist.correctedQuery}
                  </p>
                  {searchAssist.typoHints?.length ? (
                    <ul className="list-disc pl-5 text-xs text-slate-600">
                      {searchAssist.typoHints.map((h: string) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ul>
                  ) : null}
                  <p className="text-xs text-slate-500">
                    AI does not run search — use these with the platform search bar. Engine:{' '}
                    {searchAssist.executionEngine}
                  </p>
                  <ul className="space-y-1">
                    {(searchAssist.suggestions || []).map((s: string) => (
                      <li key={s} className="rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs">
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          )}

          {tab === 'memory' && (
            <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-slate-500">{memory?.privacyNotice}</p>
              <div>
                <h3 className="text-sm font-semibold">Preferred topics</h3>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(memory?.preferredTopics || []).map((t: string) => (
                    <span key={t} className="rounded-full bg-violet-100 px-2 py-0.5 text-xs text-violet-900">
                      {t}
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={topicInput}
                    onChange={(e) => setTopicInput(e.target.value)}
                    placeholder="Add topics (comma-separated)"
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                    aria-label="Add preferred topics"
                  />
                  <button type="button" onClick={saveTopics} className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white">
                    Save
                  </button>
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold">Muted topics</h3>
                <div className="mt-1 flex flex-wrap gap-1">
                  {(memory?.mutedTopics || []).map((t: string) => (
                    <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                      {t}
                    </span>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <input
                    value={muteInput}
                    onChange={(e) => setMuteInput(e.target.value)}
                    placeholder="Mute topics (comma-separated)"
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                    aria-label="Mute topics"
                  />
                  <button type="button" onClick={saveMuted} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
                    Mute
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={exportMem}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
                >
                  <Download className="h-4 w-4" /> Export memory
                </button>
                <button
                  type="button"
                  onClick={clearMem}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700"
                >
                  <Trash2 className="h-4 w-4" /> Delete memory
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {whyCard ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="why-title"
        >
          <div className="max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h2 id="why-title" className="text-base font-semibold text-slate-900">
              Why am I seeing this?
            </h2>
            <p className="mt-2 text-sm text-slate-700">{whyCard.whyAmISeeingThis || whyCard.explanation}</p>
            <ul className="mt-2 list-disc pl-5 text-xs text-slate-600">
              {(whyCard.reasons || []).map((r: string) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-slate-500">
              Source: {whyCard.source} · Advisory only · You can mark Not interested or Hide similar.
            </p>
            <button
              type="button"
              className="mt-4 rounded-lg bg-violet-600 px-3 py-1.5 text-sm text-white"
              onClick={() => setWhyCard(null)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default PersonalizedDiscovery;
