import React, { useEffect, useState, Suspense, useMemo, useCallback, lazy } from 'react';
import { useUser } from '../context/UserContext';
import { useContent } from '../context/ContentContext';
import { useSocket } from '../context/SocketContext';
import { useT } from '../i18n/useT';
import { CMSService } from '../services/cms';
import {
  HomepageSection,
  HeroContent,
  ProjectBriefContent,
  TopProServicesContent,
  TrustSecurityContent,
  TrendingOppsContent,
  GrowthDashContent,
  GigCreationContent,
  MarketInsightsContent,
  PopularServicesContent,
  PromoBannersContent,
  TrustValueContent,
  VideoFeatureContent,
  MarketplaceTilesContent,
  GuidesGridContent,
  MadeOnScrolithContent,
  FooterCtaStripContent,
  GuestCommunityPreviewContent,
  GuestFeatureShowcaseContent,
  GuestFinalCtaContent,
  GuestHeroAuthContent,
  GuestPathsContent,
  GuestTrendingPreviewContent,
  GuestWhatIsScrolithContent
} from '../types';
import { upsertImagePreloadLink } from '../utils/resourceHints';
import { resolveResponsiveAssetUrl } from '../utils/assetUrl';
const lazyGuestSection = <T extends keyof typeof import('../components/sections/GuestSections')>(name: T) =>
  lazy(async () => {
    const module = await import('../components/sections/GuestSections');
    return { default: module[name] as React.ComponentType<any> };
  });

// Modular Sections (Lazy Loaded)
const HeroAISection = React.lazy(() => import('../components/sections/HeroAISection'));
const AISkillMatchBar = React.lazy(() => import('../components/sections/AISkillMatchBar'));
const TrendingOpportunities = React.lazy(() => import('../components/sections/TrendingOpportunities'));
const FreelancerGrowthDashboard = React.lazy(() => import('../components/sections/FreelancerGrowthDashboard'));
const AIGigCreationCTA = React.lazy(() => import('../components/sections/AIGigCreationCTA'));
const MarketplaceInsights = React.lazy(() => import('../components/sections/MarketplaceInsights'));
const AIProjectBriefGenerator = React.lazy(() => import('../components/sections/AIProjectBriefGenerator'));
const TopProServices = React.lazy(() => import('../components/sections/TopProServices'));
const TrustSecurity = React.lazy(() => import('../components/sections/TrustSecurity'));
const MemberHomeSection = React.lazy(() => import('../components/sections/MemberHomeSection'));
const Recommendations = React.lazy(() => import('../components/Recommendations'));
const PopularServicesSection = lazyGuestSection('PopularServicesSection');
const PromoBannersSection = lazyGuestSection('PromoBannersSection');
const TrustValueSection = lazyGuestSection('TrustValueSection');
const VideoFeatureSection = lazyGuestSection('VideoFeatureSection');
const MarketplaceTilesSection = lazyGuestSection('MarketplaceTilesSection');
const GuidesGridSection = lazyGuestSection('GuidesGridSection');
const MadeOnScrolithSection = lazyGuestSection('MadeOnScrolithSection');
const FooterCtaStripSection = lazyGuestSection('FooterCtaStripSection');
const GuestHeroAuthSection = lazyGuestSection('GuestHeroAuthSection');
const GuestWhatIsScrolithSection = lazyGuestSection('GuestWhatIsScrolithSection');
const GuestPathsSection = lazyGuestSection('GuestPathsSection');
const GuestFeatureShowcaseSection = lazyGuestSection('GuestFeatureShowcaseSection');
const GuestTrendingPreviewSection = lazyGuestSection('GuestTrendingPreviewSection');
const GuestCommunityPreviewSection = lazyGuestSection('GuestCommunityPreviewSection');
const GuestFinalCtaSection = lazyGuestSection('GuestFinalCtaSection');

// Legacy Sections
const TrustSection = React.lazy(() => import('../components/sections/LegacySections').then((module) => ({ default: module.TrustSection })));
const CategoriesSection = React.lazy(() => import('../components/sections/LegacySections').then((module) => ({ default: module.CategoriesSection })));
const HowItWorksSection = React.lazy(() => import('../components/sections/LegacySections').then((module) => ({ default: module.HowItWorksSection })));
const FeaturedSection = React.lazy(() => import('../components/sections/LegacySections').then((module) => ({ default: module.FeaturedSection })));
const CTASection = React.lazy(() => import('../components/sections/LegacySections').then((module) => ({ default: module.CTASection })));

