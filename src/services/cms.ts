
import { PlatformSettings, HomepageSection, HomeSlide, HeaderConfig, FooterConfig, TrendingConfig, ActivityConfig, UserRole, HeroSearchConfig } from '../types';

const API_URL = '/api'; 

// --- CIRCUIT BREAKER & CACHE ---
const CIRCUIT_KEY = 'scrolith_api_circuit';
const requestCache = new Map<string, Promise<any>>();
const CACHE_DURATION = 60000; // 60 seconds cache
const REQUEST_TIMEOUT = 5000; // 5 seconds timeout

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

// --- DEFAULT DATA ---

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
    id: 'default', description: 'The next-generation freelance marketplace.', copyright: '© 2024 Scrolith Inc.', logoUrl: '',
    columns: [
        { id: 'c1', title: 'Support', links: [{ id: 'l1', label: 'Help Center', url: '/support', type: 'internal', visibility: [] }] }
    ],
    contact: { adminEmail: 'admin@scrolith.com', supportEmail: 'support@scrolith.com', ticketRoute: '/support' },
    socials: []
};

const DEFAULT_HERO: HeroSearchConfig = {
    headline: "Find the perfect freelance services",
    subheadline: "Connect with top talent, manage projects, and pay securely via Escrow.",
    searchPlaceholder: "Try 'Logo Design' or 'React Developer'...",
    searchSize: "large",
    quickTags: [
        { id: 'qt1', label: 'Web Dev', url: '/browse?category=Development', color: 'blue' },
        { id: 'qt2', label: 'Design', url: '/browse?category=Design', color: 'purple' }
    ],
    trustedBrands: { enabled: true, title: "Trusted by industry leaders", logos: [] },
    valueProp: { enabled: true, heading: "Why us?", badges: [] }
};

const DEFAULT_SECTIONS: HomepageSection[] = [
    { id: 'hero', type: 'hero', name: 'Hero', isActive: true, position: 1, content: DEFAULT_HERO },
    { id: 'skill_match', type: 'skill_matching', name: 'AI Match', isActive: true, position: 2, content: {} },
    { id: 'top_pro', type: 'top_pro_services', name: 'Pro Services', isActive: true, position: 3, content: { title: "Top Rated" } },
    { id: 'cta', type: 'cta', name: 'Bottom CTA', isActive: true, position: 6, content: { headline: "Ready?", subheadline: "Join today.", buttonText: "Join", buttonLink: "/auth/signup" }, style: { theme: 'blue' } }
];

export const CMSService = {
    getSettings: async (): Promise<PlatformSettings> => {
        const data = await api.get('/admin/settings');
        return data || {
            siteName: 'Scrolith', tagline: 'Marketplace', logoUrl: '', faviconUrl: '',
            adminEmail: 'admin@scrolith.com', supportEmail: 'support@scrolith.com',
            footerAboutTitle: 'About', footerAboutText: 'About text', footerCopyright: '© 2024',
            footerLinks: [], socialLinks: [],
            system: { maintenanceMode: false, registrationsEnabled: true, kycEnforced: false, admin2FA: false }
        };
    },
    updateSettings: async (s: any) => api.post('/admin/settings/update', s).then(r => r?.data || s),
    
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
    saveHomepageSection: async (s: any) => api.post('/cms/homepage/sections/update', s),
    
    getHomeSlides: async () => (await api.get('/cms/slides')) || [],
    saveHomeSlide: async (s: any) => api.post('/cms/slides/save', s),
    deleteHomeSlide: async (id: string) => api.post('/cms/slides/delete', { id }),
    updateHomeSlideOrder: async (slides: any[]) => api.post('/cms/slides/reorder', { slides }),

    getHeroSearchConfig: async () => (await api.get('/cms/hero-search')) || DEFAULT_HERO,
    saveHeroSearchConfig: async (c: any) => api.post('/cms/hero-search', c),

    getHeaderConfig: async () => (await api.get('/cms/header')) || DEFAULT_HEADER,
    saveHeaderConfig: async (c: any) => api.post('/cms/header', c),
    
    getFooterConfig: async () => (await api.get('/cms/footer')) || DEFAULT_FOOTER,
    saveFooterConfig: async (c: any) => api.post('/cms/footer', c),

    getTrendingConfig: async () => (await api.get('/cms/trending')) || { enabled: true, title: 'Trending', categoryIds: [], visibility: ['guest'], scrollBehavior: 'manual', autoSlideInterval: 5000 },
    saveTrendingConfig: async (c: any) => api.post('/cms/trending', c),

    getActivityConfig: async () => (await api.get('/cms/activity')) || { icons: [], helpMenu: [], design: { iconStyle: 'outline', iconSize: 20, badgeColor: '#EF4444', showBadges: true } },
    saveActivityConfig: async (c: any) => api.post('/cms/activity', c),

    // Stubs
    uploadMedia: async (file: File) => ({ id: Date.now().toString(), url: URL.createObjectURL(file), name: file.name, type: 'image', size: file.size, createdAt: '' }),
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
    getKYCRequests: async () => [],
    submitKYC: async (data: any) => {},
    updateKYCStatus: async (id: string, status: string) => {},
    getAffiliateContent: async () => ({ heroTitle: '', heroSubtitle: '', heroButtonText: '', benefits: [] }),
    saveAffiliateContent: async (c: any) => c,
    getHomepageAnalytics: async () => ({ views: 0, ctaClicks: 0, bounceRate: 0, avgTimeOnPage: 0, deviceBreakdown: { desktop: 100, mobile: 0, tablet: 0 }, sectionEngagement: [] }),
    addHomepageSection: async (type: any) => ({ id: `new-${Date.now()}`, type, name: 'New', isActive: true, position: 99, content: {} }),
    updateSectionOrder: async (sections: any[]) => {},
    deleteHomepageSection: async (id: string) => {}
};
