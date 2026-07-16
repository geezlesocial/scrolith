import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftIcon as ArrowLeft, SearchIcon as Search } from '../../../components/icons/ShellIcons';
import { mobileSearch } from '../../../services/mobileSearch';
import OptimizedImage from '../../../components/media/OptimizedImage';
import { resolvePostAttachmentMediaUrl } from '../../../utils/postAttachmentMedia';
import { MOBILE_PAGE_SECTION_CLASS } from '../mobileShellLayout';

export type SearchCategory = 'posts' | 'people' | 'pages' | 'jobs' | 'gigs';
type SearchScope = SearchCategory | 'all';

const GROUP_LABELS: Record<SearchCategory, string> = {
  posts: 'Posts',
  people: 'Users',
  pages: 'Pages',
  jobs: 'Jobs',
  gigs: 'Gigs'
};

const DEFAULT_ORDER: SearchCategory[] = ['people', 'pages', 'jobs', 'gigs', 'posts'];
const SEARCH_RECENTS_KEY = 'scrolith:mobile-search-recents:v1';
const RECOMMENDED_QUERIES = [
  'remote work',
  'AI tools',
  'frontend developer',
  'business automation',
  'creator campaigns',
  'project manager'
];

type SearchBuckets = Record<SearchCategory, any[]>;

const EMPTY_BUCKETS: SearchBuckets = {
  posts: [],
  people: [],
  pages: [],
  jobs: [],
  gigs: []
};

const readRecentSearches = () => {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SEARCH_RECENTS_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry || '').trim()).filter(Boolean).slice(0, 8) : [];
  } catch {
    return [];
  }
};

const writeRecentSearches = (items: string[]) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SEARCH_RECENTS_KEY, JSON.stringify(items.slice(0, 8)));
  } catch {
    // Search history is optional and should never block navigation.
  }
};