type RenderSection =
  | HomepageSection
  | { id: string; type: 'recommendations'; isActive: true; position: number; name: string; content?: null };

const normalizeSectionType = (value: any): string => {
  const raw = String(value || '').trim().toLowerCase();
  const cleaned = raw.replace(/[\s-]+/g, '_');
  switch (cleaned) {
    case 'hero_section':
    case 'heroheader':
    case 'header_hero':
      return 'hero';
    case 'howitworks':
    case 'how_it_works_section':
      return 'how_it_works';
    case 'projectbriefgenerator':
      return 'project_brief_generator';
    case 'topproservices':
      return 'top_pro_services';
    case 'trustsecurity':
      return 'trust_security';
    case 'trendingopps':
      return 'trending_opps';
    case 'growthdash':
      return 'growth_dash';
    case 'gigcreation':
      return 'gig_creation';
    case 'marketinsights':
      return 'market_insights';
    case 'skillmatching':
      return 'skill_matching';
    case 'memberhome':
    case 'member_home':
    case 'linkedin_home':
    case 'linkedinhome':
    case 'home_feed':
    case 'homefeed':
    case 'community_home':
      return 'member_home';
    case 'hero_ai':
    case 'heroai':
      return 'hero';
    case 'popularservices':
    case 'popular_services':
    case 'popular-services':
      return 'popular_services';
    case 'promobanners':
    case 'promo_banners':
    case 'promo-banners':
      return 'promo_banners';
    case 'trustvalue':
    case 'trust_value':
    case 'trust-value':
      return 'trust_value';
    case 'videofeature':
    case 'video_feature':
    case 'video-feature':
      return 'video_feature';
    case 'marketplacetiles':
    case 'marketplace_tiles':
    case 'marketplace-tiles':
    case 'category_tiles':
    case 'category-tiles':
      return 'marketplace_tiles';
    case 'guidesgrid':
    case 'guides_grid':
    case 'guides-grid':
    case 'blog_grid':
    case 'blog-grid':
      return 'guides_grid';
    case 'madeonScrolith':
    case 'made_on_Scrolith':
    case 'made-on-Scrolith':
    case 'made_on':
      return 'made_on_Scrolith';
    case 'footer_cta_strip':
    case 'footer-cta-strip':
    case 'footerctastrip':
      return 'footer_cta_strip';
    case 'guestheroauth':
    case 'guest_hero_auth':
      return 'guest_hero_auth';
    case 'guestwhatisscrolith':
    case 'guest_what_is_scrolith':
    case 'guest_what_is_scrolith_section':
      return 'guest_what_is_scrolith';
    case 'guestpaths':
    case 'guest_paths':
      return 'guest_paths';
    case 'guestfeatureshowcase':
    case 'guest_feature_showcase':
      return 'guest_feature_showcase';
    case 'guesttrendingpreview':
    case 'guest_trending_preview':
      return 'guest_trending_preview';
    case 'guestcommunitypreview':
    case 'guest_community_preview':
      return 'guest_community_preview';
    case 'guestfinalcta':
    case 'guest_final_cta':
      return 'guest_final_cta';
    default:
      return cleaned;
  }
};

const GUEST_SECTION_PRIORITY: string[] = [
  'guest_hero_auth',
  'guest_what_is_scrolith',
  'guest_feature_showcase',
  'guest_paths',
  'guest_trending_preview',
  'guest_community_preview',
  'guest_final_cta'
];

const isGuestSectionType = (type: any) => GUEST_SECTION_PRIORITY.includes(String(type || '').trim());

const resolveLandingHeroImage = (section: HomepageSection | undefined | null) => {
  const content = section?.content && typeof section.content === 'object' ? (section.content as Record<string, any>) : {};
  const type = String(section?.type || '').trim();

  if (type === 'guest_hero_auth') {
    return String(content.heroBackgroundUrl || content.sideImageUrl || '').trim();
  }

  if (type === 'hero') {
    return String(content.backgroundImage || content.background_image || '').trim();
  }

  return '';
};

