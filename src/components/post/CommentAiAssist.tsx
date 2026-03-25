import React, { useState } from 'react';
import { Check, Loader2, Sparkles, Wand2, X } from 'lucide-react';
import { useNotification } from '../../context/NotificationContext';
import { AIService, type PostEnhanceMode } from '../../services/ai/ai.service';

const commentAiActions: Array<{ mode: PostEnhanceMode; label: string }> = [
  { mode: 'grammar', label: 'Improve Grammar' },
  { mode: 'rephrase', label: 'Rephrase' },
  { mode: 'professional', label: 'Make Professional' },
  { mode: 'shorten', label: 'Shorten' },
  { mode: 'expand', label: 'Expand' }
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
  const [runningMode, setRunningMode] = useState<PostEnhanceMode | null>(null);
  const [suggestion, setSuggestion] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [suggestionMode, setSuggestionMode] = useState<PostEnhanceMode | null>(null);
  const [compareView, setCompareView] = useState<'compare' | 'ai'>('compare');

  const dismissSuggestion = () => {
    setSuggestion('');
    setSourceText('');
    setSuggestionMode(null);
    setCompareView('compare');
  };

  const runAiRewrite = async (mode: PostEnhanceMode) => {
    const text = String(value || '').trim();
    if (!text) {
      showNotification('warning', 'Scrolitha AI', `Write your ${scopeLabel} first, then run AI assistance.`);
      return;
    }
    if (loading || disabled) return;

    setLoading(true);
    setRunningMode(mode);
    try {
      const result = await AIService.enhancePostDraft({ text, mode });
      const enhancedText = String(result?.enhancedText || '').trim();
      if (!enhancedText) {
        showNotification('warning', 'Scrolitha AI', 'No suggestion was returned. Please try again.');
        return;
      }
      setSourceText(text);
      setSuggestion(enhancedText);
      setSuggestionMode(mode);
      setCompareView('compare');
    } catch (error: any) {
      showNotification(
        'error',
        'Scrolitha AI',
        error?.response?.data?.error ||
          error?.response?.data?.message ||
          error?.message ||
          'Unable to enhance this text right now.'
      );
    } finally {
      setLoading(false);
      setRunningMode(null);
    }
  };

  return (
    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-700">
            <Sparkles className="h-3.5 w-3.5" />
            Scrolitha AI
          </div>
          <p className="mt-1 text-xs text-emerald-900/80">
            Rewrite privately before posting. Public viewers still only see your final profile photo, name, and text.
          </p>
        </div>
        {suggestionMode ? (
          <span className="rounded-full border border-emerald-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
            {commentAiActions.find((entry) => entry.mode === suggestionMode)?.label || suggestionMode}
          </span>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {commentAiActions.map((action) => (
          <button
            key={action.mode}
            type="button"
            onClick={() => void runAiRewrite(action.mode)}
            disabled={disabled || loading}
            className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {runningMode === action.mode && loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="h-3.5 w-3.5 text-emerald-600" />
            )}
            {runningMode === action.mode && loading ? 'Working...' : action.label}
          </button>
        ))}
      </div>

      {suggestion ? (
        <div className="mt-3 rounded-2xl border border-emerald-200 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-slate-900">Suggestion ready</div>
            <div className="inline-flex rounded-full border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setCompareView('compare')}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                  compareView === 'compare' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                Compare
              </button>
              <button
                type="button"
                onClick={() => setCompareView('ai')}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                  compareView === 'ai' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                }`}
              >
                AI only
              </button>
            </div>
          </div>

          {compareView === 'compare' ? (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Current</div>
                <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                  {sourceText || '(empty)'}
                </pre>
              </div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Scrolitha suggestion</div>
                <pre className="mt-2 whitespace-pre-wrap text-sm text-emerald-900">
                  {suggestion || '(empty)'}
                </pre>
              </div>
            </div>
          ) : (
            <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
              <pre className="whitespace-pre-wrap text-sm text-emerald-900">{suggestion || '(empty)'}</pre>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                onReplace(suggestion);
                dismissSuggestion();
              }}
              className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-4 py-2 text-[11px] font-semibold uppercase text-white transition hover:bg-emerald-700"
            >
              <Check className="h-3.5 w-3.5" />
              Use suggestion
            </button>
            <button
              type="button"
              onClick={dismissSuggestion}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-4 py-2 text-[11px] font-semibold uppercase text-slate-600 transition hover:bg-slate-50"
            >
              <X className="h-3.5 w-3.5" />
              Dismiss
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default CommentAiAssist;
