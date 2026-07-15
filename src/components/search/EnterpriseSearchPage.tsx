import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Bookmark, BookmarkCheck, Loader2, RefreshCw, Search, Sparkles, TrendingUp } from 'lucide-react';
import EnterpriseSearchCombobox from './EnterpriseSearchCombobox';
import { EnterpriseSearchFilters } from './EnterpriseSearchFilters';
import { EnterpriseSearchResultCard } from './EnterpriseSearchResultCard';
import { EnterpriseSearchResultSkeleton } from './EnterpriseSearchSkeletons';
import { useEnterpriseSearchQuery } from '../../search/useEnterpriseSearchQuery';
import {
  DEFAULT_TRENDING,
  RESERVED_UX_DOMAINS,
  SEARCH_TABS,
  isSearchSaved,
  pushRecentSearch,
  toggleSavedSearch,
  type SearchUxFilters,
  type SearchUxTab
} from '../../search/enterpriseSearch.ux';
import { subscribeSearchRefresh } from '../../services/enterpriseSearch';

export default function EnterpriseSearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const tabParam = (searchParams.get('type') || 'all') as SearchUxTab;
  const tab: SearchUxTab = SEARCH_TABS.some((t) => t.key === tabParam) ? tabParam : 'all';

  const [filters, setFilters] = useState<SearchUxFilters>({ sort: 'relevance' });
  const [savedTick, setSavedTick] = useState(0);

  const search = useEnterpriseSearchQuery({
    query,
    tab,
    filters,
    enabled: true
  });

  useEffect(() => {
    if (query.trim()) pushRecentSearch(query);
  }, [query]);

  useEffect(() => {
    return subscribeSearchRefresh(() => {
      search.softRefresh();
    });
  }, [search]);

  const setTab = (next: SearchUxTab) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'all') params.delete('type');
    else params.set('type', next);
    setSearchParams(params, { replace: true });
  };

  const cleanQuery = query.trim();
  const saved = useMemo(() => isSearchSaved(cleanQuery), [cleanQuery, savedTick]);

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_45%,#f8fafc_100%)] pb-12 pt-20">
      <div className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              <Sparkles className="h-4 w-4 text-indigo-500" aria-hidden />
              Enterprise Search
            </div>
            <div className="flex items-center gap-2">
              {cleanQuery ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  onClick={() => {
                    toggleSavedSearch(cleanQuery);
                    setSavedTick((n) => n + 1);
                  }}
                  aria-pressed={saved}
                >
                  {saved ? <BookmarkCheck className="h-3.5 w-3.5 text-indigo-600" /> : <Bookmark className="h-3.5 w-3.5" />}
                  {saved ? 'Saved' : 'Save search'}
                </button>
              ) : null}
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                onClick={() => search.softRefresh()}
                disabled={search.loading}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${search.loading ? 'animate-spin' : ''}`} />
                Soft refresh
              </button>
            </div>
          </div>

          <div className="mx-auto max-w-4xl">
            <EnterpriseSearchCombobox
              placeholder="Search people, posts, companies, jobs, marketplace…"
              className="max-w-4xl"
              size="large"
              searchPath="/search"
              initialQuery={query}
            />
          </div>

          <div
            className="mt-4 flex gap-2 overflow-x-auto pb-1"
            role="tablist"
            aria-label="Result types"
          >
            {SEARCH_TABS.map((item) => {
              const active = tab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setTab(item.key)}
                  className={[
                    'inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                    active ? 'bg-slate-950 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  ].join(' ')}
                >
                  {item.label}
                </button>
              );
            })}
            {RESERVED_UX_DOMAINS.map((d) => (
              <span
                key={d.key}
                className="inline-flex shrink-0 cursor-not-allowed items-center rounded-full bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-400"
                title="Coming soon"
              >
                {d.label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">
              {cleanQuery
                ? search.loading
                  ? 'Searching Scrolith…'
                  : `${search.items.length} result${search.items.length === 1 ? '' : 's'} for “${cleanQuery}”`
                : 'Search Scrolith'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Universal search across people, posts, companies, communities, jobs, services, and marketplace.
              {search.usedLegacyFallback ? ' Showing live platform results while Enterprise Search backend is offline.' : ''}
              {search.fallbackUsed && !search.usedLegacyFallback ? ' Results use safe ranking fallback.' : ''}
            </p>
          </div>
          <div className="rounded-xl border border-dashed border-indigo-200 bg-indigo-50/60 px-3 py-2 text-xs text-indigo-800">
            Ask Scrolitha <span className="font-semibold">(Coming Soon)</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
          <EnterpriseSearchFilters tab={tab} filters={filters} onChange={setFilters} />

          <div className="min-w-0">
            {search.error ? (
              <div className="rounded-2xl border border-red-200 bg-white p-5 text-sm text-red-700 shadow-sm" role="alert">
                <p>{search.error}</p>
                <button
                  type="button"
                  className="mt-3 rounded-full bg-red-600 px-4 py-2 text-xs font-semibold text-white"
                  onClick={() => search.reload()}
                >
                  Try again
                </button>
              </div>
            ) : null}

            {search.loading && !search.items.length ? <EnterpriseSearchResultSkeleton /> : null}

            {!search.loading && !search.error && cleanQuery && search.items.length > 0 ? (
              <>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {search.items.map((item) => (
                    <EnterpriseSearchResultCard key={item.id} item={item} query={cleanQuery} />
                  ))}
                </div>
                {search.nextCursor ? (
                  <div className="mt-6 flex justify-center">
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                      onClick={() => search.loadMore()}
                      disabled={search.loading}
                    >
                      {search.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Load more
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}

            {!search.loading && !search.error && cleanQuery && search.items.length === 0 ? (
              <EmptyEnterpriseState query={cleanQuery} />
            ) : null}

            {!cleanQuery ? <EmptyEnterpriseState query="" /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyEnterpriseState({ query }: { query: string }) {
  const prompts = DEFAULT_TRENDING;
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-10">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
        {query ? <Search className="h-8 w-8 text-slate-500" /> : <TrendingUp className="h-8 w-8 text-slate-500" />}
      </div>
      <h3 className="mt-4 text-lg font-bold text-slate-950">
        {query ? 'No results found' : 'Start with a recommendation'}
      </h3>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
        {query
          ? 'Try a broader keyword, clear filters, or pick a trending search below.'
          : 'Search people, companies, jobs, services, marketplace, communities, and discussions.'}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {prompts.map((keyword) => (
          <Link
            key={keyword}
            to={`/search?q=${encodeURIComponent(keyword)}`}
            className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:bg-white"
          >
            {keyword}
          </Link>
        ))}
      </div>
    </div>
  );
}