const hasRenderableGuestContent = (section: any) => {
  const type = String(section?.type || '').trim();
  const content = section?.content && typeof section.content === 'object' ? section.content : {};

  if (type === 'guest_hero_auth') {
    return Boolean(
      String(content.headline || '').trim() ||
      String(content.subheadline || '').trim() ||
      String(content.authPanelTitle || '').trim()
    );
  }
  if (type === 'guest_what_is_scrolith') {
    return Boolean(
      String(content.title || '').trim() ||
      String(content.subtitle || '').trim() ||
      (Array.isArray(content.cards) && content.cards.length)
    );
  }
  if (type === 'guest_paths') {
    const freelancerBullets = Array.isArray(content.freelancerBullets) ? content.freelancerBullets : [];
    const employerBullets = Array.isArray(content.employerBullets) ? content.employerBullets : [];
    return Boolean(
      String(content.title || '').trim() ||
      String(content.subtitle || '').trim() ||
      freelancerBullets.length ||
      employerBullets.length
    );
  }
  if (type === 'guest_feature_showcase') {
    return Boolean(
      String(content.title || '').trim() ||
      String(content.subtitle || '').trim() ||
      (Array.isArray(content.tabs) && content.tabs.length)
    );
  }
  if (type === 'guest_trending_preview') {
    const hasPreviewData = Boolean(
      (Array.isArray(content.jobs) && content.jobs.length) ||
      (Array.isArray(content.gigs) && content.gigs.length) ||
      (Array.isArray(content.posts) && content.posts.length)
    );
    return hasPreviewData || content.showEmptyState === true;
  }
  if (type === 'guest_community_preview') {
    const hasPosts = Array.isArray(content.posts) && content.posts.length > 0;
    return hasPosts || content.showEmptyState === true;
  }
  if (type === 'guest_final_cta') {
    return Boolean(String(content.title || '').trim() || String(content.subtitle || '').trim());
  }
  return true;
};

const extractGuestHomepageSections = (payload: any): HomepageSection[] =>
  (Array.isArray(payload?.sections) ? payload.sections : null) ||
  (Array.isArray(payload?.data?.sections) ? payload.data.sections : null) ||
  [];

const extractGuestHomepageSeo = (payload: any): Record<string, any> | null =>
  payload?.seo || payload?.data?.seo || null;

const createInitialGuestHomepageState = () => {
  try {
    const payload = (CMSService as any).getGuestHomepageFallback?.();
    return {
      sections: extractGuestHomepageSections(payload),
      seo: extractGuestHomepageSeo(payload)
    };
  } catch {
    return { sections: [] as HomepageSection[], seo: null as Record<string, any> | null };
  }
};

const BRAND_LOGO_SMALL = '/logo-64.png';

