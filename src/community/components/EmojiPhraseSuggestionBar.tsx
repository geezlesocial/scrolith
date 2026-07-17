import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  insertEmojiAtCaret,
  rememberEmojiUse,
  suggestEmojisForText,
  type EmojiSuggestion
} from '../../utils/emojiPhraseSuggestions';

export type EmojiPhraseSuggestionBarProps = {
  value: string;
  caret: number;
  disabled?: boolean;
  onInsert: (nextValue: string, nextCaret: number) => void;
  className?: string;
};

/**
 * Contextual emoji suggestions for comment composers.
 * Inserts only on explicit click/keyboard activation.
 */
const EmojiPhraseSuggestionBar: React.FC<EmojiPhraseSuggestionBarProps> = ({
  value,
  caret,
  disabled,
  onInsert,
  className = ''
}) => {
  const listId = useId();
  const [dismissedQuery, setDismissedQuery] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const { suggestions, range } = useMemo(
    () => suggestEmojisForText(value, caret, { limit: 6, minScore: 70 }),
    [value, caret]
  );

  const queryKey = range ? `${range.start}:${range.end}:${value.slice(range.start, range.end).toLowerCase()}` : '';
  const visible = !disabled && suggestions.length > 0 && dismissedQuery !== queryKey;

  useEffect(() => {
    setHighlight(0);
  }, [queryKey]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setDismissedQuery(queryKey);
        return;
      }
      if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlight((prev) => (prev + 1) % suggestions.length);
      }
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlight((prev) => (prev - 1 + suggestions.length) % suggestions.length);
      }
      if (event.key === 'Enter' && !event.shiftKey) {
        const pick = suggestions[highlight];
        if (!pick) return;
        event.preventDefault();
        applySuggestion(pick);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, highlight, suggestions, queryKey, value, caret, range]);

  const applySuggestion = (item: EmojiSuggestion) => {
    const replaceColon = range && value.slice(range.start, range.end).startsWith(':') ? range : null;
    const result = insertEmojiAtCaret(value, caret, item.emoji, replaceColon);
    rememberEmojiUse(item.emoji);
    onInsert(result.value, result.caret);
    setDismissedQuery(queryKey);
  };

  if (!visible) return null;

  const prefersReducedMotion =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return (
    <div
      ref={rootRef}
      id={listId}
      role="listbox"
      aria-label="Emoji suggestions"
      className={`mt-2 flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200 bg-white/95 px-2 py-1.5 shadow-sm ${
        prefersReducedMotion ? '' : 'transition duration-150'
      } ${className}`}
    >
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Suggestions</span>
      {suggestions.map((item, index) => {
        const active = index === highlight;
        return (
          <button
            key={`${item.emoji}-${item.label}`}
            type="button"
            role="option"
            aria-selected={active}
            aria-label={`Insert ${item.label} emoji`}
            className={`inline-flex h-9 min-w-[2.25rem] items-center justify-center rounded-xl border px-2 text-lg leading-none transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 ${
              active
                ? 'border-emerald-300 bg-emerald-50 shadow-sm'
                : 'border-slate-200 bg-slate-50 hover:border-emerald-200 hover:bg-emerald-50/60'
            }`}
            onMouseDown={(event) => {
              // Prevent textarea blur before click.
              event.preventDefault();
            }}
            onClick={() => applySuggestion(item)}
          >
            <span aria-hidden>{item.emoji}</span>
          </button>
        );
      })}
      <button
        type="button"
        className="ml-auto rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setDismissedQuery(queryKey)}
        aria-label="Dismiss emoji suggestions"
      >
        Dismiss
      </button>
    </div>
  );
};

export default EmojiPhraseSuggestionBar;
