import React, { useEffect, useState, Suspense, useMemo, useCallback } from 'react';
import { Loader } from 'lucide-react';
import { Navigate, useLocation } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import { useContent } from '../context/ContentContext';
import { useSocket } from '../context/SocketContext';
import { useT } from '../i18n/useT';
import { CMSService } from '../services/cms';
import {
  HomepageSection,
  HeroContent,
  HeroSearchConfig,
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
  HomeSlide,
  HeaderConfig,
  UserRole
} from '../types';
import Recommendations from '../components/Recommendations';
import TrendingCategoriesStrip from '../components/TrendingCategoriesStrip';
import HomeSlider from '../components/HomeSlider';
import {
  PopularServicesSection,
  PromoBannersSection,
  TrustValueSection,
  VideoFeatureSection,
  MarketplaceTilesSection,
  GuidesGridSection,
  MadeOnScrolithSection,
  FooterCtaStripSection,
} from '../components/sections/GuestSections';

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
    default:
      return cleaned;
  }
};

const Landing = () => {
  const location = useLocation();
  const t = useT();
  const [sections, setSections] = useState<HomepageSection[]>([]);
  const [slides, setSlides] = useState<HomeSlide[]>([]);
  const [heroConfig, setHeroConfig] = useState<HeroSearchConfig | null>(null);
  const [headerConfig, setHeaderConfig] = useState<HeaderConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();
  const { settings } = useContent();
  const { socket } = useSocket();
  const [isMobileViewport, setIsMobileViewport] = useState(
    () => (typeof window !== 'undefined' ? window.innerWidth < 900 : false)
  );

  useEffect(() => {
    const onResize = () => setIsMobileViewport(window.innerWidth < 900);
    window.addEventListener('resize', onResize, { passive: true });
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const allowDesktopOverride =
    new URLSearchParams(location.search).get('desktop') === '1' ||
    new URLSearchParams(location.search).get('view') === 'desktop';

  // Logged-in mobile home uses the dedicated LinkedIn-style shell for best UX.
  if (user && isMobileViewport && !allowDesktopOverride) {
    return <Navigate to="/m/home" replace />;
  }

  const userRole = user?.role;
  const effectiveRole = userRole || UserRole.GUEST;

  const normalizeSections = useCallback((data: HomepageSection[]) => {
    return data
      .map((section: any, index: number) => {
        let content = section.content;
        if (typeof content === "string") {
          try {
            content = JSON.parse(content);
          } catch {
            // Leave content as-is if not valid JSON.
          }
        }

        let style = section.style;
        if (typeof style === "string") {
          try {
            style = JSON.parse(style);
          } catch {
            // Leave style as-is if not valid JSON.
          }
        }

        const activeValue = section.isActive ?? section.is_active ?? section.enabled ?? section.is_enabled;
        const normalizedActive =
          section.isActive === undefined && section.is_active === undefined
            ? true
            : (typeof activeValue === "string"
                ? !["false", "0", "no", "off"].includes(activeValue.toLowerCase())
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

        return {
          ...section,
          id: section.id ?? section._id ?? section.uuid ?? `section-${index}`,
          type: normalizedType,
          content,
          style,
          isActive: normalizedActive,
          position,
          name: section.name || section.title || normalizedType || 'Section'
        };
      })
      .sort((a, b) => (a.position || 0) - (b.position || 0));
  }, []);

  const loadData = useCallback(async () => {
    const [sectionsResult, slidesResult, heroResult, headerResult] = await Promise.allSettled([
      CMSService.getHomepageSections({ role: effectiveRole }),
      CMSService.getHomeSlides(),
      CMSService.getHeroSearchConfig(),
      CMSService.getHeaderConfig()
    ]);

    if (sectionsResult.status === 'fulfilled') {
      const nextSections = Array.isArray(sectionsResult.value) ? sectionsResult.value : [];
      setSections(normalizeSections(nextSections));
    } else {
      console.error('Failed to load homepage sections', sectionsResult.reason);
      setSections([]);
    }

    if (slidesResult.status === 'fulfilled') {
      setSlides(Array.isArray(slidesResult.value) ? slidesResult.value : []);
    } else {
      console.error('Failed to load homepage slides', slidesResult.reason);
      setSlides([]);
    }

    if (heroResult.status === 'fulfilled') {
      setHeroConfig(heroResult.value as any as HeroSearchConfig);
    } else {
      console.error('Failed to load hero search config', heroResult.reason);
      setHeroConfig(null);
    }

    if (headerResult.status === 'fulfilled') {
      setHeaderConfig(headerResult.value as any as HeaderConfig);
    } else {
      console.error('Failed to load header config', headerResult.reason);
      setHeaderConfig(null);
    }

    setLoading(false);
  }, [effectiveRole, normalizeSections]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!socket) return;

    socket.on('cms:sections_updated', (updatedSections: HomepageSection[]) => {
      if (Array.isArray(updatedSections)) {
        setSections(normalizeSections(updatedSections));
      } else {
        loadData();
      }
    });

    socket.on('cms:slides_updated', (updatedSlides: HomeSlide[]) => {
      if (Array.isArray(updatedSlides)) {
        setSlides(updatedSlides);
      } else {
        loadData();
      }
    });

    socket.on('cms:hero_updated', () => {
      loadData();
    });
    socket.on('cms:hero_search_updated', () => {
      loadData();
    });
    socket.on('cms:header_updated', () => {
      loadData();
    });

    return () => {
      socket.off('cms:sections_updated');
      socket.off('cms:slides_updated');
      socket.off('cms:hero_updated');
      socket.off('cms:hero_search_updated');
      socket.off('cms:header_updated');
    };
  }, [socket, loadData, normalizeSections]);

  useEffect(() => {
    if (socket) return;
    const id = window.setInterval(() => {
      loadData();
    }, 5000);
    return () => window.clearInterval(id);
  }, [socket, loadData]);

  const activeSections = useMemo(() => sections.filter((section) => section.isActive), [sections]);

  const hasMemberHome = useMemo(
    () => activeSections.some((section) => section.type === 'member_home'),
    [activeSections]
  );

  const effectiveSections = useMemo<RenderSection[]>(() => {
    if (!user) return activeSections;
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
  }, [user, activeSections, hasMemberHome, settings]);

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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <Loader className="animate-spin text-blue-600 w-10 h-10 mx-auto mb-4" />
          <p className="text-gray-500 font-medium">Loading Marketplace...</p>
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

      {!user ? (
        <>
          <div className="relative z-20">
            <TrendingCategoriesStrip />
          </div>

          <div className="relative z-10">
            <HomeSlider
              slides={slides}
              heroConfig={heroConfig}
              searchMode={(() => {
                if (!headerConfig) return 'keyword';
                const h = headerConfig as Record<string, unknown>;
                return (h['searchMode'] as string) || (h['search_mode'] as string) || 'keyword';
              })()}
            />
          </div>
        </>
      ) : null}

      <Suspense fallback={<div className="py-24 text-center"><Loader className="animate-spin mx-auto w-8 h-8 text-gray-400" /></div>}>
        {renderSections.filter(s => s.isActive).map((section) => (
          <React.Fragment key={section.id}>
            <SectionRenderer section={section} userId={user?.id} />
          </React.Fragment>
        ))}
        {renderSections.length === 0 && (
          <div className="py-20 text-center text-gray-400">
            <p>{t('landing.no_sections_configured', 'No content sections configured. Please configure via Admin Dashboard.')}</p>
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
    case 'member_home': return <MemberHomeSection content={section.content as any} />;
    case 'recommendations': return userId ? <Recommendations userId={userId} /> : null;
    default: return null;
  }
};

export default Landing;

