import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Building2, PlusCircle, RefreshCw } from 'lucide-react';
import { CommunityService } from '../../services/community';
import { useNotification } from '../../context/NotificationContext';
import CompanyPage from '../../pages/CompanyPage';

type OwnedPage = {
  id: string;
  name: string;
  slug: string;
  handle?: string | null;
};

const normalizeOwnedPage = (page: any): OwnedPage | null => {
  const id = String(page?.id || '').trim();
  const slug = String(page?.slug || '').trim();
  if (!id || !slug) return null;
  return {
    id,
    slug,
    name: String(page?.name || 'Business page'),
    handle: page?.handle || null
  };
};

const ManagePagesModule: React.FC = () => {
  const location = useLocation();
  const { showNotification } = useNotification();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [pages, setPages] = useState<OwnedPage[]>([]);
  const [selectedSlug, setSelectedSlug] = useState<string>('');

  const dashboardPath = useMemo(() => {
    const path = String(location.pathname || '');
    const search = new URLSearchParams(location.search);
    const asParam = search.get('as');
    const base = path.startsWith('/client/') ? '/client/dashboard' : '/freelancer/dashboard';
    const nextSearch = new URLSearchParams();
    nextSearch.set('tab', 'community');
    nextSearch.set('section', 'business');
    nextSearch.set('createPage', '1');
    if (asParam) nextSearch.set('as', asParam);
    return `${base}?${nextSearch.toString()}`;
  }, [location.pathname, location.search]);

  const loadPages = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setRefreshing(true);
    try {
      const data = await CommunityService.getMyBusinessPages();
      const normalized = (Array.isArray(data) ? data : [])
        .map(normalizeOwnedPage)
        .filter((item): item is OwnedPage => Boolean(item));
      setPages(normalized);
      setSelectedSlug((prev) => {
        if (prev && normalized.some((page) => page.slug === prev)) return prev;
        return normalized[0]?.slug || '';
      });
    } catch (error: any) {
      showNotification('error', 'Manage Pages', error?.response?.data?.error || 'Unable to load owned pages.');
      setPages([]);
      setSelectedSlug('');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    void loadPages();
  }, [loadPages]);

  useEffect(() => {
    const refresh = () => {
      void loadPages(true);
    };

    window.addEventListener('community:business_page_created', refresh as EventListener);
    window.addEventListener('community:business_page_updated', refresh as EventListener);
    return () => {
      window.removeEventListener('community:business_page_created', refresh as EventListener);
      window.removeEventListener('community:business_page_updated', refresh as EventListener);
    };
  }, [loadPages]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">
        Loading pages...
      </div>
    );
  }

  if (!pages.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-blue-50 p-2 text-blue-600">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Manage Pages</h2>
            <p className="mt-1 text-sm text-slate-600">You have no business pages yet.</p>
            <Link
              to={dashboardPath}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <PlusCircle className="h-4 w-4" />
              Create your first page
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Manage Pages</h2>
            <p className="mt-1 text-xs text-slate-500">Select an owned page to manage dashboard, posts, followers, following and profile details.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void loadPages(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <Link
              to={dashboardPath}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              <PlusCircle className="h-4 w-4" />
              Add new page
            </Link>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {pages.map((page) => {
            const active = page.slug === selectedSlug;
            return (
              <button
                key={page.id}
                type="button"
                onClick={() => setSelectedSlug(page.slug)}
                className={`rounded-full px-3 py-1.5 text-sm transition ${
                  active
                    ? 'bg-blue-600 text-white'
                    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {page.name}
                <span className={`ml-2 text-xs ${active ? 'text-blue-100' : 'text-slate-500'}`}>
                  @{page.handle || page.slug}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {selectedSlug ? <CompanyPage slugOverride={selectedSlug} /> : null}
    </div>
  );
};

export default ManagePagesModule;
