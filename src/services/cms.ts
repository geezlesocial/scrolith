import { PlatformSettings, HomepageSection, HomeSlide, HeaderConfig, FooterConfig, TrendingConfig, ActivityConfig, UserRole, HeroSearchConfig, StaticPage, PageCategory, MediaItem, AuthPagesConfig } from '../types';

// FIXED: Use relative URL for proxy instead of hardcoded localhost:5000
// Resolve API base: prefer explicit backend URL in builds, otherwise use proxy '/api' in dev.
const _hasBackendEnv = Boolean(
    import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL
);
if (import.meta.env.PROD && !_hasBackendEnv) {
    throw new Error('VITE_BACKEND_URL (or VITE_API_URL) must be set when building for production');
}
const API_URL =
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    (import.meta.env.VITE_BACKEND_URL ? `${String(import.meta.env.VITE_BACKEND_URL).replace(/\/$/, '')}/api` : '') ||
    '/api'; // dev proxy

const devLog = (...args: any[]) => {
    if (!import.meta.env.PROD) console.log(...args);
};
const devWarn = (...args: any[]) => {
    if (!import.meta.env.PROD) console.warn(...args);
};

// --- Fallback Data ---
const fallbackData = {
    // CMS Pages
    pages: [
        {
            id: 'page-about',
            title: 'About Us',
            slug: 'about',
            content: '<h1>About Geezle Marketplace</h1><p>Geezle is a platform connecting talented freelancers with clients worldwide. We provide a secure and efficient marketplace for digital services.</p>',
            status: 'PUBLISHED',
            categoryId: 'cat-general',
            category_id: 'cat-general',
            updatedAt: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            visibility: 'public',
            seo: {
                metaTitle: 'About Geezle Marketplace',
                metaDescription: 'Learn about Geezle - the freelance marketplace connecting talent with opportunity worldwide.',
                metaKeywords: ['freelance', 'marketplace', 'digital services', 'talent']
            },
            images: [],
            videos: [],
            blocks: []
        },
        {
            id: 'page-privacy',
            title: 'Privacy Policy',
            slug: 'privacy-policy',
            content: '<h1>Privacy Policy</h1><p>Your privacy is important to us. This policy explains how we collect, use, and protect your information.</p>',
            status: 'PUBLISHED',
            categoryId: 'cat-legal',
            category_id: 'cat-legal',
            updatedAt: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            visibility: 'public',
            seo: {
                metaTitle: 'Privacy Policy - Geezle',
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
            slug: 'terms-of-service',
            content: '<h1>Terms of Service</h1><p>By using Geezle, you agree to these terms and conditions.</p>',
            status: 'PUBLISHED',
            categoryId: 'cat-legal',
            category_id: 'cat-legal',
            updatedAt: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            visibility: 'public',
            seo: {
                metaTitle: 'Terms of Service - Geezle',
                metaDescription: 'Terms and conditions for using Geezle Marketplace.',
                metaKeywords: ['terms', 'service', 'agreement']
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
        siteName: 'Geezle Marketplace',
        siteDescription: 'Connect with top freelancers and find your next project',
        siteTagline: 'Find, hire, and work with the best talent',
        logoUrl: '/logo.svg',
        faviconUrl: '/favicon.ico',
        adminEmail: 'admin@geezle.com',
        supportEmail: 'support@geezle.com',
        footerAboutTitle: 'About Geezle',
        footerAboutText: 'Connecting talent with opportunity worldwide.',
        footerCopyright: '© 2024 Geezle Inc. All rights reserved.',
        footerLinks: [
            { label: 'About Us', url: '/about', type: 'internal' },
            { label: 'Privacy Policy', url: '/privacy-policy', type: 'internal' },
            { label: 'Terms of Service', url: '/terms-of-service', type: 'internal' }
        ],
        socialLinks: [
            { platform: 'twitter', url: 'https://twitter.com/geezle' },
            { platform: 'facebook', url: 'https://facebook.com/geezle' },
            { platform: 'linkedin', url: 'https://linkedin.com/company/geezle' }
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
        case 'madeongeezle':
        case 'made_on_geezle':
        case 'made-on-geezle':
        case 'made_on':
            return 'made_on_geezle';
        case 'footer_cta_strip':
        case 'footer-cta-strip':
        case 'footerctastrip':
            return 'footer_cta_strip';
        default:
            return cleaned;
    }
};

const normalizeNavItem = (item: any) => {
    if (!item) return null;
    const visibility = normalizeRoleList(
        item.visibility ?? item.roles ?? item.target_roles ?? item.visible_to ?? item.visibleTo
    );
    const label = item.label ?? item.title ?? item.name ?? '';
    const url = item.url ?? item.href ?? item.link ?? '';
    const group = item.group ?? item.section ?? item.menu_group ?? item.menuGroup ?? '';
    return {
        ...item,
        label,
        url,
        group,
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

const getAuthHeaders = () => {
    const token = localStorage.getItem('token');
    return token ? { Authorization: `Bearer ${token}` } : {};
};

// --- API HELPER ---
const api = {
    get: async (endpoint: string) => {
        try {
            const url = `${API_URL}${endpoint}`;
            devLog(`🌐 API GET: ${url}`);

            const res = await fetch(url, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    ...getAuthHeaders()
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
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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
            const res = await fetch(`${API_URL}${endpoint}`, {
                method: 'DELETE',
                headers: { ...getAuthHeaders() }
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

    // --- System Settings (Synced Real-Time) ---
    // FIXED: Updated to use correct endpoints
    getSettings: async (): Promise<PlatformSettings> => {
        const raw = unwrap(await api.get('/admin/settings'));
        const source = raw?.settings ?? raw?.data?.settings ?? raw ?? {};

        const siteName = source.siteName ?? source.site_name ?? 'Geezle';
        const tagline = source.tagline ?? source.siteTagline ?? source.site_tagline ?? 'Marketplace';
        const logoUrl = source.logoUrl ?? source.logo_url ?? '';
        const faviconUrl = source.faviconUrl ?? source.favicon_url ?? '';
        const adminEmail = source.adminEmail ?? source.admin_email ?? 'admin@geezle.com';
        const supportEmail = source.supportEmail ?? source.support_email ?? 'support@geezle.com';
        const footerAboutTitle = source.footerAboutTitle ?? source.footer_about_title ?? 'About';
        const footerAboutText = source.footerAboutText ?? source.footer_about_text ?? 'About text';
        const footerCopyright = source.footerCopyright ?? source.footer_copyright ?? '© 2024';
        const footerLinks = source.footerLinks ?? source.footer_links ?? [];
        const socialLinks = source.socialLinks ?? source.social_links ?? [];

        return {
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
        } as any;
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
            if (items.length === 0) return import.meta.env.PROD ? [] : (fallbackData.pages as any as StaticPage[]);
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
            return import.meta.env.PROD ? [] : (fallbackData.pages as any as StaticPage[]);
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
                : ((fallbackData.pages as any[]).find((page: any) => page.slug === slug) as StaticPage | undefined);
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
            } as any) as StaticPage;
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
            if (items.length === 0) return import.meta.env.PROD ? [] : (fallbackData.pageCategories as any as PageCategory[]);
            return items.map((cat: any) => ({
                ...cat,
                sortOrder: cat.sortOrder ?? cat.sort_order ?? 0,
                sort_order: cat.sort_order ?? cat.sortOrder ?? 0,
                created_at: cat.created_at ?? cat.createdAt ?? new Date().toISOString(),
                updated_at: cat.updated_at ?? cat.updatedAt ?? new Date().toISOString()
            })) as PageCategory[];
        } catch (error) {
            console.error('Failed to fetch page categories:', error);
            return import.meta.env.PROD ? [] : (fallbackData.pageCategories as any as PageCategory[]);
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
                        const res = await fetch(`${API_URL}${url}`, {
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
                    return { sections: [], slides: [], pageType: 'homepage', published: false };
                }

                devLog('✅ Homepage API response:', {
                        hasSections: !!fallback.sections,
                        sectionsCount: Array.isArray(fallback.sections) ? fallback.sections.length : 0,
                        hasSlides: !!fallback.slides,
                        slidesCount: Array.isArray(fallback.slides) ? fallback.slides.length : 0,
                        pageType: fallback.pageType,
                        published: fallback.published
                });

                return fallback;
        } catch (error) {
                console.error('❌ Failed to fetch homepage:', error);
                return { sections: [], slides: [], pageType: 'homepage', published: false };
        }
},

    getHomepageSections: async (options?: { role?: UserRole; location?: string }) => {
        let rawSections: any[] = [];
        try {
            const data = unwrap(await api.get('/cms/homepage/sections'));
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
                section?.targeting?.roles ?? section?.target_roles ?? section?.roles ?? section?.visibility
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
                target_roles: normalizedTargetRoles,
                targeting: { roles: normalizedTargetRoles },
                roles: normalizedTargetRoles
            };
        });

        if (options?.role) {
            const role = normalizeRole(options.role);
            sections = sections.filter((s: any) => {
                const roles = normalizeRoleList(
                    s?.targeting?.roles ?? s?.target_roles ?? s?.roles ?? s?.visibility
                );
                if (roles.length === 0) return true;
                if (roles.includes('all') || roles.includes('*')) return true;
                return roles.includes(role);
            });
        }

        return sections.sort((a, b) => a.position - b.position);
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

        let slides = rawSlides as any[];
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
            slides = homepageSlides as any[];
        }

        return slides.map((slide: any, index: number) => {
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
    },
    saveHomeSlide: async (s: any) => api.post('/cms/slides/save', s),
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

            return {
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
            } as any;
        } catch (error) {
            console.error('Failed to fetch header config:', error);
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
            } as any;
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
            throw error; // Re-throw so handlers can show error messages
        }
    },

    // --- Footer Config ---
    getFooterConfig: async (): Promise<FooterConfig> => {
        try {
            const raw = unwrap(await api.get('/cms/footer'));
            const source = raw || {};
            const now = Date.now();

            const columnsSource = source.columns ?? source.footer_columns ?? source.items ?? [];
            const columns = ensureArray<any>(columnsSource).map((column: any, colIndex: number) => {
                const linksSource = column.links ?? column.items ?? column.children ?? [];
                const links = ensureArray<any>(linksSource).map((link: any, linkIndex: number) => {
                    const url = link.url ?? link.href ?? link.link ?? '';
                    const type = link.type ?? (url && String(url).startsWith('http') ? 'external' : 'internal');
                    return {
                        id: link.id || `footer-link-${now}-${colIndex}-${linkIndex}`,
                        label: link.label ?? link.title ?? '',
                        url,
                        visibility: normalizeRoleList(
                            link.visibility ?? link.roles ?? link.target_roles ?? link.visible_to ?? link.visibleTo
                        ),
                        type
                    };
                });

                return {
                    id: column.id || `footer-col-${now}-${colIndex}`,
                    title: column.title ?? column.label ?? '',
                    links
                };
            });

            const contactSource = source.contact ?? source.footer_contact ?? {};
            const adminEmail = contactSource.admin_email ?? contactSource.adminEmail ?? '';
            const supportEmail = contactSource.support_email ?? contactSource.supportEmail ?? '';
            const ticketRoute = contactSource.ticket_route ?? contactSource.ticketRoute ?? '';

            const socialsSource = source.socials ?? source.social_links ?? source.socialLinks ?? [];
            const socials = ensureArray<any>(socialsSource).map((social: any, index: number) => ({
                id: social.id || `footer-social-${now}-${index}`,
                platform: social.platform ?? social.name ?? '',
                url: social.url ?? '',
                enabled: normalizeBoolean(social.enabled ?? social.is_enabled, true),
                icon: social.icon ?? social.icon_url ?? ''
            }));

            const logoUrl = source.logo_url ?? source.logoUrl ?? '';
            const description = source.description ?? source.footer_description ?? '';
            const copyright = source.copyright ?? source.footer_copyright ?? '';

            return {
                ...source,
                id: source.id || `footer-${now}`,
                description,
                copyright,
                columns,
                contact: {
                    admin_email: adminEmail,
                    support_email: supportEmail,
                    ticket_route: ticketRoute
                },
                socials,
                logo_url: logoUrl,
                logoUrl
            } as any;
        } catch (error) {
            console.error('Failed to fetch footer config:', error);
            return {
                id: 'default',
                description: '',
                copyright: '',
                columns: [],
                contact: {
                    admin_email: '',
                    support_email: '',
                    ticket_route: ''
                },
                socials: [],
                logo_url: ''
            };
        }
    },

    saveFooterConfig: async (config: FooterConfig): Promise<FooterConfig> => {
        try {
            const source: any = config || {};
            const contactSource = source.contact ?? {};
            const columnsSource = ensureArray<any>(source.columns);
            const socialsSource = ensureArray<any>(source.socials);
            const payload = {
                ...source,
                logo_url: source.logo_url ?? source.logoUrl ?? '',
                logoUrl: source.logo_url ?? source.logoUrl ?? '',
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
                } as any;
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
                } as any;
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
            const res = await api.post(`/cms/trending?role=admin`, config);
            // Backend returns { success: true, message: '...', data: {...} }
            return res?.data?.data || res?.data || config;
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
                } as any)
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
            } as any;
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
        return api.post('/cms/hero-search', payload);
    },

    // --- Auth Pages Config ---
    getAuthPagesConfig: async (): Promise<AuthPagesConfig | null> => {
        try {
            const data = unwrap(await api.get('/cms/auth-pages'));
            return (data || null) as any;
        } catch (error) {
            console.error('Failed to fetch auth pages config:', error);
            return null;
        }
    },

    saveAuthPagesConfig: async (config: AuthPagesConfig): Promise<AuthPagesConfig> => {
        try {
            const data = unwrap(await api.post('/cms/auth-pages', config));
            return (data || config) as any;
        } catch (error) {
            console.error('Failed to save auth pages config:', error);
            throw error;
        }
    },

    // --- File Upload ---
    uploadMedia: async (file: File): Promise<MediaItem> => {
        try {
            const formData = new FormData();
            formData.append('file', file);

            const res = await fetch(`${API_URL}/cms/media`, {
                method: 'POST',
                headers: {
                    ...getAuthHeaders()
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
        const templates: Record<string, any> = {
            popular_services: { title: '', subtitle: '', items: [] },
            promo_banners: { title: '', items: [] },
            trust_value: { title: '', subtitle: '', items: [] },
            video_feature: { eyebrow: '', title: '', subtitle: '', videoUrl: '', poster: '', ctaLabel: '', ctaUrl: '' },
            marketplace_tiles: { title: '', subtitle: '', items: [] },
            guides_grid: { title: '', subtitle: '', items: [] },
            made_on_geezle: { title: '', subtitle: '', items: [] },
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
            'made_on_geezle',
            'footer_cta_strip'
        ]);
        const targetingRoles = guestOnlyTypes.has(type) ? [UserRole.GUEST] : [];
        const newSection = {
            id: `sec-${Date.now()}`,
            type,
            name: `New ${type} Section`,
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
            const data = await api.get('/cms/blog/posts');
            return data || [];
        } catch (error) {
            console.error('Failed to fetch blog posts:', error);
            return [];
        }
    },

    getBlogPostBySlug: async (slug: string) => {
        try {
            const data = await api.get(`/cms/blog/posts/${slug}`);
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
                return res?.data || post;
            } else {
                const res = await api.post('/cms/blog/posts', post);
                return res?.data || post;
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
            const data = await api.get('/cms/blog/categories');
            return data || [];
        } catch (error) {
            console.error('Failed to fetch blog categories:', error);
            return [];
        }
    },

    saveBlogCategory: async (category: any) => {
        try {
            if (category.id) {
                const res = await api.put(`/cms/blog/categories/${category.id}`, category);
                return res?.data || category;
            } else {
                const res = await api.post('/cms/blog/categories', category);
                return res?.data || category;
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

    getBlogSettings: async () => ({
        pageTitle: 'Blog',
        metaTitle: 'Geezle Blog',
        metaDescription: 'Latest news and insights from Geezle',
        bannerImage: '',
        postsPerPage: 10,
        defaultCategory: '',
        showAuthor: true,
        showDate: true
    }),

    updateBlogSettings: async (settings: any) => {
        try {
            const res = await api.post('/cms/blog/settings', settings);
            return res?.data || settings;
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
            const data = await api.get('/admin/kyc/requests');
            return data || [];
        } catch (error) {
            console.error('Failed to fetch KYC requests:', error);
            return [];
        }
    },

    submitKYC: async (data: any) => {
        try {
            const res = await api.post('/admin/kyc/submit', data);
            return res?.data || { success: true };
        } catch (error) {
            console.error('Failed to submit KYC:', error);
            return { success: false, error: 'Failed to submit KYC' };
        }
    },

    updateKYCStatus: async (id: string, status: string, notes?: string) => {
        try {
            const res = await api.post(`/admin/kyc/${id}/status`, { status, notes });
            return res?.data || { success: true };
        } catch (error) {
            console.error(`Failed to update KYC status for ${id}:`, error);
            return { success: false, error: 'Failed to update KYC status' };
        }
    },

    // --- Affiliate Methods ---
    getAffiliateContent: async () => {
        const devAffiliateFallback = {
            heroTitle: 'Become a Geezle Affiliate',
            heroSubtitle: 'Earn commissions by referring users to our platform',
            heroButtonText: 'Join Now',
            benefits: [
                { title: 'High Commission', description: 'Earn up to 30% commission on referrals' },
                { title: 'Recurring Earnings', description: 'Get paid for as long as your referrals use Geezle' },
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
            } as any;
        } catch (error) {
            console.error('Failed to fetch affiliate content:', error);
            return import.meta.env.PROD
                ? { heroTitle: '', heroSubtitle: '', heroButtonText: '', benefits: [] }
                : (devAffiliateFallback as any);
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
