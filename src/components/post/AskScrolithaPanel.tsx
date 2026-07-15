import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Bot, Loader2, MessageSquarePlus, Sparkles, X } from 'lucide-react';
import ScrolithaService from '../../services/scrolitha';
import { useNotification } from '../../context/NotificationContext';
import { useUser } from '../../context/UserContext';
import {
  canShowSessionSuggestion,
  dismissProactiveSuggestion,
  isProactiveSuggestionDismissed,
  recordSessionSuggestionShown,
  SCROLITHA_DISCLOSURE,
  SCROLITHA_SYSTEM_LABEL
} from '../../utils/scrolithaIdentity';

type AskScrolithaPanelProps = {
  postId: string;
  postPreview?: string;
  compact?: boolean;
  className?: string;
  onRequestStarted?: (commentId: string) => void;
};

const FALLBACK_PROMPTS = [
  'Is the main claim supported by platform records?',
  'Summarize the key points',
  'Recommend related public jobs or services',
  'Explain this in simple terms'
];

const sessionIdForTab = () => {
  try {
    const key = 'scrolitha:tab-session-id';
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const next = `tab_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    window.sessionStorage.setItem(key, next);
    return next;
  } catch {
    return `tab_${Date.now()}`;
  }
};

const AskScrolithaPanel: React.FC<AskScrolithaPanelProps> = ({
  postId,
  postPreview,
  compact = false,
  className = '',
  onRequestStarted
}) => {
  const { user } = useUser();
  const { showNotification } = useNotification();
  const panelId = useId();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'thread' | 'instant'>('thread');
  const [dismissed, setDismissed] = useState(
    () => isProactiveSuggestionDismissed(postId) || !canShowSessionSuggestion()
  );
  const [infoOpen, setInfoOpen] = useState(false);
  /** Safe rollout: hide Ask UI until backend contextual featureFlags.enabled is true. */
  const [featureAllowed, setFeatureAllowed] = useState(false);
  const [featureChecked, setFeatureChecked] = useState(false);
  const [quickPrompts, setQuickPrompts] = useState<string[]>([]);
  const [instantAnswer, setInstantAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const [confidenceLabel, setConfidenceLabel] = useState<string | null>(null);
  const [explanationSummary, setExplanationSummary] = useState<string | null>(null);
  const [pipeline, setPipeline] = useState<string[]>([]);
  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (!user?.id || dismissed) return;
    let active = true;
    ScrolithaService.platformIdentity()
      .then((identity) => {
        if (!active) return;
        const enabled = Boolean(identity?.featureFlags?.enabled);
        setFeatureAllowed(enabled);
        setFeatureChecked(true);
        if (!enabled) return;
        recordSessionSuggestionShown();
        return ScrolithaService.contextualSuggestions(postId).then((result) => {
          if (!active) return;
          if (result.suggestions?.length) {
            setQuickPrompts(result.suggestions.slice(0, 4));
          } else {
            setQuickPrompts(FALLBACK_PROMPTS.slice(0, 4));
          }
        });
      })
      .catch(() => {
        if (!active) return;
        // Fail closed: do not advertise Ask Scrolitha when identity/flags are unavailable.
        setFeatureAllowed(false);
        setFeatureChecked(true);
        setQuickPrompts([]);
      });
    return () => {
      active = false;
    };
  }, [dismissed, postId, user?.id]);

  useEffect(() => {
    if (open) {
      // Focus management for accessibility — delay one frame so panel is visible.
      const t = window.setTimeout(() => textareaRef.current?.focus(), prefersReducedMotion ? 0 : 50);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [open, prefersReducedMotion]);

  const preview = useMemo(() => {
    const text = String(postPreview || '').replace(/\s+/g, ' ').trim();
    if (!text) return '';
    return text.length > 140 ? `${text.slice(0, 137)}…` : text;
  }, [postPreview]);

  if (!user?.id || dismissed) return null;
  if (!featureChecked || !featureAllowed) return null;

  const submitThread = async (text: string) => {
    const next = String(text || '').trim();
    if (!next) {
      showNotification('warning', 'Scrolitha', 'Enter a question first.');
      return;
    }
    if (loading) return;
    setLoading(true);
    setInstantAnswer(null);
    try {
      const result = await ScrolithaService.contextualAsk({
        postId,
        question: next.startsWith('@') ? next : `@Scrolitha ${next}`
      });
      showNotification('info', 'Scrolitha', result?.message || 'Scrolitha is reviewing this post…');
      if (result?.commentId) onRequestStarted?.(result.commentId);
      setQuestion('');
      setOpen(false);
    } catch (error: any) {
      showNotification(
        'error',
        'Scrolitha',
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          error?.message ||
          'Unable to ask Scrolitha right now.'
      );
    } finally {
      setLoading(false);
    }
  };

  const submitInstant = async (text: string) => {
    const next = String(text || '').trim();
    if (!next) {
      showNotification('warning', 'Scrolitha', 'Enter a question first.');
      return;
    }
    if (loading) return;
    setLoading(true);
    try {
      const result = await ScrolithaService.intelligenceAsk({
        question: next,
        surface: 'post',
        entityType: 'post',
        entityId: postId,
        postId,
        sessionId: sessionIdForTab()
      });
      setInstantAnswer(result.answer || '');
      setSources(Array.isArray(result.sources) ? result.sources : []);
      setSessionKey(result.sessionKey || null);
      setConfidenceLabel(result.confidenceLabel || result.confidenceBand || null);
      setExplanationSummary(result.explanation?.summary || result.explanationText || null);
      setPipeline(Array.isArray(result.workflow?.pipeline) ? result.workflow.pipeline : []);
      if (result.recommendations?.length) {
        setQuickPrompts(result.recommendations.slice(0, 4));
      }
    } catch (error: any) {
      showNotification(
        'error',
        'Scrolitha',
        error?.response?.data?.message ||
          error?.response?.data?.error ||
          error?.message ||
          'Intelligence request failed.'
      );
    } finally {
      setLoading(false);
    }
  };

  const submit = async (text: string) => {
    if (mode === 'instant') return submitInstant(text);
    return submitThread(text);
  };

  const dismissPrompt = async (prompt: string) => {
    if (!sessionKey) return;
    try {
      await ScrolithaService.intelligenceDismiss({
        sessionKey,
        suggestionKey: prompt.slice(0, 24).toLowerCase()
      });
      setQuickPrompts((prev) => prev.filter((p) => p !== prompt));
    } catch {
      // ignore
    }
  };

  return (
    <div
      className={`rounded-2xl border border-cyan-100/80 bg-gradient-to-br from-cyan-50/80 to-white motion-safe:transition-shadow ${className}`}
      data-scrolitha-intelligence="true"
    >
      {!open ? (
        <div className={`flex items-center gap-2 ${compact ? 'px-3 py-2' : 'px-3 py-2.5'}`}>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex min-w-0 flex-1 items-center gap-2 rounded-xl px-1 py-1 text-left text-sm font-medium text-cyan-900 transition hover:bg-cyan-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
            aria-expanded={false}
            aria-controls={panelId}
            aria-label="Ask Scrolitha about this post"
          >
            <span
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-cyan-700 text-white"
              aria-hidden
            >
              <Sparkles className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-semibold">Ask Scrolitha</span>
              {!compact && preview ? (
                <span className="block truncate text-xs font-normal text-cyan-900/70">{preview}</span>
              ) : (
                <span className="block text-xs font-normal text-cyan-900/70">
                  Verify claims, summarize, or explore platform context
                </span>
              )}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              dismissProactiveSuggestion(postId);
              setDismissed(true);
            }}
            className="rounded-full p-1.5 text-cyan-800/70 transition hover:bg-cyan-100 hover:text-cyan-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
            aria-label="Dismiss Ask Scrolitha suggestion"
            title="Dismiss"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      ) : (
        <div
          id={panelId}
          className="space-y-3 p-3"
          role="region"
          aria-label="Ask Scrolitha intelligence panel"
          aria-busy={loading}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-cyan-950">
              <Bot className="h-4 w-4 text-cyan-800" aria-hidden />
              Ask Scrolitha
              <span className="rounded-full bg-cyan-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-900">
                {SCROLITHA_SYSTEM_LABEL}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full p-1 text-slate-600 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
              aria-label="Close Ask Scrolitha panel"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>

          <div
            className="inline-flex rounded-full border border-cyan-200 bg-white p-0.5"
            role="tablist"
            aria-label="Scrolitha response mode"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'thread'}
              onClick={() => setMode('thread')}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 ${
                mode === 'thread' ? 'bg-cyan-700 text-white' : 'text-cyan-900'
              }`}
            >
              Reply in thread
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'instant'}
              onClick={() => setMode('instant')}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 ${
                mode === 'instant' ? 'bg-cyan-700 text-white' : 'text-cyan-900'
              }`}
            >
              Instant assist
            </button>
          </div>

          <div className="flex flex-wrap gap-1.5" role="list" aria-label="Suggested questions">
            {quickPrompts.map((prompt) => (
              <div key={prompt} className="inline-flex items-center gap-0.5" role="listitem">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void submit(prompt)}
                  className="rounded-full border border-cyan-200 bg-white px-2.5 py-1 text-[11px] font-medium text-cyan-950 transition hover:bg-cyan-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600 disabled:opacity-60"
                >
                  {prompt}
                </button>
                {sessionKey ? (
                  <button
                    type="button"
                    className="rounded-full p-1 text-cyan-800/60 hover:bg-cyan-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-600"
                    aria-label={`Dismiss suggestion: ${prompt}`}
                    onClick={() => void dismissPrompt(prompt)}
                  >
                    <X className="h-3 w-3" aria-hidden />
                  </button>
                ) : null}
              </div>
            ))}
          </div>

          <label className="block" htmlFor={`${panelId}-question`}>
            <span className="sr-only">Question for Scrolitha</span>
            <textarea
              id={`${panelId}-question`}
              ref={textareaRef}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              rows={2}
              placeholder="@Scrolitha is this claim supported?"
              disabled={loading}
              className="w-full resize-none rounded-xl border border-cyan-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-cyan-600/30 focus:ring-2 disabled:opacity-60"
            />
          </label>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setInfoOpen((prev) => !prev)}
              className="text-[11px] font-medium text-cyan-900 underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-600"
              aria-expanded={infoOpen}
            >
              {infoOpen ? 'Hide capabilities' : 'Capabilities & limits'}
            </button>
            <div className="flex flex-wrap gap-2">
              {mode === 'thread' ? (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void submitThread(question)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-cyan-800 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700 disabled:opacity-60"
                >
                  {loading ? (
                    <Loader2 className={`h-3.5 w-3.5 ${prefersReducedMotion ? '' : 'animate-spin'}`} aria-hidden />
                  ) : (
                    <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Post &amp; ask
                </button>
              ) : (
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void submitInstant(question)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-cyan-800 px-3.5 py-1.5 text-xs font-semibold text-white transition hover:bg-cyan-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-700 disabled:opacity-60"
                >
                  {loading ? (
                    <Loader2 className={`h-3.5 w-3.5 ${prefersReducedMotion ? '' : 'animate-spin'}`} aria-hidden />
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" aria-hidden />
                  )}
                  Instant answer
                </button>
              )}
            </div>
          </div>

          {instantAnswer ? (
            <div
              className="rounded-xl border border-cyan-100 bg-white/90 px-3 py-2 text-sm leading-6 text-slate-800"
              role="status"
              aria-live="polite"
            >
              {confidenceLabel ? (
                <p className="mb-1 text-[11px] font-bold uppercase tracking-wide text-cyan-900">
                  Confidence: {confidenceLabel}
                </p>
              ) : null}
              <p className="whitespace-pre-wrap">{instantAnswer}</p>
              {explanationSummary ? (
                <p className="mt-2 text-[11px] text-slate-600">
                  <span className="font-semibold">Why: </span>
                  {explanationSummary}
                </p>
              ) : null}
              {sources.length ? (
                <p className="mt-2 text-[11px] text-slate-600">
                  <span className="font-semibold">Sources used: </span>
                  {sources.join(' · ')}
                </p>
              ) : null}
              {pipeline.length ? (
                <p className="mt-1 text-[10px] text-slate-500">
                  <span className="font-semibold">Skills pipeline: </span>
                  {pipeline.join(' → ')}
                </p>
              ) : null}
            </div>
          ) : null}

          {infoOpen ? (
            <p className="rounded-xl bg-white/80 px-3 py-2 text-[11px] leading-5 text-slate-700" role="note">
              {SCROLITHA_DISCLOSURE} Uses permission-aware platform relationships (profiles, public jobs/services,
              communities, pages) plus this post. Session memory is temporary. External web search is not simulated.
              Moderation assist never removes content automatically.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default AskScrolithaPanel;
