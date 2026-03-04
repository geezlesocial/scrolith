import express from 'express';
import prisma from '../utils/prismaClient';

const router = express.Router();

const isObjectLike = (value: any): value is Record<string, any> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const deepMerge = <T extends Record<string, any>>(base: T, patch: any): T => {
  if (!isObjectLike(patch)) return base;
  const out: any = { ...base };
  Object.keys(patch).forEach((key) => {
    const next = patch[key];
    const prev = out[key];
    if (isObjectLike(prev) && isObjectLike(next)) {
      out[key] = deepMerge(prev, next);
    } else if (next !== undefined) {
      out[key] = next;
    }
  });
  return out as T;
};

const DEFAULT_MOBILE_HOME_LAYOUT = {
  header: {
    messagesEnabled: true,
    quickMenuEnabled: true
  },
  accountMenu: {
    dashboard: true,
    viewAs: true,
    switchCurrency: true,
    postProject: true,
    yourBriefs: true,
    referFriend: true,
    billingPayments: true,
    settings: true,
    logout: true
  },
  messagesPopup: {
    enabled: true,
    previewLimit: 6
  },
  quickMenu: {
    createPost: true,
    switchUser: true,
    browseJobs: true,
    browseGigs: true,
    projectBrief: true,
    gigCreation: true,
    settings: true
  },
  bottomTabs: {
    home: true,
    network: true,
    post: true,
    notifications: true,
    jobs: true,
    messages: false
  },
  feed: {
    showPromoted: true,
    promotedFrequency: 6,
    showSuggestedPeople: true,
    showSuggestedPages: true,
    showTrendingTags: true,
    showRecommendedGigsJobs: true
  },
  stories: {
    enabled: true,
    maxItems: 12
  },
  postComposer: {
    visibilityEnabled: true,
    allowedVisibilities: ['public', 'network', 'friends', 'private'],
    defaultVisibility: 'public',
    graphicWarningEnabled: true,
    graphicWarningLabel: 'Graphic warning',
    graphicWarningBlurMedia: true,
    topics: [],
    locations: []
  },
  postCard: {
    reactionsEnabled: true,
    commentsEnabled: true,
    repostsEnabled: true,
    sendEnabled: true,
    linkPreviewEnabled: true,
    mediaPreviewEnabled: true,
    mentionsEnabled: true,
    hashtagsEnabled: true
  },
  search: {
    enabled: true,
    categories: ['posts', 'people', 'pages', 'jobs', 'gigs']
  }
};

const DEFAULT_GUEST_HOMEPAGE_SECTIONS = [
  {
    id: 'guest-hero-auth',
    type: 'guest_hero_auth',
    name: 'Guest Hero + Auth',
    isActive: true,
    position: 1,
    content: {
      headline: 'The All-in-One Platform for Work, Talent, and Community',
      subheadline:
        'Scrolith combines professional networking, freelance marketplace, messaging, payments, and AI workflows.',
      description:
        'Join millions building careers, growing businesses, and collaborating in real time.',
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
      signupCtaLabel: 'Sign up'
    }
  },
  {
    id: 'guest-what-is-scrolith',
    type: 'guest_what_is_scrolith',
    name: 'What is Scrolith',
    isActive: true,
    position: 2,
    content: {
      title: 'What is Scrolith?',
      subtitle: 'A complete ecosystem for professionals and businesses.',
      cards: [
        { id: 'social', title: 'Social Network', description: 'Build your network, publish updates, and grow visibility.' },
        { id: 'marketplace', title: 'Freelance Marketplace', description: 'Offer services or hire verified professionals.' },
        { id: 'messaging', title: 'Messaging', description: 'Real-time chat, voice notes, and collaborative communication.' },
        { id: 'payments', title: 'Wallet & Payments', description: 'Secure transactions and enterprise-grade payment flow.' },
        { id: 'ai', title: 'AI Assistant', description: 'Automate content, insights, and productivity workflows.' },
        { id: 'pages', title: 'Business Pages', description: 'Grow your brand with dedicated page presence and community.' }
      ]
    }
  },
  {
    id: 'guest-paths',
    type: 'guest_paths',
    name: 'Freelancer vs Employer',
    isActive: true,
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
    }
  },
  {
    id: 'guest-feature-showcase',
    type: 'guest_feature_showcase',
    name: 'Feature Showcase',
    isActive: true,
    position: 4,
    content: {
      title: 'Explore Scrolith features',
      subtitle: 'Everything needed to work, hire, and scale in one platform.',
      tabs: [
        { id: 'marketplace', label: 'Marketplace', title: 'Professional services marketplace', description: 'Discover and deliver high-value services globally.' },
        { id: 'community', label: 'Community', title: 'High-engagement community feed', description: 'Share updates, stories, and scroll content in real time.' },
        { id: 'messaging', label: 'Messaging', title: 'Instant communication tools', description: 'Reliable chat infrastructure for teams and clients.' },
        { id: 'ai', label: 'AI Assistant', title: 'Productivity with AI', description: 'Generate ideas, optimize content, and automate repetitive tasks.' },
        { id: 'payments', label: 'Payments', title: 'Secure wallet and payout stack', description: 'Enterprise-grade checkout, payouts, and fund management.' },
        { id: 'trust', label: 'Trust & Verification', title: 'Verified quality at scale', description: 'KYC, moderation, and safety-first controls for confidence.' }
      ]
    }
  },
  {
    id: 'guest-trending-preview',
    type: 'guest_trending_preview',
    name: 'Trending Preview',
    isActive: true,
    position: 5,
    content: {
      title: 'Trending on Scrolith',
      subtitle: 'Preview opportunities and content before joining.',
      jobsTitle: 'Trending Jobs',
      gigsTitle: 'Trending Gigs',
      postsTitle: 'Popular Posts',
      jobs: [],
      gigs: [],
      posts: []
    }
  },
  {
    id: 'guest-community-preview',
    type: 'guest_community_preview',
    name: 'Community Preview',
    isActive: true,
    position: 6,
    content: {
      title: 'Community preview',
      subtitle: 'See what professionals are talking about right now.',
      ctaLabel: 'Sign up to interact',
      ctaUrl: '/auth/signup',
      posts: []
    }
  },
  {
    id: 'guest-final-cta',
    type: 'guest_final_cta',
    name: 'Final CTA',
    isActive: true,
    position: 7,
    content: {
      title: 'Join Scrolith today',
      subtitle: 'Create your professional profile and unlock marketplace + community access.',
      primaryCtaLabel: 'Sign up',
      primaryCtaUrl: '/auth/signup',
      secondaryCtaLabel: 'Login',
      secondaryCtaUrl: '/auth/login'
    }
  }
];

