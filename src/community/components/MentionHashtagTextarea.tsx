import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Hash, Loader2, AtSign } from 'lucide-react';
import { CommunityService } from '../../services/community';

type Suggestion =
  | {
      kind: 'mention';
      id: string;
      username: string;
      name?: string | null;
      avatar?: string | null;
      isVerified?: boolean;
    }
  | {
      kind: 'tag';
      id: string;
      slug: string;
      count?: number;
    };

type ActiveToken = {
  kind: 'mention' | 'tag';
  query: string;
  replaceStart: number;
  replaceEnd: number;
};

const MAX_QUERY_LEN = 30;

const findActiveToken = (
  value: string,
  caret: number,
  opts: { mentionsEnabled: boolean; hashtagsEnabled: boolean }
): ActiveToken | null => {
  const before = value.slice(0, caret);

  // Mentions: @username (letters/numbers/underscore/dot). Keep conservative to avoid triggering in emails/URLs.
  const mentionMatch = before.match(/(^|[\s([{>])@([a-zA-Z0-9_.]{0,30})$/);
  if (mentionMatch && opts.mentionsEnabled) {
    const query = String(mentionMatch[2] || '').slice(0, MAX_QUERY_LEN);
    const replaceStart = Math.max(0, caret - query.length - 1);
    return { kind: 'mention', query, replaceStart, replaceEnd: caret };
  }

  // Tags: #tag (letters/numbers/underscore) aligned with backend normalize/extract rules.
  const tagMatch = before.match(/(^|[\s([{>])#([a-zA-Z0-9_]{0,40})$/);
  if (tagMatch && opts.hashtagsEnabled) {
    const query = String(tagMatch[2] || '').slice(0, 40);
    const replaceStart = Math.max(0, caret - query.length - 1);
    return { kind: 'tag', query, replaceStart, replaceEnd: caret };
  }

  return null;
};

export type MentionHashtagTextareaProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  mentionsEnabled?: boolean;
  hashtagsEnabled?: boolean;
  minQueryLength?: number;
};

const MentionHashtagTextarea = React.forwardRef<HTMLTextAreaElement, MentionHashtagTextareaProps>(
  (
    {
      value,
      onChange,
      placeholder,
      className = '',
      disabled,
      mentionsEnabled = true,
      hashtagsEnabled = true,
      minQueryLength = 1
    },
    forwardedRef
  ) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const setRefs = useCallback(
      (node: HTMLTextAreaElement | null) => {
        textareaRef.current = node;
        if (!forwardedRef) return;
        if (typeof forwardedRef === 'function') forwardedRef(node);
        else (forwardedRef as any).current = node;
      },
      [forwardedRef]
    );

    const [active, setActive] = useState<ActiveToken | null>(null);
    const [items, setItems] = useState<Suggestion[]>([]);
    const [loading, setLoading] = useState(false);
    const [highlightIndex, setHighlightIndex] = useState(0);

    const isOpen = Boolean(active);
    const canQuery = Boolean(active && active.query.trim().length >= minQueryLength);

    const close = useCallback(() => {
      setActive(null);
      setItems([]);
      setLoading(false);
      setHighlightIndex(0);
    }, []);

    const setActiveFrom = useCallback(
      (nextValue: string, caret: number | null | undefined) => {
        const safeCaret = typeof caret === 'number' ? caret : nextValue.length;
        const token = findActiveToken(nextValue, safeCaret, { mentionsEnabled, hashtagsEnabled });
        setActive(token);
        setHighlightIndex(0);
      },
      [hashtagsEnabled, mentionsEnabled]
    );

    const updateFromCaret = useCallback(() => {
      const el = textareaRef.current;
      if (!el) return;
      const caret = typeof el.selectionStart === 'number' ? el.selectionStart : value.length;
      setActiveFrom(value, caret);
    }, [setActiveFrom, value]);

    useEffect(() => {
      if (!isOpen) return;
      const onDocMouseDown = (event: MouseEvent) => {
        const target = event.target as Node | null;
        if (!target) return;
        if (containerRef.current && containerRef.current.contains(target)) return;
        close();
      };
      document.addEventListener('mousedown', onDocMouseDown);
      return () => document.removeEventListener('mousedown', onDocMouseDown);
    }, [close, isOpen]);

    useEffect(() => {
      if (!active) {
        setItems([]);
        setLoading(false);
        return;
      }
      if (!canQuery) {
        setItems([]);
        setLoading(false);
        return;
      }

      let cancelled = false;
      setLoading(true);

      const timeout = window.setTimeout(async () => {
        try {
          if (active.kind === 'mention') {
            const raw = await CommunityService.searchUserMentions(active.query);
            const next: Suggestion[] = (Array.isArray(raw) ? raw : [])
              .map((row: any) => {
                const id = String(row?.id || '').trim();
                const username = String(row?.username || '').trim().replace(/^@+/, '');
                if (!id || !username) return null;
                return {
                  kind: 'mention',
                  id,
                  username,
                  name: row?.name ? String(row.name) : null,
                  avatar: row?.avatar ? String(row.avatar) : null,
                  isVerified: Boolean(row?.isVerified)
                } as Suggestion;
              })
              .filter(Boolean) as Suggestion[];
            if (!cancelled) setItems(next.slice(0, 10));
          } else {
            const raw = await CommunityService.searchTags(active.query, 10);
            const next: Suggestion[] = (Array.isArray(raw) ? raw : [])
              .map((row: any) => {
                const slug = String(row?.slug || row?.name || '').trim().replace(/^#+/, '');
                if (!slug) return null;
                return { kind: 'tag', id: slug, slug, count: Number(row?.count || 0) || undefined } as Suggestion;
              })
              .filter(Boolean) as Suggestion[];
            if (!cancelled) setItems(next.slice(0, 10));
          }
        } catch {
          if (!cancelled) setItems([]);
        } finally {
          if (!cancelled) setLoading(false);
        }
      }, 180);

      return () => {
        cancelled = true;
        window.clearTimeout(timeout);
      };
    }, [active, canQuery]);

    const applySuggestion = useCallback(
      (suggestion: Suggestion) => {
        if (!active) return;
        const prefix = active.kind === 'mention' ? '@' : '#';
        const token =
          suggestion.kind === 'mention'
            ? `${prefix}${suggestion.username}`
            : `${prefix}${suggestion.slug}`;
        const replacement = `${token} `;
        const next =
          value.slice(0, active.replaceStart) + replacement + value.slice(active.replaceEnd);
        onChange(next);

        window.setTimeout(() => {
          const el = textareaRef.current;
          if (!el) return;
          const caret = active.replaceStart + replacement.length;
          try {
            el.focus();
            el.setSelectionRange(caret, caret);
          } catch {}
        }, 0);

        close();
      },
      [active, close, onChange, value]
    );

    const onKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (!isOpen) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
          return;
        }
        if (!items.length) return;
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setHighlightIndex((prev) => Math.min(items.length - 1, prev + 1));
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          setHighlightIndex((prev) => Math.max(0, prev - 1));
          return;
        }
        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
          // Allow Ctrl/Cmd+Enter to submit forms without interfering with picker.
          return;
        }
        if (event.key === 'Enter' && active) {
          // If the picker is open, enter selects the highlighted suggestion.
          event.preventDefault();
          const selected = items[highlightIndex];
          if (selected) applySuggestion(selected);
        }
      },
      [active, applySuggestion, close, highlightIndex, isOpen, items]
    );

    const visibleItems = useMemo(() => items, [items]);

    return (
      <div ref={containerRef} className="relative">
        <textarea
          ref={setRefs}
          value={value}
          onChange={(e) => {
            const nextValue = e.target.value;
            const caret = typeof e.target.selectionStart === 'number' ? e.target.selectionStart : nextValue.length;
            onChange(nextValue);
            setActiveFrom(nextValue, caret);
          }}
          onKeyDown={onKeyDown}
          onKeyUp={updateFromCaret}
          onClick={updateFromCaret}
          onFocus={updateFromCaret}
          placeholder={placeholder}
          disabled={disabled}
          className={className}
        />

        {isOpen ? (
          <div className="absolute left-0 right-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[11px] font-semibold text-slate-600">
              <span className="inline-flex items-center gap-1">
                {active?.kind === 'mention' ? <AtSign className="h-3.5 w-3.5" /> : <Hash className="h-3.5 w-3.5" />}
                {active?.kind === 'mention' ? 'Mention' : 'Tag'}
              </span>
              {loading ? (
                <span className="inline-flex items-center gap-1 text-slate-500">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Searching...
                </span>
              ) : (
                <span className="text-slate-400">Enter to insert</span>
              )}
            </div>

            {!canQuery ? (
              <div className="px-3 py-3 text-xs text-slate-500">
                Type to search {active?.kind === 'mention' ? 'people' : 'tags'}.
              </div>
            ) : !visibleItems.length && !loading ? (
              <div className="px-3 py-3 text-xs text-slate-500">No matches.</div>
            ) : (
              <div className="max-h-64 overflow-auto">
                {visibleItems.map((item, idx) => {
                  const isActive = idx === highlightIndex;
                  if (item.kind === 'mention') {
                    const label = item.name ? String(item.name) : `@${item.username}`;
                    return (
                      <button
                        key={`mention_${item.id}`}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => applySuggestion(item)}
                        className={[
                          'flex w-full items-center gap-3 px-3 py-2 text-left text-sm',
                          isActive ? 'bg-slate-50' : 'bg-white hover:bg-slate-50'
                        ].join(' ')}
                      >
                        <div className="h-8 w-8 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
                          {item.avatar ? (
                            <img src={item.avatar} alt={item.username} className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="truncate font-semibold text-slate-900">{label}</div>
                          <div className="truncate text-xs text-slate-500">@{item.username}</div>
                        </div>
                      </button>
                    );
                  }

                  return (
                    <button
                      key={`tag_${item.id}`}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applySuggestion(item)}
                      className={[
                        'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm',
                        isActive ? 'bg-slate-50' : 'bg-white hover:bg-slate-50'
                      ].join(' ')}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-900">#{item.slug}</div>
                        {item.count ? (
                          <div className="truncate text-xs text-slate-500">{item.count} posts</div>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : null}
      </div>
    );
  }
);

MentionHashtagTextarea.displayName = 'MentionHashtagTextarea';

export default MentionHashtagTextarea;
