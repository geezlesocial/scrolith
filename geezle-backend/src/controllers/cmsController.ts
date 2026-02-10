import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { PrismaClient, CmsTarget } from '@prisma/client';
import { defaultAuthPagesConfig, normalizeAuthPagesConfig, sanitizeAuthPagesConfig } from '../utils/authPagesConfig';
import { sendSystemMessage } from '../services/systemMessaging';

const prisma = new PrismaClient();

const emitCmsEvent = (req: Request, event: string, payload?: any) => {
  const io = req.app.get('io');
  const communityIo = req.app.get('communityIo');
  if (io) {
    io.emit(event, payload);
  }
  if (communityIo) {
    communityIo.emit(event, payload);
  }
};

const CMS_PAGES_SCOPE = 'cms_pages';
const CMS_PAGE_CATEGORIES_SCOPE = 'cms_page_categories';
const CMS_AUTH_PAGES_SCOPE = 'cms_auth_pages';
const CMS_ANSWERS_SCOPE = 'cms_answers_page';
const CMS_GUIDES_SCOPE = 'cms_guides_page';
const CMS_HIRE_SCOPE = 'cms_hire_page';
const CMS_FREELANCER_SCOPE = 'cms_freelancer_page';
const CMS_BLOG_POSTS_SCOPE = 'cms_blog_posts';
const CMS_BLOG_CATEGORIES_SCOPE = 'cms_blog_categories';
const CMS_BLOG_SETTINGS_SCOPE = 'cms_blog_settings';

const PLATFORM_SETTINGS_FILE = path.resolve(__dirname, '../../data/platform-system-settings.json');
const getPublicPlatformSettings = () => {
  const defaults = {
    siteName: 'Scrolith Marketplace',
    tagline: 'Find, hire, and work with the best talent',
    logoUrl: '/logo.svg',
    faviconUrl: '/favicon.ico',
    adminEmail: 'admin@Scrolith.com',
    supportEmail: 'support@Scrolith.com',
    gigExperience: {
      enabled: true,
      chatBarEnabled: true,
      inlineChatEnabled: true,
      shareModalEnabled: true,
      allowGuestOpenChat: true,
      showSellerMeta: true,
      quickPrompts: [
        'Hey, can you help me with this gig?',
        'Can you provide your timeline and budget estimate?',
        'Can you customize this package for my requirements?'
      ]
    }
  };
  try {
    if (fs.existsSync(PLATFORM_SETTINGS_FILE)) {
      const raw = fs.readFileSync(PLATFORM_SETTINGS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.platform) {
        return {
          ...defaults,
          ...parsed.platform,
          gigExperience: {
            ...defaults.gigExperience,
            ...(parsed.platform.gigExperience || {}),
            quickPrompts: Array.isArray(parsed.platform.gigExperience?.quickPrompts) && parsed.platform.gigExperience.quickPrompts.length
              ? parsed.platform.gigExperience.quickPrompts
              : defaults.gigExperience.quickPrompts
          }
        };
      }
    }
  } catch (e) {
    console.warn('[cms] Failed to read platform settings file', e);
  }
  return defaults;
};

const getAppSetting = async (scope: string, fallback: any) => {
  const existing = await prisma.appSetting.findUnique({ where: { scope } });
  if (!existing) return fallback;
  return existing.data ?? fallback;
};