const DEFAULT_GUEST_SEO = {
  title: 'Scrolith | Professional Network, Marketplace, and Messaging',
  metaDescription:
    'Scrolith is an enterprise-grade platform for professionals and businesses to connect, hire, collaborate, and grow.',
  keywords: [
    'Scrolith',
    'freelance marketplace',
    'professional network',
    'jobs',
    'gigs',
    'messaging',
    'AI assistant'
  ],
  ogImage: ''
};

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

const normalizeGuestSection = (section: any, fallbackPosition: number) => {
  const raw = isObjectLike(section) ? section : {};
  const fallback = DEFAULT_GUEST_HOMEPAGE_SECTIONS[fallbackPosition] || DEFAULT_GUEST_HOMEPAGE_SECTIONS[0];
  const positionValue = Number(raw.position ?? raw.sortOrder ?? fallbackPosition + 1);
  return {
    id: String(raw.id || fallback.id || `guest-section-${fallbackPosition + 1}`),
    type: String(raw.type || fallback.type || 'guest_hero_auth'),
    name: String(raw.name || fallback.name || 'Guest Section'),
    isActive: raw.isActive !== undefined ? Boolean(raw.isActive) : true,
    position: Number.isFinite(positionValue) ? positionValue : fallbackPosition + 1,
    content: isObjectLike(raw.content) ? raw.content : {}
  };
};

const normalizeGuestSeo = (seo: any) => {
  const source = isObjectLike(seo) ? seo : {};
  const keywordsRaw = source.keywords;
  const keywords = Array.isArray(keywordsRaw)
    ? keywordsRaw.map((entry: any) => String(entry || '').trim()).filter(Boolean)
    : String(keywordsRaw || '')
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
  return {
    title: String(source.title || DEFAULT_GUEST_SEO.title),
    metaDescription: String(source.metaDescription || source.description || DEFAULT_GUEST_SEO.metaDescription),
    keywords: keywords.length ? keywords : clone(DEFAULT_GUEST_SEO.keywords),
    ogImage: String(source.ogImage || source.og_image || '')
  };
};

const normalizeGuestHomepagePayload = (raw: any) => {
  const source = isObjectLike(raw) ? raw : {};
  const draftSource = isObjectLike(source.draft) ? source.draft : {};
  const publishedSource = isObjectLike(source.published) ? source.published : {};
  const draftSectionsRaw =
    Array.isArray(draftSource.sections) && draftSource.sections.length > 0
      ? draftSource.sections
      : clone(DEFAULT_GUEST_HOMEPAGE_SECTIONS);
  const publishedSectionsRaw =
    Array.isArray(publishedSource.sections) && publishedSource.sections.length > 0
      ? publishedSource.sections
      : draftSectionsRaw;

  const draftSections = draftSectionsRaw
    .map((section: any, index: number) => normalizeGuestSection(section, index))
    .sort((a: any, b: any) => a.position - b.position);
  const publishedSections = publishedSectionsRaw
    .map((section: any, index: number) => normalizeGuestSection(section, index))
    .sort((a: any, b: any) => a.position - b.position);

  return {
    draft: {
      sections: draftSections,
      seo: normalizeGuestSeo(draftSource.seo),
      updatedAt: String(draftSource.updatedAt || source.updatedAt || new Date().toISOString())
    },
    published: {
      sections: publishedSections,
      seo: normalizeGuestSeo(publishedSource.seo || draftSource.seo),
      publishedAt: String(publishedSource.publishedAt || source.updatedAt || new Date().toISOString())
    },
    updatedAt: String(source.updatedAt || new Date().toISOString())
  };
};

