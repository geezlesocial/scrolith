import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useNotification } from '../context/NotificationContext';
import { DeveloperPlatformService } from '../services/developerPlatform';

const DeveloperDocsPage: React.FC = () => {
  const { showNotification } = useNotification();
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [docsConfig, setDocsConfig] = useState<any>(null);

  const selectedSlug = useMemo(
    () => String(new URLSearchParams(location.search).get('page') || '').trim().toLowerCase(),
    [location.search]
  );

  const loadDocs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await DeveloperPlatformService.getDocs();
      setDocsConfig(data || null);
    } catch (error: any) {
      showNotification('error', 'Developer Docs', error?.message || 'Failed to load developer documentation.');
    } finally {
      setLoading(false);
    }
  }, [showNotification]);

  useEffect(() => {
    void loadDocs();
  }, [loadDocs]);

  useEffect(() => {
    const refresh = () => {
      void loadDocs();
    };
    window.addEventListener('dev:docs_updated', refresh as EventListener);
    return () => window.removeEventListener('dev:docs_updated', refresh as EventListener);
  }, [loadDocs]);

  const pages = useMemo(
    () => (Array.isArray(docsConfig?.pages) ? docsConfig.pages.filter((page: any) => page?.isPublished !== false) : []),
    [docsConfig?.pages]
  );

  const activePage = useMemo(() => {
    if (!pages.length) return null;
    if (!selectedSlug) return pages[0];
    return (
      pages.find((page: any) => String(page.slug || '').toLowerCase() === selectedSlug) ||
      pages.find((page: any) => String(page.id || '').toLowerCase() === selectedSlug) ||
      pages[0]
    );
  }, [pages, selectedSlug]);

  const openPage = (slug: string) => {
    const next = String(slug || '').trim();
    if (!next) return;
    const params = new URLSearchParams(location.search);
    params.set('page', next);
    navigate({ pathname: '/developer/docs', search: params.toString() ? `?${params.toString()}` : '' }, { replace: false });
  };

  return (
    <div className="mx-auto flex w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <aside className="hidden w-80 shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:block">
        <h1 className="text-base font-semibold text-slate-900">{String(docsConfig?.landingTitle || 'Developer Docs')}</h1>
        <p className="mt-1 text-xs text-slate-500">{String(docsConfig?.landingSubtitle || '')}</p>
        <a
          href={String(docsConfig?.portalHomeUrl || '/developer')}
          className="mt-3 inline-flex text-xs font-medium text-indigo-600 hover:text-indigo-500"
        >
          Back to Developer Portal
        </a>
        <nav className="mt-4 space-y-1">
          {pages.map((page: any) => {
            const slug = String(page.slug || page.id || '').trim();
            const isActive = slug.toLowerCase() === String(activePage?.slug || activePage?.id || '').toLowerCase();
            return (
              <button
                key={String(page.id)}
                type="button"
                onClick={() => openPage(slug)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm ${
                  isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <p className="font-medium">{String(page.title || 'Untitled')}</p>
                {page.summary ? <p className={`mt-0.5 text-xs ${isActive ? 'text-slate-200' : 'text-slate-500'}`}>{String(page.summary)}</p> : null}
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="min-w-0 flex-1">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          {loading ? (
            <p className="text-sm text-slate-500">Loading documentation...</p>
          ) : !activePage ? (
            <p className="text-sm text-slate-500">No documentation pages are available yet.</p>
          ) : (
            <>
              <div className="mb-4 border-b border-slate-100 pb-4">
                <h2 className="text-xl font-semibold text-slate-900">{String(activePage.title || 'Untitled')}</h2>
                {activePage.summary ? <p className="mt-1 text-sm text-slate-600">{String(activePage.summary)}</p> : null}
              </div>
              <article className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-700">
                {String(activePage.content || 'No documentation content.')}
              </article>
              <p className="mt-6 text-xs text-slate-400">
                Last updated: {activePage.updatedAt ? new Date(activePage.updatedAt).toLocaleString() : 'Unknown'}
              </p>
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default DeveloperDocsPage;
