import { PlatformSettings, HomepageSection, HomeSlide, HeaderConfig, FooterConfig, TrendingConfig, ActivityConfig, UserRole, HeroSearchConfig, StaticPage, PageCategory, MediaItem, AuthPagesConfig, AnswersPageConfig, GuidesPageConfig, HirePageConfig, FreelancerPageConfig, SystemMessagesConfig, SystemMessagesVariables } from '../types';
import { AdminService } from './admin';
import { AuthService } from './authService';
import { tokenStore } from './tokenStore';
import { getApiBaseUrl, getBackendOrigin } from '../utils/apiBase';
import { DEFAULT_MEMBER_HOME_REGIONS, DEFAULT_MEMBER_HOME_TOPICS } from '../constants/defaultAudienceOptions';

// FIXED: Use relative URL for proxy instead of hardcoded localhost:5000
// Resolve API base: prefer explicit backend URL in builds, otherwise use proxy '/api' in dev.
const _hasBackendEnv = Boolean(
    import.meta.env.VITE_BACKEND_URL ||
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_MOBILE_API_URL ||
    import.meta.env.VITE_MOBILE_API_BASE_URL
);
if (import.meta.env.PROD && !_hasBackendEnv) {
    throw new Error('VITE_BACKEND_URL (or VITE_API_URL) must be set when building for production');
}
const getCmsApiUrl = () => getApiBaseUrl();
const getCmsBackendOrigin = () => getBackendOrigin();
const BRAND_LOGO_URL = 'https://scrolith.com/logo.png';
const BRAND_FAVICON_URL = 'https://scrolith.com/favicon.png';
const AUTH_PAGES_CACHE_TTL_MS = 5 * 60 * 1000;
const GUEST_HOMEPAGE_FETCH_TIMEOUT_MS = 3500;

let authPagesCache: { config: AuthPagesConfig | null; cachedAt: number } | null = null;
let authPagesRequest: Promise<AuthPagesConfig | null> | null = null;

const devLog = (...args: any[]) => {
    if (!import.meta.env.PROD) console.log(...args);
};
const devWarn = (...args: any[]) => {
    if (!import.meta.env.PROD) console.warn(...args);
};

const fetchWithTimeout = async (url: string, init: RequestInit = {}, timeoutMs = 5000) => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            ...init,
            signal: controller.signal
        });
    } finally {
        window.clearTimeout(timer);
    }
};

// --- Fallback Data ---
const fallbackData = {
    // CMS Pages
    pages: [
        {
            id: 'page-about',
            title: 'About Us',
            slug: 'about',
            content: '<h1>About Scrolith Marketplace</h1><p>Scrolith is a platform connecting talented freelancers with clients worldwide. We provide a secure and efficient marketplace for digital services.</p>',
            status: 'PUBLISHED',
            categoryId: 'cat-general',
            category_id: 'cat-general',
            updatedAt: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            visibility: 'public',
            seo: {
                metaTitle: 'About Scrolith Marketplace',
                metaDescription: 'Learn about Scrolith - the freelance marketplace connecting talent with opportunity worldwide.',
                metaKeywords: ['freelance', 'marketplace', 'digital services', 'talent']
            },
            images: [],
            videos: [],
            blocks: []
        },
        {
            id: 'page-privacy',
            title: 'Privacy Policy',
            slug: 'privacy',
            content: '<h1>Privacy Policy</h1><p>Your privacy is important to us. This policy explains how we collect, use, and protect your information.</p>',
            status: 'PUBLISHED',
            categoryId: 'cat-legal',
            category_id: 'cat-legal',
            updatedAt: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            visibility: 'public',
            seo: {
                metaTitle: 'Privacy Policy - Scrolith',
                metaDescription: 'Read our privacy policy to understand how we protect your data.',
                metaKeywords: ['privacy', 'data protection', 'policy']
            },
            images: [],
            videos: [],
            blocks: []
        },
        {
            id: 'page-terms',
            title: 'Terms of Service',
            slug: 'terms',
            content: '<h1>Terms of Service</h1><p>By using Scrolith, you agree to these terms and conditions.</p>',
            status: 'PUBLISHED',
            categoryId: 'cat-legal',
            category_id: 'cat-legal',
            updatedAt: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            visibility: 'public',
            seo: {
                metaTitle: 'Terms of Service - Scrolith',
                metaDescription: 'Terms and conditions for using Scrolith Marketplace.',
                metaKeywords: ['terms', 'service', 'agreement']
            },
            images: [],
            videos: [],
            blocks: []
        },
        {
            id: 'page-refund-policy',
            title: 'Refund Policy',
            slug: 'refund-policy',
            content: '<h1>Refund Policy</h1><p>Read how Scrolith handles eligible refunds, disputes, and payment support requests.</p>',
            status: 'PUBLISHED',
            categoryId: 'cat-legal',
            category_id: 'cat-legal',
            updatedAt: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            visibility: 'public',
            seo: {
                metaTitle: 'Refund Policy - Scrolith',
                metaDescription: 'Read the Scrolith refund rules for supported transactions and dispute flows.',
                metaKeywords: ['refund', 'refund policy', 'dispute', 'payment support']
            },
            images: [],
            videos: [],
            blocks: []
        }
    ],

    // Page Categories
    pageCategories: [
        {
            id: 'cat-general',
            name: 'General',
            slug: 'general',
            status: 'active',
            description: 'General information pages',
            image: null,
            sortOrder: 1,
            sort_order: 1,
            count: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        },
        {
            id: 'cat-legal',
            name: 'Legal',
            slug: 'legal',
            status: 'active',
            description: 'Legal and policy pages',
            image: null,
            sortOrder: 2,
            sort_order: 2,
            count: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        },
        {
            id: 'cat-help',
            name: 'Help & Support',
            slug: 'help',
            status: 'active',
            description: 'Help center and support pages',
            image: null,
            sortOrder: 3,
            sort_order: 3,
            count: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        }
    ],

    // Platform Settings
    settings: {
        siteName: 'Scrolith Marketplace',
        siteDescription: 'Connect with top freelancers and find your next project',
        siteTagline: 'AI-Powered Social Freelance Marketplace with Secure Escrow & Monetization',
        logoUrl: BRAND_LOGO_URL,
        faviconUrl: BRAND_FAVICON_URL,
        adminEmail: 'admin@Scrolith.com',
        supportEmail: 'support@Scrolith.com',
        footerAboutTitle: 'About Scrolith',
        footerAboutText: 'Connecting talent with opportunity worldwide.',
        footerCopyright: '© 2024 Scrolith Inc. All rights reserved.',
        footerLinks: [
            { label: 'About Us', url: '/p/about', type: 'internal' },
            { label: 'Privacy Policy', url: '/p/privacy', type: 'internal' },
            { label: 'Terms of Service', url: '/p/terms', type: 'internal' },
            { label: 'Refund Policy', url: '/p/refund-policy', type: 'internal' }
        ],
        socialLinks: [
            { platform: 'twitter', url: 'https://twitter.com/Scrolith' },
            { platform: 'facebook', url: 'https://facebook.com/Scrolith' },
            { platform: 'linkedin', url: 'https://linkedin.com/company/Scrolith' }
        ],
        system: {
            maintenanceMode: false,
            registrationsEnabled: true,
            kycEnforced: false,
            admin2FA: false,
            defaultCurrency: 'USD',
            timezone: 'UTC'
        }
    }
};

const unwrap = (payload: any) => payload?.data?.data ?? payload?.data ?? payload;

const ensureArray = <T,>(value: any): T[] => (Array.isArray(value) ? value : []);

const normalizeBoolean = (value: any, fallback: boolean) => {
    if (value === undefined || value === null) return fallback;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['false', '0', 'no', 'off'].includes(normalized)) return false;
        if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
        return Boolean(normalized);
    }
    return Boolean(value);
};

const normalizeRole = (role: any): string => {
    if (!role) return 'guest';
    const r = String(role).toLowerCase().trim();
    if (r === 'public') return 'guest';
    if (r === 'client') return 'employer';
    if (r === 'all' || r === '*') return 'all';
    return r;
};

const normalizeRoleList = (value: any): string[] => {
    if (Array.isArray(value)) return value.map(normalizeRole);
    if (typeof value === 'string') {
        return value
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean)
            .map(normalizeRole);
    }
    return [];
};

const localAssetHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', '10.0.2.2']);
const isLocalAssetHost = (host: string) => {
    const normalized = String(host || '').trim().toLowerCase();
    if (!normalized) return false;
    if (localAssetHosts.has(normalized)) return true;
    if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(normalized)) return false;
    if (normalized.startsWith('192.168.') || normalized.startsWith('10.')) return true;
    if (normalized.startsWith('172.')) {
        const second = Number(normalized.split('.')[1] || '0');
        return second >= 16 && second <= 31;
    }
    return false;
};

const isAssetPath = (value: string) => {
    const v = value.toLowerCase();
    return (
        v.startsWith('/uploads') ||
        v.startsWith('uploads/') ||
        v.includes('/uploads/') ||
        v.startsWith('/api/files/') ||
        v.startsWith('api/files/') ||
        v.includes('/api/files/') ||
        v.startsWith('/files/content/') ||
        v.startsWith('files/content/') ||
        v.includes('/files/content/')
    );
};

const normalizeAssetUrl = (value: string) => {
    const backendOrigin = getCmsBackendOrigin();
    if (!backendOrigin) return value;
    const trimmed = value.trim();
    if (!trimmed) return value;
    const lower = trimmed.toLowerCase();
    if (lower.startsWith('data:') || lower.startsWith('blob:') || lower.startsWith('mailto:') || lower.startsWith('tel:')) {
        return value;
    }

    if (lower.startsWith('http://') || lower.startsWith('https://')) {
        if (!isAssetPath(lower)) return value;
        try {
            const url = new URL(trimmed);
            if (!isLocalAssetHost(url.hostname.toLowerCase())) return value;
            return `${backendOrigin}${url.pathname}${url.search}${url.hash}`;
        } catch {
            return value;
        }
    }

    if (isAssetPath(lower)) {
        if (lower.startsWith('uploads/')) return `${backendOrigin}/${trimmed}`;
        if (lower.startsWith('api/files/')) return `${backendOrigin}/${trimmed}`;
        if (lower.startsWith('files/content/')) return `${backendOrigin}/${trimmed}`;
        return `${backendOrigin}${trimmed}`;
    }

    return value;
};

const normalizeAssetUrls = <T,>(value: T): T => {
    if (!value) return value;
    const seen = new WeakSet<object>();
    const walk = (node: any): any => {
        if (!node) return node;
        if (typeof node === 'string') return normalizeAssetUrl(node);
        if (Array.isArray(node)) return node.map(walk);
        if (typeof node === 'object') {
            if (node instanceof Date) return node;
            if (seen.has(node)) return node;
            seen.add(node);
            const out: Record<string, any> = {};
            Object.entries(node).forEach(([key, val]) => {
                out[key] = walk(val);
            });
            return out;
        }
        return node;
    };
    return walk(value);
};

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

const parseObjectValue = (value: any, fallback: Record<string, any> = {}) => {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
        } catch {
            return fallback;
        }
    }
    return typeof value === 'object' && !Array.isArray(value) ? value : fallback;
};

const normalizeHomepageSection = (section: any, index: number): HomepageSection => {
    const source = section || {};
    const rawType =
        source.type ??
        source.sectionType ??
        source.section_type ??
        source.section ??
        source.name ??
        source.title;
    const normalizedType = normalizeSectionType(rawType);
    const activeSource = source.isActive ?? source.is_active;
    const isActive = activeSource === undefined || activeSource === null
        ? true
        : normalizeBoolean(activeSource, true);
    const roleSource =
        source.targetRoles ??
        source.target_roles ??
        source.roles ??
        source.targeting?.roles ??
        [];
    const targetRoles = normalizeRoleList(roleSource);
    const positionValue = source.position ?? source.sortOrder ?? source.sort_order ?? 0;
    const parsedPosition = Number(positionValue);
    const position = Number.isFinite(parsedPosition) ? parsedPosition : 0;

    return {
        ...source,
        id: source.id ?? source._id ?? source.uuid ?? `section-${index}`,
        type: normalizedType as any,
        section_type: normalizedType,
        sectionType: normalizedType,
        name: source.name || source.title || normalizedType || 'Section',
        isActive,
        is_active: isActive,
        position,
        sortOrder: position,
        sort_order: position,
        content: parseObjectValue(source.content, {}),
        style: parseObjectValue(source.style, {}),
        targetRoles,
        target_roles: targetRoles,
        roles: targetRoles,
        targeting: {
            ...(source.targeting && typeof source.targeting === 'object' ? source.targeting : {}),
            roles: targetRoles
        }
    } as HomepageSection & Record<string, any>;
};

const normalizeHomepageSlide = (slide: any, index: number): HomeSlide => {
    const source = slide || {};
    const activeSource = source.isActive ?? source.is_active;
    const isActive = activeSource === undefined || activeSource === null
        ? true
        : normalizeBoolean(activeSource, true);
    const sortValue = source.sortOrder ?? source.sort_order ?? 0;
    const parsedSortOrder = Number(sortValue);
    const sortOrder = Number.isFinite(parsedSortOrder) ? parsedSortOrder : 0;
    const mediaType = source.mediaType ?? source.media_type ?? source.type ?? 'image';
    const mediaUrl =
        source.mediaUrl ??
        source.media_url ??
        source.image_url ??
        source.image ??
        source.video_url ??
        source.video ??
        source.url ??
        '';
    const redirectUrl = source.redirectUrl ?? source.redirect_url ?? source.link ?? source.href ?? '';
    const roleVisibility = normalizeRoleList(source.roleVisibility ?? source.role_visibility ?? []);
    const createdAt = source.createdAt || source.created_at || source.created || new Date().toISOString();
    const updatedAt = source.updatedAt || source.updated_at || source.updated || new Date().toISOString();

    return {
        ...source,
        id: source.id ?? source._id ?? source.uuid ?? `slide-${index}`,
        mediaType,
        media_type: mediaType,
        mediaUrl,
        media_url: mediaUrl,
        redirectUrl,
        redirect_url: redirectUrl,
        roleVisibility,
        role_visibility: roleVisibility,
        sortOrder,
        sort_order: sortOrder,
        isActive,
        is_active: isActive,
        createdAt,
        created_at: createdAt,
        updatedAt,
        updated_at: updatedAt,
        backgroundColor: source.backgroundColor || source.background_color || source.bgColor || source.bg_color,
        background_color: source.backgroundColor || source.background_color || source.bgColor || source.bg_color
    } as HomeSlide & Record<string, any>;
};

const extractHomepageSections = (payload: any): any[] => {
    const source = unwrap(payload) || {};
    return (
        (Array.isArray(source.sections) ? source.sections : null) ||
        (Array.isArray(source.homeSections) ? source.homeSections : null) ||
        (Array.isArray(source.home_sections) ? source.home_sections : null) ||
        (Array.isArray(source.data?.sections) ? source.data.sections : null) ||
        (Array.isArray(source.data?.homeSections) ? source.data.homeSections : null) ||
        (Array.isArray(source.data?.home_sections) ? source.data.home_sections : null) ||
        []
    );
};

const extractHomepageSlides = (payload: any): any[] => {
    const source = unwrap(payload) || {};
    return (
        (Array.isArray(source.slides) ? source.slides : null) ||
        (Array.isArray(source.homeSlides) ? source.homeSlides : null) ||
        (Array.isArray(source.home_slides) ? source.home_slides : null) ||
        (Array.isArray(source.data?.slides) ? source.data.slides : null) ||
        (Array.isArray(source.data?.homeSlides) ? source.data.homeSlides : null) ||
        (Array.isArray(source.data?.home_slides) ? source.data.home_slides : null) ||
        []
    );
};

const normalizeHomepagePayload = (payload: any, fallbackPageType = 'homepage') => {
    const source = unwrap(payload) || {};
    const sections = extractHomepageSections(source)
        .map(normalizeHomepageSection)
        .sort((a, b) => (a.position || 0) - (b.position || 0));
    const slides = extractHomepageSlides(source)
        .map(normalizeHomepageSlide)
        .sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const pageType = source.pageType ?? source.page_type ?? fallbackPageType;

    return normalizeAssetUrls({
        ...source,
        pageType,
        page_type: pageType,
        sections,
        homeSections: sections,
        home_sections: sections,
        slides,
        homeSlides: slides,
        home_slides: slides
    });
};

