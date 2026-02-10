
import { PlatformSettings, HomepageSection, HomeSlide, HeaderConfig, FooterConfig, TrendingConfig, ActivityConfig, UserRole, HeroSearchConfig } from '../types';

const API_URL = '/api'; 

// --- CIRCUIT BREAKER & CACHE ---
const CIRCUIT_KEY = 'scrolith_api_circuit';
const requestCache = new Map<string, Promise<any>>();
const CACHE_DURATION = 60000; // 60 seconds cache
const REQUEST_TIMEOUT = 5000; // 5 seconds timeout (Increased from 500ms)

const checkCircuit = () => {
    try {
        const stored = localStorage.getItem(CIRCUIT_KEY);
        if (stored) {
            const { resetTime } = JSON.parse(stored);
            if (Date.now() < resetTime) return false;
            localStorage.removeItem(CIRCUIT_KEY);
        }
        return true;
    } catch (e) {
        return true;
    }
};

const tripCircuit = () => {
    console.warn("[CMS] Circuit Tripped: Switching to Offline Mode.");
    const resetTime = Date.now() + 60000; // 1 minute cooldown
    localStorage.setItem(CIRCUIT_KEY, JSON.stringify({ resetTime }));
};

// --- API HELPER ---
const api = {
    get: async (endpoint: string) => {
        // 1. Circuit Breaker
        if (!checkCircuit()) return null;

        // 2. Cache
        const cacheKey = `GET:${endpoint}`;
        if (requestCache.has(cacheKey)) return requestCache.get(cacheKey);

        const requestPromise = (async () => {
            try {
                const controller = new AbortController();
                const id = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
                
                const res = await fetch(`${API_URL}${endpoint}`, { signal: controller.signal });
                clearTimeout(id);
                
                if (res.status === 429 || res.status >= 500) {
                    tripCircuit();
                    return null;
                }
                if (!res.ok) return null;
                
                return await res.json();
            } catch (e) {
                // Network error or timeout -> return null to trigger fallback
                return null;
            } finally {
                setTimeout(() => requestCache.delete(cacheKey), CACHE_DURATION);
            }
        })();

        requestCache.set(cacheKey, requestPromise);
        return requestPromise;
    },
    post: async (endpoint: string, data: any) => {
        if (!checkCircuit()) return { success: false };
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
                signal: controller.signal
            });
            clearTimeout(id);
            if (res.status === 429) tripCircuit();
            if (!res.ok) return { success: false };
            return await res.json();
        } catch (e) {
            return { success: false };
        }
    }
};

// --- DEFAULT DATA (FALLBACKS) ---

const DEFAULT_HEADER: HeaderConfig = {
    id: 'default', homeUrl: '/', variant: 'light', searchEnabled: true, searchMode: 'keyword', logoUrl: '', faviconUrl: '',
    navigation: [
        { id: 'n1', label: 'Find Talent', url: '/browse', visibility: [UserRole.GUEST, UserRole.EMPLOYER, UserRole.ADMIN, UserRole.FREELANCER] },
        { id: 'n2', label: 'Find Work', url: '/browse-jobs', visibility: [UserRole.GUEST, UserRole.FREELANCER, UserRole.ADMIN] },
        { id: 'n3', label: 'Community', url: '/community', visibility: [UserRole.GUEST, UserRole.FREELANCER, UserRole.EMPLOYER, UserRole.ADMIN] }
    ],
    actions: { notifications: true, messages: true, orders: true, lists: true, switchSelling: true, profile: true },
    profileMenu: [
        { id: 'pm1', label: 'Dashboard', url: '/dashboard', visibility: [UserRole.FREELANCER, UserRole.EMPLOYER, UserRole.ADMIN] },
        { id: 'pm2', label: 'Settings', url: '/settings', visibility: [UserRole.FREELANCER, UserRole.EMPLOYER, UserRole.ADMIN] }
    ]
};

const DEFAULT_FOOTER: FooterConfig = {
    id: 'default', description: 'The next-generation freelance marketplace connecting employers with top talent.', copyright: '© 2024 Scrolith Inc.', logoUrl: '',
    columns: [
        { id: 'c1', title: 'Support', links: [{ id: 'l1', label: 'Help Center', url: '/support', type: 'internal', visibility: [] }] },
        { id: 'c2', title: 'Community', links: [{ id: 'l2', label: 'Forum', url: '/community/forum', type: 'internal', visibility: [] }, { id: 'l3', label: 'Events', url: '/community/events', type: 'internal', visibility: [] }] }
    ],
    contact: { adminEmail: 'admin@scrolith.com', supportEmail: 'support@scrolith.com', ticketRoute: '/support' },
    socials: [
        { id: 's1', platform: 'Twitter', url: '#', enabled: true, icon: '' },
        { id: 's2', platform: 'LinkedIn', url: '#', enabled: true, icon: '' }
    ]
};

