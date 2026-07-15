import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { History, Search, Sparkles, X } from 'lucide-react';
import {
  EnterpriseSearchService,
  isEnterpriseSearchClientEnabled
} from '../../services/enterpriseSearch';
import { SearchService } from '../../services/search';
import {
  DEFAULT_TRENDING,
  clearRecentSearches,
  isSearchSaved,
  pushRecentSearch,
  readRecentSearches,
  readSavedSearches,
  toggleSavedSearch
} from '../../search/enterpriseSearch.ux';
import { EnterpriseSearchSuggestionSkeleton } from './EnterpriseSearchSkeletons';
import { HighlightMatch } from '../../search/highlightMatch';

type ComboItem = {
  id: string;
  text: string;
  kind: 'history' | 'saved' | 'trending' | 'suggestion' | 'entity' | 'prompt';
  url?: string;
  subtitle?: string;
};

export type EnterpriseSearchComboboxProps = {
  placeholder?: string;
  className?: string;
  size?: 'normal' | 'large' | 'xl' | 'header';
  showButton?: boolean;
  buttonLabel?: string;
  buttonAriaLabel?: string;
  searchPath?: string;
  initialQuery?: string;
  onSearch?: (term: string) => void;
  disableNavigation?: boolean;
};

export default function EnterpriseSearchCombobox({
  placeholder = 'Search people, jobs, companies, posts, marketplace…',
  className = '',
  size = 'header',
  showButton = false,
  buttonLabel = 'Search',
  buttonAriaLabel,
  searchPath = '/search',
  initialQuery = '',
  onSearch,
  disableNavigation = false
}: EnterpriseSearchComboboxProps) {
  const navigate = useNavigate();
  const listboxId = useId();
  const inputId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const seqRef = useRef(0);

  const [query, setQuery] = useState(initialQuery);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const [items, setItems] = useState<ComboItem[]>([]);
  const [recents, setRecents] = useState<string[]>(() => readRecentSearches());
  const [saved, setSaved] = useState(() => readSavedSearches());

  useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const clean = query.trim();

  const buildIdleItems = useCallback((): ComboItem[] => {
    const recentItems: ComboItem[] = recents.map((text, i) => ({
      id: `hist-${i}`,
      text,
      kind: 'history',
      subtitle: 'Recent'
    }));
    const savedItems: ComboItem[] = saved.map((s) => ({
      id: s.id,
      text: s.query,
      kind: 'saved',
      subtitle: 'Saved'
    }));
    const trending: ComboItem[] = DEFAULT_TRENDING.map((text, i) => ({
      id: `trend-${i}`,
      text,
      kind: 'trending',
      subtitle: 'Trending'
    }));
    return [...recentItems, ...savedItems, ...trending].slice(0, 10);
  }, [recents, saved]);

  useEffect(() => {
    if (!open) return;
    if (clean.length < 2) {
      setItems(buildIdleItems());
      setLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const seq = ++seqRef.current;
    setLoading(true);

    const timer = window.setTimeout(async () => {
      try {
        let rows: ComboItem[] = [];
        if (isEnterpriseSearchClientEnabled()) {
          const suggest = await EnterpriseSearchService.suggest(clean, 8, {
            signal: controller.signal as any,
            retries: 0
          });
          if (!suggest.disabled && suggest.suggestions?.length) {
            rows = suggest.suggestions.map((s, i) => ({
              id: `sg-${i}-${s.text}`,
              text: s.text,
              kind: s.kind === 'entity' ? 'entity' : 'suggestion',
              url: s.url,
              subtitle: s.subtitle || s.domain
            }));
          }
        }
        if (!rows.length) {
          const legacy = await SearchService.getSuggestions(clean).catch(() => []);
          rows = (Array.isArray(legacy) ? legacy : []).map((s: any, i: number) => ({
            id: `lg-${i}`,
            text: String(s?.text || s?.keyword || s?.title || '').trim(),
            kind: 'suggestion' as const,
            url: s?.url,
            subtitle: s?.category || s?.description
          })).filter((r) => r.text);
        }
        if (controller.signal.aborted || seq !== seqRef.current) return;
        setItems(rows.slice(0, 10));
      } catch {
        if (seq === seqRef.current) setItems([]);
      } finally {
        if (seq === seqRef.current) setLoading(false);
      }
    }, 280);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [buildIdleItems, clean, open]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setHighlight(-1);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const commitSearch = (term: string) => {
    const value = term.trim();
    if (!value) return;
    setRecents(pushRecentSearch(value));
    setQuery(value);
    setOpen(false);
    setHighlight(-1);
    onSearch?.(value);
    if (disableNavigation) return;
    const url = new URL(searchPath, window.location.origin);
    url.searchParams.set('q', value);
    navigate(`${url.pathname}${url.search}`);
  };

  const selectItem = (item: ComboItem) => {
    if (item.url) {
      setOpen(false);
      if (item.url.startsWith('http')) window.location.href = item.url;
      else navigate(item.url);
      return;
    }
    commitSearch(item.text);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (open) {
        e.preventDefault();
        setOpen(false);
        setHighlight(-1);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHighlight((h) => Math.min(items.length - 1, h + 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(-1, h - 1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (highlight >= 0 && items[highlight]) selectItem(items[highlight]);
      else commitSearch(query);
      return;
    }
    if (e.key === '/' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      inputRef.current?.focus();
    }
  };

  const sizeClass =
    size === 'header'
      ? 'py-2.5 text-sm rounded-full border border-slate-200/90 bg-slate-100/90 pl-10 pr-10'
      : size === 'xl'
        ? 'py-6 text-lg rounded-2xl pl-12 pr-28'
        : size === 'large'
          ? 'py-5 text-base rounded-2xl pl-12 pr-28'
          : 'py-3 text-sm rounded-full pl-12 pr-28';

  const activeDescendant = highlight >= 0 ? `${listboxId}-opt-${highlight}` : undefined;

  return (
    <div ref={containerRef} className={`relative w-full ${className}`}>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeDescendant}
          aria-label={placeholder}
          className={[
            'w-full border border-slate-200 bg-white text-slate-900 outline-none transition',
            'placeholder:text-slate-500 focus:border-blue-400 focus:ring-2 focus:ring-blue-500/20',
            sizeClass
          ].join(' ')}
          placeholder={placeholder}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          autoComplete="off"
        />
        {query ? (
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Clear search"
            onClick={() => {
              setQuery('');
              setItems(buildIdleItems());
              setOpen(true);
              inputRef.current?.focus();
            }}
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
        {showButton ? (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-slate-900 px-4 py-1.5 text-sm font-semibold text-white"
            aria-label={buttonAriaLabel || buttonLabel}
            onClick={() => commitSearch(query)}
          >
            {buttonLabel}
          </button>
        ) : null}
      </div>

      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Search suggestions"
          className="absolute z-50 mt-2 max-h-96 w-full overflow-auto rounded-2xl border border-slate-200 bg-white py-2 shadow-xl"
        >
          <div className="flex items-center justify-between px-3 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <span className="inline-flex items-center gap-1">
              <Sparkles className="h-3.5 w-3.5" />
              {clean.length >= 2 ? 'Suggestions' : 'Recent · Saved · Trending'}
            </span>
            {recents.length ? (
              <button
                type="button"
                className="text-[11px] font-semibold normal-case text-slate-500 hover:text-slate-800"
                onClick={() => {
                  clearRecentSearches();
                  setRecents([]);
                  setItems(buildIdleItems());
                }}
              >
                Clear recent
              </button>
            ) : null}
          </div>

          {loading ? <EnterpriseSearchSuggestionSkeleton /> : null}

          {!loading && items.length === 0 && clean.length >= 2 ? (
            <div className="px-4 py-6 text-center text-sm text-slate-500">No suggestions. Press Enter to search.</div>
          ) : null}

          {!loading
            ? items.map((item, index) => {
                const active = index === highlight;
                return (
                  <button
                    key={item.id}
                    id={`${listboxId}-opt-${index}`}
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={[
                      'flex w-full items-start gap-3 px-3 py-2.5 text-left text-sm transition',
                      active ? 'bg-slate-100' : 'hover:bg-slate-50'
                    ].join(' ')}
                    onMouseEnter={() => setHighlight(index)}
                    onClick={() => selectItem(item)}
                  >
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
                      {item.kind === 'history' || item.kind === 'saved' ? (
                        <History className="h-4 w-4" aria-hidden />
                      ) : (
                        <Search className="h-4 w-4" aria-hidden />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-slate-900">
                        <HighlightMatch text={item.text} query={clean} />
                      </span>
                      {item.subtitle ? (
                        <span className="mt-0.5 block text-xs text-slate-500">{item.subtitle}</span>
                      ) : null}
                    </span>
                    {item.kind === 'history' || clean.length < 2 ? (
                      <button
                        type="button"
                        className="shrink-0 text-[11px] font-semibold text-indigo-600 hover:underline"
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setSaved(toggleSavedSearch(item.text));
                        }}
                      >
                        {isSearchSaved(item.text) ? 'Unsave' : 'Save'}
                      </button>
                    ) : null}
                  </button>
                );
              })
            : null}

          <div className="mt-1 border-t border-slate-100 px-3 pt-2">
            <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Ask Scrolitha <span className="font-semibold text-slate-700">(Coming Soon)</span>
            </div>
            <p className="mt-2 px-1 text-[11px] text-slate-400">
              Shortcuts: ↑↓ navigate · Enter search · Esc close · Ctrl/⌘+/ focus
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