const getHomepageSectionsFromNormalizedPayload = (payload: any) =>
    ensureArray<any>(payload?.sections ?? payload?.homeSections ?? payload?.home_sections);

const hasActiveHomepageSections = (payload: any) =>
    getHomepageSectionsFromNormalizedPayload(payload).some((section) => section?.isActive !== false && section?.is_active !== false);

const isDefaultCmsSeedHomepage = (payload: any) => {
    const sections = getHomepageSectionsFromNormalizedPayload(payload);
    if (sections.length === 0) return false;

    const sectionIds = sections.map((section) => String(section?.id || '').trim().toLowerCase());
    const sectionTypes = sections.map((section) => String(section?.type || '').trim().toLowerCase());
    const body = JSON.stringify({
        pageType: payload?.pageType ?? payload?.page_type,
        sections
    }).toLowerCase();
    const hasDemoText =
        body.includes('find the perfect freelancer for your project') ||
        body.includes('dev mike') ||
        body.includes('sarah art');
    const hasSeedSectionSet =
        sections.length <= 3 &&
        sectionIds.includes('hero') &&
        sectionIds.includes('categories') &&
        sectionIds.includes('featured') &&
        sectionTypes.includes('hero') &&
        sectionTypes.includes('categories') &&
        sectionTypes.includes('featured');
    const hasScrolithGuestSections = sectionTypes.some((type) => type.startsWith('guest_'));

    return !hasScrolithGuestSections && (hasDemoText || hasSeedSectionSet);
};

const fallbackGuestHomepage = () => normalizeHomepagePayload({
    pageType: 'public_home',
    published: false,
    sections: [
        {
            id: 'fallback-guest-hero-auth',
            type: 'guest_hero_auth',
            name: 'Guest Hero + Auth',
            is_active: true,
            position: 1,
            content: {
                headline: 'The All-in-One Platform for Work, Talent, and Community',
                subheadline: 'Scrolith combines professional networking, freelance marketplace, messaging, payments, and AI workflows.',
                description: 'Join millions building careers, growing businesses, and collaborating in real time.',
                primaryCtaLabel: 'Create account',
                primaryCtaUrl: '/auth/signup',
                secondaryCtaLabel: 'Log in',
                secondaryCtaUrl: '/auth/login',
                heroBackgroundUrl: '',
                authPanelTitle: 'Welcome to Scrolith',
                authPanelSubtitle: 'Sign in or create an account to start working and growing.',
                defaultTab: 'signup',
                enableSocialLogin: true,
                loginCtaLabel: 'Login',
                signupCtaLabel: 'Sign up',
                scrolitha: {
                    enabled: true,
                    eyebrow: 'Scrolitha Live Assistant',
                    title: 'Talk to Scrolitha before you create your account',
                    subtitle: 'Launch guided AI onboarding directly from the guest homepage.',
                    description: 'Visitors can preview gig creation, hiring, briefs, and marketplace workflows before signing in.',
                    primaryPrompt: 'Create a gig draft',
                    primaryLabel: 'Open Scrolitha',
                    secondaryLabel: 'Join with popup',
                    secondaryUrl: '/auth/signup',
                    promptChips: ['Create a gig draft', 'Generate a project brief', 'How do I start on Scrolith?']
                },
                authPopup: {
                    enabled: true,
                    delaySeconds: 120,
                    headline: 'Stay on Scrolith and continue your account setup',
                    subheadline: 'Sign in or join directly from the guest homepage with the same enterprise auth controls.',
                    defaultTab: 'signup',
                    dismissLabel: 'Maybe later',
                    trustNote: 'This popup is additive to your existing auth pages and can be dismissed anytime.'
                }
            },
            style: {},
            target_roles: ['guest']
        },
        {
            id: 'fallback-what-is-scrolith',
            type: 'guest_what_is_scrolith',
            name: 'What is Scrolith',
            is_active: true,
            position: 2,
            content: {
                title: 'What is Scrolith?',
                subtitle: 'A complete ecosystem for professionals and businesses.',
                cards: [
                    { id: 'social', title: 'Social Network', description: 'Build your network, publish updates, and grow visibility.' },
                    { id: 'marketplace', title: 'Freelance Marketplace', description: 'Offer services or hire verified professionals.' },
                    { id: 'messaging', title: 'Messaging', description: 'Real-time chat, voice notes, and collaborative communication.' },
                    { id: 'payments', title: 'Wallet & Payments', description: 'Secure transactions and enterprise-grade payment flow.' },
                    { id: 'ai', title: 'Scrolitha', description: 'Automate content, insights, and productivity workflows.' },
                    { id: 'pages', title: 'Business Pages', description: 'Grow your brand with dedicated page presence and community.' }
                ]
            },
            style: {},
            target_roles: ['guest']
        },
        {
            id: 'fallback-guest-paths',
            type: 'guest_paths',
            name: 'Freelancer vs Employer',
            is_active: true,
            position: 3,
            content: {
                title: 'Choose your path',
                subtitle: 'Scrolith supports both talent and businesses at scale.',
                freelancerTitle: 'Freelancer',
                freelancerBullets: ['Create gigs', 'Apply to jobs', 'Earn income'],
                freelancerCtaLabel: 'Start freelancing',
                freelancerCtaUrl: '/auth/signup',
                employerTitle: 'Employer',
                employerBullets: ['Post jobs', 'Hire talent', 'Manage projects'],
                employerCtaLabel: 'Start hiring',
                employerCtaUrl: '/auth/signup'
            },
            style: {},
            target_roles: ['guest']
        },
        {
            id: 'fallback-guest-feature-showcase',
            type: 'guest_feature_showcase',
            name: 'Feature Showcase',
            is_active: true,
            position: 4,
            content: {
                title: 'Explore Scrolith features',
                subtitle: 'Everything needed to work, hire, and scale in one platform.',
                tabs: [
                    { id: 'marketplace', label: 'Marketplace', title: 'Professional services marketplace', description: 'Discover and deliver high-value services globally.' },
                    { id: 'community', label: 'Community', title: 'High-engagement community feed', description: 'Share updates, stories, and scroll content in real time.' },
                    { id: 'messaging', label: 'Messaging', title: 'Instant communication tools', description: 'Reliable chat infrastructure for teams and clients.' },
                    { id: 'ai', label: 'Scrolitha', title: 'Productivity with Scrolitha', description: 'Generate ideas, optimize content, and automate repetitive tasks.' },
                    { id: 'payments', label: 'Payments', title: 'Secure wallet and payout stack', description: 'Enterprise-grade checkout, payouts, and fund management.' },
                    { id: 'trust', label: 'Trust & Verification', title: 'Verified quality at scale', description: 'KYC, moderation, and safety-first controls for confidence.' }
                ]
            },
            style: {},
            target_roles: ['guest']
        },
        {
            id: 'fallback-guest-final-cta',
            type: 'guest_final_cta',
            name: 'Final CTA',
            is_active: true,
            position: 5,
            content: {
                title: 'Join Scrolith today',
                subtitle: 'Create your professional profile and unlock marketplace + community access.',
                primaryCtaLabel: 'Sign up',
                primaryCtaUrl: '/auth/signup',
                secondaryCtaLabel: 'Login',
                secondaryCtaUrl: '/auth/login'
            },
            style: {},
            target_roles: ['guest']
        }
    ],
    slides: [],
    seo: {
        title: 'Scrolith',
        metaDescription: 'Connect with freelancers, jobs, gigs, and communities on Scrolith.',
        keywords: [],
        ogImage: ''
    },
    updatedAt: new Date().toISOString()
}, 'public_home');

const normalizeNavItem = (item: any) => {
    if (!item) return null;
    const visibility = normalizeRoleList(
        item.visibility ?? item.roles ?? item.target_roles ?? item.visible_to ?? item.visibleTo
    );
    const label = item.label ?? item.title ?? item.name ?? '';
    const url = item.url ?? item.href ?? item.link ?? '';
    const group = item.group ?? item.section ?? item.menu_group ?? item.menuGroup ?? '';
    const description = item.description ?? item.subtitle ?? item.tagline ?? '';
    return {
        ...item,
        label,
        url,
        group,
        description,
        visibility
    };
};

const normalizeDropdown = (value: any, fallbackId: string) => {
    if (!value) return null;
    const source = Array.isArray(value) ? { items: value } : value;
    const label = source.label ?? source.title ?? source.name ?? '';
    const description = source.description ?? source.subtitle ?? '';
    const visibility = normalizeRoleList(
        source.visibility ?? source.roles ?? source.target_roles ?? source.visible_to ?? source.visibleTo
    );
    const itemsSource = source.items ?? source.links ?? source.menu ?? source.children ?? [];
    const items = ensureArray<any>(itemsSource).map(normalizeNavItem).filter(Boolean);
    const id = source.id ?? source._id ?? fallbackId;
    if (!label && items.length === 0) return null;
    return {
        ...source,
        id,
        label,
        description,
        visibility,
        items
    };
};

const normalizeFooterConfigSource = (raw: any, fallbackId = 'footer'): FooterConfig => {
    const source = raw || {};
    const now = Date.now();
    const enabled = normalizeBoolean(
        source.enabled ?? source.is_enabled ?? source.isEnabled ?? source.active ?? source.is_active ?? source.isActive,
        true
    );
    const columnsSource = source.columns ?? source.footer_columns ?? source.footerColumns ?? source.items ?? [];
    const columns = ensureArray<any>(columnsSource).map((column: any, colIndex: number) => {
        const linksSource = column.links ?? column.items ?? column.children ?? [];
        const links = ensureArray<any>(linksSource).map((link: any, linkIndex: number) => {
            const url = link.url ?? link.href ?? link.link ?? '';
            const type = link.type ?? (url && String(url).startsWith('http') ? 'external' : 'internal');
            return {
                ...link,
                id: link.id || `footer-link-${now}-${colIndex}-${linkIndex}`,
                label: link.label ?? link.title ?? link.name ?? '',
                url,
                visibility: normalizeRoleList(
                    link.visibility ??
                    link.roles ??
                    link.target_roles ??
                    link.targetRoles ??
                    link.visible_to ??
                    link.visibleTo ??
                    link.role_visibility ??
                    link.roleVisibility
                ),
                type
            };
        });

        return {
            ...column,
            id: column.id || `footer-col-${now}-${colIndex}`,
            title: column.title ?? column.label ?? column.name ?? '',
            links
        };
    });

    const contactSource = source.contact ?? source.footer_contact ?? source.footerContact ?? {};
    const adminEmail = contactSource.admin_email ?? contactSource.adminEmail ?? source.admin_email ?? source.adminEmail ?? '';
    const supportEmail =
        contactSource.support_email ?? contactSource.supportEmail ?? source.support_email ?? source.supportEmail ?? '';
    const ticketRoute =
        contactSource.ticket_route ?? contactSource.ticketRoute ?? source.ticket_route ?? source.ticketRoute ?? '';

    const socialsSource = source.socials ?? source.social_links ?? source.socialLinks ?? [];
    const socials = ensureArray<any>(socialsSource).map((social: any, index: number) => ({
        ...social,
        id: social.id || `footer-social-${now}-${index}`,
        platform: social.platform ?? social.name ?? social.label ?? '',
        url: social.url ?? social.href ?? social.link ?? '',
        enabled: normalizeBoolean(social.enabled ?? social.is_enabled ?? social.isEnabled, true),
        icon: social.icon ?? social.icon_url ?? social.iconUrl ?? ''
    }));

    const logoUrl = source.logoUrl ?? source.logo_url ?? source.logo ?? '';
    const socialLabelTitle =
        source.social_label_title ??
        source.socialLabelTitle ??
        source.social_title ??
        source.socialTitle ??
        '';
    const description = cleanFooterText(
        source.description ??
        source.footer_description ??
        source.footerDescription ??
        source.footer_about_text ??
        source.footerAboutText ??
        ''
    );
    const copyright = cleanFooterText(
        source.copyright ??
        source.footer_copyright ??
        source.footerCopyright ??
        ''
    );

    return normalizeAssetUrls({
        ...source,
        id: source.id || `${fallbackId}-${now}`,
        enabled,
        isEnabled: enabled,
        is_enabled: enabled,
        isActive: enabled,
        is_active: enabled,
        description,
        copyright,
        columns,
        contact: {
            ...contactSource,
            admin_email: adminEmail,
            adminEmail,
            support_email: supportEmail,
            supportEmail,
            ticket_route: ticketRoute,
            ticketRoute
        },
        socials,
        logo_url: logoUrl,
        logoUrl,
        social_label_title: socialLabelTitle,
        socialLabelTitle
    }) as unknown as FooterConfig;
};

const isFooterExplicitlyDisabled = (footer: any) => {
    if (!footer) return false;
    const explicitValue = footer.enabled ?? footer.is_enabled ?? footer.isEnabled ?? footer.active ?? footer.is_active ?? footer.isActive;
    return explicitValue !== undefined && explicitValue !== null && normalizeBoolean(explicitValue, true) === false;
};

const hasRenderableFooterConfig = (footer: any) => {
    if (!footer) return false;
    if (isFooterExplicitlyDisabled(footer)) return false;
    const contact = footer.contact || {};
    const hasVisibleColumnLinks = ensureArray<any>(footer.columns).some((column) =>
        ensureArray<any>(column?.links).some((link) => link?.label && (link?.url || link?.href || link?.link))
    );
    const hasSocials = ensureArray<any>(footer.socials).some((social) => social?.url && social?.enabled !== false);
    return Boolean(
        footer.description ||
        footer.copyright ||
        hasVisibleColumnLinks ||
        hasSocials ||
        contact.support_email ||
        contact.supportEmail ||
        contact.admin_email ||
        contact.adminEmail ||
        contact.ticket_route ||
        contact.ticketRoute
    );
};

const cleanFooterText = (value: any) => String(value ?? '').replace(/Â©/g, '(c)').trim();

const buildDefaultFooterConfig = (): FooterConfig =>
    normalizeFooterConfigSource(
        {
            id: 'default-footer',
            description:
                'Scrolith is an AI-powered social freelance marketplace where creators, freelancers, and businesses connect, collaborate, and grow.',
            copyright: '(c) 2026 Scrolith. All rights reserved.',
            logo_url: BRAND_LOGO_URL,
            columns: [
                {
                    id: 'default-footer-freelancers',
                    title: 'For Freelancers',
                    links: [
                        { id: 'default-find-jobs', label: 'Find Jobs', url: '/browse-jobs', type: 'internal', visibility: [] },
                        { id: 'default-create-gig', label: 'Create Gig', url: '/create-gig', type: 'internal', visibility: [] },
                        { id: 'default-community', label: 'Community', url: '/community', type: 'internal', visibility: [] }
                    ]
                },
                {
                    id: 'default-footer-employers',
                    title: 'For Employers',
                    links: [
                        { id: 'default-find-talent', label: 'Find Talent', url: '/browse', type: 'internal', visibility: [] },
                        { id: 'default-post-job', label: 'Post a Job', url: '/create-job', type: 'internal', visibility: [] },
                        { id: 'default-hire', label: 'Hire Resources', url: '/hire', type: 'internal', visibility: [] }
                    ]
                },
                {
                    id: 'default-footer-company',
                    title: 'Company',
                    links: [
                        { id: 'default-about', label: 'About Us', url: '/p/about', type: 'internal', visibility: [] },
                        { id: 'default-contact', label: 'Contact', url: '/contact', type: 'internal', visibility: [] },
                        { id: 'default-terms', label: 'Terms of Service', url: '/p/terms', type: 'internal', visibility: [] },
                        { id: 'default-privacy', label: 'Privacy Policy', url: '/p/privacy', type: 'internal', visibility: [] },
                        { id: 'default-refund', label: 'Refund Policy', url: '/p/refund-policy', type: 'internal', visibility: [] }
                    ]
                }
            ],
            contact: {
                support_email: 'support@scrolith.com',
                admin_email: '/contact',
                ticket_route: '/support'
            },
            socials: [
                { id: 'default-facebook', platform: 'facebook', url: 'https://facebook.com/Scrolith', enabled: true },
                { id: 'default-twitter', platform: 'twitter', url: 'https://twitter.com/Scrolith', enabled: true },
                { id: 'default-linkedin', platform: 'linkedin', url: 'https://linkedin.com/company/Scrolith', enabled: true }
            ],
            socialLabelTitle: 'Follow us'
        },
        'default-footer'
    );

