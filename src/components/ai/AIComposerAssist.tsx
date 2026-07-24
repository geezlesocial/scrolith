/**
 * Enterprise AI Composer assist — draft-only rewrites, never auto-submits.
 * Used by Create Post (desktop + mobile) and reusable surfaces.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles, Copy, Check, Undo2, RotateCcw } from 'lucide-react';
import { AIService, type PostEnhanceMode } from '../../services/ai/ai.service';
import { ScrolithaAssistantService } from '../../services/scrolithaAssistant';

const POST_MODES: Array<{ id: PostEnhanceMode; label: string }> = [
  { id: 'grammar', label: 'Grammar' },
  { id: 'rephrase', label: 'Rephrase' },
  { id: 'professional', label: 'Professional' },
  { id: 'shorten', label: 'Shorten' },
  { id: 'expand', label: 'Expand' }
];

const GENERIC_MODES = [
  { id: 'improve', label: 'Improve' },
  { id: 'expand', label: 'Expand' },
  { id: 'shorten', label: 'Shorten' },
  { id: 'professional', label: 'Professional' },
  { id: 'friendly', label: 'Friendly' },
  { id: 'formal', label: 'Formal' },
  { id: 'casual', label: 'Casual' },
  { id: 'grammar', label: 'Grammar' },
  { id: 'spelling', label: 'Spelling' },
  { id: 'hashtags', label: 'Hashtags' },
  { id: 'emoji', label: 'Emoji' }
] as const;

export type AIComposerAssistProps = {
  value: string;
  onApplyDraft: (draft: string, meta?: { mode: string; replace: boolean }) => void;
  /** When surface starts with "post", uses AIService.enhancePostDraft (Create Post path). */
  surface?: string;
  className?: string;
  disabled?: boolean;
  /** Compact mode for mobile toolbars */
  compact?: boolean;
  defaultMode?: string;
};

const AIComposerAssist: React.FC<AIComposerAssistProps> = ({
  value,
  onApplyDraft,
  surface = 'generic',
  className = '',
  disabled,
  compact = false,
  defaultMode
}) => {
  const isPostSurface = /^post/i.test(surface || '');
  const modes = isPostSurface ? POST_MODES : GENERIC_MODES;
  const [mode, setMode] = useState<string>(defaultMode || modes[0].id);
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [copied, setCopied] = useState(false);
  const [live, setLive] = useState('');
  const [prevApplied, setPrevApplied] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    // Reset draft when the source text is cleared.
    if (!String(value || '').trim()) {
      setDraft('');
      setError('');
      setWarning('');
    }
  }, [value]);

  const run = useCallback(async () => {
    if (!value.trim() || disabled || loading) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;

    setLoading(true);
    setError('');
    setWarning('');
    setLive('Generating AI draft…');
    try {
      let text = '';
      let warn = '';
      if (isPostSurface) {
        const result = await AIService.enhancePostDraft({
          text: value,
          mode: mode as PostEnhanceMode
        });
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        text = String(result?.enhancedText || '').trim();
        if (result?.fallbackUsed || result?.warning) {
          warn =
            String(result.warning || '') ||
            'Scrolitha used backup processing. Review carefully before applying.';
        }
      } else {
        const result = await ScrolithaAssistantService.composer({
          text: value,
          mode,
          surface
        });
        if (controller.signal.aborted || requestId !== requestIdRef.current) return;
        if (!result.ok || !result.text) {
          setError(result.reason || 'AI unavailable (feature flags or consent may be off)');
          setLive('AI draft failed');
          return;
        }
        text = String(result.text || '').trim();
      }

      if (!text) {
        setError('No suggestion was returned. Please try again.');
        setLive('AI draft empty');
        return;
      }
      setDraft(text);
      setWarning(warn);
      setLive('AI draft ready. Review before applying.');
    } catch (err: any) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return;
      const message = String(err?.message || 'Request failed');
      if (/abort/i.test(message)) return;
      setError(message);
      setLive('AI draft failed');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [disabled, isPostSurface, loading, mode, surface, value]);

  const copy = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  const apply = (replace: boolean) => {
    if (!draft) return;
    setPrevApplied(value);
    onApplyDraft(draft, { mode, replace });
    setLive(replace ? 'AI draft applied (replaced).' : 'AI draft inserted.');
  };

  const undoApply = () => {
    if (prevApplied === null) return;
    onApplyDraft(prevApplied, { mode: 'undo', replace: true });
    setLive('Restored previous text.');
    setPrevApplied(null);
  };

  return (
    <div
      className={`rounded-xl border border-violet-200 bg-violet-50/70 p-3 ${className}`}
      role="region"
      aria-label="Scrolitha AI composer assist"
      data-testid="ai-composer-assist"
    >
      <div className="sr-only" role="status" aria-live="polite">
        {live}
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-700" aria-hidden />
        <span className="text-sm font-semibold text-violet-950">Scrolitha AI assist</span>
        <span className="text-[11px] font-medium text-violet-700">Draft only — never auto-posts</span>
      </div>
      <div className={`mb-2 flex flex-wrap gap-1 ${compact ? 'max-h-20 overflow-y-auto' : ''}`} role="group" aria-label="Rewrite modes">
        {modes.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={loading || disabled}
            onClick={() => setMode(m.id)}
            className={`rounded-full px-2.5 py-1 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
              mode === m.id
                ? 'bg-violet-600 text-white'
                : 'border border-violet-200 bg-white text-violet-900 hover:bg-violet-50'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void run()}
          disabled={loading || disabled || !value.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
          {loading ? 'Generating…' : 'Generate draft'}
        </button>
        {loading ? (
          <button
            type="button"
            onClick={() => abortRef.current?.abort()}
            className="inline-flex items-center gap-1 rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-semibold text-violet-900"
          >
            Cancel
          </button>
        ) : null}
        {draft ? (
          <>
            <button
              type="button"
              onClick={() => apply(true)}
              className="rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              Replace text
            </button>
            <button
              type="button"
              onClick={() => apply(false)}
              className="rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              Insert below
            </button>
            <button
              type="button"
              onClick={() => void copy()}
              className="inline-flex items-center gap-1 rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-50"
            >
              {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
              Copy
            </button>
            <button
              type="button"
              onClick={() => void run()}
              disabled={loading || disabled}
              className="inline-flex items-center gap-1 rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-50"
              title="Regenerate with the same mode"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden />
              Retry
            </button>
          </>
        ) : null}
        {prevApplied !== null ? (
          <button
            type="button"
            onClick={undoApply}
            className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900"
          >
            <Undo2 className="h-3.5 w-3.5" aria-hidden />
            Undo apply
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {warning ? (
        <p className="mt-2 text-xs text-amber-800" role="status">
          {warning}
        </p>
      ) : null}
      {draft ? (
        <div className="mt-2">
          <p className="mb-1 text-xs font-medium text-violet-800">
            AI draft preview — review carefully. Outputs may be incorrect.
          </p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-violet-100 bg-white p-2 text-sm text-slate-800">
            {draft}
          </pre>
        </div>
      ) : null}
    </div>
  );
};

export default AIComposerAssist;
