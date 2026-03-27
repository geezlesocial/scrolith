import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AlertCircle, ArrowUpRight, Clock3, FileText, HelpCircle, Loader, ShieldCheck } from 'lucide-react';
import { StaticPage as StaticPageType } from '../types';
import { CMSService } from '../services/cms';
import { useSocket } from '../context/SocketContext';

type TocItem = {
  id: string;
  title: string;
  level: 2 | 3;
};

const SUPPORT_URL = 'https://scrolith.com/support';

const slugifyHeading = (value: string) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');

const preparePageContent = (html: string) => {
  if (!html || typeof window === 'undefined' || typeof DOMParser === 'undefined') {
    return { html, toc: [] as TocItem[] };
  }

  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<body>${html}</body>`, 'text/html');
    const toc: TocItem[] = [];
    const usedIds = new Set<string>();

    doc.querySelectorAll('h2, h3').forEach((heading, index) => {
      const text = heading.textContent?.trim() || `section-${index + 1}`;
      let id = slugifyHeading(text) || `section-${index + 1}`;
      while (usedIds.has(id)) id = `${id}-${index + 1}`;
      usedIds.add(id);
      heading.setAttribute('id', id);
      toc.push({
        id,
        title: text,
        level: heading.tagName === 'H3' ? 3 : 2
      });
    });

    return {
      html: doc.body.innerHTML || html,
      toc
    };
  } catch (error) {
    console.error('Failed to prepare static page content', error);
    return { html, toc: [] as TocItem[] };
  }
};

const getSeoField = (page: StaticPageType | null, ...keys: string[]) => {
  const source = (page as any)?.seo || {};
  for (const key of keys) {
    if (source[key]) return String(source[key]);
  }
  return '';
};

const upsertMetaTag = (selector: string, attrs: Record<string, string>, content: string) => {
  if (typeof document === 'undefined' || !content.trim()) return;
  let node = document.head.querySelector(selector) as HTMLMetaElement | null;
  if (!node) {
    node = document.createElement('meta');
    Object.entries(attrs).forEach(([key, value]) => node!.setAttribute(key, value));
    document.head.appendChild(node);
  }
  node.setAttribute('content', content);
};

const upsertCanonicalLink = (href: string) => {
  if (typeof document === 'undefined' || !href.trim()) return;
  let node = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!node) {
    node = document.createElement('link');
    node.setAttribute('rel', 'canonical');
    document.head.appendChild(node);
  }
  node.setAttribute('href', href);
};

const inferPageLabel = (slug?: string) => {
  const normalized = String(slug || '').trim().toLowerCase();
  if (normalized.includes('privacy')) return 'Privacy';
  if (normalized.includes('terms')) return 'Legal';
  if (normalized.includes('refund')) return 'Billing';
  if (normalized.includes('about')) return 'Company';
  return 'Page';
};

const StaticPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<StaticPageType | null>(null);
  const [loading, setLoading] = useState(true);
  const { socket } = useSocket();
  const slugRef = useRef<string | undefined>(slug);

  useEffect(() => {
    slugRef.current = slug;
  }, [slug]);

  const loadPage = async () => {
    if (!slugRef.current) return;
    setLoading(true);
    try {
      const data = await CMSService.getPageBySlug(slugRef.current);
      setPage(data || null);
    } catch (error) {
      console.error('Failed to load page', error);
      setPage(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  useEffect(() => {
    if (!socket) return;

    const handlePageUpdate = (payload: any) => {
      const updatedSlug = payload?.slug || payload?.data?.slug;
      if (!updatedSlug || updatedSlug === slugRef.current) {
        loadPage();
      }
    };
    const handlePagesUpdate = () => loadPage();
    const handlePageDelete = (payload: any) => {
      const deletedId = payload?.id || payload?.data?.id;
      if (page?.id && deletedId && deletedId === page.id) {
        setPage(null);
      } else {
        loadPage();
      }
    };

    socket.on('cms:page_updated', handlePageUpdate);
    socket.on('cms:pages_updated', handlePagesUpdate);
    socket.on('cms:page_deleted', handlePageDelete);

    return () => {
      socket.off('cms:page_updated', handlePageUpdate);
      socket.off('cms:pages_updated', handlePagesUpdate);
      socket.off('cms:page_deleted', handlePageDelete);
    };
  }, [socket, page?.id]);

  useEffect(() => {
    if (socket) return;
    const id = window.setInterval(() => {
      loadPage();
    }, 60000);
    return () => window.clearInterval(id);
  }, [socket]);

  const prepared = useMemo(() => preparePageContent(page?.content || ''), [page?.content]);
  const seoTitle = getSeoField(page, 'meta_title', 'metaTitle');
  const seoDescription = getSeoField(page, 'meta_description', 'metaDescription');
  const canonicalUrl = page?.slug ? `https://scrolith.com/p/${page.slug}` : '';
  const pageLabel = inferPageLabel(page?.slug);
  const updatedSource = (page as any)?.updatedAt || (page as any)?.updated_at || '';
  const updatedLabel = updatedSource
    ? new Date(updatedSource).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  useEffect(() => {
    if (!page) return;
    document.title = seoTitle || `${page.title} | Scrolith`;
    upsertMetaTag('meta[name="description"]', { name: 'description' }, seoDescription || page.title);
    upsertMetaTag('meta[property="og:title"]', { property: 'og:title' }, seoTitle || page.title);
    upsertMetaTag('meta[property="og:description"]', { property: 'og:description' }, seoDescription || page.title);
    upsertMetaTag('meta[name="twitter:title"]', { name: 'twitter:title' }, seoTitle || page.title);
    upsertMetaTag('meta[name="twitter:description"]', { name: 'twitter:description' }, seoDescription || page.title);
    if (canonicalUrl) upsertCanonicalLink(canonicalUrl);
  }, [canonicalUrl, page, seoDescription, seoTitle]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 pt-24">
        <div className="mx-auto flex max-w-6xl items-center justify-center px-4 py-24 sm:px-6 lg:px-8">
          <Loader className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  if (!page) {
    return (
      <div className="min-h-screen bg-slate-50 pt-24">
        <div className="mx-auto max-w-3xl px-4 py-24 text-center sm:px-6 lg:px-8">
          <div className="rounded-[28px] border border-slate-200 bg-white p-10 shadow-sm">
            <AlertCircle className="mx-auto mb-4 h-12 w-12 text-rose-500" />
            <h1 className="text-3xl font-bold text-slate-900">Page Not Found</h1>
            <p className="mt-3 text-base text-slate-600">
              The page you requested is unavailable or has moved. Use the links below to continue.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                to="/"
                className="inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Go Home
              </Link>
              <a
                href={SUPPORT_URL}
                className="inline-flex items-center justify-center rounded-full border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Visit Support
              </a>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_38%,#f8fafc_100%)] pt-24 pb-16">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
          <div className="bg-[radial-gradient(circle_at_top_left,_rgba(59,130,246,0.2),_transparent_38%),linear-gradient(135deg,#0f172a_0%,#1e293b_100%)] px-6 py-8 text-white sm:px-10 sm:py-10">
            <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.22em] text-sky-200">
              <span>{pageLabel}</span>
              {updatedLabel ? <span>Updated {updatedLabel}</span> : null}
            </div>
            <h1 className="mt-4 max-w-4xl text-3xl font-bold tracking-tight sm:text-5xl">{page.title}</h1>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-200 sm:text-base">
              {seoDescription || 'Scrolith policy and company information page.'}
            </p>
          </div>

          <div className="grid gap-4 border-t border-slate-200 bg-slate-50 px-6 py-5 sm:grid-cols-3 sm:px-10">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-3 text-slate-900">
                <Clock3 className="h-4 w-4 text-blue-600" />
                <p className="text-sm font-semibold">Realtime updates</p>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                This page is served through the live CMS and updates when admins publish changes.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-3 text-slate-900">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                <p className="text-sm font-semibold">Admin governed</p>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Legal and company pages stay editable in the existing CMS Pages admin workflow.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-3 text-slate-900">
                <HelpCircle className="h-4 w-4 text-blue-600" />
                <p className="text-sm font-semibold">Need help?</p>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Use the support center for account, billing, compliance, and platform questions.
              </p>
            </div>
          </div>
        </section>

        <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_280px]">
          <article className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm sm:p-10">
            <div
              className="prose prose-slate max-w-none prose-headings:scroll-mt-28 prose-headings:font-semibold prose-h2:mt-12 prose-h2:border-t prose-h2:border-slate-200 prose-h2:pt-8 prose-h3:mt-8 prose-a:text-blue-700 prose-a:no-underline hover:prose-a:text-blue-800 prose-strong:text-slate-900 prose-li:marker:text-blue-600 prose-table:w-full"
              dangerouslySetInnerHTML={{ __html: prepared.html }}
            />

            {updatedLabel ? (
              <div className="mt-12 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Last updated on {updatedLabel}.
              </div>
            ) : null}
          </article>

          <aside className="space-y-4">
            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-28">
              <div className="flex items-center gap-3 text-slate-900">
                <FileText className="h-4 w-4 text-blue-600" />
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">On This Page</h2>
              </div>
              <div className="mt-4 space-y-2">
                {prepared.toc.length ? (
                  prepared.toc.map((item) => (
                    <a
                      key={item.id}
                      href={`#${item.id}`}
                      className={`block rounded-xl px-3 py-2 text-sm transition hover:bg-slate-50 ${
                        item.level === 3 ? 'ml-3 text-slate-500' : 'font-medium text-slate-700'
                      }`}
                    >
                      {item.title}
                    </a>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">This page does not have a generated table of contents.</p>
                )}
              </div>
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">Quick Links</h2>
              <div className="mt-4 space-y-2">
                <Link to="/p/about" className="flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  About Scrolith
                  <ArrowUpRight className="h-4 w-4 text-slate-400" />
                </Link>
                <Link to="/p/terms" className="flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Terms of Service
                  <ArrowUpRight className="h-4 w-4 text-slate-400" />
                </Link>
                <Link to="/p/privacy" className="flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Privacy Policy
                  <ArrowUpRight className="h-4 w-4 text-slate-400" />
                </Link>
                <Link to="/p/refund-policy" className="flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                  Refund Policy
                  <ArrowUpRight className="h-4 w-4 text-slate-400" />
                </Link>
                <a
                  href={SUPPORT_URL}
                  className="flex items-center justify-between rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Support Center
                  <ArrowUpRight className="h-4 w-4 text-slate-400" />
                </a>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default StaticPage;
