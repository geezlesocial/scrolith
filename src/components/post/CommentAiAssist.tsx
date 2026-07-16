import React, { useMemo, useRef, useState } from 'react';
import { Check, Loader2, Sparkles, Wand2, X } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import type { ScrolithaRewriteMode } from '../../services/scrolitha';
import { runScrolithaRewrite } from '../../utils/scrolithaRewrite';

type CommentAiAction = {
  key: string;
  mode: ScrolithaRewriteMode;
  label: string;
  goal: string;
};

const buildCommentAiActions = (scopeLabel: string): CommentAiAction[] => [
  {
    key: 'help',
    mode: 'expand',
    label: 'Help me write',
    goal: `Turn this draft into a stronger ${scopeLabel} with a clear point, natural tone, and a complete finish.`
  },
  {
    key: 'grammar',
    mode: 'grammar',
    label: 'Fix grammar',
    goal: `Correct grammar, spelling, and punctuation while preserving the meaning of this ${scopeLabel}.`
  },
  {
    key: 'professional',
    mode: 'professional',
    label: 'Professional',
    goal: `Rewrite this ${scopeLabel} so it sounds polished, confident, and professional without changing the intent.`
  },
  {
    key: 'longer',
    mode: 'expand',
    label: 'Longer',
    goal: `Expand this ${scopeLabel} with a little more detail and clarity while keeping it concise enough to post.`
  },
  {
    key: 'format',
    mode: 'rephrase',
    label: 'Format',
    goal: `Format this ${scopeLabel} for readability using clean sentence breaks and a tidy structure.`
  },
  {
    key: 'shorter',
    mode: 'shorten',
    label: 'Shorter',
    goal: `Shorten this ${scopeLabel} so it feels crisp and direct without losing the key point.`
  },
  {
    key: 'autocomplete',
    mode: 'expand',
    label: 'Autocomplete',
    goal: `Complete this unfinished ${scopeLabel} naturally, preserving the writer's tone and intended message.`
  }
];

type CommentAiAssistProps = {
  value: string;
  onReplace: (nextValue: string) => void;
  disabled?: boolean;
  scopeLabel?: string;
};

const CommentAiAssist: React.FC<CommentAiAssistProps> = ({
  value,
  onReplace,
  disabled = false,
  scopeLabel = 'comment'
}) => {
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(false);
  const [runningAction, setRunningAction] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [suggestionAction, setSuggestionAction] = useState<string | null>(null);
  const inFlightRef = useRef(false);
  const commentAiActions = useMemo(() => buildCommentAiActions(scopeLabel), [scopeLabel]);

  const dismissSuggestion = () => {
    setSuggestion('');
    setSourceText('');
    setSuggestionAction(null);
  };

  const runAiRewrite = async (action: CommentAiAction) => {
    const text = String(value || '').trim();
    if (!text) {
      showNotification('warning', 'Scrolitha', `Write your ${scopeLabel} first, then run Scrolitha assistance.`);
      return;
    }
    if (loading || disabled || inFlightRef.current) return;

    inFlightRef.current = true;
    setLoading(true);
    setRunningAction(action.key);
    try {
      const result = await runScrolithaRewrite({
        text,
        mode: action.mode,
        goal: action.goal,
        scope: `comment-${scopeLabel}`
      });
      if (!result.ok) {
        showNotification(result.retryable ? 'warning' : 'error', 'Scrolitha', result.message);
        return;
      }
      if (result.warning) {
        showNotification('warning', 'Scrolitha', result.warning);
      }
      setSourceText(text);
      setSuggestion(result.text);
      setSuggestionAction(action.key);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      setRunningAction(null);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
        <Sparkles className="h-3.5 w-3.5 text-sky-500" />
        Scrolitha prompts
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {commentAiActions.map((action) => (
          <button
            key={action.key}
            type="button"
            onClick={() => void runAiRewrite(action)}
            disabled={disabled || loading}
            className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {runningAction === action.key && loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="h-3.5 w-3.5 text-sky-500" />
            )}
            {runningAction === action.key && loading ? 'Working...' : action.label}
          </button>
        ))}
      </div>

      {suggestion ? (
        <div className="rounded-3xl border border-sky-100 bg-sky-50/80 p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-900">Scrolitha suggestion ready</p>
              <p className="text-xs text-slate-500">
                {commentAiActions.find((entry) => entry.key === suggestionAction)?.label || 'Rewrite'}
              </p>
            </div>
            <span className="rounded-full border border-sky-200 bg-white px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-sky-700">
              Private preview
            </span>
          </div>

          {sourceText && sourceText !== suggestion ? (
            <div className="mt-3 rounded-2xl border border-white/80 bg-white/80 p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Original</div>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-500">{sourceText}</p>
            </div>
          ) : null}

          <div className="mt-3 rounded-2xl border border-sky-100 bg-white p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">Suggested</div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{suggestion}</p>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onReplace(suggestion);
                dismissSuggestion();
              }}
              className="inline-flex items-center gap-1 rounded-full bg-slate-900 px-4 py-2 text-[11px] font-semibold uppercase text-white transition hover:bg-slate-800"
            >
              <Check className="h-3.5 w-3.5" />
              Use suggestion
            </button>
            <button
              type="button"
              onClick={dismissSuggestion}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-4 py-2 text-[11px] font-semibold uppercase text-slate-600 transition hover:bg-slate-50"
            >
              <X className="h-3.5 w-3.5" />
              Keep mine
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default CommentAiAssist;
