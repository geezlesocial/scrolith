/**
 * Phase 33.1 — Reusable AI Composer assist panel (drafts only, never auto-submit).
 * Integrate near Create Post / Comments / Messages / Community / Business Pages.
 */
import React, { useState } from 'react';
import { Loader2, Sparkles, Copy, Check } from 'lucide-react';
import { ScrolithaAssistantService } from '../../services/scrolithaAssistant';

const MODES = [
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
  onApplyDraft: (draft: string) => void;
  surface?: string;
  className?: string;
  disabled?: boolean;
};

const AIComposerAssist: React.FC<AIComposerAssistProps> = ({
  value,
  onApplyDraft,
  surface = 'generic',
  className = '',
  disabled
}) => {
  const [mode, setMode] = useState<string>('improve');
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [live, setLive] = useState('');

  const run = async () => {
    if (!value.trim() || disabled) return;
    setLoading(true);
    setError('');
    setLive('Generating AI draft…');
    try {
      const result = await ScrolithaAssistantService.composer({
        text: value,
        mode,
        surface
      });
      if (!result.ok || !result.text) {
        setError(result.reason || 'AI unavailable (feature flags or consent may be off)');
        setLive('AI draft failed');
        return;
      }
      setDraft(result.text);
      setLive('AI draft ready. Review before applying.');
    } catch (err: any) {
      setError(err?.message || 'Request failed');
      setLive('AI draft failed');
    } finally {
      setLoading(false);
    }
  };

  const copy = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      className={`rounded-xl border border-violet-200 bg-violet-50/60 p-3 ${className}`}
      role="region"
      aria-label="Scrolitha AI composer assist"
    >
      <div className="sr-only" role="status" aria-live="polite">
        {live}
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-700" aria-hidden />
        <span className="text-sm font-medium text-violet-900">AI assist</span>
        <span className="text-xs text-violet-700">Draft only — never auto-submits</span>
      </div>
      <div className="mb-2 flex flex-wrap gap-1" role="group" aria-label="Rewrite modes">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={loading || disabled}
            onClick={() => setMode(m.id)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${
              mode === m.id ? 'bg-violet-600 text-white' : 'bg-white text-violet-900 border border-violet-200'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={run}
          disabled={loading || disabled || !value.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
          Generate draft
        </button>
        {draft ? (
          <>
            <button
              type="button"
              onClick={() => onApplyDraft(draft)}
              className="rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-medium text-violet-900 hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              Apply to editor
            </button>
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-1 rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-medium text-violet-900 hover:bg-violet-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              Copy
            </button>
          </>
        ) : null}
      </div>
      {error ? (
        <p className="mt-2 text-xs text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {draft ? (
        <div className="mt-2">
          <p className="mb-1 text-xs text-violet-800">
            AI draft preview — review carefully. Outputs may be incorrect.
          </p>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-2 text-sm text-slate-800 border border-violet-100">
            {draft}
          </pre>
        </div>
      ) : null}
    </div>
  );
};

export default AIComposerAssist;