const getGuestHomepageState = async () => {
  try {
    const config = await prisma.cMSConfig.findFirst({
      where: { target: 'HOMEPAGE' as any },
      orderBy: { version: 'desc' }
    });
    const data = isObjectLike(config?.data) ? (config!.data as Record<string, any>) : {};
    const guestRaw = data.guestHomepage || data.guest_homepage || {};
    return normalizeGuestHomepagePayload(guestRaw);
  } catch (error) {
    console.warn('[homepage] Failed to load guest homepage config from DB; using defaults', error);
    return normalizeGuestHomepagePayload({});
  }
};

const listTrendingJobs = async () => {
  try {
    const jobs = await prisma.job.findMany({
      where: {
        isActive: true,
        isVisible: true,
        status: 'ACTIVE' as any
      },
      orderBy: [{ isFeatured: 'desc' }, { postedTime: 'desc' }],
      take: 6,
      select: {
        id: true,
        title: true,
        type: true,
        budget: true,
        postedTime: true
      }
    });
    return jobs.map((job: any) => ({
      id: job.id,
      title: job.title,
      type: String(job.type || ''),
      budget: job.budget || '',
      postedTime: job.postedTime
    }));
  } catch (error) {
    console.warn('[homepage] Failed to load trending jobs', error);
    return [];
  }
};

const listTrendingGigs = async () => {
  try {
    const gigs = await prisma.gig.findMany({
      where: {
        isActive: true,
        status: 'ACTIVE' as any
      },
      orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
      take: 6,
      select: {
        id: true,
        title: true,
        slug: true,
        price: true,
        rating: true,
        reviewCount: true,
        image: true
      }
    });
    return gigs.map((gig: any) => ({
      id: gig.id,
      title: gig.title,
      slug: gig.slug,
      price: gig.price,
      rating: gig.rating || 0,
      reviewCount: gig.reviewCount || 0,
      image: gig.image || ''
    }));
  } catch (error) {
    console.warn('[homepage] Failed to load trending gigs', error);
    return [];
  }
};

const listPopularPosts = async () => {
  try {
    const posts = await prisma.communityPost.findMany({
      where: {
        status: 'active',
        visibility: 'public'
      },
      orderBy: [{ likesCount: 'desc' }, { createdAt: 'desc' }],
      take: 6,
      include: {
        author: {
          select: {
            id: true,
            name: true,
            username: true,
            avatar: true
          }
        }
      }
    });
    return posts.map((post: any) => ({
      id: post.id,
      title: post.title || '',
      content: post.content || '',
      likesCount: Number(post.likesCount || 0),
      commentsCount: Number(post.commentsCount || 0),
      createdAt: post.createdAt,
      author: {
        id: post.author?.id || '',
        name: post.author?.name || post.author?.username || 'Scrolith user',
        username: post.author?.username || '',
        avatar: post.author?.avatar || ''
      }
    }));
  } catch (error) {
    console.warn('[homepage] Failed to load popular posts', error);
    return [];
  }
};

router.get('/guest', async (_req, res) => {
  try {
    const state = await getGuestHomepageState();
    const [jobs, gigs, posts] = await Promise.all([
      listTrendingJobs(),
      listTrendingGigs(),
      listPopularPosts()
    ]);

    const hydratedSections = state.published.sections.map((section: any) => {
      if (section.type === 'guest_trending_preview') {
        return {
          ...section,
          content: {
            ...(isObjectLike(section.content) ? section.content : {}),
            jobs,
            gigs,
            posts
          }
        };
      }
      if (section.type === 'guest_community_preview') {
        return {
          ...section,
          content: {
            ...(isObjectLike(section.content) ? section.content : {}),
            posts
          }
        };
      }
      return section;
    });

    return res.json({
      success: true,
      data: {
        sections: hydratedSections,
        seo: state.published.seo,
        updatedAt: state.updatedAt
      }
    });
  } catch (error: any) {
    console.error('[homepage] Failed to load guest homepage', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load guest homepage' });
  }
});

// Public mobile settings endpoint:
// GET /api/homepage/mobile-settings
router.get('/mobile-settings', async (_req, res) => {
  try {
    const record = await prisma.appSetting.findUnique({ where: { scope: 'platform' } });
    const platform = isObjectLike(record?.data) ? (record!.data as Record<string, any>) : {};
    const raw = platform.mobileHomeLayout || platform.mobile_home_layout || {};
    const merged = deepMerge(DEFAULT_MOBILE_HOME_LAYOUT, raw);
    return res.json({ success: true, data: merged });
  } catch (error: any) {
    console.warn('[homepage] Failed to load mobile settings; falling back to defaults', error);
    return res.json({ success: true, data: DEFAULT_MOBILE_HOME_LAYOUT });
  }
});

export default router;