const DEFAULT_HERO: HeroSearchConfig = {
    headline: "Find the perfect freelance services",
    subheadline: "Connect with top talent, manage projects, and pay securely via Escrow.",
    searchPlaceholder: "Try 'Logo Design' or 'React Developer'...",
    searchSize: "large",
    quickTags: [
        { id: 'qt1', label: 'Web Development', url: '/browse?category=Development', color: 'blue' },
        { id: 'qt2', label: 'Graphic Design', url: '/browse?category=Design', color: 'purple' },
        { id: 'qt3', label: 'Writing', url: '/browse?category=Writing', color: 'green' }
    ],
    trustedBrands: { 
        enabled: true, 
        title: "Trusted by industry leaders", 
        logos: [
            { id: 'tb1', src: 'https://upload.wikimedia.org/wikipedia/commons/2/2f/Google_2015_logo.svg', alt: 'Google' },
            { id: 'tb2', src: 'https://upload.wikimedia.org/wikipedia/commons/5/51/IBM_logo.svg', alt: 'IBM' },
            { id: 'tb3', src: 'https://upload.wikimedia.org/wikipedia/commons/a/a9/Amazon_logo.svg', alt: 'Amazon' }
        ] 
    },
    valueProp: { enabled: true, heading: "Why us?", badges: [] }
};

const DEFAULT_SECTIONS: HomepageSection[] = [
    { id: 'hero', type: 'hero', name: 'Hero', isActive: true, position: 1, content: DEFAULT_HERO },
    { id: 'skill_match', type: 'skill_matching', name: 'AI Match', isActive: true, position: 2, content: {} },
    { id: 'top_pro', type: 'top_pro_services', name: 'Pro Services', isActive: true, position: 3, content: { title: "Top Rated Professional Services" } },
    { id: 'market', type: 'market_insights', name: 'Market Insights', isActive: true, position: 4, content: { title: "Trending in the Market" } },
    { id: 'trust', type: 'trust_security', name: 'Trust & Safety', isActive: true, position: 5, content: { title: "Your Safety is Our Priority" } },
    { id: 'cta', type: 'cta', name: 'Bottom CTA', isActive: true, position: 6, content: { headline: "Ready to get started?", subheadline: "Join our community today.", buttonText: "Join Now", buttonLink: "/auth/signup" }, style: { theme: 'blue' } }
];

const DEFAULT_SLIDES: HomeSlide[] = [
    {
        id: 'slide-1', mediaType: 'image',
        mediaUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1920&q=80',
        title: 'Unlock Your Potential', subtitle: 'Find the best freelance jobs in tech, design, and marketing.',
        redirectUrl: '/browse', roleVisibility: [UserRole.GUEST, UserRole.FREELANCER, UserRole.EMPLOYER],
        sortOrder: 1, isActive: true, createdAt: '', updatedAt: '', backgroundColor: '#111827'
    }
];

