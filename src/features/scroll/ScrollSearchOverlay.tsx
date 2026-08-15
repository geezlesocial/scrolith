import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, Search, Sparkles, X } from 'lucide-react';
import { ScrollService, type ScrollVideo } from '../../services/scroll';
import { ScrolithaDiscoveryService } from '../../services/scrolithaDiscovery';

type ScrollSearchOverlayProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (scroll: ScrollVideo) => void;
};

const normalizeQuery = (value: string) => value.trim().replace(/\s+/g, ' ');

const readSuggestions = (value: any): string[] => {
  const candidates = [value?.suggestions, value?.relatedQueries, value?.phrases, value?.recommendations];
  const result: string[] = [];
  candidates.forEach((collection) => {
    if (!Array.isArray(collection)) return;
    collection.forEach((entry) => {
      const text = typeof entry === 'string' ? entry : entry?.label || entry?.text || entry?.query;
      if (typeof text === 'string' && text.trim() && !result.includes(text.trim())) result.push(text.trim());
    });
  });
  return result.slice(0, 5);
};

const ScrollSearchOverlay: React.FC<ScrollSearchOverlayProps> = ({ open, onClose, onSelect }) => {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const requestSequenceRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const previewTimerRef = useRef<number | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ScrollVideo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePreviewId, setActivePreviewId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const normalizedQuery = useMemo(() => normalizeQuery(query), [query]);

  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => {
      window.clearTimeout(focusTimer);
      restoreFocusRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    abortRef.current?.abort();
    if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
    setActivePreviewId(null);
    setActiveIndex(0);
    setAiSuggestions([]);
    setError(null);
    if (normalizedQuery.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    const sequence = ++requestSequenceRef.current;
    const timer = window.setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);
      try {
        const payload = await ScrollService.search({ query: normalizedQuery, limit: 20, signal: controller.signal });
        if (sequence !== requestSequenceRef.current || controller.signal.aborted) return;
        setResults(Array.isArray(payload?.items) ? payload.items : []);
        setActiveIndex(0);
      } catch (requestError: any) {
        if (controller.signal.aborted || requestError?.name === 'CanceledError' || requestError?.code === 'ERR_CANCELED') return;
        if (sequence === requestSequenceRef.current) {
          setResults([]);
          setError(requestError?.response?.data?.error || 'Scroll search is temporarily unavailable.');
        }
      } finally {
        if (sequence === requestSequenceRef.current) setLoading(false);
      }
    }, 280);

    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [normalizedQuery, open]);

  useEffect(() => () => {
    abortRef.current?.abort();
    if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
  }, []);

  const stopPreview = () => {
    if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
    previewTimerRef.current = null;
    setActivePreviewId(null);
  };

  const startPreview = (id: string) => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    if (previewTimerRef.current !== null) window.clearTimeout(previewTimerRef.current);
    previewTimerRef.current = window.setTimeout(() => setActivePreviewId(id), 240);
  };

  const handleDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown' && results.length) {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, results.length - 1));
      return;
    }
    if (event.key === 'ArrowUp' && results.length) {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
      return;
    }
    if (event.key === 'Enter' && document.activeElement === inputRef.current && results[activeIndex]) {
      event.preventDefault();
      onSelect(results[activeIndex]);
      stopPreview();
      return;
    }
    if (event.key !== 'Tab' || !dialogRef.current) return;
    const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])'))
      .filter((element) => !element.hasAttribute('disabled'));
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const askScrolitha = async () => {
    if (normalizedQuery.length < 2 || aiLoading) return;
    setAiLoading(true);
    try {
      const payload = await ScrolithaDiscoveryService.searchAssist(normalizedQuery, 'scroll');
      setAiSuggestions(readSuggestions(payload));
    } catch {
      setAiSuggestions([]);
    } finally {
      setAiLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        id="scroll-search-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scroll-search-title"
        tabIndex={-1}
        onKeyDown={handleDialogKeyDown}
        className="flex max-h-[88dvh] w-full max-w-3xl flex-col overflow-hidden rounded-t-[28px] border border-white/15 bg-slate-950 text-white shadow-2xl sm:max-h-[82vh] sm:rounded-[28px]"
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4 sm:px-6">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-300/15 text-cyan-200">
            <Search className="h-5 w-5" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="scroll-search-title" className="text-base font-semibold">Search Scroll videos</h2>
            <p className="text-xs text-white/60">Find videos by creator, caption, title, location, or tag.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close Scroll search" className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 text-white/80 hover:bg-white/10">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>
        <div className="border-b border-white/10 p-4 sm:px-6">
          <label className="sr-only" htmlFor="scroll-search-input">Search Scroll videos</label>
          <div className="flex items-center gap-2 rounded-2xl border border-cyan-200/30 bg-white/10 px-3 focus-within:border-cyan-300 focus-within:ring-2 focus-within:ring-cyan-300/20">
            <Search className="h-4 w-4 shrink-0 text-white/50" aria-hidden />
            <input
              ref={inputRef}
              id="scroll-search-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search Scroll videos"
              autoComplete="off"
              role="combobox"
              aria-controls="scroll-search-results"
              aria-expanded={results.length > 0}
              aria-activedescendant={results[activeIndex] ? `scroll-result-${results[activeIndex].id}` : undefined}
              className="h-12 min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/45"
            />
            {loading ? <Loader2 className="h-4 w-4 animate-spin text-cyan-200" aria-label="Searching" /> : null}
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-white/55">{normalizedQuery.length < 2 ? 'Type at least 2 characters.' : 'Results are limited to videos you can view.'}</p>
            <button type="button" onClick={() => void askScrolitha()} disabled={normalizedQuery.length < 2 || aiLoading} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border border-fuchsia-300/30 px-3 text-xs font-semibold text-fuchsia-100 disabled:cursor-not-allowed disabled:opacity-40">
              {aiLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Sparkles className="h-3.5 w-3.5" aria-hidden />}
              Scrolitha suggestions
            </button>
          </div>
          {aiSuggestions.length ? (
            <div className="mt-3 flex flex-wrap gap-2" aria-label="Scrolitha suggested searches">
              {aiSuggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => setQuery(suggestion)} className="rounded-full border border-fuchsia-300/30 bg-fuchsia-300/10 px-3 py-1.5 text-xs text-fuchsia-100">{suggestion}</button>)}
            </div>
          ) : null}
        </div>
        <div id="scroll-search-results" role="listbox" aria-label="Scroll search results" className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {error ? <div className="rounded-2xl border border-rose-300/30 bg-rose-500/10 p-4 text-sm text-rose-100" role="alert">{error}<button type="button" onClick={() => setQuery((value) => `${value} `)} className="ml-3 underline">Retry</button></div> : null}
          {!error && !loading && normalizedQuery.length >= 2 && results.length === 0 ? <p className="py-12 text-center text-sm text-white/60">No Scroll videos found for &ldquo;{normalizedQuery}&rdquo;.</p> : null}
          {!normalizedQuery && !loading ? <p className="py-12 text-center text-sm text-white/60">Search for a creator, caption, title, or tag.</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {results.map((result, index) => {
              const media = result.media;
              const isPreviewing = activePreviewId === result.id;
              return (
                <button
                  key={result.id}
                  id={`scroll-result-${result.id}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  onClick={() => { stopPreview(); onSelect(result); }}
                  onFocus={() => setActiveIndex(index)}
                  onMouseEnter={() => startPreview(result.id)}
                  onMouseLeave={stopPreview}
                  className="group flex min-w-0 gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-2 text-left transition hover:border-cyan-200/50 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-300/70"
                >
                  <span className="relative h-24 w-16 shrink-0 overflow-hidden rounded-xl bg-black/50">
                    {media?.url && isPreviewing ? <video src={media.url} poster={media.thumbnailUrl || undefined} autoPlay muted playsInline preload="metadata" className="h-full w-full object-cover" /> : media?.thumbnailUrl || media?.url ? <img src={media.thumbnailUrl || media.url} alt="" className="h-full w-full object-cover" loading="lazy" /> : <span className="flex h-full items-center justify-center text-[10px] text-white/50">Video</span>}
                  </span>
                  <span className="min-w-0 py-1">
                    <span className="block truncate text-sm font-semibold text-white">{result.title || result.description || 'Untitled Scroll'}</span>
                    <span className="mt-1 block truncate text-xs text-cyan-100/80">{result.author?.name || 'Scrolith creator'}{result.author?.username ? ` @${result.author.username}` : ''}</span>
                    <span className="mt-2 line-clamp-2 text-xs leading-5 text-white/60">{result.description || 'Open this video in Scroll.'}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ScrollSearchOverlay;
