
import React, { useEffect, useState, Suspense } from 'react';
import { Loader } from 'lucide-react';
import { useUser } from '../context/UserContext';
import { CMSService } from '../services/cms';
import { HomepageSection, HeroContent, TrustContent, CategoriesContent, FeaturedContent, HowItWorksContent, CTAContent, SkillMatchingContent, TrendingOppsContent, GrowthDashContent, GigCreationContent, MarketInsightsContent, HomeSlide, ProjectBriefContent, TopProServicesContent, TrustSecurityContent } from '../types';
import Recommendations from '../components/Recommendations';
import TrendingCategoriesStrip from '../components/TrendingCategoriesStrip';
import HomeSlider from '../components/HomeSlider';

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

// Legacy Sections (Direct Import or Lazy if possible)
import { TrustSection, CategoriesSection, HowItWorksSection, FeaturedSection, CTASection } from '../components/sections/LegacySections'; 

const Landing = () => {
  const [sections, setSections] = useState<HomepageSection[]>([]);
  const [slides, setSlides] = useState<HomeSlide[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useUser();

  // Depend on user ID/role rather than the full object to prevent unnecessary re-fetches
  const userId = user?.id;
  const userRole = user?.role;

  useEffect(() => {
    let mounted = true;

    const fetchData = async () => {
        try {
            // Fetch with fast timeout handled by service
            const [fetchedSections, fetchedSlides] = await Promise.all([
                CMSService.getHomepageSections({ 
                    role: userRole, 
                    location: user?.location 
                }),
                CMSService.getHomeSlides()
            ]);
            
            if (mounted) {
                // Ensure we always have sections to render, even if API fails (CMSService should return defaults, but extra safety here)
                setSections(fetchedSections && fetchedSections.length > 0 ? fetchedSections.filter(s => s.isActive) : []);
                setSlides(fetchedSlides || []);
            }
        } catch (error) {
            console.error("Failed to load landing data", error);
        } finally {
            if (mounted) setLoading(false);
        }
    };
    fetchData();

    return () => {
        mounted = false;
    };
  }, [userId, userRole]);

  return (
    <>
      {loading ? (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <Loader className="animate-spin text-blue-600 w-10 h-10 mx-auto mb-4" />
            <p className="text-gray-500 font-medium">Loading Marketplace...</p>
          </div>
        </div>
      ) : (
        <div className="bg-white min-h-screen flex flex-col">
          {/* 1. Trending Categories Strip (Fixed Top) */}
          <div className="sticky top-16 z-20">
             <TrendingCategoriesStrip />
          </div>

          {/* 2. Home Slider */}
          <div className="relative z-10">
             <HomeSlider slides={slides} />
          </div>

          {/* 3. Dynamic CMS Sections */}
          <Suspense fallback={<div className="py-24 text-center"><Loader className="animate-spin mx-auto w-8 h-8 text-gray-400" /></div>}>
              {sections.length === 0 ? (
                  // Fallback content if sections are empty (shouldn't happen with CMS defaults)
                   <div className="py-20 text-center text-gray-500">
                       <p>Welcome to Scrolith. Browse our categories to get started.</p>
                   </div>
              ) : (
                  sections.map((section) => (
                    <React.Fragment key={section.id}>
                        <SectionRenderer section={section} />
                        {/* Special Case: Inject Personalized Recommendations after Hero if logged in */}
                        {section.type === 'hero' && user && (
                            <Recommendations userId={user.id} />
                        )}
                    </React.Fragment>
                  ))
              )}
          </Suspense>
        </div>
      )}
    </>
  );
};

const SectionRenderer: React.FC<{ section: HomepageSection }> = ({ section }) => {
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
    
    // Legacy Sections
    case 'trust': return <TrustSection content={section.content as TrustContent} style={section.style} />;
    case 'categories': return <CategoriesSection content={section.content as CategoriesContent} />;
    case 'how_it_works': return <HowItWorksSection content={section.content as HowItWorksContent} />;
    case 'featured': return <FeaturedSection content={section.content as FeaturedContent} style={section.style} />;
    case 'cta': return <CTASection content={section.content as CTAContent} style={section.style} />;
    
    default: return null;
  }
};

export default Landing;
