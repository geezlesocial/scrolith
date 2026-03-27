import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  BadgeInfo,
  CalendarDays,
  Clock3,
  FileText,
  HelpCircle,
  Loader,
  Megaphone,
  ShieldCheck,
  Sparkles
} from 'lucide-react';
import { ContentBlock, StaticPage as StaticPageType } from '../types';
import { CMSService } from '../services/cms';
import { useSocket } from '../context/SocketContext';
import { prepareStaticPageContent, StaticPageTocItem } from '../utils/staticPageContent';

type PageModuleBlock = ContentBlock & {
  type: ContentBlock['type'] | 'callout' | 'cta' | 'ad';
  settings?: Record<string, any>;
};

const SUPPORT_URL = 'https://scrolith.com/support';

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

const upsertJsonLd = (data: Record<string, any>) => {
  if (typeof document === 'undefined') return;
  let node = document.head.querySelector('script[data-scrolith-jsonld="static-page"]') as HTMLScriptElement | null;
  if (!node) {
    node = document.createElement('script');
    node.type = 'application/ld+json';
    node.setAttribute('data-scrolith-jsonld', 'static-page');
    document.head.appendChild(node);
  }
  node.textContent = JSON.stringify(data);
};

const inferPageLabel = (slug?: string) => {
  const normalized = String(slug || '').trim().toLowerCase();
  if (normalized.includes('privacy')) return 'Privacy & Data';
  if (normalized.includes('terms')) return 'Legal';
  if (normalized.includes('refund')) return 'Billing';
  if (normalized.includes('about')) return 'Company';
  return 'Page';
};

const normalizeBlockPlacement = (block: PageModuleBlock) => {
  const raw = String(block?.settings?.placement || '').trim().toLowerCase();
  if (raw === 'sidebar' || raw === 'after_content' || raw === 'after_hero') return raw;
  if (block.type === 'ad') return 'sidebar';
  if (block.type === 'cta') return 'after_content';
  return 'after_hero';
};

const getBlockTone = (block: PageModuleBlock) => {
  const tone = String(block?.settings?.tone || 'info').trim().toLowerCase();
  if (tone === 'success' || tone === 'warning' || tone === 'danger') return tone;
  return 'info';
};