export default function SearchScreen({
  enabled,
  categories,
  onClose,
  onNavigate,
  onNavigateUrl
}: {
  enabled: boolean;
  categories: SearchCategory[];
  onClose: () => void;
  onNavigate?: () => void;
  onNavigateUrl?: (url: string) => void;
}) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState<SearchScope>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchBuckets>(EMPTY_BUCKETS);
  const [retryTick, setRetryTick] = useState(0);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const requestIdRef = useRef(0);

  const normalizedQuery = q.trim();
  const canSearch = enabled && normalizedQuery.length >= 2;
  const available = useMemo(
    () => (Array.isArray(categories) && categories.length ? categories : DEFAULT_ORDER),
    [categories]
  );

  const activeResults = useMemo(() => {
    if (active === 'all') {
      return DEFAULT_ORDER.filter((key) => available.includes(key)).flatMap((key) =>
        Array.isArray(results?.[key]) ? results[key] : []
      );
    }
    const list = results?.[active] ?? [];
    return Array.isArray(list) ? list : [];
  }, [results, active, available]);

  const allSections = useMemo(
    () =>
      DEFAULT_ORDER.filter((key) => available.includes(key))
        .map((key) => ({
          key,
          label: GROUP_LABELS[key],
          items: Array.isArray(results?.[key]) ? results[key] : []
        }))
        .filter((section) => section.items.length > 0),
    [available, results]
  );
  const hasVisibleResults = active === 'all' ? allSections.length > 0 : activeResults.length > 0;

  useEffect(() => {
    setActive('all');
  }, [categories, enabled]);

  useEffect(() => {
    setRecentSearches(readRecentSearches());
  }, []);

  const rememberSearch = (query: string) => {
    const normalized = query.trim();
    if (normalized.length < 2) return;
    const next = [normalized, ...recentSearches.filter((entry) => entry.toLowerCase() !== normalized.toLowerCase())].slice(0, 8);
    setRecentSearches(next);
    writeRecentSearches(next);
  };

  const navigateAfterResult = () => {
    rememberSearch(normalizedQuery);
    (onNavigate || onClose)();
  };

  const navigateUrlAfterResult = (url: string) => {
    rememberSearch(normalizedQuery);
    if (onNavigateUrl) {
      onNavigateUrl(url);
      return;
    }
    (onNavigate || onClose)();
  };

  useEffect(() => {
    if (!enabled || normalizedQuery.length < 2) {
      setLoading(false);
      setError(null);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const timer = window.setTimeout(async () => {
      setLoading(true);
        setError(null);
        try {
          if (active === 'all') {
            const [unified, posts] = await Promise.all([
              mobileSearch.searchUnified({ q: normalizedQuery, perType: 4, limit: 20 }),
              available.includes('posts')
                ? mobileSearch.search({ q: normalizedQuery, type: 'posts', limit: 6 })
                : Promise.resolve([])
            ]);
            if (requestIdRef.current !== requestId) return;
            const unifiedGroups = {
              people: Array.isArray(unified?.groups?.people) ? unified.groups.people : [],
              pages: Array.isArray(unified?.groups?.pages) ? unified.groups.pages : [],
              jobs: Array.isArray(unified?.groups?.jobs) ? unified.groups.jobs : [],
              gigs: Array.isArray(unified?.groups?.gigs) ? unified.groups.gigs : []
            };
            const unifiedCount =
              unifiedGroups.people.length +
              unifiedGroups.pages.length +
              unifiedGroups.jobs.length +
              unifiedGroups.gigs.length;

            if (unifiedCount === 0) {
              const fallbackQueries = await Promise.all([
                available.includes('people')
                  ? mobileSearch.search({ q: normalizedQuery, type: 'people', limit: 4 })
                  : Promise.resolve([]),
                available.includes('pages')
                  ? mobileSearch.search({ q: normalizedQuery, type: 'pages', limit: 4 })
                  : Promise.resolve([]),
                available.includes('jobs')
                  ? mobileSearch.search({ q: normalizedQuery, type: 'jobs', limit: 4 })
                  : Promise.resolve([]),
                available.includes('gigs')
                  ? mobileSearch.search({ q: normalizedQuery, type: 'gigs', limit: 4 })
                  : Promise.resolve([])
              ]);
              if (requestIdRef.current !== requestId) return;
              unifiedGroups.people = Array.isArray(fallbackQueries[0]) ? fallbackQueries[0] : [];
              unifiedGroups.pages = Array.isArray(fallbackQueries[1]) ? fallbackQueries[1] : [];
              unifiedGroups.jobs = Array.isArray(fallbackQueries[2]) ? fallbackQueries[2] : [];
              unifiedGroups.gigs = Array.isArray(fallbackQueries[3]) ? fallbackQueries[3] : [];
            }

            setResults((prev) => ({
              ...prev,
              posts: Array.isArray(posts) ? posts : [],
              people: unifiedGroups.people,
              pages: unifiedGroups.pages,
              jobs: unifiedGroups.jobs,
              gigs: unifiedGroups.gigs
            }));
        } else {
          const resp = await mobileSearch.search({ q: normalizedQuery, type: active, limit: 12 });
          if (requestIdRef.current !== requestId) return;
          setResults((prev) => ({ ...prev, [active]: Array.isArray(resp) ? resp : [] }));
        }
      } catch (e: any) {
        if (requestIdRef.current !== requestId) return;
        setError(e?.response?.data?.error ?? e?.message ?? 'Search failed.');
      } finally {
        if (requestIdRef.current === requestId) {
          setLoading(false);
        }
      }
    }, 240);

    return () => window.clearTimeout(timer);
  }, [active, available, enabled, normalizedQuery, retryTick]);

  return (
    <div className={MOBILE_PAGE_SECTION_CLASS}>
      <div className="sticky top-0 z-10 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
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
              placeholder="Search users, pages, jobs and gigs"
              className="w-full bg-transparent text-sm outline-none"
              disabled={!enabled}
              autoFocus
            />
            <div className="flex h-4 w-4 items-center justify-center">
              {loading && canSearch ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-slate-500" /> : null}
            </div>
          </div>
        </div>

        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {(['all', ...available] as SearchScope[]).map((scope) => {
            const isActive = scope === active;
            const label = scope === 'all' ? 'ALL' : GROUP_LABELS[scope].toUpperCase();
            return (
              <button
                key={scope}
                type="button"
                onClick={() => setActive(scope)}
                className={[
                  'whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold',
                  isActive ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
                ].join(' ')}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-3 min-h-[45dvh] space-y-3">
        {!enabled ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            Search is disabled by admin settings.
          </div>
        ) : q.trim().length < 2 ? (
          <div className="space-y-3">
            {recentSearches.length > 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Recent searches</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {recentSearches.map((entry) => (
                    <button
                      key={entry}
                      type="button"
                      onClick={() => setQ(entry)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700"
                    >
                      {entry}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Recommended by Scrolith</div>
              <div className="mt-3 grid grid-cols-1 gap-2">
                {RECOMMENDED_QUERIES.map((entry) => (
                  <button
                    key={entry}
                    type="button"
                    onClick={() => setQ(entry)}
                    className="flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-3 text-left text-sm font-semibold text-slate-800 hover:bg-slate-100"
                  >
                    <Search className="h-4 w-4 text-slate-500" />
                    <span>{entry}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : loading && !hasVisibleResults ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            Searching {active === 'all' ? 'posts, users, pages, jobs and gigs' : GROUP_LABELS[active].toLowerCase()}...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-white p-4">
            <div className="text-sm font-semibold text-red-700">Search error</div>
            <div className="mt-1 text-sm text-slate-700">{error}</div>
            {canSearch ? (
              <button
                type="button"
                onClick={() => {
                  setRetryTick((value) => value + 1);
                }}
                className="mt-3 w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
              >
                Retry
              </button>
            ) : null}
          </div>
        ) : !loading && !hasVisibleResults ? (
          <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            No results found for "{q.trim()}".
          </div>
        ) : active === 'all' ? (
          <div className="space-y-3">
            {loading ? (
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                Updating results...
              </div>
            ) : null}
            {allSections.map((section) => (
              <div key={section.key} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <span>{section.label}</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px]">{section.items.length}</span>
                </div>
                <div className="divide-y divide-slate-100">
                  {section.items.map((row: any, index: number) => (
                      <SearchRow
                        key={`${section.key}-${row?.id ?? row?.url ?? index}`}
                        type={section.key}
                        row={row}
                        onNavigate={navigateAfterResult}
                        onNavigateUrl={navigateUrlAfterResult}
                      />
                    ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
            {loading ? (
              <div className="bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                Updating results...
              </div>
            ) : null}
            {activeResults.map((row: any, index: number) => (
                <SearchRow
                  key={`${active}-${row?.id ?? row?.url ?? index}`}
                  type={active}
                  row={row}
                  onNavigate={navigateAfterResult}
                  onNavigateUrl={navigateUrlAfterResult}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

function SearchRow({
  type,
  row,
  onNavigate,
  onNavigateUrl
}: {
  type: string;
  row: any;
  onNavigate: () => void;
  onNavigateUrl?: (url: string) => void;
}) {
  const lastTapRef = useRef(0);
  const toInternalUrl = (value: string) => {
    const normalized = String(value || '').trim();
    if (!normalized) return '';
    if (normalized.startsWith('/')) return normalized;
    if (typeof window === 'undefined') return normalized;
    try {
      const url = new URL(normalized, window.location.origin);
      if (url.origin !== window.location.origin) return normalized;
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return normalized;
    }
  };

  const title =
    row?.title ??
    row?.name ??
    row?.username ??
    row?.headline ??
    row?.companyName ??
    'Result';

  const subtitle =
    row?.subtitle ??
    row?.description ??
    row?.tagline ??
    row?.category ??
    row?.domain ??
    (row?.username ? `@${row.username}` : '') ??
    '';

  const normalizeUrl = (value: unknown) => String(value || '').trim();
  const normalizeHandle = (value: unknown) => String(value || '').trim().replace(/^@+/, '');
  const resolvedType = String(type || row?.type || row?.kind || '').trim().toLowerCase();
  const canonicalUrl = (() => {
    if (resolvedType === 'people' || resolvedType === 'person' || resolvedType === 'user' || resolvedType === 'users') {
      const handle = normalizeHandle(row?.username ?? row?.handle ?? row?.meta?.username);
      if (handle) return `/u/${encodeURIComponent(handle)}`;
      const id = normalizeUrl(row?.id ?? row?._id ?? row?.userId ?? row?.user_id);
      if (id) return `/profile/${encodeURIComponent(id)}`;
    }

    if (resolvedType === 'pages' || resolvedType === 'page') {
      const slug = normalizeHandle(row?.slug ?? row?.handle ?? row?.username ?? row?.meta?.slug);
      const id = normalizeUrl(row?.id ?? row?._id);
      if (slug) return `/company/${encodeURIComponent(slug)}`;
      if (id) return `/company/${encodeURIComponent(id)}`;
    }

    if (resolvedType === 'jobs' || resolvedType === 'job') {
      const jobId = normalizeUrl(row?.slug ?? row?.id ?? row?._id ?? row?.jobId ?? row?.job_id);
      if (jobId) return `/jobs/${encodeURIComponent(jobId)}`;
    }

    if (resolvedType === 'gigs' || resolvedType === 'gig') {
      const gigId = normalizeUrl(row?.slug ?? row?.id ?? row?._id ?? row?.gigId ?? row?.gig_id);
      if (gigId) return `/gigs/${encodeURIComponent(gigId)}`;
    }

    if (resolvedType === 'posts' || resolvedType === 'post') {
      const postId = normalizeUrl(row?.id ?? row?._id ?? row?.postId ?? row?.post_id);
      if (postId) return `/post/${encodeURIComponent(postId)}`;
    }

    return null;
  })();
  const resolvedUrl = canonicalUrl || toInternalUrl(normalizeUrl(row?.url ?? row?.actionUrl ?? row?.action_url)) || null;
  const avatar = resolvePostAttachmentMediaUrl({
    url:
      row?.avatarUrl ??
      row?.avatar ??
      row?.image ??
      row?.photo ??
      row?.logoUrl ??
      row?.logo ??
      row?.iconUrl ??
      row?.meta?.avatarUrl ??
      row?.meta?.avatar ??
      row?.meta?.image ??
      '',
    fileId:
      row?.avatarFileId ??
      row?.avatar_file_id ??
      row?.imageFileId ??
      row?.image_file_id ??
      row?.logoFileId ??
      row?.logo_file_id ??
      row?.iconFileId ??
      row?.icon_file_id ??
      row?.meta?.avatarFileId ??
      row?.meta?.avatar_file_id ??
      ''
  });

  const initials = String(title || 'R')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || '')
    .join('')
    .toUpperCase();

  const card = (
    <div className="flex items-center gap-3 p-3 hover:bg-slate-50">
      <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100">
        {avatar ? (
          <OptimizedImage src={avatar} alt={title} width={80} height={80} sizes="40px" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[11px] font-semibold text-slate-600">
            {initials || 'R'}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
        {subtitle ? <div className="mt-0.5 truncate text-xs text-slate-600">{subtitle}</div> : null}
      </div>
      <div className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase text-slate-500">
        {String(type || 'result').replace(/s$/, '')}
      </div>
    </div>
  );

  const triggerNavigation = (action: () => void) => {
    const now = Date.now();
    if (now - lastTapRef.current < 260) return;
    lastTapRef.current = now;
    action();
  };

  if (typeof resolvedUrl === 'string' && resolvedUrl.startsWith('/')) {
    if (onNavigateUrl) {
      return (
        <button
          type="button"
          onPointerDown={(event) => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            triggerNavigation(() => onNavigateUrl(resolvedUrl));
          }}
          onClick={() => triggerNavigation(() => onNavigateUrl(resolvedUrl))}
          className="block w-full touch-manipulation text-left"
          style={{ WebkitTapHighlightColor: 'transparent' }}
        >
          {card}
        </button>
      );
    }
    return (
      <Link to={resolvedUrl} onClick={onNavigate}>
        {card}
      </Link>
    );
  }

  if (typeof resolvedUrl === 'string' && resolvedUrl.trim()) {
    return (
      <a href={resolvedUrl} target="_blank" rel="noreferrer" onClick={onNavigate} className="block">
        {card}
      </a>
    );
  }

  return <div className="block">{card}</div>;
}