const saveAppSetting = async (scope: string, data: any) => {
  const saved = await prisma.appSetting.upsert({
    where: { scope },
    create: { scope, data },
    update: { data }
  });
  return saved.data;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');

const defaultAnswersPage = {
  hero: {
    title: 'Scrolith Answers',
    subtitle: 'Get expert answers and AI-powered insights for your business challenges.',
    primaryCtaLabel: 'Ask a Question',
    primaryCtaUrl: '#ask-ai',
    backgroundImage: '',
    badgeLabel: 'AI Powered'
  },
  ai: {
    enabled: true,
    allowGuest: true,
    disclaimer: 'AI responses are for informational purposes only. Always verify critical decisions.'
  },
  categories: [
    { id: 'cat-strategy', label: 'Business Strategy', description: 'Growth, positioning, competitive analysis.' },
    { id: 'cat-finance', label: 'Finance & Pricing', description: 'Pricing, unit economics, forecasting.' },
    { id: 'cat-marketing', label: 'Marketing & Sales', description: 'Funnels, acquisition, brand strategy.' },
    { id: 'cat-ops', label: 'Operations', description: 'Process, scale, productivity.' }
  ],
  featuredQuestions: [
    { id: 'q1', question: 'How do I price a new service offering?', tags: ['pricing', 'strategy'] },
    { id: 'q2', question: 'What is a good CAC:LTV ratio?', tags: ['marketing', 'finance'] },
    { id: 'q3', question: 'How can I improve team productivity?', tags: ['operations'] }
  ],
  faq: [
    { id: 'faq1', question: 'Is Scrolith Answers free?', answer: 'Yes. AI answers are available based on system settings.' },
    { id: 'faq2', question: 'Are answers reviewed by humans?', answer: 'AI responses are generated instantly. For verified expert help, consult professionals.' }
  ],
  updated_at: new Date().toISOString()
};

const defaultGuidesPage = {
  hero: {
    title: 'Scrolith Guides',
    subtitle: 'In-depth, professional guides for founders, freelancers, and teams.',
    primaryCtaLabel: 'Explore Guides',
    primaryCtaUrl: '#guides',
    backgroundImage: '',
    badgeLabel: 'Deep Dives'
  },
  ai: {
    enabled: true,
    allowGuest: true,
    disclaimer: 'AI-generated guides are drafts. Validate facts and tailor to your context.'
  },
  topics: [
    { id: 'topic-startup', label: 'Startup Foundations', description: 'Launch, validate, and scale.' },
    { id: 'topic-growth', label: 'Growth & Marketing', description: 'Acquisition, retention, growth loops.' },
    { id: 'topic-finance', label: 'Finance & Operations', description: 'Run a healthy business.' },
    { id: 'topic-legal', label: 'Legal & Compliance', description: 'Contracts, policies, risk.' }
  ],
  featuredGuides: [
    { id: 'guide-1', title: 'Go-to-Market Strategy Blueprint', excerpt: 'Plan your launch with confidence.', category: 'Growth & Marketing', readTime: '8 min', coverImage: '' },
    { id: 'guide-2', title: 'Pricing Models That Scale', excerpt: 'Choose pricing that matches your value.', category: 'Finance & Operations', readTime: '10 min', coverImage: '' },
    { id: 'guide-3', title: 'Founder Hiring Playbook', excerpt: 'Build your first team the right way.', category: 'Startup Foundations', readTime: '7 min', coverImage: '' }
  ],
  callToAction: {
    title: 'Need a tailored guide?',
    subtitle: 'Use our AI guide builder to generate a custom playbook.',
    ctaLabel: 'Generate Guide',
    ctaUrl: '#ai-guide-builder'
  },
  updated_at: new Date().toISOString()
};

const defaultHirePage = {
  hero: {
    title: 'I am seeking to hire',
    subtitle: 'We’re looking for proven freelance talent and a premium business solution to drive results.',
    primaryCtaLabel: 'Post a Project',
    primaryCtaUrl: '/create-job',
    secondaryCtaLabel: 'Browse Talent',
    secondaryCtaUrl: '/browse',
    backgroundImage: '',
    badgeLabel: 'Premium Hiring'
  },
  ai: {
    enabled: true,
    allowGuest: true,
    disclaimer: 'AI recommendations are advisory. Validate candidates and scope before hiring.'
  },
  highlights: [
    { id: 'h1', title: 'Vetted Experts', description: 'Work with proven, high-performance freelancers.' },
    { id: 'h2', title: 'Business Outcomes', description: 'Strategic focus on measurable impact.' },
    { id: 'h3', title: 'Premium Support', description: 'Dedicated success guidance and escalation path.' }
  ],
  steps: [
    { id: 's1', title: 'Define scope', description: 'Describe goals, timeline, and budget.' },
    { id: 's2', title: 'Match with experts', description: 'We shortlist top candidates for your project.' },
    { id: 's3', title: 'Launch confidently', description: 'Start with clear milestones and reporting.' }
  ],
  testimonials: [
    { id: 't1', name: 'Morgan K.', role: 'COO', quote: 'Exceptional execution and communication.' }
  ],
  updated_at: new Date().toISOString()
};

const defaultFreelancerPage = {
  hero: {
    title: 'Professional Freelancer for Strategic Business Projects',
    subtitle: 'I deliver premium freelance and agency-level services for strategic business projects—combining expert execution with scalable solutions tailored to your goals.',
    primaryCtaLabel: 'Join as Pro Freelancer',
    primaryCtaUrl: '/auth/signup',
    secondaryCtaLabel: 'View Opportunities',
    secondaryCtaUrl: '/browse-jobs',
    backgroundImage: '',
    badgeLabel: 'Elite Talent'
  },
  ai: {
    enabled: true,
    allowGuest: true,
    disclaimer: 'AI assistance supports positioning and proposals; verify details before sending.'
  },
  services: [
    { id: 'svc1', title: 'Strategy & Growth', description: 'Market positioning, go-to-market, growth planning.' },
    { id: 'svc2', title: 'Operations', description: 'Process design, execution planning, KPIs.' },
    { id: 'svc3', title: 'Finance & Analytics', description: 'Financial models, dashboards, forecasting.' }
  ],
  proof: [
    { id: 'p1', metric: '150+', label: 'Projects delivered' },
    { id: 'p2', metric: '4.9/5', label: 'Average rating' },
    { id: 'p3', metric: '24h', label: 'Response time' }
  ],
  callToAction: {
    title: 'Ready to deliver premium outcomes?',
    subtitle: 'Set up your elite freelancer profile and attract high-value clients.',
    ctaLabel: 'Create Profile',
    ctaUrl: '/profile/edit'
  },
  updated_at: new Date().toISOString()
};

const defaultBlogSettings = {
  page_title: 'Blog',
  meta_title: 'Scrolith Blog',
  meta_description: 'Latest news and insights from Scrolith',
  banner_image: '',
  posts_per_page: 10,
  default_category: '',
  show_author: true,
  show_date: true,
  updated_at: new Date().toISOString()
};

const normalizeBlogSettings = (payload: any = {}) => {
  const src = payload || {};
  const normalized = {
    page_title: src.page_title ?? src.pageTitle ?? defaultBlogSettings.page_title,
    meta_title: src.meta_title ?? src.metaTitle ?? defaultBlogSettings.meta_title,
    meta_description: src.meta_description ?? src.metaDescription ?? defaultBlogSettings.meta_description,
    banner_image: src.banner_image ?? src.bannerImage ?? defaultBlogSettings.banner_image,
    posts_per_page: Number(src.posts_per_page ?? src.postsPerPage ?? defaultBlogSettings.posts_per_page),
    default_category: src.default_category ?? src.defaultCategory ?? defaultBlogSettings.default_category,
    show_author: src.show_author ?? src.showAuthor ?? defaultBlogSettings.show_author,
    show_date: src.show_date ?? src.showDate ?? defaultBlogSettings.show_date,
    updated_at: src.updated_at ?? new Date().toISOString()
  };
  return {
    ...normalized,
    pageTitle: normalized.page_title,
    metaTitle: normalized.meta_title,
    metaDescription: normalized.meta_description,
    bannerImage: normalized.banner_image,
    postsPerPage: normalized.posts_per_page,
    defaultCategory: normalized.default_category,
    showAuthor: normalized.show_author,
    showDate: normalized.show_date
  };
};

const normalizeBlogPost = (incoming: any, categories: any[] = [], now?: string) => {
  const timestamp = now || new Date().toISOString();
  const id = String(incoming?.id || incoming?._id || `post-${Date.now()}`);
  const baseSlug = slugify(incoming?.slug || incoming?.title || '');
  const slug = baseSlug || `post-${Date.now()}`;
  const categoryId = incoming?.category_id ?? incoming?.categoryId ?? '';
  const category = categories.find((c: any) => c.id === categoryId);
  const categoryName =
    incoming?.category_name ??
    incoming?.categoryName ??
    category?.name ??
    '';
  const seoRaw = incoming?.seo || {};
  const seo = {
    meta_title: seoRaw.meta_title ?? seoRaw.metaTitle ?? '',
    meta_description: seoRaw.meta_description ?? seoRaw.metaDescription ?? '',
    meta_keywords: seoRaw.meta_keywords ?? seoRaw.metaKeywords ?? [],
    no_index: seoRaw.no_index ?? seoRaw.noIndex ?? false,
    metaTitle: seoRaw.metaTitle ?? seoRaw.meta_title ?? '',
    metaDescription: seoRaw.metaDescription ?? seoRaw.meta_description ?? '',
    metaKeywords: seoRaw.metaKeywords ?? seoRaw.meta_keywords ?? [],
    noIndex: seoRaw.noIndex ?? seoRaw.no_index ?? false
  };

  const createdAt = incoming?.created_at || incoming?.createdAt || timestamp;

  const normalized = {
    id,
    title: incoming?.title || '',
    slug,
    content: incoming?.content || '',
    blocks: Array.isArray(incoming?.blocks) ? incoming.blocks : [],
    excerpt: incoming?.excerpt || incoming?.short_description || incoming?.shortDescription || '',
    short_description: incoming?.short_description ?? incoming?.shortDescription ?? '',
    shortDescription: incoming?.shortDescription ?? incoming?.short_description ?? '',
    featured_image: incoming?.featured_image ?? incoming?.featuredImage ?? '',
    featuredImage: incoming?.featuredImage ?? incoming?.featured_image ?? '',
    status: (incoming?.status || 'draft').toString().toLowerCase(),
    visibility: incoming?.visibility || 'public',
    author_name: incoming?.author_name ?? incoming?.authorName ?? 'Admin',
    authorName: incoming?.authorName ?? incoming?.author_name ?? 'Admin',
    category_id: categoryId,
    categoryId,
    category_name: categoryName,
    categoryName,
    tags: Array.isArray(incoming?.tags) ? incoming.tags : [],
    views: Number(incoming?.views ?? 0),
    seo,
    allow_comments: incoming?.allow_comments ?? incoming?.allowComments ?? true,
    allowComments: incoming?.allowComments ?? incoming?.allow_comments ?? true,
    is_featured: incoming?.is_featured ?? incoming?.isFeatured ?? false,
    isFeatured: incoming?.isFeatured ?? incoming?.is_featured ?? false,
    created_at: createdAt,
    createdAt,
    updated_at: timestamp,
    updatedAt: timestamp,
    scheduled_at: incoming?.scheduled_at ?? incoming?.scheduledAt ?? null,
    scheduledAt: incoming?.scheduledAt ?? incoming?.scheduled_at ?? null
  };

  return normalized;
};

const computeCategoryCounts = (posts: any[], categories: any[]) => {
  const counts: Record<string, number> = {};
  posts.forEach((post: any) => {
    const catId = post.category_id || post.categoryId;
    if (!catId) return;
    counts[catId] = (counts[catId] || 0) + 1;
  });

  return categories.map((cat: any) => ({
    ...cat,
    count: counts[cat.id] || 0
  }));
};

const isBlogPostPublic = (post: any) => {
  const status = String(post?.status || '').toLowerCase();
  if (status === 'published') return true;
  if (status === 'scheduled') {
    const rawDate = post?.scheduled_at ?? post?.scheduledAt ?? post?.publish_at ?? post?.publishAt;
    if (!rawDate) return false;
    const ts = new Date(rawDate).getTime();
    if (!Number.isFinite(ts)) return false;
    return ts <= Date.now();
  }
  return false;
};

// Helper function to get or create CMS config
const getOrCreateCMSConfig = async (target: CmsTarget, defaultData: any) => {
  let config = await prisma.cMSConfig.findFirst({
    where: { target },
    orderBy: { version: 'desc' },
    include: { updatedBy: { select: { id: true, email: true, name: true } } }
  });

  if (!config) {
    config = await prisma.cMSConfig.create({
      data: {
        target,
        version: 1,
        data: defaultData
      },
      include: { updatedBy: { select: { id: true, email: true, name: true } } }
    });
  }

  return config;
};

// Helper function to save CMS config
const saveCMSConfig = async (target: CmsTarget, data: any, userId?: string) => {
  const existing = await prisma.cMSConfig.findFirst({
    where: { target },
    orderBy: { version: 'desc' }
  });

  const version = existing ? existing.version + 1 : 1;

  const config = await prisma.cMSConfig.create({
    data: {
      target,
      version,
      data,
      updatedById: userId || null
    },
    include: { updatedBy: { select: { id: true, email: true, name: true } } }
  });

  return config;
};

// Mock data storage (fallback - in production, use database)
let cmsData = {
  header: {
    id: 'default-header',
    variant: 'light',
    homeUrl: '/',
    navigation: [
      { id: 'home', label: 'Home', url: '/', icon: 'home', visibility: ['GUEST', 'FREELANCER', 'EMPLOYER', 'ADMIN'] },
      { id: 'browse', label: 'Browse Talent', url: '/browse', icon: 'users', visibility: ['GUEST', 'EMPLOYER', 'ADMIN'] },
      { id: 'jobs', label: 'Find Jobs', url: '/browse-jobs', icon: 'briefcase', visibility: ['GUEST', 'FREELANCER', 'ADMIN'] },
      { id: 'community', label: 'Community', url: '/community', icon: 'chat', visibility: ['GUEST', 'FREELANCER', 'EMPLOYER', 'ADMIN'] }
    ],
    actions: {
      profile: true,
      notifications: true,
      messages: true
    },
    profileMenu: [
      { id: 'profile', label: 'My Profile', url: '/profile/edit', icon: 'user', visibility: ['FREELANCER', 'EMPLOYER', 'ADMIN'] },
      { id: 'dashboard', label: 'Dashboard', url: '/freelancer/dashboard', icon: 'dashboard', visibility: ['FREELANCER', 'EMPLOYER', 'ADMIN'] },
      { id: 'settings', label: 'Settings', url: '/settings', icon: 'settings', visibility: ['FREELANCER', 'EMPLOYER', 'ADMIN'] }
    ],
    logoUrl: 'https://ui-avatars.com/api/?name=Scrolith&background=0D8ABC&color=fff&size=128&bold=true',
    faviconUrl: 'https://ui-avatars.com/api/?name=G&background=0D8ABC&color=fff&size=64&bold=true',
    searchEnabled: true,
    searchMode: 'keyword',
    createdAt: new Date(),
    updatedAt: new Date()
  },
  footer: {
    id: 'default-footer',
    logoUrl: '/logo.svg',
    description: 'Connect with top freelancers and find your next project.',
    socialLabelTitle: '',
    copyright: '© 2024 Scrolith. All rights reserved.',
    socials: [
      { id: 'social-1', platform: 'facebook', icon: 'facebook', url: 'https://facebook.com/Scrolith', enabled: true },
      { id: 'social-2', platform: 'twitter', icon: 'twitter', url: 'https://twitter.com/Scrolith', enabled: true },
      { id: 'social-3', platform: 'linkedin', icon: 'linkedin', url: 'https://linkedin.com/company/Scrolith', enabled: true }
    ],
    columns: [
      {
        id: 'col-1',
        title: 'For Freelancers',
        links: [
          { id: 'link-1', label: 'Find Jobs', url: '/browse-jobs', type: 'internal', visibility: ['GUEST'] },
          { id: 'link-2', label: 'Create Gig', url: '/create-gig', type: 'internal', visibility: ['FREELANCER', 'ADMIN'] },
          { id: 'link-3', label: 'Success Stories', url: '/success-stories', type: 'internal', visibility: ['GUEST'] }
        ]
      },
      {
        id: 'col-2',
        title: 'For Employers',
        links: [
          { id: 'link-4', label: 'Find Talent', url: '/browse', type: 'internal', visibility: ['GUEST', 'EMPLOYER', 'ADMIN'] },
          { id: 'link-5', label: 'Post a Job', url: '/create-job', type: 'internal', visibility: ['EMPLOYER', 'ADMIN'] },
          { id: 'link-6', label: 'Hire Resources', url: '/hire', type: 'internal', visibility: ['EMPLOYER', 'ADMIN'] }
        ]
      },
      {
        id: 'col-3',
        title: 'Company',
        links: [
          { id: 'link-7', label: 'About Us', url: '/about', type: 'internal', visibility: ['GUEST'] },
          { id: 'link-8', label: 'Contact', url: '/contact', type: 'internal', visibility: ['GUEST'] },
          { id: 'link-9', label: 'Careers', url: '/careers', type: 'internal', visibility: ['GUEST'] }
        ]
      }
    ],
    contact: {
      adminEmail: 'admin@Scrolith.com',
      supportEmail: 'support@Scrolith.com',
      ticketRoute: '/support'
    }
  },
  activity: {
    id: 'default-activity',
    design: {
      iconSize: 24,
      iconStyle: 'outline',
      showBadges: true,
      badgeColor: '#3b82f6'
    },
    icons: [
      { id: 'messages', type: 'message', label: 'Messages', isEnabled: true, roles: ['FREELANCER', 'EMPLOYER', 'ADMIN'], sortOrder: 1, showLabel: true },
      { id: 'notifications', type: 'bell', label: 'Notifications', isEnabled: true, roles: ['FREELANCER', 'EMPLOYER', 'ADMIN'], sortOrder: 2, showLabel: true },
      { id: 'profile', type: 'user', label: 'Profile', isEnabled: true, roles: ['FREELANCER', 'EMPLOYER', 'ADMIN'], sortOrder: 3, showLabel: true }
    ],
    helpMenu: [
      { id: 'help', label: 'Help Center', url: '/help', isEnabled: true, target: '_blank' },
      { id: 'docs', label: 'Documentation', url: '/docs', isEnabled: true, target: '_blank' },
      { id: 'contact', label: 'Contact Support', url: '/contact', isEnabled: true, target: '_blank' }
    ],
    createdAt: new Date(),
    updatedAt: new Date()
  },
  heroSearch: {
    id: 'default-hero-search',
    placeholder: 'Search for services, freelancers, or jobs...',
    categories: [
      { id: 'development', label: 'Development', icon: 'code' },
      { id: 'design', label: 'Design', icon: 'palette' },
      { id: 'marketing', label: 'Marketing', icon: 'megaphone' },
      { id: 'writing', label: 'Writing', icon: 'pen' },
      { id: 'video', label: 'Video', icon: 'video' }
    ],
    popularSearches: [
      'Web Development', 'Logo Design', 'Content Writing', 'Mobile App', 'SEO Services'
    ],
    headline: 'Find Your Next Opportunity',
    subheadline: 'Connect with top talent and projects',
    searchPlaceholder: 'Search for jobs, gigs, or skills...',
    searchSize: 'normal',
    quickTags: [
      { id: 'tag-1', label: 'Web Design', url: '/browse?category=web-design', color: 'blue' },
      { id: 'tag-2', label: 'Content Writing', url: '/browse?category=content-writing', color: 'green' },
      { id: 'tag-3', label: 'Digital Marketing', url: '/browse?category=digital-marketing', color: 'purple' },
      { id: 'tag-4', label: 'Video Editing', url: '/browse?category=video-editing', color: 'red' }
    ],
    trustedBrands: {
      enabled: true,
      title: 'Trusted by leading companies',
      logos: Array(6).fill(null).map((_, i) => ({
        id: `brand-${i + 1}`,
        src: '',
        alt: `Brand ${i + 1}`
      }))
    },
    valueProp: {
      enabled: true,
      heading: 'Why Choose Us',
      badges: [
        { id: 'badge-1', label: 'Secure Payments', icon: 'shield' },
        { id: 'badge-2', label: 'Quality Guarantee', icon: 'check-circle' },
        { id: 'badge-3', label: '24/7 Support', icon: 'headphones' }
      ]
    }
  },
  trending: {
    id: 'default-trending',
    enabled: true,
    title: 'Trending Categories',
    show_icons: false,
    categoryIds: [],
    scrollBehavior: 'manual',
    autoSlideInterval: 5000,
    visibility: ['GUEST', 'FREELANCER', 'EMPLOYER'],
    opportunities: [
      {
        id: 'opp-1',
        title: 'Full Stack Developer Needed',
        category: 'Development',
        budget: '$2000 - $4000',
        postedTime: '2 hours ago',
        applicants: 25,
        type: 'Fixed Price',
        isTrending: true
      },
      {
        id: 'opp-2',
        title: 'UI/UX Designer for Mobile App',
        category: 'Design',
        budget: '$1000 - $2000',
        postedTime: '4 hours ago',
        applicants: 18,
        type: 'Fixed Price',
        isTrending: true
      },
      {
        id: 'opp-3',
        title: 'Content Writer for Tech Blog',
        category: 'Writing',
        budget: '$0.10 / word',
        postedTime: '6 hours ago',
        applicants: 32,
        type: 'Hourly',
        isTrending: true
      }
    ]
  },
  homepageSections: [
    {
      id: 'hero',
      type: 'hero',
      title: 'Find the Perfect Freelancer for Your Project',
      subtitle: 'Connect with top talent from around the world',
      content: {
        title: 'Find the Perfect Freelancer for Your Project',
        subtitle: 'Connect with top talent from around the world',
        description: 'Discover skilled professionals ready to help you achieve your goals.',
        primaryAction: { label: 'Browse Talent', url: '/browse', style: 'primary' },
        secondaryAction: { label: 'Post a Job', url: '/create-job', style: 'secondary' },
        image: '/hero-image.jpg',
        features: [
          { icon: 'shield', title: 'Secure Payments', description: 'Your money is protected until you\'re satisfied' },
          { icon: 'star', title: 'Top Talent', description: 'Access to the best freelancers worldwide' },
          { icon: 'clock', title: 'Quick Delivery', description: 'Get results fast with our efficient process' }
        ]
      },
      isActive: true,
      sortOrder: 1,
      style: { theme: 'light', animation: 'fade-in' }
    },
    {
      id: 'categories',
      type: 'categories',
      title: 'Browse by Category',
      content: {
        categories: [
          { id: '1', name: 'Development', slug: 'development', icon: 'code', count: 120, description: 'Web, mobile, and software development' },
          { id: '2', name: 'Design', slug: 'design', icon: 'palette', count: 85, description: 'Graphic, UI/UX, and creative design' },
          { id: '3', name: 'Marketing', slug: 'marketing', icon: 'megaphone', count: 60, description: 'Digital marketing and promotion' },
          { id: '4', name: 'Writing', slug: 'writing', icon: 'pen', count: 45, description: 'Content writing and copywriting' },
          { id: '5', name: 'Video', slug: 'video', icon: 'video', count: 30, description: 'Video production and editing' },
          { id: '6', name: 'AI Services', slug: 'ai-services', icon: 'brain', count: 50, description: 'AI-powered solutions' }
        ]
      },
      isActive: true,
      sortOrder: 2,
      style: { layout: 'grid', columns: 3 }
    },
    {
      id: 'featured',
      type: 'featured',
      title: 'Featured Services',
      content: {
        services: [
          {
            id: 'g1',
            title: 'I will build a modern React website',
            freelancerName: 'Dev Mike',
            price: 300,
            rating: 4.9,
            reviews: 120,
            image: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=400&q=80',
            category: 'Development'
          },
          {
            id: 'g2',
            title: 'I will design a stunning logo',
            freelancerName: 'Sarah Art',
            price: 50,
            rating: 4.8,
            reviews: 85,
            image: 'https://images.unsplash.com/photo-1626785774573-4b799314346d?auto=format&fit=crop&w=400&q=80',
            category: 'Design'
          }
        ]
      },
      isActive: true,
      sortOrder: 3,
      style: { layout: 'carousel', autoplay: true }
    }
  ],
  homeSlides: [
    {
      id: 'slide-1',
      title: 'Premium Freelance Services',
      subtitle: 'Quality work guaranteed',
      description: 'Connect with top-tier freelancers who deliver exceptional results.',
      image: '/slide-1.jpg',
      ctaText: 'Explore Services',
      ctaUrl: '/browse',
      isActive: true,
      sortOrder: 1,
      mediaType: 'image',
      mediaUrl: 'https://images.unsplash.com/photo-1600880292203-757bb62b4baf?auto=format&fit=crop&w=1920&q=80',
      redirectUrl: '/browse',
      roleVisibility: ['GUEST', 'FREELANCER', 'EMPLOYER', 'ADMIN'],
      backgroundColor: '#000000',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    {
      id: 'slide-2',
      title: 'Hire Top Talent',
      subtitle: 'Fast and reliable',
      description: 'Find the perfect match for your project requirements.',
      image: '/slide-2.jpg',
      ctaText: 'Find Freelancers',
      ctaUrl: '/browse',
      isActive: true,
      sortOrder: 2,
      mediaType: 'image',
      mediaUrl: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1920&q=80',
      redirectUrl: '/browse',
      roleVisibility: ['GUEST', 'FREELANCER', 'EMPLOYER', 'ADMIN'],
      backgroundColor: '#000000'
    }
  ],
  analytics: {
    views: 12450,
    ctaClicks: 1245,
    bounceRate: 32,
    avgTimeOnPage: 156,
    deviceBreakdown: { desktop: 65, mobile: 30, tablet: 5 },
    sectionEngagement: [
      { name: 'Hero', clicks: 450, views: 12450 },
      { name: 'Trending', clicks: 320, views: 9800 },
      { name: 'Categories', clicks: 280, views: 8700 }
    ]
  }
};

// GET Functions
export const getHeaderConfig = async (req: Request, res: Response) => {
  try {
    // Try to get from database first
    const config = await getOrCreateCMSConfig(CmsTarget.HOMEPAGE, { header: cmsData.header, footer: cmsData.footer, heroSearch: cmsData.heroSearch });
    const data = config.data as Record<string, unknown> | undefined;

    // Get header from database or use fallback
    const headerRaw = (data && (data['header'] as Record<string, unknown> | undefined)) || cmsData.header;

    // Transform to match frontend types (snake_case)
    const headerAny = headerRaw as any;
    const transformed = {
      id: (headerAny['id'] as string) || 'default-header',
      home_url: (headerAny['homeUrl'] as string) || (headerAny['home_url'] as string) || '/',
      variant: (headerAny['variant'] as string) || 'light',
      search_enabled: (headerAny['searchEnabled'] as boolean) ?? (headerAny['search_enabled'] as boolean) ?? true,
      search_mode: (headerAny['searchMode'] as string) || (headerAny['search_mode'] as string) || 'keyword',
      logo_url: (headerAny['logoUrl'] as string) || (headerAny['logo_url'] as string) || '/logo.svg',
      favicon_url: (headerAny['faviconUrl'] as string) || (headerAny['favicon_url'] as string) || '/favicon.ico',
      navigation: Array.isArray(headerAny['navigation']) ? (headerAny['navigation'] as unknown[]) : [],
      actions: (headerAny['actions'] as Record<string, unknown>) || {
        notifications: true,
        messages: true,
        orders: true,
        lists: true,
        switch_selling: true,
        profile: true
      },
      profile_menu: Array.isArray(headerAny['profileMenu']) ? (headerAny['profileMenu'] as unknown[]) : Array.isArray(headerAny['profile_menu']) ? (headerAny['profile_menu'] as unknown[]) : [],
      profile_menu_group_labels: headerAny['profileMenuGroupLabels'] || headerAny['profile_menu_group_labels'] || headerAny['profile_group_labels'] || {},
      guest_primary_dropdown: headerAny['guestPrimaryDropdown'] || headerAny['guest_primary_dropdown'] || headerAny['guestProDropdown'] || headerAny['guest_pro_dropdown'] || null,
      guest_explore_dropdown: headerAny['guestExploreDropdown'] || headerAny['guest_explore_dropdown'] || headerAny['guestExplore'] || headerAny['guest_explore'] || null,
      guest_ctas: headerAny['guestCtas'] || headerAny['guest_ctas'] || headerAny['guestActions'] || headerAny['guest_actions'] || [],
      role_switch: headerAny['roleSwitch'] || headerAny['role_switch'] || headerAny['switchRole'] || null
    };

    console.log('✅ Header config served from database:', {
      hasLogo: !!transformed.logo_url,
      hasFavicon: !!transformed.favicon_url,
      navItems: transformed.navigation.length
    });

    res.json(transformed);
  } catch (error) {
    console.error('❌ Error getting header config, using fallback:', error);
    // Fallback to mock data
    const header = cmsData.header;
    const headerAny = header as any;
    const transformed = {
      id: header.id || 'default-header',
      home_url: (headerAny.homeUrl as string) || (headerAny.home_url as string) || '/',
      variant: header.variant || 'light',
      search_enabled: (headerAny.searchEnabled as boolean) ?? (headerAny.search_enabled as boolean) ?? true,
      search_mode: (headerAny.searchMode as string) || (headerAny.search_mode as string) || 'keyword',
      logo_url: (headerAny.logoUrl as string) || (headerAny.logo_url as string) || '/logo.svg',
      favicon_url: (headerAny.faviconUrl as string) || (headerAny.favicon_url as string) || '/favicon.ico',
      navigation: Array.isArray(headerAny.navigation) ? headerAny.navigation : [],
      actions: (headerAny.actions as Record<string, unknown>) || {},
      profile_menu: Array.isArray(headerAny.profileMenu) ? headerAny.profileMenu : Array.isArray(headerAny.profile_menu) ? headerAny.profile_menu : [],
      profile_menu_group_labels: headerAny.profileMenuGroupLabels || headerAny.profile_menu_group_labels || headerAny.profile_group_labels || {},
      guest_primary_dropdown: headerAny.guestPrimaryDropdown || headerAny.guest_primary_dropdown || headerAny.guestProDropdown || headerAny.guest_pro_dropdown || null,
      guest_explore_dropdown: headerAny.guestExploreDropdown || headerAny.guest_explore_dropdown || headerAny.guestExplore || headerAny.guest_explore || null,
      guest_ctas: headerAny.guestCtas || headerAny.guest_ctas || headerAny.guestActions || headerAny.guest_actions || [],
      role_switch: headerAny.roleSwitch || headerAny.role_switch || headerAny.switchRole || null
    };
    res.json(transformed);
  }
};

export const getFooterConfig = async (req: Request, res: Response) => {
  try {
    // Try to get from database first
    const config = await getOrCreateCMSConfig(CmsTarget.FOOTER, { footer: cmsData.footer });
    const data = config.data as any;

    // Return footer config from database, or fallback to mock
    const footer = data?.footer || cmsData.footer;
    res.json(footer);
  } catch (error) {
    console.error('Error getting footer config, using fallback:', error);
    // Fallback to mock data if database fails
    res.json(cmsData.footer);
  }
};

export const getActivityConfig = async (req: Request, res: Response) => {
  try {
    // Try to load from CMS config first
    const config = await getOrCreateCMSConfig(CmsTarget.HOMEPAGE, {
      header: cmsData.header,
      footer: cmsData.footer,
      heroSearch: cmsData.heroSearch,
      activity: cmsData.activity
    });
    const data = config.data as any;
    const activity = data?.activity || cmsData.activity;
    res.json(activity);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

const POLICY_SLUGS = new Set(['terms', 'terms-of-service', 'privacy', 'privacy-policy']);

const broadcastPolicyUpdate = async (page: any) => {
  const slug = String(page?.slug || '').toLowerCase();
  const status = String(page?.status || '').toUpperCase();
  if (!POLICY_SLUGS.has(slug)) return;
  if (!['PUBLISHED', 'ACTIVE'].includes(status)) return;

  const policyType = slug.includes('privacy') ? 'Privacy Policy' : 'Terms of Service';
  const policyUrl = `/p/${slug}`;
  const effectiveDate = page?.updatedAt || page?.updated_at || new Date().toISOString();

  const users = await prisma.user.findMany({
    where: { isActive: true },
    select: { id: true, name: true, email: true }
  });

  const chunkSize = 200;
  for (let i = 0; i < users.length; i += chunkSize) {
    const batch = users.slice(i, i + chunkSize);
    await Promise.all(
      batch.map((user) =>
        sendSystemMessage({
          templateKey: 'policy_update',
          userId: user.id,
          user,
          context: {
            policy: { type: policyType, url: policyUrl, effectiveDate }
          },
          actionUrl: policyUrl,
          typeOverride: 'policy'
        })
      )
    );
  }
};

export const getHomepageSections = async (req: Request, res: Response) => {
  try {
    const { role, location } = req.query;
    // Filter sections based on role if needed - handle both camelCase and snake_case
    const filteredSections = cmsData.homepageSections
      .filter(section => {
        const isActive = (section as any).isActive !== false;
        return isActive;
      })
      .map(section => ({
        ...section,
        // Transform to snake_case for frontend types
        is_active: (section as any).isActive !== false,
        position: (section as any).sortOrder || 0,
        name: (section as any).name || (section as any).title || 'Section'
      }))
      .sort((a, b) => ((a as any).position || 0) - ((b as any).position || 0));

    console.log('✅ Homepage sections served:', {
      total: cmsData.homepageSections.length,
      active: filteredSections.length
    });

    res.json(filteredSections);
  } catch (error) {
    console.error('❌ Error getting homepage sections:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getHomeSlides = async (req: Request, res: Response) => {
  try {
    // Try to get from database first
    const config = await getOrCreateCMSConfig(CmsTarget.HOMEPAGE, { homeSlides: cmsData.homeSlides });
    const data = config.data as any;

    // Get slides from database or use fallback
    const slides = data?.homeSlides || cmsData.homeSlides;

    // Filter and transform to snake_case for frontend
    const activeSlides = slides
      .filter((slide: any) => {
        const isActive = slide.isActive !== false;
        return isActive;
      })
      .map((slide: any) => ({
        id: slide.id,
        media_type: slide.mediaType || slide.media_type || 'image',
        media_url: slide.mediaUrl || slide.media_url || '',
        title: slide.title,
        subtitle: slide.subtitle,
        redirect_url: slide.redirectUrl || slide.redirect_url,
        role_visibility: slide.roleVisibility || slide.role_visibility || ['GUEST', 'FREELANCER', 'EMPLOYER'],
        sort_order: slide.sortOrder || slide.sort_order || 0,
        is_active: slide.isActive !== false,
        created_at: slide.createdAt || slide.created_at || new Date().toISOString(),
        updated_at: slide.updatedAt || slide.updated_at || new Date().toISOString(),
        background_color: slide.backgroundColor || slide.background_color || '#000000'
      }))
      .sort((a: any, b: any) => a.sort_order - b.sort_order);

    console.log('✅ Home slides served from database:', {
      total: slides.length,
      active: activeSlides.length
    });

    res.json(activeSlides);
  } catch (error) {
    console.error('❌ Error getting home slides, using fallback:', error);
    // Fallback to mock data
    const activeSlides = cmsData.homeSlides
      .filter(slide => {
        const isActive = (slide as any).isActive !== false;
        return isActive;
      })
      .map(slide => ({
        id: slide.id,
        media_type: slide.mediaType || 'image',
        media_url: slide.mediaUrl || '',
        title: slide.title,
        subtitle: slide.subtitle,
        redirect_url: slide.redirectUrl,
        role_visibility: slide.roleVisibility || ['GUEST', 'FREELANCER', 'EMPLOYER'],
        sort_order: (slide as any).sortOrder || 0,
        is_active: (slide as any).isActive !== false,
        created_at: (slide as any).createdAt || new Date().toISOString(),
        updated_at: (slide as any).updatedAt || new Date().toISOString(),
        background_color: (slide as any).backgroundColor || '#000000'
      }))
      .sort((a, b) => a.sort_order - b.sort_order);
    res.json(activeSlides);
  }
};

export const getTrendingOpportunities = async (req: Request, res: Response) => {
  try {
    res.json(cmsData.trending.opportunities);
  } catch (error) {
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getHeroSearchConfig = async (req: Request, res: Response) => {
  try {
    // Try to get from database first
    const config = await getOrCreateCMSConfig(CmsTarget.HOMEPAGE, { heroSearch: cmsData.heroSearch });
    const data = config.data as any;

    // Return hero search config from database, or fallback to mock
    const heroSearch = data?.heroSearch || cmsData.heroSearch;
    res.json(heroSearch);
  } catch (error) {
    console.error('Error getting hero search config, using fallback:', error);
    // Fallback to mock data if database fails
    res.json(cmsData.heroSearch);
  }
};

// ==============================================
// POST/PUT/DELETE FUNCTIONS
// ==============================================

// Header Config - Save/Update
export const saveHeaderConfig = async (req: Request, res: Response) => {
  try {
    const config = req.body;
    // Debug: log incoming navigation payload for troubleshooting visibility issues
    try {
      console.log('🔔 Incoming header.save navigation payload sample:', Array.isArray(config?.navigation) ? config.navigation.map((n: any) => ({ id: n.id, label: n.label, visibility: n.visibility })) : config?.navigation);
    } catch (e) {
      /* ignore logging errors */
    }
    const userId = req.user?.id;

    // Normalize incoming data (handle both camelCase and snake_case)
    // Detailed logging to trace navigation visibility persistence issues
    try {
      console.log('🔍 saveHeaderConfig - incoming navigation count:', Array.isArray(config?.navigation) ? config.navigation.length : 0);
      console.log('🔍 saveHeaderConfig - incoming navigation sample:', Array.isArray(config?.navigation) ? config.navigation.slice(0,5) : config?.navigation);
    } catch (e) {
      /* ignore logging errors */
    }

    const normalized = {
      ...cmsData.header,
      // Map snake_case to camelCase for internal storage
      logoUrl: config.logo_url || config.logoUrl || cmsData.header.logoUrl,
      faviconUrl: config.favicon_url || config.faviconUrl || cmsData.header.faviconUrl,
      homeUrl: config.home_url || config.homeUrl || cmsData.header.homeUrl,
      searchEnabled: config.search_enabled !== undefined ? config.search_enabled : (config.searchEnabled !== undefined ? config.searchEnabled : cmsData.header.searchEnabled),
      searchMode: config.search_mode || config.searchMode || cmsData.header.searchMode,
      // Ensure navigation items preserve and normalize visibility lists
      navigation: Array.isArray(config.navigation)
        ? config.navigation.map((it: any) => ({
            ...it,
            visibility: Array.isArray(it?.visibility)
              ? it.visibility.map((v: any) => String(v).toLowerCase())
              : []
          }))
        : cmsData.header.navigation,
      profileMenu: config.profile_menu || config.profileMenu || config.userMenu || cmsData.header.profileMenu,
      profileMenuGroupLabels: config.profile_menu_group_labels || config.profileMenuGroupLabels || config.profile_group_labels || cmsData.header.profileMenuGroupLabels,
      guestPrimaryDropdown: config.guest_primary_dropdown || config.guestPrimaryDropdown || config.guestProDropdown || cmsData.header.guestPrimaryDropdown,
      guestExploreDropdown: config.guest_explore_dropdown || config.guestExploreDropdown || config.guestExplore || cmsData.header.guestExploreDropdown,
      guestCtas: config.guest_ctas || config.guestCtas || config.guestActions || cmsData.header.guestCtas,
      roleSwitch: config.role_switch || config.roleSwitch || config.switchRole || cmsData.header.roleSwitch,
      actions: config.actions || cmsData.header.actions,
      variant: config.variant || cmsData.header.variant,
      updatedAt: new Date()
    };

    // Log normalized navigation before saving
    try {
      console.log('🔍 saveHeaderConfig - normalized.navigation sample:', Array.isArray(normalized.navigation) ? normalized.navigation.map((n: any) => ({ id: n.id, visibility: n.visibility })) : normalized.navigation);
    } catch (e) {
      /* ignore */
    }

    // Get existing homepage config or create new
    const existingConfig = await getOrCreateCMSConfig(CmsTarget.HOMEPAGE, { header: cmsData.header, footer: cmsData.footer, heroSearch: cmsData.heroSearch });
    const existingData = existingConfig.data as any;

    // Update header in the config data
    const updatedData = {
      ...existingData,
      header: normalized
    };

    // Save to database
    const saved = await saveCMSConfig(CmsTarget.HOMEPAGE, updatedData, userId);

    try {
      console.log('✅ saveHeaderConfig - saved CMS config id:', saved.id, 'version:', saved.version);
    } catch (e) {
      /* ignore */
    }

    // Also update in-memory cache
    cmsData.header = normalized;

    try {
      console.log('✅ Header config saved to database:', {
      hasLogo: !!normalized.logoUrl,
      hasFavicon: !!normalized.faviconUrl,
      navItems: Array.isArray(normalized.navigation) ? normalized.navigation.length : 0
    });
    } catch (e) {
      /* ignore */
    }

    // Emit realtime event so connected clients can refresh immediately
    emitCmsEvent(req, 'cms:header_updated', normalized);

    res.json({
      success: true,
      message: 'Header configuration saved successfully',
      data: normalized
    });
  } catch (error) {
    console.error('❌ Error saving header config:', error);
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' });
  }
};

// Footer Config - Save/Update
export const saveFooterConfig = async (req: Request, res: Response) => {
  try {
    const config = req.body;
    const userId = req.user?.id;

    // Normalize incoming data
    const normalized = {
      ...cmsData.footer,
      id: config.id || cmsData.footer.id,
      logoUrl: config.logo_url || config.logoUrl || cmsData.footer.logoUrl,
      description: config.description || cmsData.footer.description,
      socialLabelTitle:
        config.social_label_title ??
        config.socialLabelTitle ??
        config.social_title ??
        config.socialTitle ??
        cmsData.footer.socialLabelTitle ??
        '',
      copyright: config.copyright || cmsData.footer.copyright,
      columns: Array.isArray(config.columns) ? config.columns : cmsData.footer.columns,
      socials: Array.isArray(config.socials) ? config.socials : cmsData.footer.socials,
      contact: config.contact || cmsData.footer.contact
    };

    // Save to database
    await saveCMSConfig(CmsTarget.FOOTER, { footer: normalized }, userId);

    // Also update in-memory cache
    cmsData.footer = normalized;

    console.log('✅ Footer config saved to database:', {
      hasLogo: !!normalized.logoUrl,
      hasDescription: !!normalized.description,
      columns: Array.isArray(normalized.columns) ? normalized.columns.length : 0,
      socials: Array.isArray(normalized.socials) ? normalized.socials.length : 0
    });

    // Emit realtime event for footer updates (clients may ignore if not subscribed)
    emitCmsEvent(req, 'cms:footer_updated', normalized);

    res.json({
      success: true,
      message: 'Footer configuration saved successfully',
      data: normalized
    });
  } catch (error) {
    console.error('❌ Error saving footer config:', error);
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' });
  }
};

// Activity Config - Save/Update
export const saveActivityConfig = async (req: Request, res: Response) => {
  try {
    const config = req.body || {};
    const userId = req.user?.id;

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

    const normalizeNumber = (value: any, fallback: number) => {
      const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
      return Number.isFinite(parsed) ? parsed : fallback;
    };

    const normalizeRole = (role: any) => {
      if (!role) return 'guest';
      const r = String(role).toLowerCase().trim();
      if (r === 'public') return 'guest';
      if (r === 'client') return 'employer';
      if (r === 'all' || r === '*') return 'all';
      return r;
    };

    const normalizeRoleList = (value: any) => {
      if (Array.isArray(value)) return value.map(normalizeRole).filter(Boolean);
      if (typeof value === 'string') {
        return value
          .split(',')
          .map((entry) => entry.trim())
          .filter(Boolean)
          .map(normalizeRole);
      }
      return [];
    };

    const incomingDesign = config.design || {};
    const iconStyle = incomingDesign.iconStyle || incomingDesign.icon_style || cmsData.activity.design.iconStyle || 'outline';
    const iconSize = normalizeNumber(incomingDesign.iconSize ?? incomingDesign.icon_size, cmsData.activity.design.iconSize || 20);
    const badgeColor = incomingDesign.badgeColor || incomingDesign.badge_color || cmsData.activity.design.badgeColor || '#3b82f6';
    const showBadges = normalizeBoolean(incomingDesign.showBadges ?? incomingDesign.show_badges, cmsData.activity.design.showBadges ?? true);

    const normalizedIcons = Array.isArray(config.icons)
      ? config.icons.map((icon: any, index: number) => {
          const sortOrder = normalizeNumber(icon.sortOrder ?? icon.sort_order, index + 1);
          const isEnabled = normalizeBoolean(icon.isEnabled ?? icon.is_enabled, true);
          const showLabel = normalizeBoolean(icon.showLabel ?? icon.show_label, true);
          const roles = normalizeRoleList(icon.roles ?? icon.visibility ?? icon.visible_to);
          return {
            ...icon,
            sortOrder,
            sort_order: sortOrder,
            isEnabled,
            is_enabled: isEnabled,
            showLabel,
            show_label: showLabel,
            roles
          };
        })
      : cmsData.activity.icons;

    const incomingHelpMenu = Array.isArray(config.helpMenu)
      ? config.helpMenu
      : Array.isArray(config.help_menu)
        ? config.help_menu
        : cmsData.activity.helpMenu;

    const normalizedHelpMenu = Array.isArray(incomingHelpMenu)
      ? incomingHelpMenu.map((link: any, index: number) => {
          const isEnabled = normalizeBoolean(link.isEnabled ?? link.is_enabled, true);
          return {
            ...link,
            id: link.id ?? `hl-${index}`,
            label: link.label ?? 'Help Link',
            url: link.url ?? '/',
            target: link.target ?? '_self',
            isEnabled,
            is_enabled: isEnabled
          };
        })
      : cmsData.activity.helpMenu;

    const normalized = {
      ...cmsData.activity,
      ...config,
      design: {
        iconStyle,
        iconSize,
        badgeColor,
        showBadges,
        icon_style: iconStyle,
        icon_size: iconSize,
        badge_color: badgeColor,
        show_badges: showBadges
      },
      icons: normalizedIcons,
      helpMenu: normalizedHelpMenu,
      help_menu: normalizedHelpMenu,
      updatedAt: new Date()
    };

    // Persist into CMS config (homepage target)
    const existingConfig = await getOrCreateCMSConfig(CmsTarget.HOMEPAGE, {
      header: cmsData.header,
      footer: cmsData.footer,
      heroSearch: cmsData.heroSearch,
      activity: cmsData.activity
    });
    const existingData = existingConfig.data as any;
    const updatedData = {
      ...existingData,
      activity: normalized
    };

    await saveCMSConfig(CmsTarget.HOMEPAGE, updatedData, userId);

    // Also update in-memory cache
    cmsData.activity = normalized;

    // Emit activity update so UI components depending on activity can refresh
    emitCmsEvent(req, 'cms:activity_updated', cmsData.activity);
    res.json({
      success: true,
      message: 'Activity configuration saved successfully',
      data: cmsData.activity
    });
  } catch (error) {
    console.error('Error saving activity config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Hero Search Config - Save/Update
export const saveHeroSearchConfig = async (req: Request, res: Response) => {
  try {
    const config = req.body;
    const userId = req.user?.id;

    // Normalize incoming data
    const normalized = {
      ...cmsData.heroSearch,
      id: config.id || cmsData.heroSearch.id || 'hero-search-default',
      headline: config.headline || cmsData.heroSearch.headline || 'Our freelancers will take it from here',
      subheadline: config.subheadline || cmsData.heroSearch.subheadline || '',
      searchPlaceholder: config.search_placeholder || config.searchPlaceholder || cmsData.heroSearch.searchPlaceholder || 'Search for any service...',
      search_placeholder: config.search_placeholder || config.searchPlaceholder || cmsData.heroSearch.searchPlaceholder || 'Search for any service...',
      searchSize: config.search_size || config.searchSize || cmsData.heroSearch.searchSize || 'large',
      search_size: config.search_size || config.searchSize || cmsData.heroSearch.searchSize || 'large',
      quickTags: config.quick_tags || config.quickTags || cmsData.heroSearch.quickTags || [],
      quick_tags: config.quick_tags || config.quickTags || cmsData.heroSearch.quickTags || [],
      trustedBrands: config.trusted_brands || config.trustedBrands || cmsData.heroSearch.trustedBrands || { enabled: true, title: 'Trusted by:', logos: [] },
      trusted_brands: config.trusted_brands || config.trustedBrands || cmsData.heroSearch.trustedBrands || { enabled: true, title: 'Trusted by:', logos: [] },
      valueProp: config.value_prop || config.valueProp || cmsData.heroSearch.valueProp || { enabled: false, heading: '', badges: [] },
      value_prop: config.value_prop || config.valueProp || cmsData.heroSearch.valueProp || { enabled: false, heading: '', badges: [] }
    };

    // Get existing homepage config or create new
    const existingConfig = await getOrCreateCMSConfig(CmsTarget.HOMEPAGE, { header: cmsData.header, footer: cmsData.footer, heroSearch: cmsData.heroSearch });
    const existingData = existingConfig.data as any;

    // Update heroSearch in the config data
    const updatedData = {
      ...existingData,
      heroSearch: normalized
    };

    // Save to database
    await saveCMSConfig(CmsTarget.HOMEPAGE, updatedData, userId);

    // Also update in-memory cache
    cmsData.heroSearch = normalized;
    emitCmsEvent(req, 'cms:hero_updated', normalized);
    emitCmsEvent(req, 'cms:hero_search_updated', normalized);

    console.log('✅ Hero search config saved to database:', {
      hasHeadline: !!normalized.headline,
      hasPlaceholder: !!normalized.searchPlaceholder,
      quickTagsCount: Array.isArray(normalized.quickTags) ? normalized.quickTags.length : 0,
      hasTrustedBrands: !!normalized.trustedBrands,
      trustedBrandsEnabled: normalized.trustedBrands?.enabled
    });

    res.json({
      success: true,
      message: 'Hero search configuration saved successfully',
      data: normalized
    });
  } catch (error) {
    console.error('❌ Error saving hero search config:', error);
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' });
  }
};

// Trending Config - Save/Update
export const saveTrendingConfig = async (req: Request, res: Response) => {
  try {
    const config = req.body;
    const userId = req.user?.id;
    let normalized: any;

    // Get existing homepage config or create new
    const existingConfig = await getOrCreateCMSConfig(CmsTarget.HOMEPAGE, { trending: cmsData.trending });
    const existingData = existingConfig.data as any;
    const currentTrending = existingData.trending || cmsData.trending;

    // Normalize incoming data
    if (config.opportunities) {
      normalized = {
        ...currentTrending,
        opportunities: config.opportunities
      };
    } else {
      // Handle the trending strip configuration
      const showIcons =
        config.show_icons !== undefined ? config.show_icons : (config.showIcons !== undefined ? config.showIcons : currentTrending.show_icons);
      normalized = {
        ...currentTrending,
        id: config.id || currentTrending.id || 'trending-default',
        enabled: config.is_enabled !== undefined ? config.is_enabled : (config.enabled !== undefined ? config.enabled : true),
        title: config.title || currentTrending.title || 'Trending Categories',
        categoryIds: (config.category_ids || config.categoryIds || []).map((id: any) => String(id)),
        scrollBehavior: config.scroll_behavior || config.scrollBehavior || 'manual',
        autoSlideInterval: config.auto_slide_interval !== undefined ? config.auto_slide_interval : (config.autoSlideInterval !== undefined ? config.autoSlideInterval : 0),
        visibility: config.visibility || currentTrending.visibility || ['GUEST', 'FREELANCER', 'EMPLOYER'],
        show_icons: showIcons
      };
    }

    // Update homepage config data
    const updatedData = {
      ...existingData,
      trending: normalized
    };

    // Save to database
    await saveCMSConfig(CmsTarget.HOMEPAGE, updatedData, userId);

    // Also update in-memory cache
    cmsData.trending = normalized;
    emitCmsEvent(req, 'cms:trending_config_updated', normalized);
    emitCmsEvent(req, 'cms:trending_updated', normalized);

    console.log('✅ Trending config saved to database:', {
      hasOpportunities: Array.isArray(normalized.opportunities),
      opportunitiesCount: Array.isArray(normalized.opportunities) ? normalized.opportunities.length : 0,
      enabled: normalized.enabled,
      categoryIds: normalized.categoryIds || normalized.category_ids
    });

    res.json({
      success: true,
      message: 'Trending configuration saved successfully',
      data: normalized
    });
  } catch (error) {
    console.error('❌ Error saving trending config:', error);
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' });
  }
};

// Homepage Sections - Save/Update
export const saveHomepageSection = async (req: Request, res: Response) => {
  try {
    const section = req.body;

    // Normalize incoming data (handle both camelCase and snake_case)
    const normalized = {
      ...section,
      id: section.id || `section-${Date.now()}`,
      type: section.type || 'hero',
      name: section.name || section.title || 'Section',
      isActive: section.is_active !== undefined ? section.is_active : (section.isActive !== undefined ? section.isActive : true),
      sortOrder: section.position !== undefined ? section.position : (section.sortOrder !== undefined ? section.sortOrder : 0),
      content: section.content || {},
      style: section.style || {},
      updatedAt: new Date()
    };

    const index = cmsData.homepageSections.findIndex(s => s.id === normalized.id);

    if (index >= 0) {
      cmsData.homepageSections[index] = {
        ...cmsData.homepageSections[index],
        ...normalized
      };
    } else {
      cmsData.homepageSections.push({
        ...normalized,
        createdAt: new Date()
      });
    }

    console.log('✅ Homepage section saved:', {
      id: normalized.id,
      type: normalized.type,
      isActive: normalized.isActive,
      name: normalized.name
    });

    emitCmsEvent(req, 'cms:sections_updated', cmsData.homepageSections);

    res.json({
      success: true,
      message: 'Homepage section saved successfully',
      data: normalized
    });
  } catch (error) {
    console.error('❌ Error saving homepage section:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Homepage Sections - Add New
export const addHomepageSection = async (req: Request, res: Response) => {
  try {
    const { type } = req.body;
    const newSection = {
      id: `section-${Date.now()}`,
      type,
      title: `New ${type} Section`,
      isActive: true,
      sortOrder: cmsData.homepageSections.length + 1,
      content: type === 'hero' ? {
        title: 'New Hero Section',
        subtitle: 'Add your content here',
        description: '',
        primaryAction: { label: 'Learn More', url: '/', style: 'primary' },
        secondaryAction: { label: 'Get Started', url: '/start', style: 'secondary' },
        image: '',
        features: []
      } : type === 'categories' ? {
        categories: []
      } : type === 'featured' ? {
        services: []
      } : {},
      style: type === 'hero' ? { theme: 'light', animation: 'fade-in' } :
        type === 'categories' ? { layout: 'grid', columns: 3 } :
          type === 'featured' ? { layout: 'carousel', autoplay: true } : {}
    };

    cmsData.homepageSections.push(newSection as any);
    emitCmsEvent(req, 'cms:sections_updated', cmsData.homepageSections);

    res.json({
      success: true,
      message: 'Homepage section added successfully',
      data: newSection
    });
  } catch (error) {
    console.error('Error adding homepage section:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Homepage Sections - Update Order
export const updateSectionOrder = async (req: Request, res: Response) => {
  try {
    const sections = req.body;

    // Normalize and update section order
    cmsData.homepageSections = sections.map((section: any, index: number) => ({
      ...section,
      id: section.id || `section-${Date.now()}-${index}`,
      type: section.type || 'hero',
      name: section.name || section.title || 'Section',
      isActive: section.is_active !== undefined ? section.is_active : (section.isActive !== undefined ? section.isActive : true),
      sortOrder: index + 1,
      position: index + 1, // Also set position for frontend compatibility
      content: section.content || {},
      style: section.style || {},
      updatedAt: new Date()
    }));

    console.log('✅ Section order updated:', {
      totalSections: cmsData.homepageSections.length,
      order: cmsData.homepageSections.map((s: any) => ({ id: s.id, name: s.name || s.title, order: s.sortOrder }))
    });

    emitCmsEvent(req, 'cms:sections_updated', cmsData.homepageSections);

    res.json({
      success: true,
      message: 'Section order updated successfully',
      data: cmsData.homepageSections
    });
  } catch (error) {
    console.error('❌ Error updating section order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Homepage Sections - Delete
export const deleteHomepageSection = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const beforeCount = cmsData.homepageSections.length;
    cmsData.homepageSections = cmsData.homepageSections.filter(s => s.id !== id);
    const afterCount = cmsData.homepageSections.length;

    console.log('✅ Homepage section deleted:', {
      id,
      beforeCount,
      afterCount,
      deleted: beforeCount > afterCount
    });

    emitCmsEvent(req, 'cms:sections_updated', cmsData.homepageSections);

    res.json({
      success: true,
      message: 'Homepage section deleted successfully',
      deletedId: id
    });
  } catch (error) {
    console.error('❌ Error deleting homepage section:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Home Slides - Save/Update
export const saveHomeSlide = async (req: Request, res: Response) => {
  try {
    const slide = req.body;
    const userId = req.user?.id;

    // Normalize incoming data
    const normalized = {
      ...slide,
      id: slide.id || `slide-${Date.now()}`,
      mediaType: slide.media_type || slide.mediaType || 'image',
      mediaUrl: slide.media_url || slide.mediaUrl || '',
      title: slide.title || '',
      subtitle: slide.subtitle || '',
      redirectUrl: slide.redirect_url || slide.redirectUrl || '',
      roleVisibility: slide.role_visibility || slide.roleVisibility || ['GUEST', 'FREELANCER', 'EMPLOYER'],
      sortOrder: slide.sort_order !== undefined ? slide.sort_order : (slide.sortOrder !== undefined ? slide.sortOrder : 0),
      isActive: slide.is_active !== undefined ? slide.is_active : (slide.isActive !== undefined ? slide.isActive : true),
      backgroundColor: slide.background_color || slide.backgroundColor || '#000000',
      updatedAt: new Date().toISOString()
    };

    // Get existing homepage config or create new
    const existingConfig = await getOrCreateCMSConfig(CmsTarget.HOMEPAGE, { homeSlides: cmsData.homeSlides });
    const existingData = existingConfig.data as any;
    const existingSlides = existingData?.homeSlides || cmsData.homeSlides;

    // Update or add slide
    const index = existingSlides.findIndex((s: any) => s.id === normalized.id);
    let updatedSlides;

    if (index >= 0) {
      updatedSlides = [...existingSlides];
      updatedSlides[index] = {
        ...updatedSlides[index],
        ...normalized
      };
    } else {
      updatedSlides = [...existingSlides, {
        ...normalized,
        createdAt: new Date().toISOString()
      }];
    }

    // Update homepage config data
    const updatedData = {
      ...existingData,
      homeSlides: updatedSlides
    };

    // Save to database
    await saveCMSConfig(CmsTarget.HOMEPAGE, updatedData, userId);

    // Also update in-memory cache
    cmsData.homeSlides = updatedSlides;

    console.log('✅ Home slide saved to database:', {
      id: normalized.id,
      title: normalized.title,
      isActive: normalized.isActive,
      mediaUrl: normalized.mediaUrl ? 'has URL' : 'no URL',
      totalSlides: updatedSlides.length
    });

    emitCmsEvent(req, 'cms:slides_updated', updatedSlides);

    res.json({
      success: true,
      message: 'Home slide saved successfully',
      data: normalized
    });
  } catch (error) {
    console.error('❌ Error saving home slide:', error);
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' });
  }
};

// Home Slides - Update Order
export const updateHomeSlideOrder = async (req: Request, res: Response) => {
  try {
    const slides = req.body;
    const userId = req.user?.id;

    const updatedSlides = slides.map((slide: any, index: number) => ({
      ...slide,
      sortOrder: index + 1,
      sort_order: index + 1
    }));

    // Get existing homepage config
    const existingConfig = await getOrCreateCMSConfig(CmsTarget.HOMEPAGE, { homeSlides: cmsData.homeSlides });
    const existingData = existingConfig.data as any;

    // Update slides in config
    const updatedData = {
      ...existingData,
      homeSlides: updatedSlides
    };

    // Save to database
    await saveCMSConfig(CmsTarget.HOMEPAGE, updatedData, userId);

    // Update in-memory cache
    cmsData.homeSlides = updatedSlides;
    emitCmsEvent(req, 'cms:slides_updated', updatedSlides);
    res.json({
      success: true,
      message: 'Slide order updated successfully'
    });
  } catch (error) {
    console.error('Error updating slide order:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Home Slides - Delete
export const deleteHomeSlide = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;

    // Get existing homepage config
    const existingConfig = await getOrCreateCMSConfig(CmsTarget.HOMEPAGE, { homeSlides: cmsData.homeSlides });
    const existingData = existingConfig.data as any;
    const existingSlides = existingData?.homeSlides || cmsData.homeSlides;

    // Filter out the deleted slide
    const updatedSlides = existingSlides.filter((s: any) => s.id !== id);

    // Update config data
    const updatedData = {
      ...existingData,
      homeSlides: updatedSlides
    };

    // Save to database
    await saveCMSConfig(CmsTarget.HOMEPAGE, updatedData, userId);

    // Update in-memory cache
    cmsData.homeSlides = updatedSlides;

    console.log('✅ Home slide deleted from database:', {
      id,
      remainingSlides: updatedSlides.length
    });

    emitCmsEvent(req, 'cms:slides_updated', updatedSlides);

    res.json({
      success: true,
      message: 'Home slide deleted successfully'
    });
  } catch (error) {
    console.error('❌ Error deleting home slide:', error);
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' });
  }
};

// Analytics - Get
export const getHomepageAnalytics = async (req: Request, res: Response) => {
  try {
    res.json(cmsData.analytics);
  } catch (error) {
    console.error('Error getting homepage analytics:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// Unified homepage endpoint - returns all homepage content
// This is a PUBLIC endpoint (no auth required) for the homepage
export const getHomepage = async (req: Request, res: Response) => {
  try {
    const { role, location, pageType } = req.query;

    // Determine page type
    const pageTypeValue = (pageType as string) ||
      (role === 'FREELANCER' ? 'freelancer_home' :
        role === 'EMPLOYER' ? 'employer_home' :
          'public_home');

    // Fetch from DB
    const [homepageConfig, footerConfigRef] = await Promise.all([
      getOrCreateCMSConfig(CmsTarget.HOMEPAGE, {
        header: cmsData.header,
        heroSearch: cmsData.heroSearch,
        homeSlides: cmsData.homeSlides,
        homepageSections: cmsData.homepageSections,
        trending: cmsData.trending
      }),
      getOrCreateCMSConfig(CmsTarget.FOOTER, { footer: cmsData.footer })
    ]);

    const data = homepageConfig.data as any;
    const footerData = footerConfigRef.data as any;

    // Use data from DB, fallback to defaults
    const header = data?.header || cmsData.header;
    const heroSearch = data?.heroSearch || cmsData.heroSearch;
    const homeSlides = data?.homeSlides || cmsData.homeSlides;
    const homepageSections = data?.homepageSections || cmsData.homepageSections;
    const trendingRaw = data?.trending || cmsData.trending;
    const footer = footerData?.footer || cmsData.footer;

    // Get active sections - transform to match frontend types (snake_case)
    const activeSections = homepageSections
      .filter((section: any) => (section as any).isActive !== false)
      .sort((a: any, b: any) => ((a as any).sortOrder || 0) - ((b as any).sortOrder || 0))
      .map((section: any) => ({
        id: section.id || `section-${Date.now()}`,
        type: section.type || 'hero',
        name: (section as any).title || section.name || 'Section',
        is_active: (section as any).isActive !== false,
        position: (section as any).sortOrder || 0,
        content: section.content,
        style: section.style
      }));

    // Get active slides - transform to match frontend types (snake_case)
    const activeSlides = homeSlides
      .filter((slide: any) => (slide as any).isActive !== false)
      .sort((a: any, b: any) => ((a as any).sortOrder || 0) - ((b as any).sortOrder || 0))
      .map((slide: any) => ({
        id: slide.id,
        media_type: slide.mediaType || 'image',
        media_url: slide.mediaUrl || '',
        title: slide.title,
        subtitle: slide.subtitle,
        redirect_url: slide.redirectUrl,
        role_visibility: slide.roleVisibility || ['GUEST', 'FREELANCER', 'EMPLOYER'],
        sort_order: (slide as any).sortOrder || 0,
        is_active: (slide as any).isActive !== false,
        created_at: slide.createdAt || new Date().toISOString(),
        updated_at: slide.updatedAt || new Date().toISOString(),
        background_color: (slide as any).backgroundColor || '#000000'
      }));

    // Get trending opportunities
    const trending = trendingRaw.opportunities || [];

    // Get trending config
    const { opportunities, ...trendingConfig } = trendingRaw;

    // Return unified homepage data
    const response = {
      pageType: pageTypeValue,
      sections: activeSections,
      slides: activeSlides,
      trending: {
        config: trendingConfig,
        opportunities: trending
      },
      heroSearch: heroSearch,
      header: header,
      footer: footer,
      published: true,
      publishedAt: new Date().toISOString(),
      timestamp: new Date().toISOString()
    };

    console.log(`✅ Homepage data served for ${pageTypeValue} (DB):`, {
      sections: activeSections.length,
      slides: activeSlides.length,
      trending: trending.length
    });

    // Always return data, even if empty (so frontend can handle it)
    res.json(response);
  } catch (error) {
    console.error('❌ Error getting homepage:', error);
    // Return empty but valid structure instead of 500
    res.json({
      pageType: 'public_home',
      sections: [],
      slides: [],
      trending: {
        config: { enabled: false },
        opportunities: []
      },
      heroSearch: cmsData.heroSearch || {},
      header: cmsData.header || {},
      footer: cmsData.footer || {},
      published: false,
      publishedAt: null,
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
};

// Trending Config - Get (for the strip configuration)
export const getTrendingConfig = async (req: Request, res: Response) => {
  try {
    const homepageConfig = await getOrCreateCMSConfig(CmsTarget.HOMEPAGE, { trending: cmsData.trending });
    const data = homepageConfig.data as any;
    const trendingRaw = data?.trending || cmsData.trending;
    const { opportunities, ...trendingConfig } = trendingRaw;
    cmsData.trending = trendingRaw;
    res.json(trendingConfig);
  } catch (error) {
    console.error('Error getting trending config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// --- Affiliate Content (Public GET, Admin POST save) ---
const defaultAffiliateContent = {
  heroTitle: 'Become a Scrolith Affiliate',
  heroSubtitle: 'Earn commissions by referring users to our platform',
  heroButtonText: 'Join Now',
  benefits: [
    { title: 'High Commission', description: 'Earn up to 30% commission on referrals', icon: 'dollar-sign' },
    { title: 'Recurring Earnings', description: 'Get paid for as long as your referrals use Scrolith', icon: 'repeat' },
    { title: 'Marketing Tools', description: 'Access banners, links, and tracking tools', icon: 'tool' }
  ],
  updated_at: new Date().toISOString()
};

export const getAffiliateContent = async (req: Request, res: Response) => {
  try {
    // Use GLOBAL target for affiliate content storage
    const config = await getOrCreateCMSConfig(CmsTarget.GLOBAL, { affiliate: defaultAffiliateContent });
    const data = config.data as any;

    // Support multiple shapes/keys
    const affiliateRaw = data?.affiliate || data?.affiliateContent || data?.affiliate_content || defaultAffiliateContent;

    // Normalize to friendly camelCase format
    const normalized = {
      heroTitle: affiliateRaw.heroTitle || affiliateRaw.hero_title || affiliateRaw.title || affiliateRaw.hero || defaultAffiliateContent.heroTitle,
      heroSubtitle: affiliateRaw.heroSubtitle || affiliateRaw.hero_subtitle || affiliateRaw.subtitle || defaultAffiliateContent.heroSubtitle,
      heroButtonText: affiliateRaw.heroButtonText || affiliateRaw.hero_button_text || affiliateRaw.heroButton || defaultAffiliateContent.heroButtonText,
      benefits: Array.isArray(affiliateRaw.benefits) ? affiliateRaw.benefits : defaultAffiliateContent.benefits,
      updated_at: affiliateRaw.updated_at || affiliateRaw.updatedAt || new Date().toISOString()
    };

    console.log('✅ Served affiliate content (DB):', { hasBenefits: Array.isArray(normalized.benefits) ? normalized.benefits.length : 0 });
    res.json(normalized);
  } catch (error) {
    console.error('❌ Error getting affiliate content, returning fallback:', error);
    res.json(defaultAffiliateContent);
  }
};

export const saveAffiliateContent = async (req: Request, res: Response) => {
  try {
    const payload = req.body || {};
    const userId = req.user?.id;

    // Normalize incoming content
    const normalized = {
      heroTitle: payload.heroTitle || payload.hero_title || payload.title || defaultAffiliateContent.heroTitle,
      heroSubtitle: payload.heroSubtitle || payload.hero_subtitle || payload.subtitle || defaultAffiliateContent.heroSubtitle,
      heroButtonText: payload.heroButtonText || payload.hero_button_text || payload.buttonText || defaultAffiliateContent.heroButtonText,
      benefits: Array.isArray(payload.benefits) ? payload.benefits : defaultAffiliateContent.benefits,
      updated_at: new Date().toISOString()
    };

    // Persist under GLOBAL target - keep existing data merged
    const existingConfig = await getOrCreateCMSConfig(CmsTarget.GLOBAL, { affiliate: defaultAffiliateContent });
    const existingData = existingConfig.data as any || {};

    const updatedData = {
      ...(existingData || {}),
      affiliate: normalized
    };

    await saveCMSConfig(CmsTarget.GLOBAL, updatedData, userId);

    // Update in-memory cache for quick access
    (cmsData as any).affiliate = normalized;

    // Emit event to connected clients if websocket exists
    emitCmsEvent(req, 'cms:affiliate_updated', normalized);

    console.log('✅ Affiliate content saved to database by user:', userId || 'anonymous');

    res.json({ success: true, message: 'Affiliate content saved', data: normalized });
  } catch (error) {
    console.error('❌ Error saving affiliate content:', error);
    res.status(500).json({ error: 'Internal server error', details: error instanceof Error ? error.message : 'Unknown error' });
  }
};

// --- CMS Pages (Static Pages) ---
export const getPages = async (_req: Request, res: Response) => {
  try {
    const data = await getAppSetting(CMS_PAGES_SCOPE, { pages: [] });
    const pages = Array.isArray((data as any)?.pages) ? (data as any).pages : [];
    res.json(pages);
  } catch (error) {
    console.error('❌ Error getting CMS pages:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPageBySlug = async (req: Request, res: Response) => {
  try {
    const slug = String(req.params?.slug || '').trim().toLowerCase();
    const data = await getAppSetting(CMS_PAGES_SCOPE, { pages: [] });
    const pages = Array.isArray((data as any)?.pages) ? (data as any).pages : [];
    const page = pages.find((p: any) => String(p.slug || '').toLowerCase() === slug);
    if (!page) return res.status(404).json({ error: 'Page not found' });
    res.json(page);
  } catch (error) {
    console.error('❌ Error getting CMS page by slug:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const savePage = async (req: Request, res: Response) => {
  try {
    const incoming = req.body || {};
    const now = new Date().toISOString();
    const data = await getAppSetting(CMS_PAGES_SCOPE, { pages: [] });
    const pages = Array.isArray((data as any)?.pages) ? (data as any).pages : [];

    const baseSlug = slugify(incoming.slug || incoming.title || '');
    let slug = baseSlug || `page-${Date.now()}`;
    const id = String(incoming.id || req.params?.id || `page-${Date.now()}`);

    const duplicate = pages.find((p: any) => p.slug === slug && p.id !== id);
    if (duplicate) {
      slug = `${slug}-${Date.now().toString().slice(-4)}`;
    }

    const normalized = {
      id,
      title: incoming.title || '',
      slug,
      content: incoming.content || '',
      blocks: Array.isArray(incoming.blocks) ? incoming.blocks : [],
      status: incoming.status || 'DRAFT',
      visibility: incoming.visibility || 'public',
      categoryId: incoming.categoryId || incoming.category_id || '',
      seo: incoming.seo || { metaTitle: '', metaDescription: '', metaKeywords: [] },
      images: Array.isArray(incoming.images) ? incoming.images : [],
      videos: Array.isArray(incoming.videos) ? incoming.videos : [],
      updatedAt: now,
      updated_at: now,
      createdAt: incoming.createdAt || incoming.created_at || now,
      created_at: incoming.created_at || incoming.createdAt || now
    };

    const index = pages.findIndex((p: any) => p.id === id);
    let updatedPages;
    if (index >= 0) {
      updatedPages = [...pages];
      updatedPages[index] = { ...updatedPages[index], ...normalized };
    } else {
      updatedPages = [...pages, normalized];
    }

    await saveAppSetting(CMS_PAGES_SCOPE, { pages: updatedPages });
    emitCmsEvent(req, 'cms:pages_updated', updatedPages);
    emitCmsEvent(req, 'cms:page_updated', normalized);

    try {
      void broadcastPolicyUpdate(normalized);
    } catch (policyError) {
      console.warn('Failed to broadcast policy update', policyError);
    }

    res.json({ success: true, data: normalized });
  } catch (error) {
    console.error('❌ Error saving CMS page:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deletePage = async (req: Request, res: Response) => {
  try {
    const id = String(req.params?.id || '');
    const data = await getAppSetting(CMS_PAGES_SCOPE, { pages: [] });
    const pages = Array.isArray((data as any)?.pages) ? (data as any).pages : [];
    const updatedPages = pages.filter((p: any) => String(p.id) !== id);
    await saveAppSetting(CMS_PAGES_SCOPE, { pages: updatedPages });
    emitCmsEvent(req, 'cms:pages_updated', updatedPages);
    emitCmsEvent(req, 'cms:page_deleted', { id });
    res.json({ success: true, id });
  } catch (error) {
    console.error('❌ Error deleting CMS page:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// --- CMS Page Categories ---
export const getPageCategories = async (_req: Request, res: Response) => {
  try {
    const data = await getAppSetting(CMS_PAGE_CATEGORIES_SCOPE, { categories: [] });
    const categories = Array.isArray((data as any)?.categories) ? (data as any).categories : [];
    res.json(categories);
  } catch (error) {
    console.error('❌ Error getting CMS categories:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const savePageCategory = async (req: Request, res: Response) => {
  try {
    const incoming = req.body || {};
    const now = new Date().toISOString();
    const data = await getAppSetting(CMS_PAGE_CATEGORIES_SCOPE, { categories: [] });
    const categories = Array.isArray((data as any)?.categories) ? (data as any).categories : [];

    const baseSlug = slugify(incoming.slug || incoming.name || '');
    let slug = baseSlug || `cat-${Date.now()}`;
    const id = String(incoming.id || req.params?.id || `cat-${Date.now()}`);

    const duplicate = categories.find((c: any) => c.slug === slug && c.id !== id);
    if (duplicate) {
      slug = `${slug}-${Date.now().toString().slice(-4)}`;
    }

    const normalized = {
      id,
      name: incoming.name || '',
      slug,
      status: incoming.status || 'active',
      description: incoming.description || '',
      image: incoming.image || null,
      sortOrder: incoming.sortOrder ?? incoming.sort_order ?? 0,
      sort_order: incoming.sort_order ?? incoming.sortOrder ?? 0,
      created_at: incoming.created_at || incoming.createdAt || now,
      updated_at: now
    };

    const index = categories.findIndex((c: any) => c.id === id);
    let updatedCategories;
    if (index >= 0) {
      updatedCategories = [...categories];
      updatedCategories[index] = { ...updatedCategories[index], ...normalized };
    } else {
      updatedCategories = [...categories, normalized];
    }

    await saveAppSetting(CMS_PAGE_CATEGORIES_SCOPE, { categories: updatedCategories });
    emitCmsEvent(req, 'cms:categories_updated', updatedCategories);
    emitCmsEvent(req, 'cms:category_updated', normalized);

    res.json({ success: true, data: normalized });
  } catch (error) {
    console.error('❌ Error saving CMS category:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deletePageCategory = async (req: Request, res: Response) => {
  try {
    const id = String(req.params?.id || '');
    const data = await getAppSetting(CMS_PAGE_CATEGORIES_SCOPE, { categories: [] });
    const categories = Array.isArray((data as any)?.categories) ? (data as any).categories : [];
    const updatedCategories = categories.filter((c: any) => String(c.id) !== id);
    await saveAppSetting(CMS_PAGE_CATEGORIES_SCOPE, { categories: updatedCategories });
    emitCmsEvent(req, 'cms:categories_updated', updatedCategories);
    emitCmsEvent(req, 'cms:category_deleted', { id });
    res.json({ success: true, id });
  } catch (error) {
    console.error('❌ Error deleting CMS category:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// --- BLOG POSTS ---
export const getBlogPosts = async (_req: Request, res: Response) => {
  try {
    const data = await getAppSetting(CMS_BLOG_POSTS_SCOPE, { posts: [] });
    const posts = Array.isArray((data as any)?.posts) ? (data as any).posts : [];
    const categoriesData = await getAppSetting(CMS_BLOG_CATEGORIES_SCOPE, { categories: [] });
    const categories = Array.isArray((categoriesData as any)?.categories) ? (categoriesData as any).categories : [];
    const filtered = posts.filter((post: any) => isBlogPostPublic(post));
    const normalized = filtered.map((post: any) => normalizeBlogPost(post, categories, post?.updated_at || post?.updatedAt));
    normalized.sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    res.json(normalized);
  } catch (error) {
    console.error('❌ Error getting blog posts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getBlogPostBySlug = async (req: Request, res: Response) => {
  try {
    const slug = String(req.params?.slug || '').trim().toLowerCase();
    const data = await getAppSetting(CMS_BLOG_POSTS_SCOPE, { posts: [] });
    const posts = Array.isArray((data as any)?.posts) ? (data as any).posts : [];
    const categoriesData = await getAppSetting(CMS_BLOG_CATEGORIES_SCOPE, { categories: [] });
    const categories = Array.isArray((categoriesData as any)?.categories) ? (categoriesData as any).categories : [];
    const post = posts.find((p: any) => String(p.slug || '').toLowerCase() === slug);
    if (!post || !isBlogPostPublic(post)) return res.status(404).json({ error: 'Post not found' });
    res.json(normalizeBlogPost(post, categories, post?.updated_at || post?.updatedAt));
  } catch (error) {
    console.error('❌ Error getting blog post by slug:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getBlogPostsAdmin = async (_req: Request, res: Response) => {
  try {
    const data = await getAppSetting(CMS_BLOG_POSTS_SCOPE, { posts: [] });
    const posts = Array.isArray((data as any)?.posts) ? (data as any).posts : [];
    const categoriesData = await getAppSetting(CMS_BLOG_CATEGORIES_SCOPE, { categories: [] });
    const categories = Array.isArray((categoriesData as any)?.categories) ? (categoriesData as any).categories : [];
    const normalized = posts.map((post: any) => normalizeBlogPost(post, categories, post?.updated_at || post?.updatedAt));
    normalized.sort((a: any, b: any) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    res.json(normalized);
  } catch (error) {
    console.error('❌ Error getting admin blog posts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getBlogPostByIdAdmin = async (req: Request, res: Response) => {
  try {
    const id = String(req.params?.id || '').trim();
    const data = await getAppSetting(CMS_BLOG_POSTS_SCOPE, { posts: [] });
    const posts = Array.isArray((data as any)?.posts) ? (data as any).posts : [];
    const categoriesData = await getAppSetting(CMS_BLOG_CATEGORIES_SCOPE, { categories: [] });
    const categories = Array.isArray((categoriesData as any)?.categories) ? (categoriesData as any).categories : [];
    const post = posts.find((p: any) => String(p.id || '') === id);
    if (!post) return res.status(404).json({ error: 'Post not found' });
    res.json(normalizeBlogPost(post, categories, post?.updated_at || post?.updatedAt));
  } catch (error) {
    console.error('❌ Error getting admin blog post by id:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const saveBlogPost = async (req: Request, res: Response) => {
  try {
    const incoming = req.body || {};
    const now = new Date().toISOString();
    const data = await getAppSetting(CMS_BLOG_POSTS_SCOPE, { posts: [] });
    const posts = Array.isArray((data as any)?.posts) ? (data as any).posts : [];
    const categoriesData = await getAppSetting(CMS_BLOG_CATEGORIES_SCOPE, { categories: [] });
    const categories = Array.isArray((categoriesData as any)?.categories) ? (categoriesData as any).categories : [];

    const id = String(incoming.id || req.params?.id || `post-${Date.now()}`);
    const baseSlug = slugify(incoming.slug || incoming.title || '');
    let slug = baseSlug || `post-${Date.now()}`;

    const duplicate = posts.find((p: any) => p.slug === slug && p.id !== id);
    if (duplicate) {
      slug = `${slug}-${Date.now().toString().slice(-4)}`;
    }

    const normalized = normalizeBlogPost({ ...incoming, id, slug, updated_at: now }, categories, now);

    const index = posts.findIndex((p: any) => p.id === id);
    let updatedPosts: any[];
    if (index >= 0) {
      updatedPosts = [...posts];
      updatedPosts[index] = { ...updatedPosts[index], ...normalized };
    } else {
      updatedPosts = [...posts, normalized];
    }

    await saveAppSetting(CMS_BLOG_POSTS_SCOPE, { posts: updatedPosts });

    const updatedCategories = computeCategoryCounts(updatedPosts, categories);
    await saveAppSetting(CMS_BLOG_CATEGORIES_SCOPE, { categories: updatedCategories });

    emitCmsEvent(req, 'cms:blog_posts_updated', updatedPosts);
    emitCmsEvent(req, 'cms:blog_post_updated', normalized);

    res.json({ success: true, data: normalized });
  } catch (error) {
    console.error('❌ Error saving blog post:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteBlogPost = async (req: Request, res: Response) => {
  try {
    const id = String(req.params?.id || '');
    const data = await getAppSetting(CMS_BLOG_POSTS_SCOPE, { posts: [] });
    const posts = Array.isArray((data as any)?.posts) ? (data as any).posts : [];
    const updatedPosts = posts.filter((p: any) => String(p.id) !== id);
    await saveAppSetting(CMS_BLOG_POSTS_SCOPE, { posts: updatedPosts });

    const categoriesData = await getAppSetting(CMS_BLOG_CATEGORIES_SCOPE, { categories: [] });
    const categories = Array.isArray((categoriesData as any)?.categories) ? (categoriesData as any).categories : [];
    const updatedCategories = computeCategoryCounts(updatedPosts, categories);
    await saveAppSetting(CMS_BLOG_CATEGORIES_SCOPE, { categories: updatedCategories });

    emitCmsEvent(req, 'cms:blog_posts_updated', updatedPosts);
    emitCmsEvent(req, 'cms:blog_post_deleted', { id });
    res.json({ success: true, id });
  } catch (error) {
    console.error('❌ Error deleting blog post:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// --- BLOG CATEGORIES ---
export const getBlogCategories = async (_req: Request, res: Response) => {
  try {
    const data = await getAppSetting(CMS_BLOG_CATEGORIES_SCOPE, { categories: [] });
    const categories = Array.isArray((data as any)?.categories) ? (data as any).categories : [];
    const postsData = await getAppSetting(CMS_BLOG_POSTS_SCOPE, { posts: [] });
    const posts = Array.isArray((postsData as any)?.posts) ? (postsData as any).posts : [];
    const normalized = computeCategoryCounts(posts, categories);
    res.json(normalized);
  } catch (error) {
    console.error('❌ Error getting blog categories:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const saveBlogCategory = async (req: Request, res: Response) => {
  try {
    const incoming = req.body || {};
    const now = new Date().toISOString();
    const data = await getAppSetting(CMS_BLOG_CATEGORIES_SCOPE, { categories: [] });
    const categories = Array.isArray((data as any)?.categories) ? (data as any).categories : [];

    const baseSlug = slugify(incoming.slug || incoming.name || '');
    let slug = baseSlug || `cat-${Date.now()}`;
    const id = String(incoming.id || req.params?.id || `cat-${Date.now()}`);

    const duplicate = categories.find((c: any) => c.slug === slug && c.id !== id);
    if (duplicate) {
      slug = `${slug}-${Date.now().toString().slice(-4)}`;
    }

    const normalized = {
      id,
      name: incoming.name || '',
      slug,
      status: incoming.status || 'active',
      description: incoming.description || '',
      count: Number(incoming.count ?? 0),
      created_at: incoming.created_at || incoming.createdAt || now,
      updated_at: now
    };

    const index = categories.findIndex((c: any) => c.id === id);
    let updatedCategories: any[];
    if (index >= 0) {
      updatedCategories = [...categories];
      updatedCategories[index] = { ...updatedCategories[index], ...normalized };
    } else {
      updatedCategories = [...categories, normalized];
    }

    const postsData = await getAppSetting(CMS_BLOG_POSTS_SCOPE, { posts: [] });
    const posts = Array.isArray((postsData as any)?.posts) ? (postsData as any).posts : [];
    const withCounts = computeCategoryCounts(posts, updatedCategories);

    await saveAppSetting(CMS_BLOG_CATEGORIES_SCOPE, { categories: withCounts });
    emitCmsEvent(req, 'cms:blog_categories_updated', withCounts);
    emitCmsEvent(req, 'cms:blog_category_updated', normalized);
    res.json({ success: true, data: normalized });
  } catch (error) {
    console.error('❌ Error saving blog category:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const deleteBlogCategory = async (req: Request, res: Response) => {
  try {
    const id = String(req.params?.id || '');
    const data = await getAppSetting(CMS_BLOG_CATEGORIES_SCOPE, { categories: [] });
    const categories = Array.isArray((data as any)?.categories) ? (data as any).categories : [];
    const updatedCategories = categories.filter((c: any) => String(c.id) !== id);
    await saveAppSetting(CMS_BLOG_CATEGORIES_SCOPE, { categories: updatedCategories });
    emitCmsEvent(req, 'cms:blog_categories_updated', updatedCategories);
    emitCmsEvent(req, 'cms:blog_category_deleted', { id });
    res.json({ success: true, id });
  } catch (error) {
    console.error('❌ Error deleting blog category:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// --- BLOG SETTINGS ---
export const getBlogSettings = async (_req: Request, res: Response) => {
  try {
    const data = await getAppSetting(CMS_BLOG_SETTINGS_SCOPE, defaultBlogSettings);
    const normalized = normalizeBlogSettings(data);
    res.json(normalized);
  } catch (error) {
    console.error('❌ Error getting blog settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const saveBlogSettings = async (req: Request, res: Response) => {
  try {
    const payload = req.body || {};
    const existing = await getAppSetting(CMS_BLOG_SETTINGS_SCOPE, defaultBlogSettings);
    const merged = normalizeBlogSettings({ ...existing, ...payload, updated_at: new Date().toISOString() });
    const saved = await saveAppSetting(CMS_BLOG_SETTINGS_SCOPE, merged);
    emitCmsEvent(req, 'cms:blog_settings_updated', saved);
    res.json({ success: true, data: saved });
  } catch (error) {
    console.error('❌ Error saving blog settings:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// --- Auth Pages Config (Login / Signup screens) ---
export const getAuthPagesConfig = async (_req: Request, res: Response) => {
  try {
    const data = await getAppSetting(CMS_AUTH_PAGES_SCOPE, defaultAuthPagesConfig);
    const normalized = normalizeAuthPagesConfig(data || {});
    const sanitized = sanitizeAuthPagesConfig(normalized);
    res.json(sanitized);
  } catch (error) {
    console.error('❌ Error getting auth pages config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const saveAuthPagesConfig = async (req: Request, res: Response) => {
  try {
    const payload = req.body || {};
    const existing = await getAppSetting(CMS_AUTH_PAGES_SCOPE, defaultAuthPagesConfig);
    const normalized = normalizeAuthPagesConfig(payload, existing || {});
    const saved = await saveAppSetting(CMS_AUTH_PAGES_SCOPE, normalized);
    const sanitized = sanitizeAuthPagesConfig(saved);
    emitCmsEvent(req, 'cms:auth_pages_updated', sanitized);
    res.json({ success: true, data: sanitized });
  } catch (error) {
    console.error('❌ Error saving auth pages config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// --- Answers Page (AI Q&A) ---
export const getAnswersPage = async (_req: Request, res: Response) => {
  try {
    const data = await getAppSetting(CMS_ANSWERS_SCOPE, defaultAnswersPage);
    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ Error getting Answers page config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const saveAnswersPage = async (req: Request, res: Response) => {
  try {
    const payload = req.body?.data ?? req.body ?? {};
    const merged = { ...defaultAnswersPage, ...payload, updated_at: new Date().toISOString() };
    const saved = await saveAppSetting(CMS_ANSWERS_SCOPE, merged);
    emitCmsEvent(req, 'cms:answers_updated', saved);
    res.json({ success: true, data: saved });
  } catch (error) {
    console.error('❌ Error saving Answers page config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// --- Guides Page ---
export const getGuidesPage = async (_req: Request, res: Response) => {
  try {
    const data = await getAppSetting(CMS_GUIDES_SCOPE, defaultGuidesPage);
    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ Error getting Guides page config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const saveGuidesPage = async (req: Request, res: Response) => {
  try {
    const payload = req.body?.data ?? req.body ?? {};
    const merged = { ...defaultGuidesPage, ...payload, updated_at: new Date().toISOString() };
    const saved = await saveAppSetting(CMS_GUIDES_SCOPE, merged);
    emitCmsEvent(req, 'cms:guides_updated', saved);
    res.json({ success: true, data: saved });
  } catch (error) {
    console.error('❌ Error saving Guides page config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// --- Hire Page ---
export const getHirePage = async (_req: Request, res: Response) => {
  try {
    const data = await getAppSetting(CMS_HIRE_SCOPE, defaultHirePage);
    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ Error getting Hire page config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const saveHirePage = async (req: Request, res: Response) => {
  try {
    const payload = req.body?.data ?? req.body ?? {};
    const merged = { ...defaultHirePage, ...payload, updated_at: new Date().toISOString() };
    const saved = await saveAppSetting(CMS_HIRE_SCOPE, merged);
    emitCmsEvent(req, 'cms:hire_updated', saved);
    res.json({ success: true, data: saved });
  } catch (error) {
    console.error('❌ Error saving Hire page config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

// --- Freelancer Page ---
export const getFreelancerPage = async (_req: Request, res: Response) => {
  try {
    const data = await getAppSetting(CMS_FREELANCER_SCOPE, defaultFreelancerPage);
    res.json({ success: true, data });
  } catch (error) {
    console.error('❌ Error getting Freelancer page config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const saveFreelancerPage = async (req: Request, res: Response) => {
  try {
    const payload = req.body?.data ?? req.body ?? {};
    const merged = { ...defaultFreelancerPage, ...payload, updated_at: new Date().toISOString() };
    const saved = await saveAppSetting(CMS_FREELANCER_SCOPE, merged);
    emitCmsEvent(req, 'cms:freelancer_updated', saved);
    res.json({ success: true, data: saved });
  } catch (error) {
    console.error('❌ Error saving Freelancer page config:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

export const getPlatformSettingsPublic = async (_req: Request, res: Response) => {
  const data = getPublicPlatformSettings();
  res.json({ success: true, data });
};

// Default export for compatibility
export default {
  // GET Functions
  getHeaderConfig,
  getFooterConfig,
  getActivityConfig,
  getHomepageSections,
  getHomeSlides,
  getTrendingOpportunities,
  getHeroSearchConfig,
  getHomepageAnalytics,
  getTrendingConfig,
  getAffiliateContent,
  getPages,
  getPageBySlug,
  getPageCategories,
  getBlogPosts,
  getBlogPostBySlug,
  getBlogPostsAdmin,
  getBlogPostByIdAdmin,
  getBlogCategories,
  getBlogSettings,
  getAuthPagesConfig,
  getAnswersPage,
  getGuidesPage,
  getHirePage,
  getFreelancerPage,

  // POST/PUT/DELETE Functions
  saveHeaderConfig,
  saveFooterConfig,
  saveActivityConfig,
  saveHeroSearchConfig,
  saveTrendingConfig,
  saveHomepageSection,
  addHomepageSection,
  updateSectionOrder,
  deleteHomepageSection,
  saveHomeSlide,
  updateHomeSlideOrder,
  deleteHomeSlide,
  saveAffiliateContent,
  savePage,
  deletePage,
  savePageCategory,
  deletePageCategory,
  saveBlogPost,
  deleteBlogPost,
  saveBlogCategory,
  deleteBlogCategory,
  saveBlogSettings,
  saveAuthPagesConfig,
  saveAnswersPage,
  saveGuidesPage,
  saveHirePage,
  saveFreelancerPage
};