const getAuthHeaders = async () => {
    const token = await tokenStore.get();
    const user = AuthService.getStoredUser();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (user?.id) headers['x-user-id'] = String(user.id);
    if (user?.role) headers['x-user-role'] = String(user.role).toLowerCase();
    if (!headers['x-user-role'] && token) headers['x-user-role'] = 'admin';
    return headers;
};

const shouldIncludeBrowserCredentials = () => {
    try {
        const runtime = typeof window !== 'undefined' ? (window as any)?.Capacitor : null;
        return !(runtime && typeof runtime.isNativePlatform === 'function' && runtime.isNativePlatform());
    } catch {
        return true;
    }
};

// --- API HELPER ---
const api = {
    get: async (endpoint: string) => {
        try {
            const url = `${getCmsApiUrl()}${endpoint}`;
            devLog(`🌐 API GET: ${url}`);

            const res = await fetch(url, {
                method: 'GET',
                credentials: shouldIncludeBrowserCredentials() ? 'include' : 'omit',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    ...(await getAuthHeaders())
                }
            });

            devLog(`📡 Response status for ${endpoint}:`, res.status, res.statusText);

            if (!res.ok) {
                // Return null for 404 to handle gracefully where expected
                if (res.status === 404) {
                    devWarn(`⚠️ Endpoint ${endpoint} not found (404)`);
                    return null;
                }

                // For other errors, throw so they can be handled
                const errorText = await res.text();
                throw new Error(`HTTP ${res.status}: ${errorText || res.statusText}`);
            }

            const data = await res.json();
            devLog(`✅ API GET success for ${endpoint}`);
            return data;
        } catch (e) {
            console.error(`❌ API Get Error ${endpoint}:`, e);
            throw e; // Propagate error
        }
    },

    post: async (endpoint: string, data: any) => {
        try {
            const res = await fetch(`${getCmsApiUrl()}${endpoint}`, {
                method: 'POST',
                credentials: shouldIncludeBrowserCredentials() ? 'include' : 'omit',
                headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
                body: JSON.stringify(data)
            });
            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`HTTP ${res.status}: ${errorText || res.statusText}`);
            }
            return await res.json();
        } catch (e) {
            console.error(`API Post Error ${endpoint}:`, e);
            throw e;
        }
    },

    put: async (endpoint: string, data: any) => {
        try {
            const res = await fetch(`${getCmsApiUrl()}${endpoint}`, {
                method: 'PUT',
                credentials: shouldIncludeBrowserCredentials() ? 'include' : 'omit',
                headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
                body: JSON.stringify(data)
            });
            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`HTTP ${res.status}: ${errorText || res.statusText}`);
            }
            return await res.json();
        } catch (e) {
            console.error(`API Put Error ${endpoint}:`, e);
            throw e;
        }
    },

    delete: async (endpoint: string) => {
        try {
            const res = await fetch(`${getCmsApiUrl()}${endpoint}`, {
                method: 'DELETE',
                credentials: shouldIncludeBrowserCredentials() ? 'include' : 'omit',
                headers: { ...(await getAuthHeaders()) }
            });
            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`HTTP ${res.status}: ${errorText || res.statusText}`);
            }
            return await res.json();
        } catch (e) {
            console.error(`API Delete Error ${endpoint}:`, e);
            throw e;
        }
    }
};

