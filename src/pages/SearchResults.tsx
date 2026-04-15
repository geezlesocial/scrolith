import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  Briefcase,
  Building2,
  Clock,
  FileText,
  Grid3X3,
  Loader,
  Search,
  Sparkles,
  Star,
  TrendingUp,
  User
} from 'lucide-react';
import SearchInput from '../components/SearchInput';
import { useCurrency } from '../context/CurrencyContext';
import { SearchService } from '../services/search';

type SearchFilter = 'all' | 'people' | 'pages' | 'jobs' | 'gigs' | 'posts';

type SearchItem = {
  id: string;
  type: SearchFilter | 'job' | 'gig' | 'post' | 'page' | 'person' | string;
  title?: string;
  name?: string;
  username?: string;
  subtitle?: string;
  description?: string;
  image?: string | null;
  avatarUrl?: string | null;
  url?: string;
  meta?: any;
};

type SearchGroups = Record<Exclude<SearchFilter, 'all'>, SearchItem[]>;

const EMPTY_GROUPS: SearchGroups = {
  people: [],
  pages: [],
  jobs: [],
  gigs: [],
  posts: []
};

const FILTERS: Array<{ key: SearchFilter; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { key: 'all', label: 'All', icon: Grid3X3 },
  { key: 'people', label: 'People', icon: User },
  { key: 'pages', label: 'Pages', icon: Building2 },
  { key: 'jobs', label: 'Jobs', icon: Briefcase },
  { key: 'gigs', label: 'Gigs', icon: Sparkles },
  { key: 'posts', label: 'Posts', icon: FileText }
];

const normalizeType = (value: unknown): Exclude<SearchFilter, 'all'> => {
  const type = String(value || '').trim().toLowerCase();
  if (type === 'person' || type === 'user' || type === 'users' || type === 'people') return 'people';
  if (type === 'page' || type === 'pages') return 'pages';
  if (type === 'job' || type === 'jobs') return 'jobs';
  if (type === 'gig' || type === 'gigs') return 'gigs';
  return 'posts';
};

const getTitle = (item: SearchItem) => item.title || item.name || item.username || 'Search result';

const getSubtitle = (item: SearchItem, type: string) =>
  item.subtitle ||
  item.description ||
  (item.username ? `@${item.username}` : '') ||
  (type === 'people' ? 'Scrolith member' : type === 'pages' ? 'Scrolith page' : type === 'jobs' ? 'Open job' : type === 'gigs' ? 'Available gig' : 'Community post');

const getUrl = (item: SearchItem, type: Exclude<SearchFilter, 'all'>) => {
  const raw = String(item.url || '').trim();
  if (raw) return raw;
  const id = encodeURIComponent(String(item.id || '').trim());
  if (!id) return '/search';
  if (type === 'people') return item.username ? `/u/${encodeURIComponent(item.username)}` : `/profile/${id}`;
  if (type === 'pages') return `/company/${id}`;
  if (type === 'jobs') return `/jobs/${id}`;
  if (type === 'gigs') return `/gigs/${id}`;
  return `/post/${id}`;
};

const mergeUnique = (items: SearchItem[]) => {
  const map = new Map<string, SearchItem>();
  items.forEach((item) => {
    const type = normalizeType(item.type);
    const key = `${type}:${item.id || item.url || getTitle(item)}`;
    if (!map.has(key)) map.set(key, { ...item, type });
  });
  return Array.from(map.values());
};