const GuestHeroAuthFallback: React.FC<{ content?: Partial<GuestHeroAuthContent>; style?: any }> = ({
  content,
  style
}) => {
  const trustPoints = Array.isArray((content as any)?.trustPoints) && (content as any).trustPoints.length
    ? (content as any).trustPoints.slice(0, 3)
    : ['Realtime marketplace', 'Secure payments', 'Verified talent'];

  return (
    <section
      className="overflow-x-clip py-6 sm:py-12"
      style={{ background: style?.background || 'linear-gradient(180deg, #f8fafc 0%, #ffffff 55%, #f8fafc 100%)' }}
    >
      <div className="mx-auto grid w-full max-w-7xl min-w-0 gap-4 px-4 sm:gap-5 sm:px-6 lg:grid-cols-[1.08fr_0.92fr] lg:gap-8 lg:px-8">
        <div className="relative min-w-0 overflow-hidden rounded-[30px] border border-slate-200/90 bg-gradient-to-br from-white via-white to-indigo-50/45 p-5 shadow-[0_28px_70px_-32px_rgba(15,23,42,0.26)] sm:rounded-[34px] sm:p-7 lg:p-8">
          <div className="pointer-events-none absolute -left-12 -top-12 h-40 w-40 rounded-full bg-indigo-200/35 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 right-0 h-48 w-48 rounded-full bg-cyan-200/35 blur-3xl" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-indigo-300 to-transparent opacity-70" />
          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-gradient-to-r from-indigo-50 via-white to-indigo-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-700 shadow-[0_10px_24px_-18px_rgba(79,70,229,0.7)]">
                <img src={BRAND_LOGO_SMALL} alt="Scrolith" width={16} height={16} className="h-4 w-4 rounded-full object-contain" loading="eager" decoding="async" />
                Scrolith Enterprise
              </span>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-800 shadow-sm">
                Work - Market - AI - Community
              </span>
            </div>
            <div className="relative max-w-3xl">
              <div className="mb-3 flex items-center gap-3 text-[10px] font-bold uppercase tracking-[0.24em] text-slate-500 sm:text-[11px]">
                <span className="h-px w-8 bg-gradient-to-r from-indigo-500 to-cyan-400 sm:w-10" aria-hidden="true" />
                <span>One connected ecosystem</span>
              </div>
              <h1 className="max-w-[13ch] text-balance text-[clamp(2.35rem,8vw,4.75rem)] font-black leading-[0.98] tracking-[-0.055em] text-slate-950">
                <span className="bg-gradient-to-br from-slate-950 via-indigo-950 to-blue-700 bg-clip-text text-transparent">
                  {content?.headline || 'The All-in-One Platform for Work, Talent, and Community'}
                </span>
              </h1>
              <div className="mt-4 flex items-center gap-2" aria-hidden="true">
                <span className="h-1 w-14 rounded-full bg-gradient-to-r from-indigo-600 to-cyan-400" />
                <span className="h-1 w-2 rounded-full bg-cyan-300" />
                <span className="h-1 w-1 rounded-full bg-indigo-200" />
              </div>
            </div>
            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-slate-600 sm:text-base sm:leading-8">
              {content?.subheadline || 'Scrolith combines professional networking, freelance marketplace, messaging, payments, and AI workflows.'}
            </p>
            {content?.description ? (
              <p className="mt-3 max-w-2xl text-[14px] leading-7 text-slate-500 sm:text-sm sm:leading-7">{content.description}</p>
            ) : null}
            <p className="mt-3 max-w-2xl text-xs font-medium leading-6 text-slate-500 sm:text-[13px]">
              Join free in minutes. Start with a stronger feed, clearer opportunities, and an AI coach that understands work.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <a
                href={content?.primaryCtaUrl || '/auth/signup'}
                className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-slate-950 px-5 py-3.5 text-sm font-semibold text-white shadow-[0_18px_40px_-20px_rgba(15,23,42,0.7)] transition hover:bg-slate-800 sm:w-auto"
              >
                {content?.primaryCtaLabel || 'Create account'}
              </a>
              <a
                href={content?.secondaryCtaUrl || '/auth/login'}
                className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full border border-slate-300 bg-white/90 px-5 py-3.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 sm:w-auto"
              >
                {content?.secondaryCtaLabel || 'Log in'}
              </a>
            </div>
            <div className="mt-5 grid gap-2 min-[420px]:grid-cols-2 sm:grid-cols-3">
              {trustPoints.map((point: string, index: number) => (
                <div
                  key={`guest-hero-fallback-trust-${index}`}
                  className="min-w-0 rounded-2xl border border-slate-200/90 bg-gradient-to-br from-slate-50 via-white to-indigo-50/60 px-3 py-3 text-[11px] font-semibold text-slate-700 shadow-sm"
                >
                  <span className="block truncate">{point}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-[24px] border border-slate-200/80 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-4 text-white shadow-[0_24px_60px_-28px_rgba(15,23,42,0.6)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-indigo-200/85">Live work graph</p>
              <p className="mt-1 text-sm font-semibold text-white/95 sm:text-base">Work, talent, and commerce moving together in real time.</p>
              <div className="mt-4 grid gap-2 min-[420px]:grid-cols-3">
                {trustPoints.map((point: string, index: number) => (
                  <div key={`guest-hero-fallback-signal-${index}`} className="min-w-0 rounded-2xl border border-white/10 bg-white/8 p-3">
                    <div className="mb-2 h-1.5 w-10 rounded-full bg-gradient-to-r from-sky-500 to-cyan-500" />
                    <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">Live signal</p>
                    <p className="mt-1 truncate text-sm font-semibold text-white">{point}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="hidden min-h-[460px] rounded-[30px] border border-slate-200/90 bg-white/85 shadow-[0_28px_70px_-36px_rgba(15,23,42,0.25)] lg:block" aria-hidden="true" />
      </div>
    </section>
  );
};

class MemberHomeShellBoundary extends React.Component<
  React.PropsWithChildren<{}>,
  { hasError: boolean }
> {
  public state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Signed-in homepage render failed:', error);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="relative min-h-screen flex flex-col bg-[#f7f4ee] text-[#0b0b0a]">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 left-[-10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,#ffe9c7,transparent_65%)] opacity-70" />
          <div className="absolute top-24 right-[-12%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,#d8f1e5,transparent_65%)] opacity-80" />
        </div>
        <div className="mx-auto flex w-full max-w-2xl flex-1 items-center justify-center px-4 py-16">
          <div className="w-full rounded-[32px] border border-white/80 bg-white/95 p-8 text-center shadow-[0_24px_48px_-36px_rgba(15,23,42,0.32)]">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50">
              <img src={BRAND_LOGO_SMALL} alt="Scrolith" className="h-10 w-10 object-contain" />
            </div>
            <h1 className="text-2xl font-semibold text-slate-900">Home is reloading</h1>
            <p className="mt-3 text-sm leading-6 text-slate-500">
              The signed-in homepage hit a render issue. Reload the page to try again.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 inline-flex items-center justify-center rounded-full bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }
}

const Landing = () => {
  const t = useT();
  const [initialGuestHomepage] = useState(createInitialGuestHomepageState);
  const [sections, setSections] = useState<HomepageSection[]>(initialGuestHomepage.sections);
  const { user } = useUser();
  const { settings } = useContent();
  const { socket } = useSocket();
  const [guestSeo, setGuestSeo] = useState<Record<string, any> | null>(initialGuestHomepage.seo);
  const [loadError, setLoadError] = useState('');

  const normalizeSections = useCallback((data: HomepageSection[]) => {
    return data
      .map((section: any, index: number) => {
        let content = section.content;
        if (typeof content === "string") {
          try {
            content = JSON.parse(content);
          } catch {
            content = {};
          }
        }
        if (!content || typeof content !== "object" || Array.isArray(content)) {
          content = {};
        }

        let style = section.style;
        if (typeof style === "string") {
          try {
            style = JSON.parse(style);
          } catch {
            style = {};
          }
        }
        if (!style || typeof style !== "object" || Array.isArray(style)) {
          style = {};
        }

        const activeValue = section.isActive ?? section.is_active;
        const normalizedActive =
          section.isActive === undefined && section.is_active === undefined
            ? true
            : (typeof activeValue === "string"
                ? !["false", "0", "no", "off"].includes(activeValue.trim().toLowerCase())
                : Boolean(activeValue));

        const rawType =
          section.type ??
          section.sectionType ??
          section.section_type ??
          section.section ??
          section.name ??
          section.title;
        const normalizedType = normalizeSectionType(rawType);
        const positionValue =
          section.position ??
          section.sortOrder ??
          section.sort_order ??
          section.order ??
          section.index ??
          0;
        const parsedPosition = Number(positionValue);
        const position = Number.isFinite(parsedPosition) ? parsedPosition : 0;
        const targetRolesSource =
          section.targetRoles ??
          section.target_roles ??
          section.roles ??
          section.targeting?.roles ??
          [];
        const targetRoles = Array.isArray(targetRolesSource) ? targetRolesSource : [];

        return {
          ...section,
          id: section.id ?? section._id ?? section.uuid ?? `section-${index}`,
          type: normalizedType,
          sectionType: normalizedType,
          section_type: normalizedType,
          content,
          style,
          isActive: normalizedActive,
          is_active: normalizedActive,
          position,
          sortOrder: position,
          sort_order: position,
          targetRoles,
          target_roles: targetRoles,
          roles: targetRoles,
          targeting: {
            ...(section.targeting && typeof section.targeting === 'object' ? section.targeting : {}),
            roles: targetRoles
          },
          name: section.name || section.title || normalizedType || 'Section'
        };
      })
      .sort((a, b) => (a.position || 0) - (b.position || 0));
  }, []);

  const loadData = useCallback(async () => {
    try {
      const payload = await CMSService.getGuestHomepage();
      const nextSections = extractGuestHomepageSections(payload);
      const nextSeo = extractGuestHomepageSeo(payload);
      setSections(normalizeSections(nextSections));
      setGuestSeo(nextSeo);
      setLoadError('');
    } catch (error: any) {
      console.error('Failed to load guest homepage sections', error);
      const fallback = createInitialGuestHomepageState();
      setSections((prev) => (prev.length ? prev : fallback.sections));
      setGuestSeo((prev) => prev || fallback.seo);
      setLoadError(error?.message || 'Unable to load guest homepage.');
    }
  }, [normalizeSections]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!guestSeo) return;
    const title = String(guestSeo.title || '').trim();
    const metaDescription = String(guestSeo.metaDescription || '').trim();
    const keywords = Array.isArray(guestSeo.keywords)
      ? guestSeo.keywords.join(', ')
      : String(guestSeo.keywords || '').trim();
    const ogImage = String(guestSeo.ogImage || '').trim();

    if (title) document.title = title;

    const ensureMeta = (selector: string, attr: 'name' | 'property', value: string) => {
      if (!value) return;
      let node = document.querySelector(selector) as HTMLMetaElement | null;
      if (!node) {
        node = document.createElement('meta');
        node.setAttribute(attr, selector.includes('og:') ? selector.replace('meta[property="', '').replace('"]', '') : selector.replace('meta[name="', '').replace('"]', ''));
        document.head.appendChild(node);
      }
      node.setAttribute('content', value);
    };

    if (metaDescription) {
      let descriptionNode = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
      if (!descriptionNode) {
        descriptionNode = document.createElement('meta');
        descriptionNode.setAttribute('name', 'description');
        document.head.appendChild(descriptionNode);
      }
      descriptionNode.setAttribute('content', metaDescription);
    }
    if (keywords) {
      let keywordsNode = document.querySelector('meta[name="keywords"]') as HTMLMetaElement | null;
      if (!keywordsNode) {
        keywordsNode = document.createElement('meta');
        keywordsNode.setAttribute('name', 'keywords');
        document.head.appendChild(keywordsNode);
      }
      keywordsNode.setAttribute('content', keywords);
    }
    if (ogImage) {
      ensureMeta('meta[property="og:image"]', 'property', ogImage);
    }
  }, [guestSeo]);

  useEffect(() => {
    if (!socket) return;

    socket.on('cms:sections_updated', (updatedSections: HomepageSection[]) => {
      (CMSService as any).invalidateGuestHomepageCache?.();
      if (Array.isArray(updatedSections)) {
        setSections(normalizeSections(updatedSections));
      } else {
        loadData();
      }
    });

    socket.on('homepage:guest_updated', () => {
      (CMSService as any).invalidateGuestHomepageCache?.();
      loadData();
    });

    return () => {
      socket.off('cms:sections_updated');
      socket.off('homepage:guest_updated');
    };
  }, [socket, loadData, normalizeSections]);

  useEffect(() => {
    if (socket) return;
    const id = window.setInterval(() => {
      loadData();
    }, 30000);
    return () => window.clearInterval(id);
  }, [socket, loadData]);

  const activeSections = useMemo(() => sections.filter((section) => section.isActive), [sections]);

  const curatedGuestSections = useMemo(() => {
    if (user) return activeSections;
    const guestOnly = activeSections.filter((section) => isGuestSectionType(section.type));
    const source = guestOnly.length ? guestOnly : activeSections;
    const heroSection = source.find((section) => String(section.type) === 'guest_hero_auth');
    const heroContent = heroSection?.content && typeof heroSection.content === 'object' ? heroSection.content : {};
    const compactMode = heroContent?.compactMode !== false;
    const rawMaxSections = Number(heroContent?.maxSections);
    const maxSections = Number.isFinite(rawMaxSections)
      ? Math.max(3, Math.min(8, Math.trunc(rawMaxSections)))
      : 5;

    const meaningful = source.filter((section) => hasRenderableGuestContent(section));
    const ranked = [...meaningful].sort((a, b) => {
      const aType = String(a.type || '');
      const bType = String(b.type || '');
      const aRank = GUEST_SECTION_PRIORITY.indexOf(aType);
      const bRank = GUEST_SECTION_PRIORITY.indexOf(bType);
      if (aRank !== bRank) {
        return (aRank === -1 ? Number.MAX_SAFE_INTEGER : aRank) - (bRank === -1 ? Number.MAX_SAFE_INTEGER : bRank);
      }
      return Number(a.position || 0) - Number(b.position || 0);
    });

    if (!compactMode) return ranked;

    const deduped: HomepageSection[] = [];
    const seenTypes = new Set<string>();
    ranked.forEach((section) => {
      const type = String(section.type || '');
      if (seenTypes.has(type)) return;
      seenTypes.add(type);
      deduped.push(section);
    });
    return deduped.slice(0, maxSections);
  }, [activeSections, user]);

  const hasMemberHome = useMemo(
    () => activeSections.some((section) => section.type === 'member_home'),
    [activeSections]
  );

  const effectiveSections = useMemo<RenderSection[]>(() => {
    if (!user) return curatedGuestSections;
    if (hasMemberHome) return activeSections;

    const memberHomeSettings = (settings as any)?.memberHome || {};
    const widgets = memberHomeSettings.widgets || {};
    const syntheticMemberHome: HomepageSection = {
      id: `member-home-default-${user.id}`,
      type: 'member_home' as any,
      name: 'Member Home',
      isActive: true,
      position: 0,
      content: {
        showStories: widgets.storiesEnabled,
        showComposer: widgets.postComposerEnabled,
        showProfiles: widgets.suggestionsEnabled,
        showMessages: widgets.recentMessagesEnabled,
        showProfileViewers: widgets.profileViewersEnabled
      } as any
    };
    return [syntheticMemberHome];
  }, [user, activeSections, curatedGuestSections, hasMemberHome, settings]);

  const renderSections = useMemo<RenderSection[]>(() => {
    const active = effectiveSections;
    if (!user) return active;
    const heroIndex = active.findIndex(section => section.type === 'hero');
    if (heroIndex === -1) return active;
    const injected = [...active];
    injected.splice(heroIndex + 1, 0, {
      id: `recommendations-${user.id}`,
      type: 'recommendations',
      isActive: true,
      position: active[heroIndex].position + 1,
      name: 'Recommendations'
    });
    return injected;
  }, [effectiveSections, user]);

  const landingHeroImage = useMemo(() => {
    if (user) return '';
    const heroSection = renderSections.find(
      (section) => section.type === 'guest_hero_auth' || section.type === 'hero'
    ) as HomepageSection | undefined;
    const rawHeroImage = resolveLandingHeroImage(heroSection);
    return rawHeroImage
      ? resolveResponsiveAssetUrl(rawHeroImage, { width: 960, height: 720, fit: 'cover', quality: 72 })
      : '';
  }, [renderSections, user]);

  useEffect(() => {
    upsertImagePreloadLink('landing-lcp-image', landingHeroImage || null, { fetchPriority: 'high' });
    return () => {
      upsertImagePreloadLink('landing-lcp-image', null);
    };
  }, [landingHeroImage]);

  if (user) {
    return (
      <MemberHomeShellBoundary>
        <MemberHomeSection />
      </MemberHomeShellBoundary>
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col bg-[#f7f4ee] text-[#0b0b0a]">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 left-[-10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,#ffe9c7,transparent_65%)] opacity-70" />
        <div className="absolute top-24 right-[-12%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,#d8f1e5,transparent_65%)] opacity-80" />
      </div>

      {renderSections.filter(s => s.isActive).map((section, index) => (
        <DeferredLandingSection
          key={section.id}
          section={section}
          userId={user?.id}
          eager={index === 0}
        />
      ))}
        {renderSections.length === 0 && (
          <div className="py-20 text-center text-gray-400">
            <p>{loadError || t('landing.no_sections_configured', 'No content sections configured. Please configure via Admin Dashboard.')}</p>
            <button
              type="button"
              onClick={() => {
                (CMSService as any).invalidateGuestHomepageCache?.();
                loadData();
              }}
              className="mt-4 inline-flex rounded-full border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Retry
            </button>
          </div>
        )}
    </div>
  );
};

const SectionFallback: React.FC<{ section: RenderSection }> = ({ section }) => {
  if (section.type === 'guest_hero_auth') {
    return <GuestHeroAuthFallback content={section.content as GuestHeroAuthContent} style={section.style} />;
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="h-48 rounded-3xl border border-slate-200 bg-white/70 shadow-sm" aria-hidden="true" />
    </div>
  );
};

const DEFERRED_SECTION_ROOT_MARGIN = '800px 0px';

const DeferredLandingSection: React.FC<{
  section: RenderSection;
  userId?: string;
  eager?: boolean;
}> = ({ section, userId, eager = false }) => {
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [isReady, setIsReady] = useState(eager);

  useEffect(() => {
    if (isReady || !host) return;

    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      setIsReady(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        setIsReady(true);
        observer.disconnect();
      },
      { rootMargin: DEFERRED_SECTION_ROOT_MARGIN }
    );

    observer.observe(host);
    return () => observer.disconnect();
  }, [host, isReady]);

  return (
    <div
      ref={setHost}
      className={isReady ? undefined : 'min-h-[360px]'}
      style={isReady ? undefined : { contain: 'layout paint', containIntrinsicSize: '360px' }}
      aria-busy={!isReady}
    >
      {isReady ? (
        <Suspense key={section.id} fallback={<SectionFallback section={section} />}>
          <SectionRenderer section={section} userId={userId} />
        </Suspense>
      ) : null}
    </div>
  );
};

const SectionRenderer: React.FC<{ section: RenderSection; userId?: string }> = ({ section, userId }) => {
  switch (section.type) {
    case 'hero': return <HeroAISection content={section.content as HeroContent} />;
    case 'project_brief_generator': return <AIProjectBriefGenerator content={section.content as ProjectBriefContent} />;
    case 'top_pro_services': return <TopProServices content={section.content as TopProServicesContent} />;
    case 'trust_security': return <TrustSecurity content={section.content as TrustSecurityContent} />;
    case 'skill_matching': return <AISkillMatchBar />;
    case 'trending_opps': return <TrendingOpportunities content={section.content as TrendingOppsContent} />;
    case 'growth_dash': return <FreelancerGrowthDashboard content={section.content as GrowthDashContent} />;
    case 'gig_creation': return <AIGigCreationCTA content={section.content as GigCreationContent} />;
    case 'market_insights': return <MarketplaceInsights content={section.content as MarketInsightsContent} />;
    case 'trust': return <TrustSection content={section.content as any} style={section.style} />;
    case 'categories': return <CategoriesSection content={section.content as any} />;
    case 'how_it_works': return <HowItWorksSection content={section.content as any} />;
    case 'featured': return <FeaturedSection content={section.content as any} style={section.style} />;
    case 'cta': return <CTASection content={section.content as any} style={section.style} />;
    case 'popular_services': return <PopularServicesSection content={section.content as PopularServicesContent} style={section.style} />;
    case 'promo_banners': return <PromoBannersSection content={section.content as PromoBannersContent} style={section.style} />;
    case 'trust_value': return <TrustValueSection content={section.content as TrustValueContent} style={section.style} />;
    case 'video_feature': return <VideoFeatureSection content={section.content as VideoFeatureContent} style={section.style} />;
    case 'marketplace_tiles': return <MarketplaceTilesSection content={section.content as MarketplaceTilesContent} style={section.style} />;
    case 'guides_grid': return <GuidesGridSection content={section.content as GuidesGridContent} style={section.style} />;
    case 'made_on_Scrolith': return <MadeOnScrolithSection content={section.content as MadeOnScrolithContent} style={section.style} />;
    case 'footer_cta_strip': return <FooterCtaStripSection content={section.content as FooterCtaStripContent} style={section.style} />;
    case 'guest_hero_auth': return <GuestHeroAuthSection content={section.content as GuestHeroAuthContent} style={section.style} />;
    case 'guest_what_is_scrolith': return <GuestWhatIsScrolithSection content={section.content as GuestWhatIsScrolithContent} style={section.style} />;
    case 'guest_paths': return <GuestPathsSection content={section.content as GuestPathsContent} style={section.style} />;
    case 'guest_feature_showcase': return <GuestFeatureShowcaseSection content={section.content as GuestFeatureShowcaseContent} style={section.style} />;
    case 'guest_trending_preview': return <GuestTrendingPreviewSection content={section.content as GuestTrendingPreviewContent} style={section.style} />;
    case 'guest_community_preview': return <GuestCommunityPreviewSection content={section.content as GuestCommunityPreviewContent} style={section.style} />;
    case 'guest_final_cta': return <GuestFinalCtaSection content={section.content as GuestFinalCtaContent} style={section.style} />;
    case 'member_home': return <MemberHomeSection content={section.content as any} />;
    case 'recommendations': return userId ? <Recommendations userId={userId} /> : null;
    default: return null;
  }
};

export default Landing;