export const CMSService = {
    getPublicPlatformSettings: async (): Promise<PlatformSettings> => {
        const raw = unwrap(await api.get('/cms/platform-settings'));
        return normalizeAssetUrls(raw?.data ?? raw ?? {}) as PlatformSettings;
    },

    // --- System Settings (Synced Real-Time) ---
    // Prefer the explicit admin platform settings endpoint when available so
    // callers of CMSService.getSettings() receive the same persisted values
    // that AdminService.savePlatformSettings writes to (dev file or DB).
    getSettings: async (): Promise<PlatformSettings> => {
        // Use admin platform settings only when a token is present
        let platformSource: any = null;
        const hasToken = Boolean(await tokenStore.get());
        const storedUser = AuthService.getStoredUser();
        const role = String(storedUser?.role || '').toLowerCase();
        const isAdmin = role.includes('admin');
        if (hasToken && isAdmin) {
            try {
                platformSource = await AdminService.getPlatformSettings();
            } catch (e) {
                devWarn('AdminService.getPlatformSettings() failed, falling back to public settings', e);
                platformSource = null;
            }
        }

        const raw = platformSource ?? unwrap(await api.get('/cms/platform-settings'));
        const source = raw?.settings ?? raw?.data?.settings ?? raw ?? {};

        const siteName = source.siteName ?? source.site_name ?? 'Scrolith';
        const tagline =
            source.tagline ??
            source.siteTagline ??
            source.site_tagline ??
            'AI-Powered Social Freelance Marketplace with Secure Escrow & Monetization';
        const logoUrl = source.logoUrl ?? source.logo_url ?? '';
        const faviconUrl = source.faviconUrl ?? source.favicon_url ?? '';
        const adminEmail = source.adminEmail ?? source.admin_email ?? 'admin@Scrolith.com';
        const supportEmail = source.supportEmail ?? source.support_email ?? 'support@Scrolith.com';
        const footerAboutTitle = source.footerAboutTitle ?? source.footer_about_title ?? 'About';
        const footerAboutText = source.footerAboutText ?? source.footer_about_text ?? 'About text';
        const footerCopyright = source.footerCopyright ?? source.footer_copyright ?? '© 2024';
        const footerLinks = source.footerLinks ?? source.footer_links ?? [];
        const socialLinks = source.socialLinks ?? source.social_links ?? [];

        const settings = {
            ...source,
            siteName,
            site_name: siteName,
            tagline,
            logoUrl,
            logo_url: logoUrl,
            faviconUrl,
            favicon_url: faviconUrl,
            adminEmail,
            admin_email: adminEmail,
            supportEmail,
            support_email: supportEmail,
            footerAboutTitle,
            footer_about_title: footerAboutTitle,
            footerAboutText,
            footer_about_text: footerAboutText,
            footerCopyright,
            footer_copyright: footerCopyright,
            footerLinks,
            footer_links: footerLinks,
            socialLinks,
            social_links: socialLinks,
            system: source.system || { maintenanceMode: false, registrationsEnabled: true, kycEnforced: false, admin2FA: false }
        } as unknown as PlatformSettings;

        return normalizeAssetUrls(settings) as PlatformSettings;
    },

    updateSettings: async (settings: Partial<PlatformSettings>): Promise<PlatformSettings> => {
        const res = await api.post('/admin/settings/update', settings);
        return res?.data || settings;
    },

    // --- CMS Pages ---
    getPages: async (): Promise<StaticPage[]> => {
        try {
            const data = unwrap(await api.get('/cms/pages'));
            const items = ensureArray<any>(data);
            if (items.length === 0) return import.meta.env.PROD ? [] : (fallbackData.pages as unknown as StaticPage[]);
            return items.map((page: any) => ({
                ...page,
                updatedAt: page.updatedAt ?? page.updated_at ?? new Date().toISOString(),
                updated_at: page.updated_at ?? page.updatedAt ?? new Date().toISOString(),
                categoryId: page.categoryId ?? page.category_id ?? '',
                category_id: page.category_id ?? page.categoryId ?? '',
                visibility: page.visibility ?? 'public',
                images: page.images ?? [],
                videos: page.videos ?? [],
                blocks: page.blocks ?? []
            })) as StaticPage[];
        } catch (error) {
            console.error('Failed to fetch CMS pages:', error);
            return import.meta.env.PROD ? [] : (fallbackData.pages as unknown as StaticPage[]);
        }
    },

    getPageBySlug: async (slug: string): Promise<StaticPage | undefined> => {
        try {
            const data = unwrap(await api.get(`/cms/pages/${slug}`));
            if (!data) return undefined;
            return {
                ...data,
                updatedAt: data.updatedAt ?? data.updated_at ?? new Date().toISOString(),
                updated_at: data.updated_at ?? data.updatedAt ?? new Date().toISOString(),
                categoryId: data.categoryId ?? data.category_id ?? '',
                category_id: data.category_id ?? data.categoryId ?? '',
                visibility: data.visibility ?? 'public',
                images: data.images ?? [],
                videos: data.videos ?? [],
                blocks: data.blocks ?? []
            } as StaticPage;
        } catch (error) {
            console.error(`Failed to fetch page ${slug}:`, error);
            return import.meta.env.PROD
                ? undefined
                : ((fallbackData.pages as unknown as StaticPage[]).find((page: any) => page.slug === slug) as StaticPage | undefined);
        }
    },

    savePage: async (page: StaticPage): Promise<StaticPage> => {
        try {
            if (page.id) {
                const res = unwrap(await api.put(`/cms/pages/${page.id}`, page));
                return (res || page) as StaticPage;
            } else {
                const res = unwrap(await api.post('/cms/pages', page));
                return (res || page) as StaticPage;
            }
        } catch (error) {
            console.error('Failed to save page:', error);
            if (import.meta.env.PROD) throw error;
            // For development, return the page with an ID. Use snake_case timestamp and cast to avoid excess property checks.
            return ({
                ...page,
                id: page.id || `page-${Date.now()}`,
                updated_at: new Date().toISOString()
            }) as unknown as StaticPage;
        }
    },

    deletePage: async (id: string): Promise<void> => {
        try {
            await api.delete(`/cms/pages/${id}`);
        } catch (error) {
            console.error(`Failed to delete page ${id}:`, error);
            if (import.meta.env.PROD) throw error;
            // For development, simulate success
        }
    },

    // --- Page Categories ---
    getPageCategories: async (): Promise<PageCategory[]> => {
        try {
            const data = unwrap(await api.get('/cms/categories'));
            const items = ensureArray<any>(data);
            if (items.length === 0) return import.meta.env.PROD ? [] : (fallbackData.pageCategories as unknown as PageCategory[]);
            return items.map((cat: any) => ({
                ...cat,
                sortOrder: cat.sortOrder ?? cat.sort_order ?? 0,
                sort_order: cat.sort_order ?? cat.sortOrder ?? 0,
                created_at: cat.created_at ?? cat.createdAt ?? new Date().toISOString(),
                updated_at: cat.updated_at ?? cat.updatedAt ?? new Date().toISOString()
            })) as PageCategory[];
        } catch (error) {
            console.error('Failed to fetch page categories:', error);
            return import.meta.env.PROD ? [] : (fallbackData.pageCategories as unknown as PageCategory[]);
        }
    },

    savePageCategory: async (category: PageCategory): Promise<PageCategory> => {
        try {
            if (category.id) {
                const res = await api.put(`/cms/categories/${category.id}`, category);
                return res?.data || category;
            } else {
                const res = await api.post('/cms/categories', category);
                return res?.data || category;
            }
        } catch (error) {
            console.error('Failed to save page category:', error);
            if (import.meta.env.PROD) throw error;
            return {
                ...category,
                id: category.id || `cat-${Date.now()}`,
                slug: category.slug || category.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')
            };
        }
    },

    // --- Trending / Community Helper Endpoints (compatibility shims) ---
    getTrendingTopics: async (): Promise<any[]> => {
        try {
            const data = unwrap(await api.get('/cms/trending/topics'));
            return Array.isArray(data) ? data : [];
        } catch (e) {
            devWarn('getTrendingTopics failed, returning empty array', e);
            return [];
        }
    },

    getUpcomingEvents: async (): Promise<any[]> => {
        try {
            const data = unwrap(await api.get('/cms/upcoming/events'));
            return Array.isArray(data) ? data : [];
        } catch (e) {
            devWarn('getUpcomingEvents failed, returning empty array', e);
            return [];
        }
    },

    getTopContributors: async (): Promise<any[]> => {
        try {
            const data = unwrap(await api.get('/cms/top/contributors'));
            return Array.isArray(data) ? data : [];
        } catch (e) {
            devWarn('getTopContributors failed, returning empty array', e);
            return [];
        }
    },

    getDiscussions: async (): Promise<any[]> => {
        try {
            const data = unwrap(await api.get('/cms/discussions'));
            return Array.isArray(data) ? data : [];
        } catch (e) {
            devWarn('getDiscussions failed, returning empty array', e);
            return [];
        }
    },

    getAds: async (): Promise<any[]> => {
        try {
            const data = unwrap(await api.get('/cms/ads'));
            return Array.isArray(data) ? data : [];
        } catch (e) {
            devWarn('getAds failed, returning empty array', e);
            return [];
        }
    },

    deletePageCategory: async (id: string): Promise<void> => {
        try {
            await api.delete(`/cms/categories/${id}`);
        } catch (error) {
            console.error(`Failed to delete category ${id}:`, error);
            if (import.meta.env.PROD) throw error;
            // For development, simulate success
        }
    },

    // --- Homepage Layout ---
    // Unified homepage endpoint - returns all homepage content
getHomepage: async (options?: { role?: UserRole; location?: string; pageType?: string; _t?: number }): Promise<any> => {
        try {
                const params = new URLSearchParams();
                if (options?.role) params.append('role', options.role);
                if (options?.location) params.append('location', options.location);
                if (options?.pageType) params.append('pageType', options.pageType);
                if (options?._t) params.append('_t', options._t.toString());

                const queryString = params.toString();
                const url = `/cms/homepage${queryString ? `?${queryString}` : ''}`;
                devLog('🔍 Fetching homepage from:', url);

                // Try a direct real-time fetch first (no-store). Be tolerant to failures.
                let direct: any = null;
                try {
                        const res = await fetch(`${getCmsApiUrl()}${url}`, {
                                cache: 'no-store',
                                headers: { 'Cache-Control': 'no-cache', Accept: 'application/json' }
                        });
                        if (res.ok) direct = await res.json();
                        else {
                            devWarn(`Homepage direct fetch returned ${res.status} ${res.statusText}`);
                            direct = null;
                        }
                } catch (e) {
                        devWarn('Homepage direct fetch failed:', e);
                        direct = null;
                }

                // Fallback to api.get but catch errors so we can return a safe default instead of nulling the entire page
                let fallback: any = direct;
                if (!fallback) {
                        try {
                            fallback = await api.get(url);
                        } catch (e) {
                            devWarn('Homepage api.get fallback failed:', e);
                            fallback = null;
                        }
                }

                if (!fallback) {
                    devWarn('⚠️ Homepage API returned null/empty; returning empty homepage object');
                    return normalizeHomepagePayload({ sections: [], slides: [], pageType: 'homepage', published: false }, 'homepage');
                }

                devLog('✅ Homepage API response:', {
                        hasSections: !!fallback.sections,
                        sectionsCount: Array.isArray(fallback.sections) ? fallback.sections.length : 0,
                        hasSlides: !!fallback.slides,
                        slidesCount: Array.isArray(fallback.slides) ? fallback.slides.length : 0,
                        pageType: fallback.pageType,
                        published: fallback.published
                });

                return normalizeHomepagePayload(fallback, options?.pageType || 'homepage');
        } catch (error) {
                console.error('❌ Failed to fetch homepage:', error);
                return normalizeHomepagePayload({ sections: [], slides: [], pageType: 'homepage', published: false }, 'homepage');
        }
},

    getGuestHomepage: async (): Promise<any> => {
        try {
            const guest = await fetchWithTimeout(`${getCmsApiUrl()}/homepage/guest`, {
                cache: 'no-store',
                headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }
            }, GUEST_HOMEPAGE_FETCH_TIMEOUT_MS);
            if (guest.ok) {
                const raw = await guest.json();
                const normalized = normalizeHomepagePayload(raw, 'public_home');
                if (hasActiveHomepageSections(normalized)) return normalized;
            }
            if (guest.status === 429) {
                devWarn('Guest homepage fetch was rate limited; using static fallback');
                return fallbackGuestHomepage();
            }
        } catch (error) {
            devWarn('Guest homepage direct fetch failed:', error);
            return fallbackGuestHomepage();
        }

        try {
            const data = unwrap(await api.get('/homepage/guest'));
            const normalized = normalizeHomepagePayload(data, 'public_home');
            if (hasActiveHomepageSections(normalized)) return normalized;
        } catch (error) {
            devWarn('Guest homepage api.get fallback failed:', error);
        }

        try {
            const direct = await fetchWithTimeout(`${getCmsApiUrl()}/cms/homepage`, {
                cache: 'no-store',
                headers: { Accept: 'application/json', 'Cache-Control': 'no-cache' }
            }, GUEST_HOMEPAGE_FETCH_TIMEOUT_MS);
            if (direct.ok) {
                const raw = await direct.json();
                const normalized = normalizeHomepagePayload(raw, 'public_home');
                if (hasActiveHomepageSections(normalized) && !isDefaultCmsSeedHomepage(normalized)) {
                    return normalized;
                }
                devWarn('Ignoring default CMS seed homepage for guest homepage');
            }
            if (direct.status === 429) {
                devWarn('Guest homepage canonical CMS fetch was rate limited; using static fallback');
                return fallbackGuestHomepage();
            }
        } catch (error) {
            devWarn('Guest homepage canonical CMS fetch failed:', error);
        }

        try {
            const data = unwrap(await api.get('/cms/homepage'));
            const normalized = normalizeHomepagePayload(data, 'public_home');
            if (hasActiveHomepageSections(normalized) && !isDefaultCmsSeedHomepage(normalized)) {
                return normalized;
            }
            devWarn('Ignoring default CMS seed homepage from api.get fallback');
        } catch (error) {
            devWarn('Guest homepage canonical api.get fallback failed:', error);
        }

        return fallbackGuestHomepage();
    },

    getGuestHomepageFallback: (): any => fallbackGuestHomepage(),

    getGuestHomepageDraft: async (): Promise<any> => {
        try {
            const data = unwrap(await api.get('/admin/homepage/draft'));
            return data || null;
        } catch (error) {
            console.error('Failed to fetch guest homepage draft:', error);
            return null;
        }
    },

    saveGuestHomepageSection: async (payload: any): Promise<any> =>
        unwrap(await api.put('/admin/homepage/section', payload)),

    reorderGuestHomepageSections: async (payload: { order?: string[]; sections?: any[]; seo?: any }): Promise<any> =>
        unwrap(await api.post('/admin/homepage/reorder', payload)),

    publishGuestHomepage: async (): Promise<any> =>
        unwrap(await api.post('/admin/homepage/publish', {})),

    getHomepageSections: async (options?: { role?: UserRole; location?: string }) => {
        let rawSections: any[] = [];
        try {
            const params = new URLSearchParams();
            if (options?.role) params.append('role', options.role);
            if (options?.location) params.append('location', options.location);
            const queryString = params.toString();
            const data = unwrap(await api.get(`/cms/homepage/sections${queryString ? `?${queryString}` : ''}`));
            rawSections =
                (Array.isArray(data) ? data : null) ||
                (Array.isArray(data?.sections) ? data.sections : null) ||
                (Array.isArray(data?.homeSections) ? data.homeSections : null) ||
                (Array.isArray(data?.home_sections) ? data.home_sections : null) ||
                (Array.isArray(data?.data?.sections) ? data.data.sections : null) ||
                (Array.isArray(data?.data?.homeSections) ? data.data.homeSections : null) ||
                (Array.isArray(data?.data?.home_sections) ? data.data.home_sections : null) ||
                (Array.isArray(data?.data) ? data.data : null) ||
                [];
        } catch (error) {
            console.error('Failed to fetch homepage sections:', error);
        }

        let sections: HomepageSection[] = rawSections as HomepageSection[];

        if (sections.length === 0) {
            const homepage = await CMSService.getHomepage(options);
            const homepageSections =
                (Array.isArray(homepage?.sections) ? homepage.sections : null) ||
                (Array.isArray(homepage?.homeSections) ? homepage.homeSections : null) ||
                (Array.isArray(homepage?.home_sections) ? homepage.home_sections : null) ||
                (Array.isArray(homepage?.data?.sections) ? homepage.data.sections : null) ||
                (Array.isArray(homepage?.data?.homeSections) ? homepage.data.homeSections : null) ||
                (Array.isArray(homepage?.data?.home_sections) ? homepage.data.home_sections : null) ||
                (Array.isArray(homepage?.data) ? homepage.data : null) ||
                [];
            sections = homepageSections as HomepageSection[];
        }

        if (sections.length === 0) return [];

        sections = sections.map((section: any, index: number) => {
            let content = section.content;
            if (typeof content === 'string') {
                try {
                    content = JSON.parse(content);
                } catch {
                    // Leave content as-is if not valid JSON.
                }
            }

            let style = section.style;
            if (typeof style === 'string') {
                try {
                    style = JSON.parse(style);
                } catch {
                    // Leave style as-is if not valid JSON.
                }
            }

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

            const activeFlag = normalizeBoolean(
                section.isActive ?? section.is_active ?? section.enabled ?? section.is_enabled,
                true
            );

            const normalizedTargetRoles = normalizeRoleList(
                section?.targetRoles ?? section?.target_roles ?? section?.roles ?? section?.targeting?.roles ?? section?.visibility
            );

            return {
                ...section,
                id: section.id ?? section._id ?? section.uuid ?? `section-${index}`,
                type: normalizedType,
                section_type: normalizedType,
                sectionType: normalizedType,
                content,
                style,
                is_active: activeFlag,
                isActive: activeFlag,
                position,
                sort_order: position,
                sortOrder: position,
                name: section.name || section.title || normalizedType || 'Section',
                targetRoles: normalizedTargetRoles,
                target_roles: normalizedTargetRoles,
                targeting: { roles: normalizedTargetRoles },
                roles: normalizedTargetRoles
            };
        });

        if (options?.role) {
            const role = normalizeRole(options.role);
            sections = sections.filter((s: any) => {
                const roles = normalizeRoleList(
                    s?.targetRoles ?? s?.target_roles ?? s?.roles ?? s?.targeting?.roles ?? s?.visibility
                );
                if (roles.length === 0) return true;
                if (roles.includes('all') || roles.includes('*')) return true;
                return roles.includes(role);
            });
        }

        const sorted = sections.sort((a, b) => a.position - b.position);
        return normalizeAssetUrls(sorted) as HomepageSection[];
    },

    saveHomepageSection: async (section: HomepageSection) => api.post('/cms/homepage/sections/update', section),

    // --- Home Slides ---
    getHomeSlides: async () => {
        let rawSlides: any[] = [];
        try {
            const data = unwrap(await api.get('/cms/slides'));
            rawSlides =
                (Array.isArray(data) ? data : null) ||
                (Array.isArray(data?.slides) ? data.slides : null) ||
                (Array.isArray(data?.homeSlides) ? data.homeSlides : null) ||
                (Array.isArray(data?.home_slides) ? data.home_slides : null) ||
                (Array.isArray(data?.data?.slides) ? data.data.slides : null) ||
                (Array.isArray(data?.data?.homeSlides) ? data.data.homeSlides : null) ||
                (Array.isArray(data?.data?.home_slides) ? data.data.home_slides : null) ||
                (Array.isArray(data?.data) ? data.data : null) ||
                [];
        } catch (error) {
            console.error('Failed to fetch home slides:', error);
        }

        let slides = rawSlides as HomeSlide[];
        if (slides.length === 0) {
            const homepage = await CMSService.getHomepage();
            const homepageSlides =
                (Array.isArray(homepage?.slides) ? homepage.slides : null) ||
                (Array.isArray(homepage?.homeSlides) ? homepage.homeSlides : null) ||
                (Array.isArray(homepage?.home_slides) ? homepage.home_slides : null) ||
                (Array.isArray(homepage?.data?.slides) ? homepage.data.slides : null) ||
                (Array.isArray(homepage?.data?.homeSlides) ? homepage.data.homeSlides : null) ||
                (Array.isArray(homepage?.data?.home_slides) ? homepage.data.home_slides : null) ||
                (Array.isArray(homepage?.data) ? homepage.data : null) ||
                [];
            slides = homepageSlides as HomeSlide[];
        }

        const normalized = slides.map((slide: any, index: number) => {
            const isActive = normalizeBoolean(
                slide.isActive ?? slide.is_active ?? slide.active ?? slide.enabled ?? slide.is_enabled,
                true
            );
            const sortOrder = slide.sortOrder !== undefined ? slide.sortOrder : (slide.sort_order ?? slide.order ?? 0);
            const createdAt = slide.createdAt || slide.created_at || slide.created || new Date().toISOString();
            const updatedAt = slide.updatedAt || slide.updated_at || slide.updated || new Date().toISOString();

            return {
                id: slide.id ?? slide._id ?? slide.uuid ?? `slide-${index}`,
                media_type: slide.mediaType || slide.media_type || slide.type || 'image',
                mediaType: slide.mediaType || slide.media_type || slide.type || 'image',
                media_url: slide.mediaUrl || slide.media_url || slide.image_url || slide.image || slide.video_url || slide.video || slide.url || '',
                mediaUrl: slide.mediaUrl || slide.media_url || slide.image_url || slide.image || slide.video_url || slide.video || slide.url || '',
                title: slide.title || slide.name,
                subtitle: slide.subtitle,
                redirect_url: slide.redirectUrl || slide.redirect_url || slide.link || slide.href || '',
                redirectUrl: slide.redirectUrl || slide.redirect_url || slide.link || slide.href || '',
                role_visibility: normalizeRoleList(
                    slide.roleVisibility ||
                    slide.role_visibility ||
                    slide.visibility ||
                    slide.roles ||
                    slide.target_roles ||
                    []
                ),
                roleVisibility: normalizeRoleList(
                    slide.roleVisibility ||
                    slide.role_visibility ||
                    slide.visibility ||
                    slide.roles ||
                    slide.target_roles ||
                    []
                ),
                sort_order: sortOrder,
                sortOrder: sortOrder,
                is_active: isActive,
                isActive: isActive,
                created_at: createdAt,
                createdAt: createdAt,
                updated_at: updatedAt,
                updatedAt: updatedAt,
                background_color: slide.backgroundColor || slide.background_color || slide.bgColor || slide.bg_color,
                backgroundColor: slide.backgroundColor || slide.background_color || slide.bgColor || slide.bg_color
            };
        });
        return normalizeAssetUrls(normalized) as HomeSlide[];
    },
    saveHomeSlide: async (s: any) => {
        const color = String(s?.backgroundColor || s?.background_color || s?.bgColor || s?.bg_color || '#000000').trim();
        const normalizedColor = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.test(color) ? color : '#000000';
        const mediaUrl = s?.mediaUrl || s?.media_url || s?.image_url || s?.video_url || '';
        const payload = {
            ...s,
            mediaUrl,
            media_url: mediaUrl,
            backgroundColor: normalizedColor,
            background_color: normalizedColor
        };
        return api.post('/cms/slides/save', payload);
    },
    deleteHomeSlide: async (id: string) => api.post('/cms/slides/delete', { id }),
    updateHomeSlideOrder: async (slides: any[]) => api.post('/cms/slides/reorder', { slides }),

    // --- Header Config ---
    getHeaderConfig: async (): Promise<HeaderConfig> => {
        try {
            const raw = unwrap(await api.get('/cms/header'));
            const source = raw || {};

            const homeUrl = source.homeUrl ?? source.home_url ?? '/';
            const searchEnabled = normalizeBoolean(source.searchEnabled ?? source.search_enabled, true);
            const searchMode = source.searchMode ?? source.search_mode ?? 'keyword';
            const logoUrl = source.logoUrl ?? source.logo_url ?? source.logo ?? '';
            const faviconUrl = source.faviconUrl ?? source.favicon_url ?? '';

            const actionsRaw = source.actions || {};
            const normalizedActions = {
                notifications: normalizeBoolean(actionsRaw.notifications, true),
                messages: normalizeBoolean(actionsRaw.messages, true),
                orders: normalizeBoolean(actionsRaw.orders, true),
                lists: normalizeBoolean(actionsRaw.lists, true),
                switchSelling: normalizeBoolean(actionsRaw.switchSelling ?? actionsRaw.switch_selling, true),
                switch_selling: normalizeBoolean(actionsRaw.switch_selling ?? actionsRaw.switchSelling, true),
                profile: normalizeBoolean(actionsRaw.profile, true)
            };

            const normalizeMenuSource = (value: any) => {
                if (Array.isArray(value)) return value;
                if (value && typeof value === 'object') return Object.values(value);
                return [];
            };

            const navigationSource = source.navigation ?? source.navItems ?? source.nav_items;
            const navigation = normalizeMenuSource(navigationSource)
                .map(normalizeNavItem)
                .filter(Boolean);

            const profileMenuSource = source.profileMenu ?? source.profile_menu ?? source.userMenu ?? source.user_menu;
            const profileMenu = normalizeMenuSource(profileMenuSource)
                .map(normalizeNavItem)
                .filter(Boolean);

            const profileGroupLabelsSource =
                source.profileMenuGroupLabels ?? source.profile_menu_group_labels ?? source.profile_group_labels ?? {};
            const profileMenuGroupLabels = {
                primary: profileGroupLabelsSource.primary ?? profileGroupLabelsSource.primary_label ?? '',
                business_tools:
                    profileGroupLabelsSource.business_tools ??
                    profileGroupLabelsSource.businessTools ??
                    profileGroupLabelsSource.business_tools_label ??
                    '',
                utilities: profileGroupLabelsSource.utilities ?? profileGroupLabelsSource.utilities_label ?? ''
            };

            const guestPrimaryDropdown = normalizeDropdown(
                source.guestPrimaryDropdown ??
                    source.guest_primary_dropdown ??
                    source.guestProDropdown ??
                    source.guest_pro_dropdown,
                'guest-primary'
            );

            const guestExploreDropdown = normalizeDropdown(
                source.guestExploreDropdown ??
                    source.guest_explore_dropdown ??
                    source.guestExplore ??
                    source.guest_explore,
                'guest-explore'
            );

            const guestCtasSource =
                source.guestCtas ?? source.guest_ctas ?? source.guestActions ?? source.guest_actions;
            const guestCtas = normalizeMenuSource(guestCtasSource)
                .map(normalizeNavItem)
                .filter(Boolean);

            const roleSwitchSource = source.roleSwitch ?? source.role_switch ?? source.switchRole ?? {};
            const roleSwitch = {
                buyer_label: roleSwitchSource.buyer_label ?? roleSwitchSource.buyerLabel ?? '',
                buyer_url: roleSwitchSource.buyer_url ?? roleSwitchSource.buyerUrl ?? '',
                seller_label: roleSwitchSource.seller_label ?? roleSwitchSource.sellerLabel ?? '',
                seller_url: roleSwitchSource.seller_url ?? roleSwitchSource.sellerUrl ?? '',
                visibility: normalizeRoleList(
                    roleSwitchSource.visibility ??
                        roleSwitchSource.roles ??
                        roleSwitchSource.target_roles ??
                        roleSwitchSource.visible_to
                )
            };

            const header = {
                ...source,
                id: source.id || 'default',
                homeUrl,
                home_url: homeUrl,
                variant: source.variant || 'light',
                searchEnabled,
                search_enabled: searchEnabled,
                searchMode,
                search_mode: searchMode,
                logoUrl,
                logo_url: logoUrl,
                faviconUrl,
                favicon_url: faviconUrl,
                navigation,
                actions: normalizedActions,
                profileMenu,
                profile_menu: profileMenu,
                userMenu: profileMenu,
                profileMenuGroupLabels: profileMenuGroupLabels,
                profile_menu_group_labels: profileMenuGroupLabels,
                guestPrimaryDropdown: guestPrimaryDropdown,
                guest_primary_dropdown: guestPrimaryDropdown,
                guestExploreDropdown: guestExploreDropdown,
                guest_explore_dropdown: guestExploreDropdown,
                guestCtas: guestCtas,
                guest_ctas: guestCtas,
                roleSwitch: roleSwitch,
                role_switch: roleSwitch
            } as unknown as HeaderConfig;
            return normalizeAssetUrls(header) as HeaderConfig;
        } catch (error) {
            console.error('Failed to fetch header config:', error);
            // Try public homepage endpoint as a fallback (some deployments restrict admin endpoints)
            try {
                const homepageRaw = unwrap(await api.get('/cms/homepage')) || {};
                const source = (homepageRaw && (homepageRaw.header || homepageRaw.homepage || homepageRaw)) || {};

                const homeUrl = source.homeUrl ?? source.home_url ?? '/';
                const searchEnabled = normalizeBoolean(source.searchEnabled ?? source.search_enabled, true);
                const searchMode = source.searchMode ?? source.search_mode ?? 'keyword';
                const logoUrl = source.logoUrl ?? source.logo_url ?? source.logo ?? '';
                const faviconUrl = source.faviconUrl ?? source.favicon_url ?? '';

                const actionsRaw = source.actions || {};
                const normalizedActions = {
                    notifications: normalizeBoolean(actionsRaw.notifications, true),
                    messages: normalizeBoolean(actionsRaw.messages, true),
                    orders: normalizeBoolean(actionsRaw.orders, true),
                    lists: normalizeBoolean(actionsRaw.lists, true),
                    switchSelling: normalizeBoolean(actionsRaw.switchSelling ?? actionsRaw.switch_selling, true),
                    switch_selling: normalizeBoolean(actionsRaw.switch_selling ?? actionsRaw.switchSelling, true),
                    profile: normalizeBoolean(actionsRaw.profile, true)
                };

                const normalizeMenuSource = (value: any) => {
                    if (Array.isArray(value)) return value;
                    if (value && typeof value === 'object') return Object.values(value);
                    return [];
                };

                const navigationSource = source.navigation ?? source.navItems ?? source.nav_items;
                const navigation = normalizeMenuSource(navigationSource)
                    .map(normalizeNavItem)
                    .filter(Boolean);

                const profileMenuSource = source.profileMenu ?? source.profile_menu ?? source.userMenu ?? source.user_menu;
                const profileMenu = normalizeMenuSource(profileMenuSource)
                    .map(normalizeNavItem)
                    .filter(Boolean);

                const profileGroupLabelsSource =
                    source.profileMenuGroupLabels ?? source.profile_menu_group_labels ?? source.profile_group_labels ?? {};
                const profileMenuGroupLabels = {
                    primary: profileGroupLabelsSource.primary ?? profileGroupLabelsSource.primary_label ?? '',
                    business_tools:
                        profileGroupLabelsSource.business_tools ??
                        profileGroupLabelsSource.businessTools ??
                        profileGroupLabelsSource.business_tools_label ??
                        '',
                    utilities: profileGroupLabelsSource.utilities ?? profileGroupLabelsSource.utilities_label ?? ''
                };

                const guestPrimaryDropdown = normalizeDropdown(
                    source.guestPrimaryDropdown ??
                        source.guest_primary_dropdown ??
                        source.guestProDropdown ??
                        source.guest_pro_dropdown,
                    'guest-primary'
                );

                const guestExploreDropdown = normalizeDropdown(
                    source.guestExploreDropdown ??
                        source.guest_explore_dropdown ??
                        source.guestExplore ??
                        source.guest_explore,
                    'guest-explore'
                );

                const guestCtasSource =
                    source.guestCtas ?? source.guest_ctas ?? source.guestActions ?? source.guest_actions;
                const guestCtas = normalizeMenuSource(guestCtasSource)
                    .map(normalizeNavItem)
                    .filter(Boolean);

                const roleSwitchSource = source.roleSwitch ?? source.role_switch ?? source.switchRole ?? {};
                const roleSwitch = {
                    buyer_label: roleSwitchSource.buyer_label ?? roleSwitchSource.buyerLabel ?? '',
                    buyer_url: roleSwitchSource.buyer_url ?? roleSwitchSource.buyerUrl ?? '',
                    seller_label: roleSwitchSource.seller_label ?? roleSwitchSource.sellerLabel ?? '',
                    seller_url: roleSwitchSource.seller_url ?? roleSwitchSource.sellerUrl ?? '',
                    visibility: normalizeRoleList(
                        roleSwitchSource.visibility ??
                            roleSwitchSource.roles ??
                            roleSwitchSource.target_roles ??
                            roleSwitchSource.visible_to
                    )
                };

                const header = {
                    ...source,
                    id: source.id || 'default',
                    homeUrl,
                    home_url: homeUrl,
                    variant: source.variant || 'light',
                    searchEnabled,
                    search_enabled: searchEnabled,
                    searchMode,
                    search_mode: searchMode,
                    logoUrl,
                    logo_url: logoUrl,
                    faviconUrl,
                    favicon_url: faviconUrl,
                    navigation,
                    actions: normalizedActions,
                    profileMenu,
                    profile_menu: profileMenu,
                    userMenu: profileMenu,
                    profileMenuGroupLabels: profileMenuGroupLabels,
                    profile_menu_group_labels: profileMenuGroupLabels,
                    guestPrimaryDropdown: guestPrimaryDropdown,
                    guest_primary_dropdown: guestPrimaryDropdown,
                    guestExploreDropdown: guestExploreDropdown,
                    guest_explore_dropdown: guestExploreDropdown,
                    guestCtas: guestCtas,
                    guest_ctas: guestCtas,
                    roleSwitch: roleSwitch,
                    role_switch: roleSwitch
                } as unknown as HeaderConfig;
                return normalizeAssetUrls(header) as HeaderConfig;
            } catch (e2) {
                console.error('Failed to fetch public homepage as fallback for header config:', e2);
                // As a last resort, attempt to read platform settings which include faviconUrl
                try {
                    const platformRaw = unwrap(await api.get('/admin/platform/settings')) || {};
                    const platformData = (platformRaw?.data ?? platformRaw) || {};
                    const faviconUrl = platformData.faviconUrl ?? platformData.favicon_url ?? '';

                    const header = {
                        id: 'default',
                        homeUrl: '/',
                        home_url: '/',
                        variant: 'light',
                        searchEnabled: true,
                        search_enabled: true,
                        searchMode: 'keyword',
                        search_mode: 'keyword',
                        logoUrl: platformData.logoUrl ?? platformData.logo_url ?? '',
                        logo_url: platformData.logoUrl ?? platformData.logo_url ?? '',
                        faviconUrl,
                        favicon_url: faviconUrl,
                        navigation: [],
                        actions: {
                            notifications: true,
                            messages: true,
                            orders: true,
                            lists: true,
                            switchSelling: true,
                            switch_selling: true,
                            profile: true
                        },
                        profileMenu: [],
                        profile_menu: [],
                        userMenu: [],
                        profileMenuGroupLabels: {},
                        profile_menu_group_labels: {},
                        guestPrimaryDropdown: null,
                        guest_primary_dropdown: null,
                        guestExploreDropdown: null,
                        guest_explore_dropdown: null,
                        guestCtas: [],
                        guest_ctas: [],
                        roleSwitch: null,
                        role_switch: null
                    } as unknown as HeaderConfig;
                    return normalizeAssetUrls(header) as HeaderConfig;
                } catch (e3) {
                    console.error('Failed to fetch platform settings as fallback for header config:', e3);
                }
            }
            return {
                id: 'default',
                homeUrl: '/',
                home_url: '/',
                variant: 'light',
                searchEnabled: true,
                search_enabled: true,
                searchMode: 'keyword',
                search_mode: 'keyword',
                logoUrl: '',
                logo_url: '',
                faviconUrl: '',
                favicon_url: '',
                navigation: [],
                actions: {
                    notifications: true,
                    messages: true,
                    orders: true,
                    lists: true,
                    switchSelling: true,
                    switch_selling: true,
                    profile: true
                },
                profileMenu: [],
                profile_menu: [],
                userMenu: [],
                profileMenuGroupLabels: {},
                profile_menu_group_labels: {},
                guestPrimaryDropdown: null,
                guest_primary_dropdown: null,
                guestExploreDropdown: null,
                guest_explore_dropdown: null,
                guestCtas: [],
                guest_ctas: [],
                roleSwitch: null,
                role_switch: null
            } as unknown as HeaderConfig;
        }
    },

    saveHeaderConfig: async (config: HeaderConfig): Promise<HeaderConfig> => {
        try {
            const source: any = config || {};
            const actionsRaw = source.actions || {};
            const normalizeDropdownPayload = (dropdown: any) => {
                if (!dropdown) return dropdown;
                const items = ensureArray<any>(dropdown.items ?? dropdown.links ?? dropdown.menu ?? []);
                return { ...dropdown, items };
            };
            const profileMenu = source.profile_menu ?? source.profileMenu ?? source.userMenu ?? [];
            const profileMenuGroupLabels =
                source.profile_menu_group_labels ?? source.profileMenuGroupLabels ?? source.profile_group_labels ?? {};
            const guestPrimaryDropdown = normalizeDropdownPayload(
                source.guest_primary_dropdown ?? source.guestPrimaryDropdown ?? source.guestProDropdown ?? null
            );
            const guestExploreDropdown = normalizeDropdownPayload(
                source.guest_explore_dropdown ?? source.guestExploreDropdown ?? source.guestExplore ?? null
            );
            const guestCtas = source.guest_ctas ?? source.guestCtas ?? source.guestActions ?? [];
            const roleSwitch = source.role_switch ?? source.roleSwitch ?? source.switchRole ?? {};
            const payload = {
                ...source,
                home_url: source.home_url ?? source.homeUrl ?? '/',
                search_enabled: normalizeBoolean(source.search_enabled ?? source.searchEnabled, true),
                search_mode: source.search_mode ?? source.searchMode ?? 'keyword',
                logo_url: source.logo_url ?? source.logoUrl ?? '',
                favicon_url: source.favicon_url ?? source.faviconUrl ?? '',
                navigation: ensureArray<any>(source.navigation),
                actions: {
                    notifications: normalizeBoolean(actionsRaw.notifications, true),
                    messages: normalizeBoolean(actionsRaw.messages, true),
                    orders: normalizeBoolean(actionsRaw.orders, true),
                    lists: normalizeBoolean(actionsRaw.lists, true),
                    switch_selling: normalizeBoolean(actionsRaw.switch_selling ?? actionsRaw.switchSelling, true),
                    profile: normalizeBoolean(actionsRaw.profile, true)
                },
                profile_menu: profileMenu,
                profile_menu_group_labels: profileMenuGroupLabels,
                guest_primary_dropdown: guestPrimaryDropdown,
                guest_explore_dropdown: guestExploreDropdown,
                guest_ctas: ensureArray<any>(guestCtas),
                role_switch: roleSwitch
            };

            const res = await api.post('/cms/header', payload);
            // Backend returns { success: true, message: '...', data: {...} }
            return res?.data?.data || res?.data || config;
        } catch (error) {
            console.error('Failed to save header config:', error);
            // Surface a clearer message for 403 admin access failures
            const status = error?.response?.status || error?.status;
            if (status === 403) {
                throw new Error(`HTTP 403: Admin access required`);
            }
            throw error; // Re-throw other errors
        }
    },

    // --- Footer Config ---
    getFooterConfig: async (): Promise<FooterConfig> => {
        try {
            const raw = unwrap(await api.get('/cms/footer'));
            const footer = normalizeFooterConfigSource(raw, 'footer');
            if (isFooterExplicitlyDisabled(raw) || isFooterExplicitlyDisabled(footer)) return footer;
            if (hasRenderableFooterConfig(footer)) return footer;
        } catch (error) {
            console.error('Failed to fetch footer config:', error);
        }

        try {
            const homepageRaw = unwrap(await api.get('/cms/homepage')) || {};
            const homepageFooter = homepageRaw.footer ?? homepageRaw.homepage?.footer ?? homepageRaw.data?.footer;
            const footer = normalizeFooterConfigSource(homepageFooter, 'homepage-footer');
            if (isFooterExplicitlyDisabled(homepageFooter) || isFooterExplicitlyDisabled(footer)) return footer;
            if (hasRenderableFooterConfig(footer)) return footer;
        } catch (error) {
            console.error('Failed to load footer config from homepage fallback:', error);
        }

        return normalizeFooterConfigSource({ id: 'footer-unavailable', enabled: false }, 'footer-unavailable');
    },

    saveFooterConfig: async (config: FooterConfig): Promise<FooterConfig> => {
        try {
            const source: any = config || {};
            const contactSource = source.contact ?? {};
            const columnsSource = ensureArray<any>(source.columns);
            const socialsSource = ensureArray<any>(source.socials);
            const socialLabelTitle =
                source.social_label_title ??
                source.socialLabelTitle ??
                source.social_title ??
                source.socialTitle ??
                '';
            const payload = {
                ...source,
                logo_url: source.logo_url ?? source.logoUrl ?? '',
                logoUrl: source.logo_url ?? source.logoUrl ?? '',
                social_label_title: socialLabelTitle,
                socialLabelTitle,
                description: source.description ?? '',
                copyright: source.copyright ?? '',
                contact: {
                    admin_email: contactSource.admin_email ?? contactSource.adminEmail ?? '',
                    support_email: contactSource.support_email ?? contactSource.supportEmail ?? '',
                    ticket_route: contactSource.ticket_route ?? contactSource.ticketRoute ?? ''
                },
                columns: columnsSource.map((column: any) => ({
                    ...column,
                    id: column.id ?? `footer-col-${Date.now()}`,
                    title: column.title ?? '',
                    links: ensureArray<any>(column.links).map((link: any) => {
                        const url = link.url ?? link.href ?? link.link ?? '';
                        const type = link.type ?? (url && String(url).startsWith('http') ? 'external' : 'internal');
                        return {
                            ...link,
                            id: link.id ?? `footer-link-${Date.now()}`,
                            label: link.label ?? '',
                            url,
                            visibility: normalizeRoleList(
                                link.visibility ?? link.roles ?? link.target_roles ?? link.visible_to ?? link.visibleTo
                            ),
                            type
                        };
                    })
                })),
                socials: socialsSource.map((social: any) => ({
                    ...social,
                    id: social.id ?? `footer-social-${Date.now()}`,
                    platform: social.platform ?? social.name ?? '',
                    url: social.url ?? '',
                    enabled: normalizeBoolean(social.enabled ?? social.is_enabled, true),
                    icon: social.icon ?? social.icon_url ?? ''
                }))
            };

            const res = await api.post('/cms/footer', payload);
            // Backend returns { success: true, message: '...', data: {...} }
            return res?.data?.data || res?.data || config;
        } catch (error) {
            console.error('Failed to save footer config:', error);
            throw error; // Re-throw so handlers can show error messages
        }
    },

    // --- Trending Config ---
    getTrendingConfig: async (): Promise<TrendingConfig> => {
        try {
            const data = unwrap(await api.get('/cms/trending-config'));
            // Transform snake_case to camelCase for frontend compatibility
            if (data) {
                const categoryIds = ensureArray<string>(data.category_ids || data.categoryIds || data.categories);
                return {
                    id: data.id || `trending-${Date.now()}`,
                    enabled: normalizeBoolean(data.enabled ?? data.is_enabled ?? data.isEnabled, false),
                    title: data.title ?? '',
                    category_ids: categoryIds.map((id: any) => String(id)),
                    scroll_behavior: data.scroll_behavior || data.scrollBehavior || 'manual',
                    auto_slide_interval: data.auto_slide_interval ?? data.autoSlideInterval ?? 5000,
                    visibility: normalizeRoleList(
                        data.visibility ?? data.roles ?? data.visible_to ?? data.visibleTo
                    ),
                    ...(data.show_icons !== undefined ? { show_icons: normalizeBoolean(data.show_icons, false) } : {}),
                    ...(data.showIcons !== undefined ? { show_icons: normalizeBoolean(data.showIcons, false) } : {})
                } as unknown as TrendingConfig;
            }
            return {
                id: `trending-default-${Date.now()}`,
                enabled: false,
                title: '',
                category_ids: [],
                scroll_behavior: 'manual',
                auto_slide_interval: 0,
                visibility: []
            };
        } catch (error) {
            console.error('Failed to fetch trending config:', error);
            try {
                const homepage = await CMSService.getHomepage();
                const trendingRaw = homepage?.trending?.config || homepage?.trending || {};
                const categoryIds = ensureArray<string>(trendingRaw.category_ids || trendingRaw.categoryIds || trendingRaw.categories);
                return {
                    id: trendingRaw.id || `trending-${Date.now()}`,
                    enabled: normalizeBoolean(trendingRaw.enabled ?? trendingRaw.is_enabled ?? trendingRaw.isEnabled, false),
                    title: trendingRaw.title ?? '',
                    category_ids: categoryIds.map((id: any) => String(id)),
                    scroll_behavior: trendingRaw.scroll_behavior || trendingRaw.scrollBehavior || 'manual',
                    auto_slide_interval: trendingRaw.auto_slide_interval ?? trendingRaw.autoSlideInterval ?? 5000,
                    visibility: normalizeRoleList(
                        trendingRaw.visibility ?? trendingRaw.roles ?? trendingRaw.visible_to ?? trendingRaw.visibleTo
                    ),
                    ...(trendingRaw.show_icons !== undefined ? { show_icons: normalizeBoolean(trendingRaw.show_icons, false) } : {}),
                    ...(trendingRaw.showIcons !== undefined ? { show_icons: normalizeBoolean(trendingRaw.showIcons, false) } : {})
                } as unknown as TrendingConfig;
            } catch (fallbackError) {
                console.error('Failed to fallback trending config from homepage:', fallbackError);
                return {
                    id: `trending-fallback-${Date.now()}`,
                    enabled: false,
                    title: '',
                    category_ids: [],
                    scroll_behavior: 'manual',
                    auto_slide_interval: 0,
                    visibility: []
                };
            }
        }
    },

    saveTrendingConfig: async (config: TrendingConfig): Promise<TrendingConfig> => {
        try {
            // Log payload for debugging E2E saves (dev only)
            try {
                devLog('[CMSService] saveTrendingConfig payload:', config);
            } catch (e) {
                /* ignore logging errors */
            }
            // Some deployments expose the legacy admin-only endpoint but not the newer
            // canonical `/cms/trending-config` POST. Try the legacy admin POST first
            // to maximize compatibility, then attempt the canonical endpoint as a
            // fallback if needed.
            try {
                const resLegacy = await api.post(`/cms/trending?role=admin`, config);
                return resLegacy?.data?.data || resLegacy?.data || config;
            } catch (legacyErr: any) {
                // If legacy fails with 404 or similar, try the canonical endpoint
                let legacyStatus = legacyErr?.response?.status || legacyErr?.status;
                if (!legacyStatus) {
                    const msg = String(legacyErr?.message || '');
                    if (msg.includes('HTTP 404')) legacyStatus = 404;
                }
                // Try canonical endpoint regardless of legacyStatus unless it's a permission error
                try {
                    const res = await api.post(`/cms/trending-config`, config);
                    return res?.data?.data || res?.data || config;
                } catch (err: any) {
                    // If canonical also fails, surface a combined error so UI can show meaningful message
                    console.error('Both legacy and canonical trending save endpoints failed', { legacyErr, err });
                    // Re-throw the canonical error (preferred) so caller sees HTTP status/message
                    throw err;
                }
            }
        } catch (error) {
            console.error('Failed to save trending config:', error);
            throw error; // Re-throw so handlers can show error messages
        }
    },

    // --- Activity Config ---
    getActivityConfig: async (): Promise<ActivityConfig> => {
        try {
            const data = await api.get('/cms/activity');
            return (
                data ||
                ({
                    icons: [],
                    helpMenu: [],
                    help_menu: [],
                    design: {
                        iconStyle: 'outline',
                        iconSize: 20,
                        badgeColor: '',
                        showBadges: true,
                        icon_style: 'outline',
                        icon_size: 20,
                        badge_color: '',
                        show_badges: true
                    }
                } as unknown as ActivityConfig)
            );
        } catch (error) {
            console.error('Failed to fetch activity config:', error);
            return {
                icons: [],
                helpMenu: [],
                help_menu: [],
                design: {
                    iconStyle: 'outline',
                    iconSize: 20,
                    badgeColor: '',
                    showBadges: true,
                    icon_style: 'outline',
                    icon_size: 20,
                    badge_color: '',
                    show_badges: true
                }
            } as unknown as ActivityConfig;
        }
    },

    saveActivityConfig: async (config: ActivityConfig): Promise<ActivityConfig> => {
        try {
            const res = await api.post('/cms/activity', config);
            return res?.data || config;
        } catch (error) {
            console.error('Failed to save activity config:', error);
            return config;
        }
    },

    // --- Hero Search Config ---
    getHeroSearchConfig: async () => {
        try {
            const raw = unwrap(await api.get('/cms/hero-search'));
            const source = raw || {};
        const now = Date.now();
        const quickTagsSource = source.quickTags ?? source.quick_tags ?? [];
        const quickTags = ensureArray<any>(quickTagsSource)
            .map((tag: any, index: number) => {
                if (typeof tag === 'string') {
                    return {
                        id: `qt-${now}-${index}`,
                        label: tag,
                        url: '',
                        bgColor: ''
                    };
                }

                const label = tag.label ?? tag.name ?? tag.title ?? '';
                const url = tag.url ?? tag.link ?? tag.href ?? '';
                return {
                    id: tag.id || `qt-${now}-${index}`,
                    label,
                    url,
                    bgColor: tag.bgColor || tag.bg_color || tag.color || ''
                };
            })
            .filter((tag: any) => tag.label);

        const trustedBrandsRaw = source.trustedBrands ?? source.trusted_brands ?? {};
        const trustedBrandsSource = Array.isArray(trustedBrandsRaw)
            ? { logos: trustedBrandsRaw }
            : trustedBrandsRaw;
        const trustedLogos = ensureArray<any>(
            trustedBrandsSource.logos ?? trustedBrandsSource.logo ?? trustedBrandsSource.items
        )
            .map((logo: any, index: number) => {
                if (typeof logo === 'string') {
                    return {
                        id: `logo-${now}-${index}`,
                        src: logo,
                        alt: '',
                        url: '',
                        clickable: false
                    };
                }

                return {
                    id: logo.id || `logo-${now}-${index}`,
                    src: logo.src || logo.image || '',
                    alt: logo.alt || logo.name || 'Brand',
                    url: logo.url || logo.link || '',
                    clickable: Boolean(logo.clickable ?? false)
                };
            })
            .filter((logo: any) => logo.src);

        const trustedBrands = {
            enabled: normalizeBoolean(
                trustedBrandsSource.enabled ?? trustedBrandsSource.is_enabled,
                trustedLogos.length > 0
            ),
            title: trustedBrandsSource.title || trustedBrandsSource.heading || '',
            logos: trustedLogos
        };

        const valuePropRaw = source.valueProp ?? source.value_prop ?? {};
        const valuePropSource = Array.isArray(valuePropRaw) ? { badges: valuePropRaw } : valuePropRaw;
        const badges = ensureArray<any>(valuePropSource.badges ?? valuePropSource.items)
            .map((badge: any, index: number) => {
                if (typeof badge === 'string') {
                    return { id: `badge-${now}-${index}`, label: badge, icon: '' };
                }

                return {
                    id: badge.id || `badge-${now}-${index}`,
                    label: badge.label || badge.title || '',
                    icon: badge.icon || badge.image || ''
                };
            })
            .filter((badge: any) => badge.label);

        const primaryCtaRaw = valuePropSource.primaryCta ?? valuePropSource.primary_cta ?? {};
        const secondaryCtaRaw = valuePropSource.secondaryCta ?? valuePropSource.secondary_cta ?? {};
        const hasValuePropContent =
            Boolean(valuePropSource.heading || valuePropSource.title) ||
            badges.length > 0 ||
            Boolean(valuePropSource.primaryCta || valuePropSource.primary_cta || valuePropSource.primary_cta_text) ||
            Boolean(valuePropSource.secondaryCta || valuePropSource.secondary_cta || valuePropSource.secondary_cta_text);

        const valueProp = {
            enabled: normalizeBoolean(valuePropSource.enabled, hasValuePropContent),
            heading: valuePropSource.heading || valuePropSource.title || '',
            primaryCta: {
                label:
                    primaryCtaRaw.label ??
                    primaryCtaRaw.text ??
                    primaryCtaRaw.title ??
                    valuePropSource.primaryCtaText ??
                    valuePropSource.primary_cta_text ??
                    '',
                url:
                    primaryCtaRaw.url ??
                    primaryCtaRaw.link ??
                    valuePropSource.primaryCtaLink ??
                    valuePropSource.primary_cta_link ??
                    ''
            },
            secondaryCta: {
                label:
                    secondaryCtaRaw.label ??
                    secondaryCtaRaw.text ??
                    secondaryCtaRaw.title ??
                    valuePropSource.secondaryCtaText ??
                    valuePropSource.secondary_cta_text ??
                    '',
                url:
                    secondaryCtaRaw.url ??
                    secondaryCtaRaw.link ??
                    valuePropSource.secondaryCtaLink ??
                    valuePropSource.secondary_cta_link ??
                    ''
            },
            badges
        };

            return {
                ...source,
            headline: source.headline || source.title || '',
            subheadline: source.subheadline || source.subtitle || '',
            searchPlaceholder: source.searchPlaceholder || source.search_placeholder || '',
            searchSize: source.searchSize || source.search_size || 'large',
            searchButtonLabel: source.searchButtonLabel || source.search_button_label || '',
            search_button_label: source.searchButtonLabel || source.search_button_label || '',
            searchButtonAriaLabel: source.searchButtonAriaLabel || source.search_button_aria_label || '',
            search_button_aria_label: source.searchButtonAriaLabel || source.search_button_aria_label || '',
            searchResultsUrl: source.searchResultsUrl || source.search_results_url || '',
            search_results_url: source.searchResultsUrl || source.search_results_url || '',
            aiBadgeLabel: source.aiBadgeLabel || source.ai_badge_label || '',
            ai_badge_label: source.aiBadgeLabel || source.ai_badge_label || '',
            aiBadgeDescription: source.aiBadgeDescription || source.ai_badge_description || '',
            ai_badge_description: source.aiBadgeDescription || source.ai_badge_description || '',
            quickTags,
            trustedBrands,
            valueProp,
            quick_tags: quickTags,
            trusted_brands: trustedBrands,
            value_prop: valueProp
            };
        } catch (error) {
            console.error('Failed to fetch hero search config:', error);
            // Fallback to unified public homepage endpoint
            try {
                const homepage = unwrap(await api.get('/cms/homepage')) || {};
                const source = homepage?.heroSearch ?? homepage?.hero_search ?? homepage;
                // reuse parsing logic by assigning to raw-like structure
                const now = Date.now();
                const quickTagsSource = source.quickTags ?? source.quick_tags ?? [];
                const quickTags = ensureArray<any>(quickTagsSource)
                    .map((tag: any, index: number) => {
                        if (typeof tag === 'string') {
                            return {
                                id: `qt-${now}-${index}`,
                                label: tag,
                                url: '',
                                bgColor: ''
                            };
                        }

                        const label = tag.label ?? tag.name ?? tag.title ?? '';
                        const url = tag.url ?? tag.link ?? tag.href ?? '';
                        return {
                            id: tag.id || `qt-${now}-${index}`,
                            label,
                            url,
                            bgColor: tag.bgColor || tag.bg_color || tag.color || ''
                        };
                    })
                    .filter((tag: any) => tag.label);

                const trustedBrandsRaw = source.trustedBrands ?? source.trusted_brands ?? {};
                const trustedBrandsSource = Array.isArray(trustedBrandsRaw) ? { logos: trustedBrandsRaw } : trustedBrandsRaw;
                const trustedLogos = ensureArray<any>(
                    trustedBrandsSource.logos ?? trustedBrandsSource.logo ?? trustedBrandsSource.items
                )
                    .map((logo: any, index: number) => {
                        if (typeof logo === 'string') {
                            return {
                                id: `logo-${now}-${index}`,
                                src: logo,
                                alt: '',
                                url: '',
                                clickable: false
                            };
                        }

                        return {
                            id: logo.id || `logo-${now}-${index}`,
                            src: logo.src || logo.image || '',
                            alt: logo.alt || logo.name || 'Brand',
                            url: logo.url || logo.link || '',
                            clickable: Boolean(logo.clickable ?? false)
                        };
                    })
                    .filter((logo: any) => logo.src);

                const trustedBrands = {
                    enabled: normalizeBoolean(
                        trustedBrandsSource.enabled ?? trustedBrandsSource.is_enabled,
                        trustedLogos.length > 0
                    ),
                    title: trustedBrandsSource.title || trustedBrandsSource.heading || '',
                    logos: trustedLogos
                };

                const valuePropRaw = source.valueProp ?? source.value_prop ?? {};
                const valuePropSource = Array.isArray(valuePropRaw) ? { badges: valuePropRaw } : valuePropRaw;
                const badges = ensureArray<any>(valuePropSource.badges ?? valuePropSource.items)
                    .map((badge: any, index: number) => {
                        if (typeof badge === 'string') {
                            return { id: `badge-${now}-${index}`, label: badge, icon: '' };
                        }

                        return {
                            id: badge.id || `badge-${now}-${index}`,
                            label: badge.label || badge.title || '',
                            icon: badge.icon || badge.image || ''
                        };
                    })
                    .filter((badge: any) => badge.label);

                const primaryCtaRaw = valuePropSource.primaryCta ?? valuePropSource.primary_cta ?? {};
                const secondaryCtaRaw = valuePropSource.secondaryCta ?? valuePropSource.secondary_cta ?? {};
                const hasValuePropContent =
                    Boolean(valuePropSource.heading || valuePropSource.title) ||
                    badges.length > 0 ||
                    Boolean(valuePropSource.primaryCta || valuePropSource.primary_cta || valuePropSource.primary_cta_text) ||
                    Boolean(valuePropSource.secondaryCta || valuePropSource.secondary_cta || valuePropSource.secondary_cta_text);

                const valueProp = {
                    enabled: normalizeBoolean(valuePropSource.enabled, hasValuePropContent),
                    heading: valuePropSource.heading || valuePropSource.title || '',
                    primaryCta: {
                        label:
                            primaryCtaRaw.label ??
                            primaryCtaRaw.text ??
                            primaryCtaRaw.title ??
                            valuePropSource.primaryCtaText ??
                            valuePropSource.primary_cta_text ??
                            '',
                        url:
                            primaryCtaRaw.url ??
                            primaryCtaRaw.link ??
                            valuePropSource.primaryCtaLink ??
                            valuePropSource.primary_cta_link ??
                            ''
                    },
                    secondaryCta: {
                        label:
                            secondaryCtaRaw.label ??
                            secondaryCtaRaw.text ??
                            secondaryCtaRaw.title ??
                            valuePropSource.secondaryCtaText ??
                            valuePropSource.secondary_cta_text ??
                            '',
                        url:
                            secondaryCtaRaw.url ??
                            secondaryCtaRaw.link ??
                            valuePropSource.secondaryCtaLink ??
                            valuePropSource.secondary_cta_link ??
                            ''
                    },
                    badges
                };

                return {
                    ...source,
                    headline: source.headline || source.title || '',
                    subheadline: source.subheadline || source.subtitle || '',
                    searchPlaceholder: source.searchPlaceholder || source.search_placeholder || '',
                    searchSize: source.searchSize || source.search_size || 'large',
                    searchButtonLabel: source.searchButtonLabel || source.search_button_label || '',
                    search_button_label: source.searchButtonLabel || source.search_button_label || '',
                    searchButtonAriaLabel: source.searchButtonAriaLabel || source.search_button_aria_label || '',
                    search_button_aria_label: source.searchButtonAriaLabel || source.search_button_aria_label || '',
                    searchResultsUrl: source.searchResultsUrl || source.search_results_url || '',
                    search_results_url: source.searchResultsUrl || source.search_results_url || '',
                    aiBadgeLabel: source.aiBadgeLabel || source.ai_badge_label || '',
                    ai_badge_label: source.aiBadgeLabel || source.ai_badge_label || '',
                    aiBadgeDescription: source.aiBadgeDescription || source.ai_badge_description || '',
                    ai_badge_description: source.aiBadgeDescription || source.ai_badge_description || '',
                    quickTags,
                    trustedBrands,
                    valueProp,
                    quick_tags: quickTags,
                    trusted_brands: trustedBrands,
                    value_prop: valueProp
                };
            } catch (fallbackError) {
                console.error('Failed to fallback hero search config from homepage:', fallbackError);
                return {} as any;
            }
        }
    },
    saveHeroSearchConfig: async (c: any) => {
        const sizeRaw = c?.search_size ?? c?.searchSize;
        const normalizedSize =
            sizeRaw === 'extra-large' || sizeRaw === 'extraLarge' ? 'xl' : sizeRaw;
        const buttonLabel = c?.search_button_label ?? c?.searchButtonLabel;
        const buttonAriaLabel = c?.search_button_aria_label ?? c?.searchButtonAriaLabel;
        const resultsUrl = c?.search_results_url ?? c?.searchResultsUrl;
        const aiBadgeLabel = c?.ai_badge_label ?? c?.aiBadgeLabel;
        const aiBadgeDescription = c?.ai_badge_description ?? c?.aiBadgeDescription;
        const payload = {
            ...c,
            ...(normalizedSize ? { search_size: normalizedSize, searchSize: normalizedSize } : {}),
            ...(buttonLabel !== undefined ? { search_button_label: buttonLabel, searchButtonLabel: buttonLabel } : {}),
            ...(buttonAriaLabel !== undefined
                ? { search_button_aria_label: buttonAriaLabel, searchButtonAriaLabel: buttonAriaLabel }
                : {}),
            ...(resultsUrl !== undefined ? { search_results_url: resultsUrl, searchResultsUrl: resultsUrl } : {}),
            ...(aiBadgeLabel !== undefined ? { ai_badge_label: aiBadgeLabel, aiBadgeLabel } : {}),
            ...(aiBadgeDescription !== undefined
                ? { ai_badge_description: aiBadgeDescription, aiBadgeDescription }
                : {})
        };
        try {
            return await api.post('/cms/hero-search', payload);
        } catch (error) {
            console.error('Failed to save hero search config:', error);
            const status = error?.response?.status || error?.status;
            if (status === 403) {
                throw new Error(`HTTP 403: Admin access required`);
            }
            throw error;
        }
    },

    // --- Auth Pages Config ---
    getAuthPagesConfig: async (): Promise<AuthPagesConfig | null> => {
        if (authPagesCache && Date.now() - authPagesCache.cachedAt < AUTH_PAGES_CACHE_TTL_MS) {
            return authPagesCache.config;
        }

        if (authPagesRequest) {
            return authPagesRequest;
        }

        authPagesRequest = (async () => {
        try {
            const data = unwrap(await api.get('/cms/auth-pages'));
            const config = (data || null) as unknown as AuthPagesConfig | null;
            const normalized = config ? (normalizeAssetUrls(config) as AuthPagesConfig) : null;
            authPagesCache = { config: normalized, cachedAt: Date.now() };
            return normalized;
        } catch (error) {
            console.error('Failed to fetch auth pages config:', error);
            authPagesCache = { config: null, cachedAt: Date.now() };
            return null;
        } finally {
            authPagesRequest = null;
        }
        })();

        return authPagesRequest;
    },

    saveAuthPagesConfig: async (config: AuthPagesConfig): Promise<AuthPagesConfig> => {
        try {
            const data = unwrap(await api.post('/cms/auth-pages', config));
            const normalized = normalizeAssetUrls((data || config) as unknown as AuthPagesConfig) as AuthPagesConfig;
            authPagesCache = { config: normalized, cachedAt: Date.now() };
            return normalized;
        } catch (error) {
            console.error('Failed to save auth pages config:', error);
            throw error;
        }
    },

    // --- System Messages & Email Templates ---
    getSystemMessagesConfig: async (): Promise<{ config: SystemMessagesConfig; variables: SystemMessagesVariables }> => {
        try {
            const raw = await api.get('/cms/system-messages');
            const config = (raw?.data ?? raw?.data?.data ?? raw) as SystemMessagesConfig;
            const variables = (raw?.variables ?? raw?.data?.variables ?? {}) as SystemMessagesVariables;
            return {
                config: config || ({ id: 'system_messages', templates: {}, updated_at: new Date().toISOString() } as SystemMessagesConfig),
                variables
            };
        } catch (error) {
            console.error('Failed to fetch system messages config:', error);
            throw error;
        }
    },

    saveSystemMessagesConfig: async (config: SystemMessagesConfig): Promise<{ config: SystemMessagesConfig; variables: SystemMessagesVariables }> => {
        try {
            const payload = { ...config, updated_at: new Date().toISOString() };
            const raw = await api.post('/cms/system-messages', payload);
            const saved = (raw?.data ?? raw?.data?.data ?? raw) as SystemMessagesConfig;
            const variables = (raw?.variables ?? raw?.data?.variables ?? {}) as SystemMessagesVariables;
            return { config: saved || payload, variables };
        } catch (error) {
            console.error('Failed to save system messages config:', error);
            throw error;
        }
    },

    // --- Answers Page Config ---
    getAnswersPageConfig: async (): Promise<AnswersPageConfig | null> => {
        try {
            const data = unwrap(await api.get('/cms/answers'));
            return (data?.data || data) as AnswersPageConfig;
        } catch (error) {
            console.error('Failed to fetch answers page config:', error);
            return null;
        }
    },

    saveAnswersPageConfig: async (config: AnswersPageConfig): Promise<AnswersPageConfig> => {
        try {
            const data = unwrap(await api.post('/cms/answers', { data: config }));
            return (data?.data || data || config) as AnswersPageConfig;
        } catch (error) {
            console.error('Failed to save answers page config:', error);
            throw error;
        }
    },

    // --- Guides Page Config ---
    getGuidesPageConfig: async (): Promise<GuidesPageConfig | null> => {
        try {
            const data = unwrap(await api.get('/cms/guides'));
            return (data?.data || data) as GuidesPageConfig;
        } catch (error) {
            console.error('Failed to fetch guides page config:', error);
            return null;
        }
    },

    saveGuidesPageConfig: async (config: GuidesPageConfig): Promise<GuidesPageConfig> => {
        try {
            const data = unwrap(await api.post('/cms/guides', { data: config }));
            return (data?.data || data || config) as GuidesPageConfig;
        } catch (error) {
            console.error('Failed to save guides page config:', error);
            throw error;
        }
    },

    // --- Hire Page Config ---
    getHirePageConfig: async (): Promise<HirePageConfig | null> => {
        try {
            const data = unwrap(await api.get('/cms/hire'));
            return (data?.data || data) as HirePageConfig;
        } catch (error) {
            console.error('Failed to fetch hire page config:', error);
            return null;
        }
    },

    saveHirePageConfig: async (config: HirePageConfig): Promise<HirePageConfig> => {
        try {
            const data = unwrap(await api.post('/cms/hire', { data: config }));
            return (data?.data || data || config) as HirePageConfig;
        } catch (error) {
            console.error('Failed to save hire page config:', error);
            throw error;
        }
    },

    // --- Freelancer Page Config ---
    getFreelancerPageConfig: async (): Promise<FreelancerPageConfig | null> => {
        try {
            const data = unwrap(await api.get('/cms/freelancer'));
            return (data?.data || data) as FreelancerPageConfig;
        } catch (error) {
            console.error('Failed to fetch freelancer page config:', error);
            return null;
        }
    },

    saveFreelancerPageConfig: async (config: FreelancerPageConfig): Promise<FreelancerPageConfig> => {
        try {
            const data = unwrap(await api.post('/cms/freelancer', { data: config }));
            return (data?.data || data || config) as FreelancerPageConfig;
        } catch (error) {
            console.error('Failed to save freelancer page config:', error);
            throw error;
        }
    },

    // --- File Upload ---
    uploadMedia: async (file: File): Promise<MediaItem> => {
        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch(`${getCmsApiUrl()}/cms/media`, {
                method: 'POST',
                credentials: shouldIncludeBrowserCredentials() ? 'include' : 'omit',
                headers: {
                    ...(await getAuthHeaders())
                },
                body: formData
            });

            if (!res.ok) {
                const errorText = await res.text();
                throw new Error(`HTTP ${res.status}: ${errorText || res.statusText}`);
            }

            return await res.json();
        } catch (error) {
            console.error('Failed to upload media:', error);
            throw error;
        }
    },

    // --- Existing Stub Methods (Preserved with corrected endpoints) ---
    getLandingContent: async () => ({
        hero: { headline: '', subheadline: '', primaryCtaText: '', primaryCtaLink: '', secondaryCtaText: '', secondaryCtaLink: '', backgroundImage: '', showTrustBadges: false },
        stats: [], howItWorks: { showVideo: false, employerSteps: [], freelancerSteps: [] }, whyChoose: {}, testimonials: [], cta: { headline: '', subheadline: '', buttonText: '', buttonLink: '' }
    }),

    addHomepageSection: async (type: any) => {
        const buildMemberHomeTemplate = () => ({
            title: 'Grow your professional world',
            subtitle: 'Catch up on your network, opportunities, and community highlights.',
            searchPlaceholder: 'Search posts, jobs, gigs, people, or pages',
            searchHint: 'Search across posts, jobs, gigs, people, and pages.',
            showSearch: true,
            showDiscover: true,
            showFollowing: true,
            showComposer: true,
            showStories: true,
            showMessages: true,
            showSlider: true,
            showProfiles: true,
            showPagesRecommendations: true,
            showProfileViewers: true,
            showProfileViewing: true,
            showJobs: true,
            showEmployers: true,
            showGigs: true,
            showFreelancers: true,
            maxFeedItems: 12,
            maxStories: 8,
            maxMessages: 6,
            maxSearchResults: 8,
            maxProfiles: 8,
            maxPagesRecommendations: 6,
            maxProfileViewers: 6,
            maxProfileViewing: 6,
            maxJobs: 6,
            maxGigs: 6,
            topics: DEFAULT_MEMBER_HOME_TOPICS,
            regions: DEFAULT_MEMBER_HOME_REGIONS,
            composerTitle: 'Share a quick update or idea with your network.',
            storyTitle: 'Stories',
            reelsTitle: 'Scroll',
            feedTitle: 'Home feed',
            profilesTitle: 'Add to your feed',
            pagesTitle: 'Pages to follow',
            profileViewersTitle: 'Profile viewers',
            profileViewingTitle: 'Recently viewed',
            jobsTitle: 'Job recommendations',
            gigsTitle: 'Gigs you can hire',
            employersTitle: 'Employers to follow',
            freelancersTitle: 'Freelancers to connect',
            messagesTitle: 'Recent messages',
            sliderTitle: 'Highlights',
            featuredActionsTitle: 'Featured',
            projectBriefQuickActionTitle: 'Scrolitha Project Brief',
            projectBriefQuickActionSubtitle: 'Draft a professional project brief with AI',
            gigCreationQuickActionTitle: 'Scrolitha Gig Creation',
            gigCreationQuickActionSubtitle: 'Generate your gig setup with AI guidance',
            sliderItems: []
        });
        const templates: Record<string, any> = {
            member_home: buildMemberHomeTemplate(),
            popular_services: { title: '', subtitle: '', items: [] },
            promo_banners: { title: '', items: [] },
            trust_value: { title: '', subtitle: '', items: [] },
            video_feature: { eyebrow: '', title: '', subtitle: '', videoUrl: '', poster: '', ctaLabel: '', ctaUrl: '' },
            marketplace_tiles: { title: '', subtitle: '', items: [] },
            guides_grid: { title: '', subtitle: '', items: [] },
            made_on_Scrolith: { title: '', subtitle: '', items: [] },
            guest_hero_auth: {
                headline: '',
                subheadline: '',
                description: '',
                primaryCtaLabel: 'Create account',
                primaryCtaUrl: '/auth/signup',
                secondaryCtaLabel: 'Log in',
                secondaryCtaUrl: '/auth/login',
                heroBackgroundUrl: '',
                authPanelTitle: '',
                authPanelSubtitle: '',
                defaultTab: 'signup',
                enableSocialLogin: true,
                loginCtaLabel: 'Login',
                signupCtaLabel: 'Sign up',
                scrolitha: {
                    enabled: true,
                    eyebrow: 'Scrolitha Live Assistant',
                    title: 'Talk to Scrolitha before you create your account',
                    subtitle: 'Launch guided AI onboarding directly from the guest homepage.',
                    description: 'Visitors can preview gig creation, hiring, briefs, and marketplace workflows before signing in.',
                    primaryPrompt: 'Create a gig draft',
                    primaryLabel: 'Open Scrolitha',
                    secondaryLabel: 'Join with popup',
                    secondaryUrl: '/auth/signup',
                    promptChips: ['Create a gig draft', 'Generate a project brief', 'How do I start on Scrolith?']
                },
                authPopup: {
                    enabled: true,
                    delaySeconds: 120,
                    headline: 'Stay on Scrolith and continue your account setup',
                    subheadline: 'Sign in or join directly from the guest homepage with the same enterprise auth controls.',
                    defaultTab: 'signup',
                    dismissLabel: 'Maybe later',
                    trustNote: 'This popup is additive to your existing auth pages and can be dismissed anytime.'
                }
            },
            guest_what_is_scrolith: {
                title: '',
                subtitle: '',
                cards: []
            },
            guest_paths: {
                title: '',
                subtitle: '',
                freelancerTitle: 'Freelancer',
                freelancerBullets: [],
                freelancerCtaLabel: '',
                freelancerCtaUrl: '/auth/signup',
                employerTitle: 'Employer',
                employerBullets: [],
                employerCtaLabel: '',
                employerCtaUrl: '/auth/signup'
            },
            guest_feature_showcase: {
                title: '',
                subtitle: '',
                tabs: []
            },
            guest_trending_preview: {
                title: '',
                subtitle: '',
                jobsTitle: 'Trending Jobs',
                gigsTitle: 'Trending Gigs',
                postsTitle: 'Popular Posts',
                jobs: [],
                gigs: [],
                posts: []
            },
            guest_community_preview: {
                title: '',
                subtitle: '',
                ctaLabel: 'Sign up to interact',
                ctaUrl: '/auth/signup',
                posts: []
            },
            guest_final_cta: {
                title: '',
                subtitle: '',
                primaryCtaLabel: 'Sign up',
                primaryCtaUrl: '/auth/signup',
                secondaryCtaLabel: 'Login',
                secondaryCtaUrl: '/auth/login'
            },
            footer_cta_strip: {
                title: '',
                subtitle: '',
                ctaLabel: '',
                ctaUrl: '',
                secondaryCtaLabel: '',
                secondaryCtaUrl: '',
                background: '',
                textColor: ''
            }
        };
        const guestOnlyTypes = new Set([
            'popular_services',
            'promo_banners',
            'trust_value',
            'video_feature',
            'marketplace_tiles',
            'guides_grid',
            'made_on_Scrolith',
            'footer_cta_strip',
            'guest_hero_auth',
            'guest_what_is_scrolith',
            'guest_paths',
            'guest_feature_showcase',
            'guest_trending_preview',
            'guest_community_preview',
            'guest_final_cta'
        ]);
        const targetingRoles = type === 'member_home'
            ? [UserRole.FREELANCER, UserRole.EMPLOYER, UserRole.ADMIN]
            : guestOnlyTypes.has(type)
                ? [UserRole.GUEST]
                : [];
        const newSection = {
            id: `sec-${Date.now()}`,
            type,
            name: type === 'member_home' ? 'Signed-in Member Home' : `New ${type} Section`,
            isActive: true,
            position: 99,
            content: templates[type] ?? {},
            style: {},
            targeting: { roles: targetingRoles }
        };
        await api.post('/cms/homepage/sections/update', newSection);
        return newSection;
    },
    updateSectionOrder: async (sections: any[]) => {
        for(const sec of sections) {
            await api.post('/cms/homepage/sections/update', sec);
        }
    },
    deleteHomepageSection: async (id: string) => {
        await api.post('/cms/homepage/sections/delete', { id });
    },

    getTemplates: async () => {
        try {
            const data = await api.get('/cms/templates');
            return data || [];
        } catch (error) {
            console.error('Failed to fetch templates:', error);
            return [];
        }
    },

    saveTemplate: async (template: any) => {
        try {
            const res = await api.post('/cms/templates', template);
            return res?.data || template;
        } catch (error) {
            console.error('Failed to save template:', error);
            return template;
        }
    },

    loadTemplate: async (id: string) => {
        try {
            const data = await api.get(`/cms/templates/${id}`);
            return data || null;
        } catch (error) {
            console.error(`Failed to load template ${id}:`, error);
            return null;
        }
    },

    getABTests: async () => {
        try {
            const data = await api.get('/cms/ab-tests');
            return data || [];
        } catch (error) {
            console.error('Failed to fetch AB tests:', error);
            return [];
        }
    },

    createABTest: async (test: any) => {
        try {
            const res = await api.post('/cms/ab-tests', test);
            return res?.data || test;
        } catch (error) {
            console.error('Failed to create AB test:', error);
            return test;
        }
    },

    saveABTest: async (test: any) => {
        try {
            const res = await api.put(`/cms/ab-tests/${test.id}`, test);
            return res?.data || test;
        } catch (error) {
            console.error('Failed to save AB test:', error);
            return test;
        }
    },

    getHomepageAnalytics: async () => {
        try {
            const data = await api.get('/cms/homepage-analytics');
            return data || {
                views: 0,
                ctaClicks: 0,
                bounceRate: 0,
                avgTimeOnPage: 0,
                deviceBreakdown: { desktop: 0, mobile: 0, tablet: 0 },
                sectionEngagement: []
            };
        } catch (error) {
            console.error('Failed to fetch homepage analytics:', error);
            return {
                views: 0,
                ctaClicks: 0,
                bounceRate: 0,
                avgTimeOnPage: 0,
                deviceBreakdown: { desktop: 0, mobile: 0, tablet: 0 },
                sectionEngagement: []
            };
        }
    },

    getHomepageHistory: async () => [],

    createHomepageVersion: async () => {
        // For development, simulate success
        return { success: true, versionId: `v${Date.now()}` };
    },

    restoreHomepageVersion: async () => {
        // For development, simulate success
        return { success: true };
    },

    // --- Blog Methods ---
    getBlogPosts: async () => {
        try {
            const raw = unwrap(await api.get('/cms/blog/posts'));
            const items = ensureArray<any>(raw);
            return items.map((post: any) => ({
                ...post,
                id: post.id,
                title: post.title ?? '',
                slug: post.slug ?? '',
                content: post.content ?? '',
                blocks: Array.isArray(post.blocks) ? post.blocks : [],
                excerpt: post.excerpt ?? post.short_description ?? post.shortDescription ?? '',
                shortDescription: post.shortDescription ?? post.short_description ?? '',
                short_description: post.short_description ?? post.shortDescription ?? '',
                featuredImage: post.featuredImage ?? post.featured_image ?? '',
                featured_image: post.featured_image ?? post.featuredImage ?? '',
                status: post.status ?? 'draft',
                visibility: post.visibility ?? 'public',
                authorName: post.authorName ?? post.author_name ?? 'Admin',
                author_name: post.author_name ?? post.authorName ?? 'Admin',
                categoryId: post.categoryId ?? post.category_id ?? '',
                category_id: post.category_id ?? post.categoryId ?? '',
                categoryName: post.categoryName ?? post.category_name ?? '',
                category_name: post.category_name ?? post.categoryName ?? '',
                tags: Array.isArray(post.tags) ? post.tags : [],
                views: Number(post.views ?? 0),
                seo: post.seo ?? { metaTitle: '', metaDescription: '', metaKeywords: [], noIndex: false },
                allowComments: post.allowComments ?? post.allow_comments ?? true,
                allow_comments: post.allow_comments ?? post.allowComments ?? true,
                isFeatured: post.isFeatured ?? post.is_featured ?? false,
                is_featured: post.is_featured ?? post.isFeatured ?? false,
                createdAt: post.createdAt ?? post.created_at ?? new Date().toISOString(),
                created_at: post.created_at ?? post.createdAt ?? new Date().toISOString(),
                updatedAt: post.updatedAt ?? post.updated_at ?? new Date().toISOString(),
                updated_at: post.updated_at ?? post.updatedAt ?? new Date().toISOString(),
                scheduledAt: post.scheduledAt ?? post.scheduled_at ?? null,
                scheduled_at: post.scheduled_at ?? post.scheduledAt ?? null
            }));
        } catch (error) {
            console.error('Failed to fetch blog posts:', error);
            return [];
        }
    },
    getAdminBlogPosts: async () => {
        try {
            const raw = unwrap(await api.get('/cms/admin/blog/posts'));
            const items = ensureArray<any>(raw);
            return items.map((post: any) => ({
                ...post,
                id: post.id,
                title: post.title ?? '',
                slug: post.slug ?? '',
                content: post.content ?? '',
                blocks: Array.isArray(post.blocks) ? post.blocks : [],
                excerpt: post.excerpt ?? post.short_description ?? post.shortDescription ?? '',
                shortDescription: post.shortDescription ?? post.short_description ?? '',
                short_description: post.short_description ?? post.shortDescription ?? '',
                featuredImage: post.featuredImage ?? post.featured_image ?? '',
                featured_image: post.featured_image ?? post.featuredImage ?? '',
                status: post.status ?? 'draft',
                visibility: post.visibility ?? 'public',
                authorName: post.authorName ?? post.author_name ?? 'Admin',
                author_name: post.author_name ?? post.authorName ?? 'Admin',
                categoryId: post.categoryId ?? post.category_id ?? '',
                category_id: post.category_id ?? post.categoryId ?? '',
                categoryName: post.categoryName ?? post.category_name ?? '',
                category_name: post.category_name ?? post.categoryName ?? '',
                tags: Array.isArray(post.tags) ? post.tags : [],
                views: Number(post.views ?? 0),
                seo: post.seo ?? { metaTitle: '', metaDescription: '', metaKeywords: [], noIndex: false },
                allowComments: post.allowComments ?? post.allow_comments ?? true,
                allow_comments: post.allow_comments ?? post.allowComments ?? true,
                isFeatured: post.isFeatured ?? post.is_featured ?? false,
                is_featured: post.is_featured ?? post.isFeatured ?? false,
                createdAt: post.createdAt ?? post.created_at ?? new Date().toISOString(),
                created_at: post.created_at ?? post.createdAt ?? new Date().toISOString(),
                updatedAt: post.updatedAt ?? post.updated_at ?? new Date().toISOString(),
                updated_at: post.updated_at ?? post.updatedAt ?? new Date().toISOString(),
                scheduledAt: post.scheduledAt ?? post.scheduled_at ?? null,
                scheduled_at: post.scheduled_at ?? post.scheduledAt ?? null
            }));
        } catch (error) {
            console.error('Failed to fetch admin blog posts:', error);
            return [];
        }
    },

    getBlogPostBySlug: async (slug: string) => {
        try {
            const data = unwrap(await api.get(`/cms/blog/posts/${slug}`));
            return data || undefined;
        } catch (error) {
            console.error(`Failed to fetch blog post ${slug}:`, error);
            return undefined;
        }
    },

    saveBlogPost: async (post: any) => {
        try {
            if (post.id) {
                const res = await api.put(`/cms/blog/posts/${post.id}`, post);
                const data = unwrap(res);
                return data || post;
            } else {
                const res = await api.post('/cms/blog/posts', post);
                const data = unwrap(res);
                return data || post;
            }
        } catch (error) {
            console.error('Failed to save blog post:', error);
            return post;
        }
    },

    deleteBlogPost: async (id: string) => {
        try {
            await api.delete(`/cms/blog/posts/${id}`);
        } catch (error) {
            console.error(`Failed to delete blog post ${id}:`, error);
            // For development, simulate success
        }
    },

    getBlogCategories: async () => {
        try {
            const raw = unwrap(await api.get('/cms/blog/categories'));
            const items = ensureArray<any>(raw);
            return items.map((cat: any) => ({
                ...cat,
                id: cat.id,
                name: cat.name ?? '',
                slug: cat.slug ?? '',
                description: cat.description ?? '',
                status: cat.status ?? 'active',
                count: Number(cat.count ?? 0)
            }));
        } catch (error) {
            console.error('Failed to fetch blog categories:', error);
            return [];
        }
    },

    saveBlogCategory: async (category: any) => {
        try {
            if (category.id) {
                const res = await api.put(`/cms/blog/categories/${category.id}`, category);
                const data = unwrap(res);
                return data || category;
            } else {
                const res = await api.post('/cms/blog/categories', category);
                const data = unwrap(res);
                return data || category;
            }
        } catch (error) {
            console.error('Failed to save blog category:', error);
            return category;
        }
    },

    deleteBlogCategory: async (id: string) => {
        try {
            await api.delete(`/cms/blog/categories/${id}`);
        } catch (error) {
            console.error(`Failed to delete blog category ${id}:`, error);
            // For development, simulate success
        }
    },

    getBlogSettings: async () => {
        try {
            const raw = unwrap(await api.get('/cms/blog/settings'));
            const data = raw || {};
            return {
                ...data,
                pageTitle: data.pageTitle ?? data.page_title ?? 'Blog',
                page_title: data.page_title ?? data.pageTitle ?? 'Blog',
                metaTitle: data.metaTitle ?? data.meta_title ?? 'Scrolith Blog',
                meta_title: data.meta_title ?? data.metaTitle ?? 'Scrolith Blog',
                metaDescription: data.metaDescription ?? data.meta_description ?? 'Latest news and insights from Scrolith',
                meta_description: data.meta_description ?? data.metaDescription ?? 'Latest news and insights from Scrolith',
                bannerImage: data.bannerImage ?? data.banner_image ?? '',
                banner_image: data.banner_image ?? data.bannerImage ?? '',
                postsPerPage: Number(data.postsPerPage ?? data.posts_per_page ?? 10),
                posts_per_page: Number(data.posts_per_page ?? data.postsPerPage ?? 10),
                defaultCategory: data.defaultCategory ?? data.default_category ?? '',
                default_category: data.default_category ?? data.defaultCategory ?? '',
                showAuthor: data.showAuthor ?? data.show_author ?? true,
                show_author: data.show_author ?? data.showAuthor ?? true,
                showDate: data.showDate ?? data.show_date ?? true,
                show_date: data.show_date ?? data.showDate ?? true
            };
        } catch (error) {
            console.error('Failed to fetch blog settings:', error);
            return {
                pageTitle: 'Blog',
                metaTitle: 'Scrolith Blog',
                metaDescription: 'Latest news and insights from Scrolith',
                bannerImage: '',
                postsPerPage: 10,
                defaultCategory: '',
                showAuthor: true,
                showDate: true,
                page_title: 'Blog',
                meta_title: 'Scrolith Blog',
                meta_description: 'Latest news and insights from Scrolith',
                banner_image: '',
                posts_per_page: 10,
                default_category: '',
                show_author: true,
                show_date: true
            };
        }
    },

    updateBlogSettings: async (settings: any) => {
        try {
            const res = await api.post('/cms/blog/settings', settings);
            const data = unwrap(res);
            return data || settings;
        } catch (error) {
            console.error('Failed to update blog settings:', error);
            return settings;
        }
    },

    // --- Media Methods ---
    getMedia: async () => {
        try {
            const data = await api.get('/cms/media');
            return data || [];
        } catch (error) {
            console.error('Failed to fetch media:', error);
            return [];
        }
    },

    deleteMedia: async (id: string) => {
        try {
            await api.delete(`/cms/media/${id}`);
        } catch (error) {
            console.error(`Failed to delete media ${id}:`, error);
            // For development, simulate success
        }
    },

    // --- KYC Methods ---
    getKYCRequests: async () => {
        try {
            const res = await api.get('/admin/kyc/requests');
            const payload = unwrap(res);
            return ensureArray(payload);
        } catch (error) {
            console.error('Failed to fetch KYC requests:', error);
            return [];
        }
    },

    submitKYC: async (data: any) => {
        try {
            const res = await api.post('/kyc/submit', data);
            return unwrap(res) || { success: true };
        } catch (error) {
            console.error('Failed to submit KYC:', error);
            return { success: false, error: 'Failed to submit KYC' };
        }
    },

    updateKYCStatus: async (id: string, status: string, notes?: string) => {
        try {
            const res = await api.post(`/admin/kyc/${id}/status`, { status, notes });
            return unwrap(res) || { success: true };
        } catch (error) {
            console.error(`Failed to update KYC status for ${id}:`, error);
            return { success: false, error: 'Failed to update KYC status' };
        }
    },

    // --- Affiliate Methods ---
    getAffiliateContent: async () => {
        const devAffiliateFallback = {
            heroTitle: 'Become a Scrolith Affiliate',
            heroSubtitle: 'Earn commissions by referring users to our platform',
            heroButtonText: 'Join Now',
            benefits: [
                { title: 'High Commission', description: 'Earn up to 30% commission on referrals' },
                { title: 'Recurring Earnings', description: 'Get paid for as long as your referrals use Scrolith' },
                { title: 'Marketing Tools', description: 'Access banners, links, and tracking tools' }
            ]
        };
        try {
            const raw = unwrap(await api.get('/cms/affiliate/content'));
            // Normalize shapes (accept snake_case or camelCase)
            const source = raw || raw?.data || raw?.affiliate || raw?.affiliateContent || raw;
            const affiliate = source || (import.meta.env.PROD ? {} : devAffiliateFallback);

            return {
                heroTitle: affiliate.heroTitle || affiliate.hero_title || affiliate.title || '',
                heroSubtitle: affiliate.heroSubtitle || affiliate.hero_subtitle || affiliate.subtitle || '',
                heroButtonText: affiliate.heroButtonText || affiliate.hero_button_text || affiliate.buttonText || '',
                benefits: Array.isArray(affiliate.benefits) ? affiliate.benefits : []
            } as unknown as { heroTitle: string; heroSubtitle: string; heroButtonText: string; benefits: any[] };
        } catch (error) {
            console.error('Failed to fetch affiliate content:', error);
            return import.meta.env.PROD
                ? { heroTitle: '', heroSubtitle: '', heroButtonText: '', benefits: [] }
                : (devAffiliateFallback as unknown as { heroTitle: string; heroSubtitle: string; heroButtonText: string; benefits: any[] });
        }
    },

    saveAffiliateContent: async (content: any) => {
        try {
            const res = await api.post('/cms/affiliate/content', content);
            return res?.data || content;
        } catch (error) {
            console.error('Failed to save affiliate content:', error);
            throw error; // bubble up so UI shows failure
        }
    },

    // --- Helper methods for backward compatibility ---
    // FIXED: These methods were trying to access wrong endpoints
    getSystemSettings: async (): Promise<any> => {
        try {
            const raw = unwrap(await api.get('/admin/system/settings')) || {};

            const source: any = raw || {};

            const system = {
                maintenanceMode: normalizeBoolean(
                    source.maintenanceMode ?? source.maintenance_mode ?? source.system?.maintenanceMode ?? source.system?.maintenance_mode,
                    false
                ),
                registrationsEnabled: normalizeBoolean(
                    source.registrationsEnabled ?? source.registrations_enabled ?? source.system?.registrationsEnabled ?? source.system?.registrations_enabled,
                    true
                ),
                kycEnforced: normalizeBoolean(
                    source.kycEnforced ?? source.kyc_enforced ?? source.system?.kycEnforced ?? source.system?.kyc_enforced,
                    false
                ),
                admin2FA: normalizeBoolean(
                    source.admin2FA ?? source.admin_2fa ?? source.system?.admin2FA ?? source.system?.admin_2fa,
                    false
                ),
                regionalCompliance: ensureArray<any>(
                    source.regionalCompliance ?? source.regional_compliance ?? source.regional ?? source.system?.regionalCompliance ?? source.system?.regional_compliance
                ),
                storage: source.storage ?? source.system?.storage ?? { driver: 'local', s3: {}, backblaze: {} },
                email: source.email ?? source.system?.email ?? { provider: '', host: '', port: 0, username: '', password: '', fromName: '', fromEmail: '' },
                currency: source.currency ?? source.system?.currency ?? { autoExchangeRate: false, baseCurrency: 'USD', provider: '', apiKey: '' },
                currencies: ensureArray<any>(source.currencies ?? source.currency_list ?? source.system?.currencies),
                aiConfig: source.aiConfig ?? source.system?.aiConfig ?? null,
                // keep any other root-level keys so callers can access extras without needing another fetch
                ...source
            };

            return system;
        } catch (error) {
            console.error('Failed to fetch system settings:', error);
            return import.meta.env.PROD
                ? { maintenanceMode: false, registrationsEnabled: true, kycEnforced: false, admin2FA: false }
                : fallbackData.settings.system;
        }
    },

    saveSystemSettings: async (settings: any): Promise<any> => {
        try {
            const res = await api.post('/admin/system/settings', settings);
            const raw = unwrap(res) || res?.data || res;
            return raw || settings;
        } catch (error) {
            console.error('Failed to save system settings:', error);
            return settings;
        }
    }
};

