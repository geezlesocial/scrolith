import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Bot, Loader2, Sparkles, X } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import ScrolithaService from '../../services/scrolitha';
import { useUser } from '../../context/UserContext';
import { useNotification } from '../../context/NotificationContext';
import { useScrolithaOs } from '../../context/ScrolithaOsContext';
import ScrolithaActionCards, { type ActionCard } from './ScrolithaActionCards';
import { SCROLITHA_DISCLOSURE, SCROLITHA_SYSTEM_LABEL } from '../../utils/scrolithaIdentity';

type SurfaceMode = 'floating' | 'side_panel' | 'inline' | 'comment_reply' | 'context_card' | 'bottom_sheet';

const detectViewport = () => {
  if (typeof window === 'undefined') return 'desktop';
  const w = window.innerWidth || 1200;
  if (w < 640) return 'mobile';
  if (w < 1024) return 'tablet';
  return 'desktop';
};

const inferSurfaceFromPath = (pathname: string) => {
  const p = String(pathname || '').toLowerCase();
  if (p.includes('/messages') || p.includes('/inbox')) return 'messaging';
  if (p.includes('/jobs')) return 'job';
  if (p.includes('/gig') || p.includes('/services')) return 'service';
  if (p.includes('/communit') || p.includes('/groups')) return 'community';
  if (p.includes('/dashboard')) return 'dashboard';
  if (p.includes('/search')) return 'search';
  if (p.includes('/post/')) return 'post';
  if (p.includes('/page/') || p.includes('/company')) return 'company';
  if (p.includes('/u/') || p.includes('/profile')) return 'profile';
  if (p === '/' || p.includes('/home') || p.includes('/feed')) return 'feed';
  return 'global';
};

