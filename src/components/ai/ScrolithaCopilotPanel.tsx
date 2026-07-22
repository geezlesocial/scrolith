/**
 * Phase 33.3 — Contextual Platform Copilot panel (embeddable).
 * Suggestions and drafts only — never auto-acts.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Bot, Loader2, Send, Sparkles, X } from 'lucide-react';
import {
  ScrolithaCopilotService,
  type CopilotSurface
} from '../../services/scrolithaCopilot';
import { classifyScrolithaClientError } from '../../utils/scrolithaErrors';

export type ScrolithaCopilotPanelProps = {
  surface: CopilotSurface;
  pagePath?: string;
  entityId?: string;
  entityType?: string;
  className?: string;
  defaultOpen?: boolean;
};

const ScrolithaCopilotPanel: React.FC<ScrolithaCopilotPanelProps> = ({
  surface,
  pagePath,
  entityId,
  entityType,
  className = '',
  defaultOpen = false
}) => {
  const [open, setOpen] = useState(defaultOpen);
  const [status, setStatus] = useState<any>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [reply, setReply] = useState('');
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [live, setLive] = useState('');
  const [statusLoading, setStatusLoading] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      setStatusLoading(true);
      const s = await ScrolithaCopilotService.getStatus();
      setStatus(s);
    } catch {
      setStatus(null);
    } finally {
      setStatusLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadStatus();
  }, [open, loadStatus]);

  const send = async () => {
    const message = input.trim();
    if (!message || loading || statusLoading || !status) return;
    if (!status.platformCopilotEnabled || !status.nativeIntelligenceEnabled) {
      setError('Scrolitha is disabled for this surface.');
      return;
    }
    if (status.betaAllowlistOnly && !status.betaAllowed) {
      setError('This Scrolitha cohort is limited to approved users.');
      return;
    }
    if (!status.consentOk) {
      setError('Enable Scrolitha AI suggestions in AI settings before continuing.');
      return;
    }
    setLoading(true);
    setError('');
    setLive('Scrolitha is thinking…');
    try {
      const data = await ScrolithaCopilotService.ask({
        message,
        surface,
        pagePath: pagePath || (typeof window !== 'undefined' ? window.location.pathname : undefined),
        entityId,
        entityType,
        includeTools: false
      });
      if (!(data as any)?.ok && (data as any)?.reason) {
        setError((data as any).reason);
        setLive(`Unavailable: ${(data as any).reason}`);
        setReply('');
        setSuggestions([]);
        return;
      }
      setReply((data as any)?.text || '');
      setSuggestions((data as any)?.suggestions || []);
      setLive('Copilot suggestion ready — review before acting');
      setInput('');
    } catch (err: any) {
      setError(classifyScrolithaClientError(err).message);
      setLive('Copilot request failed');
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-2 rounded-full bg-violet-600 px-3 py-2 text-sm font-medium text-white shadow-lg hover:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 ${className}`}
        aria-label="Open Scrolitha Copilot"
      >
        <Sparkles className="h-4 w-4" aria-hidden />
        Scrolitha
      </button>
    );
  }

  return (
    <section
      className={`flex w-full max-w-md flex-col rounded-2xl border border-violet-200 bg-white shadow-xl ${className}`}
      role="complementary"
      aria-label="Scrolitha Platform Copilot"
    >
      <div className="sr-only" role="status" aria-live="polite">
        {live}
      </div>
      <header className="flex items-center justify-between border-b border-violet-100 px-3 py-2">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-violet-700" aria-hidden />
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Scrolitha Copilot</h2>
            <p className="text-[11px] text-slate-500">
              {surface} · suggestions only · Ollama qwen3:14b
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded p-1 text-slate-500 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
          aria-label="Close copilot"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="space-y-2 p-3 text-xs text-amber-950 bg-amber-50 border-b border-amber-100" role="note">
        {status?.disclosure ||
            'Drafts and tips only. Scrolitha never posts, messages, or takes irreversible actions for you.'}
        {status && !status.betaAllowed ? (
          <p className="mt-1 font-medium">Beta allowlist only — ask an admin for access.</p>
        ) : null}
      </div>

      <div className="max-h-64 flex-1 space-y-2 overflow-y-auto p-3 text-sm">
        {reply ? (
          <div className="rounded-xl bg-violet-50 p-3 text-slate-800 whitespace-pre-wrap">{reply}</div>
        ) : (
          <p className="text-slate-500">
            Ask for rewrites, summaries, job drafts, search ideas, or page-specific tips.
          </p>
        )}
        {suggestions.map((s) => (
          <article key={s.id} className="rounded-lg border border-slate-100 p-2">
            <h3 className="text-xs font-semibold text-violet-800">{s.title}</h3>
            <p className="mt-0.5 text-xs text-slate-600">{s.body}</p>
            <p className="mt-1 text-[10px] text-slate-400">Requires your action · {s.skillId}</p>
          </article>
        ))}
        {error ? (
          <p className="text-xs text-red-700" role="alert">
            {error}
          </p>
        ) : null}
      </div>

      <div className="border-t border-slate-100 p-2">
        <label htmlFor="copilot-input" className="sr-only">
          Message to Scrolitha
        </label>
        <div className="flex gap-2">
          <input
            id="copilot-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                send();
              }
            }}
            placeholder="Ask Scrolitha…"
            className="min-h-[40px] flex-1 rounded-xl border border-slate-300 px-3 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
            disabled={statusLoading || loading || !status || !status.platformCopilotEnabled || !status.betaAllowed || !status.consentOk}
          />
          <button
            type="button"
            onClick={send}
            disabled={statusLoading || loading || !input.trim() || !status || !status.platformCopilotEnabled || !status.betaAllowed || !status.consentOk}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white hover:bg-violet-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 disabled:opacity-50"
            aria-label="Send"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </section>
  );
};

export default ScrolithaCopilotPanel;
