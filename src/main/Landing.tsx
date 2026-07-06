import React, { useEffect, useState, Suspense, useMemo, useCallback, lazy } from 'react';
import { LoaderIcon } from '../components/icons/ShellIcons';
import { Navigate, useLocation } from 'react-router-dom';
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
import { TrustSection, CategoriesSection, HowItWorksSection, FeaturedSection, CTASection } from '../components/sections/LegacySections';

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
              <img src="/logo.png" alt="Scrolith" className="h-10 w-10 object-contain" />
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
  const [loading, setLoading] = useState(initialGuestHomepage.sections.length === 0);
  const { user } = useUser();
  const { settings } = useContent();
  const { socket } = useSocket();
  const [guestSeo, setGuestSeo] = useState<Record<string, any> | null>(initialGuestHomepage.seo);
  const [loadError, setLoadError] = useState('');
  const location = useLocation();

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
    } finally {
      setLoading(false);
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
      if (Array.isArray(updatedSections)) {
        setSections(normalizeSections(updatedSections));
      } else {
        loadData();
      }
    });

    socket.on('homepage:guest_updated', () => {
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

  if (loading) {
    return (
      <div className="relative min-h-screen flex flex-col bg-[#f7f4ee] text-[#0b0b0a]">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-32 left-[-10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,#ffe9c7,transparent_65%)] opacity-70" />
          <div className="absolute top-24 right-[-12%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,#d8f1e5,transparent_65%)] opacity-80" />
        </div>
        <div className="h-[620px] sm:h-[660px] md:h-[710px] lg:h-[760px] xl:h-[820px] bg-slate-900/90 animate-pulse" />
        <div className="mx-auto w-full max-w-7xl px-4 py-10 space-y-5">
          <div className="h-10 w-1/2 rounded-md bg-slate-200 animate-pulse" />
          <div className="h-6 w-1/3 rounded-md bg-slate-200 animate-pulse" />
          <div className="h-64 rounded-2xl bg-slate-200 animate-pulse" />
          <div className="h-64 rounded-2xl bg-slate-200 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen flex flex-col bg-[#f7f4ee] text-[#0b0b0a]">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 left-[-10%] h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,#ffe9c7,transparent_65%)] opacity-70" />
        <div className="absolute top-24 right-[-12%] h-[520px] w-[520px] rounded-full bg-[radial-gradient(circle_at_center,#d8f1e5,transparent_65%)] opacity-80" />
      </div>

      <Suspense fallback={<div className="py-24 text-center"><LoaderIcon className="animate-spin mx-auto w-8 h-8 text-gray-400" /></div>}>
        {renderSections.filter(s => s.isActive).map((section) => (
          <React.Fragment key={section.id}>
            <SectionRenderer section={section} userId={user?.id} />
          </React.Fragment>
        ))}
        {renderSections.length === 0 && (
          <div className="py-20 text-center text-gray-400">
            <p>{loadError || t('landing.no_sections_configured', 'No content sections configured. Please configure via Admin Dashboard.')}</p>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                loadData();
              }}
              className="mt-4 inline-flex rounded-full border border-gray-300 px-4 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
            >
              Retry
            </button>
          </div>
        )}
      </Suspense>
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

