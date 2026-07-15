/**
 * Mobile enterprise search panel — used when UX flag is ON.
 * Preserves mobile navigation callbacks; expands domains via enterprise client + legacy fallback.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Loader2, Search } from 'lucide-react';
import { useEnterpriseSearchQuery } from '../../search/useEnterpriseSearchQuery';
import { SEARCH_TABS, pushRecentSearch, type SearchUxTab } from '../../search/enterpriseSearch.ux';
import { HighlightMatch } from '../../search/highlightMatch';
import { formatSearchExplanation } from '../../services/enterpriseSearch';
import { MOBILE_PAGE_SECTION_CLASS } from '../../mobile/home/mobileShellLayout';

const MOBILE_TABS: SearchUxTab[] = [
  'all',
  'person',
  'post',
  'job',
  'service',
  'marketplace_listing',
  'company',
  'community',
  'discussion'
];

export default function EnterpriseMobileSearchPanel({
  enabled,
  onClose,
  onNavigate,
  onNavigateUrl
}: {
  enabled: boolean;
  onClose: () => void;
  onNavigate?: () => void;
  onNavigateUrl?: (url: string) => void;
}) {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<SearchUxTab>('all');
  const clean = q.trim();

  const search = useEnterpriseSearchQuery({
    query: clean,
    tab,
    filters: { sort: 'relevance' },
    enabled: enabled && clean.length >= 2
  });

  useEffect(() => {
    if (clean.length >= 2) pushRecentSearch(clean);
  }, [clean]);

  const tabs = useMemo(() => SEARCH_TABS.filter((t) => MOBILE_TABS.includes(t.key)), []);

  const openUrl = (url: string) => {
    if (onNavigateUrl) onNavigateUrl(url);
    else if (onNavigate) onNavigate();
    else onClose();
  };

  if (!enabled) return null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-slate-50">
      <div className="border-b border-slate-200 bg-white px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="rounded-full p-2 text-slate-600 hover:bg-slate-100"
            aria-label="Close search"
            onClick={onClose}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search Scrolith"
              aria-label="Search Scrolith"
              className="w-full rounded-full border border-slate-200 bg-slate-100 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-500/20"
            />
          </div>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Search categories">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={[
                'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold',
                tab === t.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto ${MOBILE_PAGE_SECTION_CLASS || 'px-3 py-3'}`}>
        {search.loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-8 w-8 animate-spin text-slate-500" aria-label="Loading" />
          </div>
        ) : null}

        {search.error ? (
          <div className="rounded-2xl border border-red-200 bg-white p-4 text-sm text-red-700" role="alert">
            {search.error}
            <button type="button" className="mt-2 block font-semibold underline" onClick={() => search.reload()}>
              Retry
            </button>
          </div>
        ) : null}

        {!search.loading && clean.length >= 2 && search.items.length === 0 && !search.error ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
            No results for “{clean}”. Try a broader keyword.
          </div>
        ) : null}

        <ul className="space-y-2" aria-label="Search results">
          {search.items.map((item) => {
            const explanation = formatSearchExplanation(item);
            return (
              <li key={item.id}>
                <Link
                  to={item.url || '/search'}
                  onClick={() => openUrl(item.url || '/search')}
                  className="block rounded-2xl border border-slate-200 bg-white p-3 shadow-sm active:bg-slate-50"
                >
                  <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{item.entityType}</div>
                  <div className="mt-1 font-semibold text-slate-900">
                    <HighlightMatch text={item.title} query={clean} />
                  </div>
                  {item.subtitle ? (
                    <div className="mt-0.5 line-clamp-2 text-xs text-slate-500">
                      <HighlightMatch text={item.subtitle} query={clean} />
                    </div>
                  ) : null}
                  {explanation ? (
                    <div className="mt-1 text-[11px] font-medium text-indigo-600">Recommended because {explanation}</div>
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>

        {search.nextCursor ? (
          <button
            type="button"
            className="mt-4 w-full rounded-full bg-slate-900 py-2.5 text-sm font-semibold text-white"
            onClick={() => search.loadMore()}
          >
            Load more
          </button>
        ) : null}

        <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-white p-3 text-center text-xs text-slate-500">
          Ask Scrolitha (Coming Soon)
        </div>
      </div>
    </div>
  );
}
