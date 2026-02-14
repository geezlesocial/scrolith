import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { mobileSearch } from '../../../services/mobileSearch';

export type SearchCategory = 'posts' | 'people' | 'pages' | 'jobs' | 'gigs';

export default function SearchScreen({
  enabled,
  categories,
  onClose
}: {
  enabled: boolean;
  categories: SearchCategory[];
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState<SearchCategory>(categories?.[0] ?? 'posts');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, any[]>>({});

  const canSearch = enabled && q.trim().length >= 2;

  const activeResults = useMemo(() => {
    const list = results?.[active] ?? [];
    return Array.isArray(list) ? list : [];
  }, [results, active]);

  useEffect(() => {
    setActive(categories?.[0] ?? 'posts');
  }, [categories]);

  const run = async () => {
    if (!canSearch) return;
    setLoading(true);
    setError(null);
    try {
      const resp = await mobileSearch.search({ q: q.trim(), type: active });
      setResults((prev) => ({ ...prev, [active]: Array.isArray(resp) ? resp : [] }));
    } catch (e: any) {
      setError(e?.response?.data?.error ?? e?.message ?? 'Search failed.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = window.setTimeout(() => {
      void run();
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, active, enabled]);

  return (
    <div className="mx-auto max-w-md px-3 py-4">
      <div className="sticky top-14 z-10 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white"
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5 text-slate-700" />
          </button>

          <div className="flex flex-1 items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search posts, people, pages, jobs, gigs"
              className="w-full bg-transparent text-sm outline-none"
              disabled={!enabled}
              autoFocus
            />
          </div>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {categories.map((c) => {
            const isActive = c === active;
            return (
              <button
                key={c}
                type="button"
                onClick={() => setActive(c)}
                className={[
                  'whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold',
                  isActive ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                ].join(' ')}
              >
                {c.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 space-y-3">
        {!enabled ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            Search is disabled by admin settings.
          </div>
        ) : q.trim().length < 2 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            Type at least 2 characters to search.
          </div>
        ) : loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            Searching {active}...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-white p-4">
            <div className="text-sm font-semibold text-red-700">Search error</div>
            <div className="mt-1 text-sm text-slate-700">{error}</div>
            <button
              type="button"
              onClick={() => void run()}
              className="mt-3 w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
            >
              Retry
            </button>
          </div>
        ) : activeResults.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            No results found for “{q.trim()}”.
          </div>
        ) : (
          <div className="space-y-2">
            {activeResults.map((row: any) => (
              <SearchRow key={row?.id ?? row?.url ?? Math.random()} type={active} row={row} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SearchRow({ type, row }: { type: string; row: any }) {
  const title =
    row?.title ??
    row?.name ??
    row?.username ??
    row?.headline ??
    row?.companyName ??
    'Result';

  const subtitle =
    row?.subtitle ??
    row?.tagline ??
    row?.category ??
    row?.domain ??
    row?.url ??
    '';

  const url = row?.url ?? row?.actionUrl ?? row?.action_url ?? null;

  return (
    <a
      href={url || undefined}
      onClick={(e) => {
        if (!url) e.preventDefault();
      }}
      className="block rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50"
    >
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      {subtitle ? <div className="mt-1 text-xs text-slate-600 line-clamp-2">{subtitle}</div> : null}
      <div className="mt-2 text-[10px] font-semibold text-slate-500">{type.toUpperCase()}</div>
    </a>
  );
}