const ScrolithaOsSurface: React.FC = () => {
  const { user } = useUser();
  const { showNotification } = useNotification();
  const location = useLocation();
  const os = useScrolithaOs();
  const panelId = useId();
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef<string | null>(null);

  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  /** Safe rollout: stay hidden until backend osSurface capability permits bootstrap. */
  const [surfaceAllowed, setSurfaceAllowed] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [chunks, setChunks] = useState<string[]>([]);
  const [visibleChunkCount, setVisibleChunkCount] = useState(0);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [cards, setCards] = useState<ActionCard[]>([]);
  const [recommendations, setRecommendations] = useState<
    Array<{ id: string; kind: string; title: string; reason: string; hrefHint?: string }>
  >([]);
  const [confidenceLabel, setConfidenceLabel] = useState<string | null>(null);
  const [explanation, setExplanation] = useState<string | null>(null);
  const [skillsUsed, setSkillsUsed] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [surfaceMode, setSurfaceMode] = useState<SurfaceMode>('floating');
  const [sessionKey, setSessionKey] = useState<string | null>(null);

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const pagePayload = useMemo(() => {
    const inferred = inferSurfaceFromPath(location.pathname);
    return {
      route: location.pathname + (location.search || ''),
      surface: os.page.surface || inferred,
      pageType: os.page.pageType || inferred,
      entityType: os.page.entityType,
      entityId: os.page.entityId,
      postId: os.page.postId,
      title: os.page.title || document.title,
      module: os.page.module || inferred,
      selectedText: os.page.selectedText
    };
  }, [location.pathname, location.search, os.page]);

  const bootstrap = useCallback(async () => {
    if (!user?.id) return;
    setBootstrapping(true);
    try {
      const data = await ScrolithaService.osBootstrap({
        page: pagePayload,
        sessionId: os.sessionId,
        viewport: detectViewport(),
        activity: expanded ? 'open' : 'idle'
      });
      setSurfaceAllowed(true);
      setSessionKey(data.sessionKey || null);
      setSuggestions(Array.isArray(data.proactiveSuggestions) ? data.proactiveSuggestions : []);
      setCards(Array.isArray(data.actionCards) ? data.actionCards : []);
      setRecommendations(Array.isArray(data.recommendations) ? data.recommendations : []);
      if (data.surfaceMode) setSurfaceMode(data.surfaceMode as SurfaceMode);
    } catch (error: any) {
      // Rollout-disabled or bootstrap failure: do not render a fake-enabled surface.
      const status = Number(error?.response?.status || error?.status || 0);
      const msg = String(error?.response?.data?.error || error?.response?.data?.message || error?.message || '');
      const disabled = status === 403 || /disabled|capability|rollout|master/i.test(msg);
      setSurfaceAllowed(false);
      setSuggestions([]);
      setCards([]);
      setRecommendations([]);
      if (!disabled) {
        // Transient errors stay hidden rather than advertising AI chrome.
        setSurfaceAllowed(false);
      }
    } finally {
      setBootstrapping(false);
    }
  }, [user?.id, pagePayload, os.sessionId, expanded]);

  useEffect(() => {
    if (!user?.id) return;
    void bootstrap();
  }, [user?.id, location.pathname, bootstrap]);

  useEffect(() => {
    os.registerOpenHandler((opts) => {
      setExpanded(true);
      if (opts?.prompt) setQuestion(opts.prompt);
    });
    return () => os.registerOpenHandler(null);
  }, [os]);

  useEffect(() => {
    if (os.isOpen) setExpanded(true);
  }, [os.isOpen]);

  useEffect(() => {
    if (os.launchPrompt) setQuestion(os.launchPrompt);
  }, [os.launchPrompt]);

  // Incremental chunk rendering
  useEffect(() => {
    if (!chunks.length) {
      setVisibleChunkCount(0);
      return;
    }
    if (prefersReducedMotion) {
      setVisibleChunkCount(chunks.length);
      return;
    }
    setVisibleChunkCount(1);
    let i = 1;
    const timer = window.setInterval(() => {
      i += 1;
      setVisibleChunkCount(i);
      if (i >= chunks.length) window.clearInterval(timer);
    }, 40);
    return () => window.clearInterval(timer);
  }, [chunks, prefersReducedMotion]);

  useEffect(() => {
    if (expanded) {
      const t = window.setTimeout(() => inputRef.current?.focus(), prefersReducedMotion ? 0 : 40);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [expanded, prefersReducedMotion]);

  const cancelInflight = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (requestIdRef.current) {
      try {
        await ScrolithaService.osCancel(requestIdRef.current);
      } catch {
        // ignore
      }
      requestIdRef.current = null;
    }
  }, []);

  const runAsk = useCallback(
    async (prompt: string, actionCardId?: string) => {
      const q = String(prompt || '').trim();
      if (!q && !actionCardId) {
        showNotification('warning', 'Scrolitha', 'Enter a question first.');
        return;
      }
      if (!user?.id) {
        showNotification('info', 'Scrolitha', 'Sign in to use Scrolitha OS.');
        return;
      }
      await cancelInflight();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setAnswer('');
      setChunks([]);
      try {
        const data = await ScrolithaService.osAsk(
          {
            question: q,
            actionCardId,
            page: pagePayload,
            sessionId: os.sessionId,
            viewport: detectViewport(),
            activity: 'asking'
          },
          { signal: controller.signal }
        );
        requestIdRef.current = data?.diagnostics?.requestId || data?.requestId || null;
        setAnswer(String(data?.answer || ''));
        setChunks(Array.isArray(data?.chunks) && data.chunks.length ? data.chunks : [String(data?.answer || '')]);
        setConfidenceLabel(data?.confidenceLabel || data?.confidenceBand || null);
        setExplanation(data?.explanation?.summary || data?.explanationText || null);
        setSkillsUsed(Array.isArray(data?.workflow?.skills) ? data.workflow.skills : data?.explanation?.skillsUsed || []);
        setSources(Array.isArray(data?.sources) ? data.sources : []);
        if (Array.isArray(data?.actionCards)) setCards(data.actionCards);
        if (Array.isArray(data?.recommendations)) setRecommendations(data.recommendations);
        if (Array.isArray(data?.suggestedFollowUps)) setSuggestions(data.suggestedFollowUps);
        if (data?.surfaceMode) setSurfaceMode(data.surfaceMode);
        if (data?.sessionKey) setSessionKey(data.sessionKey);
      } catch (error: any) {
        if (error?.name === 'CanceledError' || error?.code === 'ERR_CANCELED') return;
        showNotification(
          'error',
          'Scrolitha',
          error?.response?.data?.message || error?.message || 'Scrolitha OS request failed.'
        );
      } finally {
        setLoading(false);
      }
    },
    [user?.id, cancelInflight, pagePayload, os.sessionId, showNotification]
  );

  if (!user?.id) return null;
  // Hidden until backend osSurface rollout permits bootstrap (safe-by-default).
  if (!surfaceAllowed) return null;

  const renderedAnswer = chunks.length
    ? chunks.slice(0, Math.max(1, visibleChunkCount)).join('\n\n')
    : answer;

  const shellClass =
    surfaceMode === 'side_panel'
      ? 'fixed right-4 top-24 z-[70] w-[min(100vw-2rem,24rem)]'
      : surfaceMode === 'bottom_sheet'
        ? 'fixed inset-x-0 bottom-0 z-[70] w-full rounded-t-3xl'
        : 'fixed bottom-24 right-4 z-[70] w-[min(100vw-2rem,22rem)] sm:bottom-6';

  if (!expanded) {
    return (
      <div className={`${shellClass} pointer-events-auto`}>
        <button
          type="button"
          onClick={() => {
            setExpanded(true);
            void bootstrap();
          }}
          className="inline-flex items-center gap-2 rounded-full bg-cyan-800 px-3.5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-cyan-900/20 transition hover:bg-cyan-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
          aria-expanded={false}
          aria-controls={panelId}
          aria-label="Open Scrolitha Intelligence OS"
        >
          <Sparkles className="h-4 w-4" aria-hidden />
          Scrolitha
          {bootstrapping ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
        </button>
      </div>
    );
  }

  return (
    <div
      id={panelId}
      className={`${shellClass} pointer-events-auto overflow-hidden rounded-2xl border border-cyan-100 bg-gradient-to-br from-cyan-50 to-white shadow-2xl shadow-slate-900/15`}
      role="dialog"
      aria-label="Scrolitha Intelligence OS"
      aria-modal="false"
      aria-busy={loading}
    >
      <div className="flex items-center justify-between gap-2 border-b border-cyan-100 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-sm font-semibold text-cyan-950">
          <Bot className="h-4 w-4 shrink-0 text-cyan-800" aria-hidden />
          <span className="truncate">Scrolitha OS</span>
          <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-900">
            {SCROLITHA_SYSTEM_LABEL}
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            void cancelInflight();
            setExpanded(false);
            os.closeOs();
          }}
          className="rounded-full p-1 text-slate-600 hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-600"
          aria-label="Close Scrolitha OS"
        >
          <X className="h-4 w-4" aria-hidden />
        </button>
      </div>

      <div className="max-h-[min(70vh,32rem)] space-y-3 overflow-y-auto p-3">
        <p className="text-[11px] text-cyan-900/80">
          Context: <span className="font-semibold">{pagePayload.surface}</span>
          {pagePayload.route ? ` · ${pagePayload.route}` : ''}
        </p>

        {suggestions.length ? (
          <div className="flex flex-wrap gap-1.5" role="list" aria-label="Proactive suggestions">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                disabled={loading}
                onClick={() => void runAsk(s)}
                className="rounded-full border border-cyan-200 bg-white px-2.5 py-1 text-left text-[11px] font-medium text-cyan-950 hover:bg-cyan-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-600 disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
        ) : null}

        <ScrolithaActionCards
          cards={cards}
          disabled={loading}
          onSelect={(card) => void runAsk(question || card.description || card.label, card.id)}
        />

        <label className="block" htmlFor={`${panelId}-q`}>
          <span className="sr-only">Ask Scrolitha</span>
          <textarea
            id={`${panelId}-q`}
            ref={inputRef}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={2}
            placeholder="Ask across posts, jobs, companies, communities…"
            disabled={loading}
            className="w-full resize-none rounded-xl border border-cyan-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-600/30 focus:ring-2 disabled:opacity-60"
          />
        </label>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            disabled={loading}
            onClick={() => void cancelInflight()}
            className="text-[11px] font-medium text-slate-600 underline-offset-2 hover:underline disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void runAsk(question)}
            className="inline-flex items-center gap-1.5 rounded-full bg-cyan-800 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-cyan-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className={`h-3.5 w-3.5 ${prefersReducedMotion ? '' : 'animate-spin'}`} aria-hidden />
            ) : (
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
            )}
            Ask
          </button>
        </div>

        {renderedAnswer ? (
          <div className="rounded-xl border border-cyan-100 bg-white/95 px-3 py-2 text-sm leading-6 text-slate-800" role="status" aria-live="polite">
            {confidenceLabel ? (
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-cyan-900">Confidence: {confidenceLabel}</p>
            ) : null}
            <p className="whitespace-pre-wrap">{renderedAnswer}</p>
            {explanation ? (
              <p className="mt-2 text-[11px] text-slate-600">
                <span className="font-semibold">Why: </span>
                {explanation}
              </p>
            ) : null}
            {skillsUsed.length ? (
              <p className="mt-1 text-[10px] text-slate-500">
                <span className="font-semibold">Skills: </span>
                {skillsUsed.join(' · ')}
              </p>
            ) : null}
            {sources.length ? (
              <p className="mt-1 text-[10px] text-slate-500">
                <span className="font-semibold">Context: </span>
                {sources.join(' · ')}
              </p>
            ) : null}
          </div>
        ) : null}

        {recommendations.length ? (
          <div className="space-y-1" aria-label="Recommendations">
            <p className="text-[11px] font-semibold text-cyan-950">Recommendations</p>
            <ul className="space-y-1">
              {recommendations.slice(0, 5).map((r) => (
                <li key={r.id} className="rounded-lg bg-white/80 px-2 py-1.5 text-[11px] text-slate-700">
                  <span className="font-semibold capitalize text-cyan-900">{r.kind}: </span>
                  {r.hrefHint ? (
                    <a href={r.hrefHint} className="font-medium text-cyan-800 underline-offset-2 hover:underline">
                      {r.title}
                    </a>
                  ) : (
                    <span className="font-medium">{r.title}</span>
                  )}
                  <span className="block text-slate-500">{r.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <p className="text-[10px] leading-4 text-slate-500" role="note">
          {SCROLITHA_DISCLOSURE} Mode: {surfaceMode}
          {sessionKey ? ' · session active' : ''}.
        </p>
      </div>
    </div>
  );
};

export default ScrolithaOsSurface;