const renderPageModule = (block: PageModuleBlock) => {
  const title = String(block?.settings?.title || block.content || '').trim();
  const description = String(block?.settings?.description || block.content || '').trim();
  const ctaLabel = String(block?.settings?.ctaLabel || block?.settings?.cta_text || '').trim();
  const ctaUrl = String(block?.settings?.ctaUrl || block?.settings?.cta_url || '').trim();
  const imageUrl = String(block?.settings?.image || block?.settings?.imageUrl || '').trim();
  const sponsor = String(block?.settings?.sponsor || block?.settings?.label || 'Sponsored').trim();

  if (block.type === 'cta') {
    return (
      <section key={block.id} className="page-module-card page-module-card--cta">
        <div className="page-module-card__eyebrow">Continue with Scrolith</div>
        <h3>{title || 'Discover more on Scrolith'}</h3>
        <p>{description || 'Explore support, community resources, and platform tools.'}</p>
        {ctaLabel && ctaUrl ? (
          <a href={ctaUrl} className="page-module-card__button">
            {ctaLabel}
            <ArrowRight className="h-4 w-4" />
          </a>
        ) : null}
      </section>
    );
  }

  if (block.type === 'ad') {
    return (
      <aside key={block.id} className="page-module-card page-module-card--ad">
        <div className="page-module-card__eyebrow">{sponsor}</div>
        <div className="page-module-card__split">
          <div>
            <h3>{title || 'Promoted'}</h3>
            <p>{description || 'Use this space for a partner ad, internal promotion, or a high-priority message.'}</p>
            {ctaLabel && ctaUrl ? (
              <a href={ctaUrl} className="page-module-card__button page-module-card__button--light">
                {ctaLabel}
                <ArrowUpRight className="h-4 w-4" />
              </a>
            ) : null}
          </div>
          {imageUrl ? <img src={imageUrl} alt={title || sponsor} className="page-module-card__image" loading="lazy" /> : null}
        </div>
      </aside>
    );
  }

  const tone = getBlockTone(block);
  return (
    <section key={block.id} className={`page-module-card page-module-card--callout page-module-card--${tone}`}>
      <div className="page-module-card__icon">
        <BadgeInfo className="h-5 w-5" />
      </div>
      <div>
        <h3>{title || 'Important information'}</h3>
        <p>{description || 'Use this section for short policy notes, legal clarifications, or notices.'}</p>
      </div>
    </section>
  );
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
      if (!updatedSlug || updatedSlug === slugRef.current) loadPage();
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

  const prepared = useMemo(() => prepareStaticPageContent(page?.content || ''), [page?.content]);
  const seoTitle = getSeoField(page, 'meta_title', 'metaTitle');
  const seoDescription = getSeoField(page, 'meta_description', 'metaDescription');
  const seoKeywords = getSeoField(page, 'meta_keywords', 'metaKeywords');
  const canonicalUrl = page?.slug ? `https://scrolith.com/p/${page.slug}` : '';
  const pageLabel = inferPageLabel(page?.slug);
  const updatedSource = (page as any)?.updatedAt || (page as any)?.updated_at || '';
  const updatedLabel = updatedSource
    ? new Date(updatedSource).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : '';
  const heroSummary = seoDescription || prepared.lead || 'Scrolith page content served through the live CMS.';
  const featuredImage = page?.images?.[0] || '';

  const pageBlocks = useMemo(() => {
    return Array.isArray(page?.blocks) ? (page?.blocks as PageModuleBlock[]) : [];
  }, [page?.blocks]);

  const heroBlocks = useMemo(
    () => pageBlocks.filter((block) => normalizeBlockPlacement(block) === 'after_hero'),
    [pageBlocks]
  );
  const sidebarBlocks = useMemo(
    () => pageBlocks.filter((block) => normalizeBlockPlacement(block) === 'sidebar'),
    [pageBlocks]
  );
  const contentBlocks = useMemo(
    () => pageBlocks.filter((block) => normalizeBlockPlacement(block) === 'after_content'),
    [pageBlocks]
  );

  useEffect(() => {
    if (!page) return;
    document.title = seoTitle || `${page.title} | Scrolith`;
    upsertMetaTag('meta[name="description"]', { name: 'description' }, heroSummary);
    upsertMetaTag('meta[property="og:title"]', { property: 'og:title' }, seoTitle || page.title);
    upsertMetaTag('meta[property="og:description"]', { property: 'og:description' }, heroSummary);
    upsertMetaTag('meta[property="og:type"]', { property: 'og:type' }, 'article');
    if (featuredImage) {
      upsertMetaTag('meta[property="og:image"]', { property: 'og:image' }, featuredImage);
      upsertMetaTag('meta[name="twitter:image"]', { name: 'twitter:image' }, featuredImage);
    }
    upsertMetaTag('meta[name="twitter:title"]', { name: 'twitter:title' }, seoTitle || page.title);
    upsertMetaTag('meta[name="twitter:description"]', { name: 'twitter:description' }, heroSummary);
    if (seoKeywords) upsertMetaTag('meta[name="keywords"]', { name: 'keywords' }, seoKeywords);
    if (canonicalUrl) upsertCanonicalLink(canonicalUrl);

    upsertJsonLd({
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: page.title,
      headline: page.title,
      description: heroSummary,
      url: canonicalUrl,
      dateModified: updatedSource || undefined,
      publisher: {
        '@type': 'Organization',
        name: 'Scrolith',
        url: 'https://scrolith.com',
        logo: {
          '@type': 'ImageObject',
          url: 'https://scrolith.com/logo.png'
        }
      },
      image: featuredImage || 'https://scrolith.com/logo.png',
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: 'Home',
            item: 'https://scrolith.com'
          },
          {
            '@type': 'ListItem',
            position: 2,
            name: pageLabel,
            item: 'https://scrolith.com/p'
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: page.title,
            item: canonicalUrl
          }
        ]
      }
    });
  }, [canonicalUrl, featuredImage, heroSummary, page, pageLabel, prepared.readingMinutes, seoKeywords, seoTitle, updatedSource]);

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
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef2ff_28%,#f8fafc_100%)] pt-24 pb-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <nav className="mb-6 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          <Link to="/" className="hover:text-slate-900">
            Home
          </Link>
          <span>/</span>
          <span>{pageLabel}</span>
          <span>/</span>
          <span className="font-medium text-slate-800">{page.title}</span>
        </nav>

        <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
          <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="bg-[radial-gradient(circle_at_top_left,_rgba(96,165,250,0.25),_transparent_32%),linear-gradient(135deg,#0f172a_0%,#172554_48%,#1e293b_100%)] px-6 py-8 text-white sm:px-10 sm:py-10">
              <div className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-200">
                <span>{pageLabel}</span>
                {updatedLabel ? <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] tracking-[0.2em]">Updated {updatedLabel}</span> : null}
              </div>
              <h1 className="mt-4 max-w-4xl text-3xl font-bold tracking-tight sm:text-5xl">{page.title}</h1>
              <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-200 sm:text-lg">{heroSummary}</p>

              <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-slate-200">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
                  <Clock3 className="h-4 w-4 text-sky-300" />
                  {prepared.readingMinutes || 1} min read
                </div>
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
                  <FileText className="h-4 w-4 text-sky-300" />
                  {prepared.wordCount.toLocaleString()} words
                </div>
                {updatedLabel ? (
                  <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2">
                    <CalendarDays className="h-4 w-4 text-sky-300" />
                    {updatedLabel}
                  </div>
                ) : null}
              </div>
            </div>

            {featuredImage ? (
              <div className="relative min-h-[240px] overflow-hidden bg-slate-950">
                <img src={featuredImage} alt={page.title} className="h-full w-full object-cover" loading="eager" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/50 via-transparent to-transparent" />
              </div>
            ) : (
              <div className="flex min-h-[240px] items-center justify-center bg-[radial-gradient(circle_at_top,_rgba(59,130,246,0.16),_transparent_40%),linear-gradient(180deg,#f8fafc_0%,#e2e8f0_100%)] p-8">
                <div className="max-w-[16rem] rounded-[28px] border border-white/70 bg-white/80 p-5 shadow-lg shadow-slate-900/10 backdrop-blur">
                  <div className="inline-flex rounded-2xl bg-blue-50 p-3 text-blue-700">
                    <Sparkles className="h-6 w-6" />
                  </div>
                  <p className="mt-4 text-sm font-semibold text-slate-900">Structured Page Layout</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Built for long-form policies, company pages, and evergreen SEO content with live CMS editing.
                  </p>
                </div>
              </div>
            )}
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
                <p className="text-sm font-semibold">Editorial structure</p>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Sections, callouts, media, and promotional blocks can be managed in the CMS without custom code.
              </p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center gap-3 text-slate-900">
                <HelpCircle className="h-4 w-4 text-blue-600" />
                <p className="text-sm font-semibold">Support & compliance</p>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                Use the support center for account, billing, compliance, and platform questions.
              </p>
            </div>
          </div>
        </section>

        {heroBlocks.length ? <div className="mt-8 grid gap-4">{heroBlocks.map(renderPageModule)}</div> : null}

        <div className="mt-8 grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
          <article className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 bg-slate-50/80 px-6 py-4 sm:px-8">
              <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                <span className="rounded-full bg-blue-50 px-3 py-1 font-medium text-blue-700">{pageLabel}</span>
                {updatedLabel ? <span>Last updated {updatedLabel}</span> : null}
              </div>
            </div>

            <div className="px-6 py-8 sm:px-8 sm:py-10">
              <div className="static-page-content" dangerouslySetInnerHTML={{ __html: prepared.html }} />

              {contentBlocks.length ? <div className="mt-10 space-y-4">{contentBlocks.map(renderPageModule)}</div> : null}

              {updatedLabel ? (
                <div className="mt-10 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Last updated on {updatedLabel}.
                </div>
              ) : null}
            </div>
          </article>

          <aside className="space-y-4">
            <div className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm xl:sticky xl:top-28">
              <div className="flex items-center gap-3 text-slate-900">
                <FileText className="h-4 w-4 text-blue-600" />
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">On This Page</h2>
              </div>
              <div className="mt-4 space-y-2">
                {prepared.toc.length ? (
                  prepared.toc.map((item: StaticPageTocItem) => (
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
                  <p className="text-sm text-slate-500">Add section headings in the CMS to generate a table of contents.</p>
                )}
              </div>
            </div>

            {sidebarBlocks.map(renderPageModule)}

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

            <div className="rounded-[24px] border border-slate-200 bg-slate-950 p-5 text-white shadow-sm">
              <div className="flex items-center gap-3">
                <Megaphone className="h-5 w-5 text-sky-300" />
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-sky-200">Promote on Scrolith</p>
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-300">
                Need a sponsored placement, product announcement, or trust-and-safety notice inside a CMS page? Add an ad module from the page editor.
              </p>
              <a href={SUPPORT_URL} className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-white">
                Contact support
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default StaticPage;