const SearchResults = () => {
  const [searchParams] = useSearchParams();
  const query = searchParams.get('q') || '';
  const mode = (searchParams.get('mode') || 'keyword') as 'keyword' | 'semantic';
  const [groups, setGroups] = useState<SearchGroups>(EMPTY_GROUPS);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<SearchFilter>('all');
  const [error, setError] = useState<string | null>(null);
  const [trending, setTrending] = useState<any[]>([]);
  const { formatPrice } = useCurrency();

  useEffect(() => {
    let cancelled = false;

    const fetchResults = async () => {
      const clean = query.trim();
      setFilter('all');
      setError(null);

      if (!clean) {
        setGroups(EMPTY_GROUPS);
        setLoading(false);
        SearchService.getTrendingSearches(8).then((items) => !cancelled && setTrending(items)).catch(() => {});
        return;
      }

      setLoading(true);
      try {
        const [unified, posts] = await Promise.all([
          mode === 'semantic'
            ? SearchService.performSearch(clean, 'semantic').then(({ results }) => ({
                groups: { people: [], pages: [], jobs: [], gigs: [] },
                results
              }))
            : SearchService.searchUnified(clean, { limit: 24, perType: 6 }),
          SearchService.search(clean, { type: 'posts', limit: 12 }).catch(() => [])
        ]);

        if (cancelled) return;

        const unifiedGroups = unified?.groups || {};
        setGroups({
          people: mergeUnique([...(unifiedGroups.people || []), ...(unified?.results || []).filter((item: any) => normalizeType(item.type) === 'people')]),
          pages: mergeUnique([...(unifiedGroups.pages || []), ...(unified?.results || []).filter((item: any) => normalizeType(item.type) === 'pages')]),
          jobs: mergeUnique([...(unifiedGroups.jobs || []), ...(unified?.results || []).filter((item: any) => normalizeType(item.type) === 'jobs')]),
          gigs: mergeUnique([...(unifiedGroups.gigs || []), ...(unified?.results || []).filter((item: any) => normalizeType(item.type) === 'gigs')]),
          posts: mergeUnique([...(posts || []), ...(unified?.results || []).filter((item: any) => normalizeType(item.type) === 'posts')])
        });
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message || 'Search failed. Please try again.');
          setGroups(EMPTY_GROUPS);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchResults();
    SearchService.getTrendingSearches(8).then((items) => !cancelled && setTrending(items)).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [mode, query]);

  const sections = useMemo(
    () =>
      FILTERS.filter((item) => item.key !== 'all')
        .map((filterItem) => ({
          ...filterItem,
          items: groups[filterItem.key as Exclude<SearchFilter, 'all'>] || []
        }))
        .filter((section) => section.items.length > 0),
    [groups]
  );

  const visibleItems = useMemo(() => {
    if (filter === 'all') return sections.flatMap((section) => section.items);
    return groups[filter] || [];
  }, [filter, groups, sections]);

  const totalResults = sections.reduce((total, section) => total + section.items.length, 0);
  const cleanQuery = query.trim();

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_45%,#f8fafc_100%)] pt-20 pb-12">
      <div className="border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 py-7 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-4xl">
            <div className="mb-4 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.22em] text-slate-400">
              <Sparkles className="h-4 w-4 text-slate-500" />
              Scrolith embedded search
            </div>
            <SearchInput
              placeholder="Search posts, jobs, gigs, people, pages"
              className="max-w-4xl"
              searchMode={mode}
              searchPath="/search"
              initialQuery={query}
            />
            <div className="mt-5 flex gap-2 overflow-x-auto pb-1">
              {FILTERS.map(({ key, label, icon: Icon }) => {
                const count = key === 'all' ? totalResults : groups[key as Exclude<SearchFilter, 'all'>]?.length || 0;
                const isActive = filter === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={[
                      'inline-flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors',
                      isActive ? 'bg-slate-950 text-white shadow-md' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    ].join(' ')}
                  >
                    <Icon className="h-4 w-4" />
                    {label}
                    <span className={isActive ? 'text-white/70' : 'text-slate-400'}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-950">
              {cleanQuery ? (loading ? 'Searching Scrolith...' : `${visibleItems.length} result${visibleItems.length === 1 ? '' : 's'} for "${cleanQuery}"`) : 'Search Scrolith'}
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              Search posts, members, pages, jobs, and gigs with one real-time result experience.
            </p>
          </div>
          {mode === 'semantic' ? (
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">
              <Sparkles className="h-3.5 w-3.5" />
              Semantic mode
            </span>
          ) : null}
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-white p-5 text-sm text-red-700 shadow-sm">{error}</div>
        ) : loading ? (
          <div className="flex justify-center rounded-3xl border border-slate-200 bg-white py-20 shadow-sm">
            <Loader className="h-10 w-10 animate-spin text-slate-700" />
          </div>
        ) : cleanQuery && visibleItems.length > 0 ? (
          filter === 'all' ? (
            <div className="space-y-6">
              {sections.map((section) => {
                const SectionIcon = section.icon;
                return (
                  <div key={section.key} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <SectionIcon className="h-5 w-5 text-slate-500" />
                        <h2 className="text-base font-bold text-slate-950">{section.label}</h2>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">{section.items.length}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {section.items.map((item) => (
                        <ResultCard key={`${section.key}-${item.id || item.url || getTitle(item)}`} item={item} type={section.key as Exclude<SearchFilter, 'all'>} formatPrice={formatPrice} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleItems.map((item) => (
                <ResultCard key={`${filter}-${item.id || item.url || getTitle(item)}`} item={item} type={filter} formatPrice={formatPrice} />
              ))}
            </div>
          )
        ) : (
          <EmptySearchState query={cleanQuery} trending={trending} />
        )}
      </div>
    </div>
  );
};

function ResultCard({
  item,
  type,
  formatPrice
}: {
  item: SearchItem;
  type: Exclude<SearchFilter, 'all'>;
  formatPrice: (value: number) => string;
}) {
  const Icon = type === 'people' ? User : type === 'pages' ? Building2 : type === 'jobs' ? Briefcase : type === 'gigs' ? Sparkles : FileText;
  const title = getTitle(item);
  const subtitle = getSubtitle(item, type);
  const image = item.avatarUrl || item.image || null;
  const url = getUrl(item, type);

  return (
    <Link
      to={url}
      className="group flex min-h-[8.5rem] flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-lg"
    >
      <div className="flex items-start gap-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
          {image ? (
            <img src={image} alt={title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Icon className="h-6 w-6 text-slate-500" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
              {type.slice(0, -1) || type}
            </span>
            {type === 'gigs' && Number.isFinite(Number(item.meta?.price)) ? (
              <span className="text-xs font-semibold text-emerald-700">{formatPrice(Number(item.meta.price))}</span>
            ) : null}
          </div>
          <h3 className="mt-2 line-clamp-2 text-base font-bold text-slate-950 group-hover:text-slate-700">{title}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-slate-500">{subtitle}</p>
        </div>
      </div>

      <div className="mt-auto flex items-center justify-between pt-4 text-xs font-semibold text-slate-400">
        <span className="inline-flex items-center gap-1">
          {type === 'jobs' ? <Clock className="h-3.5 w-3.5" /> : type === 'gigs' ? <Star className="h-3.5 w-3.5" /> : <Search className="h-3.5 w-3.5" />}
          Open result
        </span>
        <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
      </div>
    </Link>
  );
}

function EmptySearchState({ query, trending }: { query: string; trending: any[] }) {
  const prompts = (Array.isArray(trending) && trending.length ? trending : [
    { keyword: 'interview tips' },
    { keyword: 'latest in ai' },
    { keyword: 'remote work' },
    { keyword: 'logo design' }
  ]).slice(0, 6);

  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-10">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-slate-100">
        {query ? <Search className="h-8 w-8 text-slate-500" /> : <TrendingUp className="h-8 w-8 text-slate-500" />}
      </div>
      <h3 className="mt-4 text-lg font-bold text-slate-950">{query ? 'No results found' : 'Start with a Scrolith recommendation'}</h3>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
        {query ? 'Try a broader keyword or pick one of the live recommendations below.' : 'Search across the marketplace, community, jobs, pages, and people from one place.'}
      </p>
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {prompts.map((item: any, index: number) => {
          const keyword = String(item.keyword || item.label || item.text || '').trim();
          if (!keyword) return null;
          return (
            <Link
              key={`${keyword}-${index}`}
              to={`/search?q=${encodeURIComponent(keyword)}`}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-slate-300 hover:bg-white"
            >
              {keyword}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export default SearchResults;