export const CMSService = {
    getSettings: async (): Promise<PlatformSettings> => {
        const data = await api.get('/admin/settings');
        return data || {
            siteName: 'Scrolith', tagline: 'The Freelance Marketplace', logoUrl: '', faviconUrl: '',
            adminEmail: 'admin@scrolith.com', supportEmail: 'support@scrolith.com',
            footerAboutTitle: 'About Scrolith', footerAboutText: 'Connecting talent with opportunity.', footerCopyright: '© 2024 Scrolith Inc.',
            footerLinks: [], socialLinks: [],
            system: { maintenanceMode: false, registrationsEnabled: true, kycEnforced: false, admin2FA: false }
        };
    },

    updateSettings: async (settings: Partial<PlatformSettings>) => api.post('/admin/settings/update', settings).then(r => r?.data || settings),

    getHomepageSections: async (options?: { role?: UserRole; location?: string }) => {
        const data = await api.get('/cms/homepage/sections');
        let sections: HomepageSection[] = data || DEFAULT_SECTIONS;
        
        if (options?.role) {
            sections = sections.filter(s => {
                if (!s.targeting || !s.targeting.roles || s.targeting.roles.length === 0) return true;
                return s.targeting.roles.includes(options.role!);
            });
        }
        return sections;
    },

    saveHomepageSection: async (section: HomepageSection) => api.post('/cms/homepage/sections/update', section),
    
    getHomeSlides: async (): Promise<HomeSlide[]> => {
        const data = await api.get('/cms/slides');
        return data || DEFAULT_SLIDES;
    },
    
    saveHomeSlide: async (slide: HomeSlide) => api.post('/cms/slides/save', slide),
    deleteHomeSlide: async (id: string) => api.post('/cms/slides/delete', { id }),
    updateHomeSlideOrder: async (slides: HomeSlide[]) => api.post('/cms/slides/reorder', { slides }),

    getHeroSearchConfig: async () => (await api.get('/cms/hero-search')) || DEFAULT_HERO,
    saveHeroSearchConfig: async (config: HeroSearchConfig) => api.post('/cms/hero-search', config),

    getHeaderConfig: async () => (await api.get('/cms/header')) || DEFAULT_HEADER,
    saveHeaderConfig: async (config: HeaderConfig) => api.post('/cms/header', config),
    
    getFooterConfig: async () => (await api.get('/cms/footer')) || DEFAULT_FOOTER,
    saveFooterConfig: async (config: FooterConfig) => api.post('/cms/footer', config),

    getTrendingConfig: async () => (await api.get('/cms/trending')) || { enabled: true, title: 'Trending Categories', categoryIds: [], visibility: ['guest', 'freelancer', 'employer'], scrollBehavior: 'manual', autoSlideInterval: 5000 },
    saveTrendingConfig: async (config: TrendingConfig) => api.post('/cms/trending', config),

    getActivityConfig: async () => (await api.get('/cms/activity')) || { 
        icons: [
            { id: 'notif', type: 'notifications', label: 'Notifications', isEnabled: true, showLabel: false, sortOrder: 1, roles: [UserRole.FREELANCER, UserRole.EMPLOYER, UserRole.ADMIN] },
            { id: 'msg', type: 'messages', label: 'Messages', isEnabled: true, showLabel: false, sortOrder: 2, roles: [UserRole.FREELANCER, UserRole.EMPLOYER, UserRole.ADMIN] }
        ], 
        helpMenu: [], 
        design: { iconStyle: 'outline', iconSize: 20, badgeColor: '#EF4444', showBadges: true } 
    },
    saveActivityConfig: async (config: ActivityConfig) => api.post('/cms/activity', config),

    // Stubs with correct signatures to prevent runtime errors
    getLandingContent: async () => ({}),
    uploadMedia: async (file: File) => ({ id: Date.now().toString(), url: URL.createObjectURL(file), name: file.name, type: 'image', size: file.size, createdAt: '' }),
    
    getTemplates: async () => [],
    saveTemplate: async (t: any) => t,
    loadTemplate: async () => null,
    getABTests: async () => [],
    createABTest: async (t: any) => t,
    saveABTest: async (t: any) => t,
    getHomepageAnalytics: async () => ({ views: 12500, ctaClicks: 3200, bounceRate: 42, avgTimeOnPage: 145, deviceBreakdown: { desktop: 60, mobile: 35, tablet: 5 }, sectionEngagement: [] }),
    getHomepageHistory: async () => [],
    createHomepageVersion: async () => {},
    restoreHomepageVersion: async () => {},
    
    getBlogPosts: async () => [],
    getBlogPostBySlug: async (slug: string) => undefined,
    saveBlogPost: async (p: any) => p,
    deleteBlogPost: async (id: string) => {},
    getBlogCategories: async () => [],
    saveBlogCategory: async (c: any) => c,
    deleteBlogCategory: async (id: string) => {},
    getBlogSettings: async () => ({ pageTitle: 'Blog', metaTitle: '', metaDescription: '', bannerImage: '', postsPerPage: 10, defaultCategory: '', showAuthor: true, showDate: true }),
    updateBlogSettings: async (s: any) => s,

    getPages: async () => [],
    getPageBySlug: async (slug: string) => undefined,
    savePage: async (p: any) => p,
    deletePage: async (id: string) => {},
    getPageCategories: async () => [],
    savePageCategory: async (c: any) => c,
    deletePageCategory: async (id: string) => {},

    getMedia: async () => [],
    deleteMedia: async () => {},
    
    getKYCRequests: async () => [],
    submitKYC: async (data: any) => {},
    updateKYCStatus: async (id: string, status: string) => {},
    
    getAffiliateContent: async () => ({ heroTitle: 'Become an Affiliate', heroSubtitle: 'Earn rewards', heroButtonText: 'Join Now', benefits: [] }),
    saveAffiliateContent: async (c: any) => c,

    addHomepageSection: async (type: any) => ({ id: `new-${Date.now()}`, type, name: 'New Section', isActive: true, position: 99, content: {} }),
    updateSectionOrder: async (sections: any[]) => {},
    deleteHomepageSection: async (id: string) => {}
};
