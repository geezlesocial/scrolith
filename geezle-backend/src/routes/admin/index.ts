import express, { Request } from 'express';
import fs from 'fs';
import path from 'path';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminMiddleware } from '../../middleware/admin.middleware';
import gigsJobsRoutes from './gigs-jobs.routes';
import analyticsRoutes from './analytics.routes';
import marketIntelligenceRoutes from './market-intelligence.routes';
import usersRoutes from './users.routes';
import marketingRoutes from './marketing.routes';
import filesRoutes from '../files.routes';
import { getAllWalletsAdmin } from '../../controllers/wallet.controller';
import favoritesAdminRoutes from './favorites.routes';
import kycAdminRoutes from './kyc.routes';
import reviewsAdminRoutes from './reviews.routes';
import cmsRoutes from '../cms';
import fraudRoutes from './fraud.routes';
import adminCommunityRoutes from './community/routes';
import staffRoutes from './staff.routes';
import rbacRoutes from './rbac.routes';
import policiesRoutes from './policies.routes';
import featureControlRoutes from './feature-control.routes';
import moderationPoliciesRoutes from './moderation-policies.routes';
import trustRoutes from './trust.routes';
import configRoutes from './config.routes';
import cartsAdminRoutes from './carts.routes';
import formsAdminRoutes from './forms.routes';
import withdrawalsAdminRoutes from './withdrawals.routes';
import monetizationAdminRoutes from './monetization.routes';
import payoutsStripeAdminRoutes from './payouts.stripe.routes';
import recoAdminRoutes from './reco.routes';
import scrolithaAdminRoutes from './scrolitha.routes';
import appsAdminRoutes from './apps.routes';
import i18nAdminRoutes from './i18n.routes';
import insightsAdminRoutes from './insights.routes';
import devAdminRoutes from './dev.routes';
import systemBackupRoutes from './system-backups.routes';
import messengerVoiceAdminRoutes from './messenger.voice.routes';
import scrollAdminRoutes from './scroll.routes';
import liveAdminRoutes from './live.routes';
import { clearPlatformRuntimeCache } from '../../controllers/admin.cache.controller';
import { getScrolithaAnalyticsForAdmin } from '../../services/scrolitha/scrolitha.orchestrator';

const router = express.Router();

import { getSystemSettings, updateSystemSettings, testEmailSettings } from '../../controllers/admin.systemSettings.controller';
import prisma from '../../utils/prismaClient';
import bcrypt from 'bcryptjs';

// Simple file-backed persistence for platform/system settings in development
// Persist to repository-level `Scrolith-backend/data` so it's easy to find and permissions are typical.
const SETTINGS_DIR = path.resolve(__dirname, '../../../data');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'platform-system-settings.json');
const BRAND_ASSET_URL = 'https://scrolith.com/icon-192.png';

const ensureSettingsDir = () => {
  try {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
  } catch (e) {
    // ignore
  }
};

const readPersistedSettings = () => {
  try {
    if (!fs.existsSync(SETTINGS_FILE)) return null;
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    console.log('[admin] Loaded persisted settings from', SETTINGS_FILE);
    return parsed;
  } catch (e) {
    console.warn('Failed to read persisted settings:', e);
    return null;
  }
};

const writePersistedSettings = (payload: any) => {
  try {
    ensureSettingsDir();
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(payload, null, 2), 'utf-8');
    console.log('[admin] Persisted settings to', SETTINGS_FILE);
    return true;
  } catch (e) {
    console.error('Failed to write persisted settings:', e);
    return false;
  }
};

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
    graphicWarningBlurMedia: true
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

const getHomepageConfigRecord = async () =>
  prisma.cMSConfig.findFirst({
    where: { target: 'HOMEPAGE' as any },
    orderBy: { version: 'desc' }
  });

const getGuestHomepageState = async () => {
  const config = await getHomepageConfigRecord();
  const data = isObjectLike(config?.data) ? (config!.data as Record<string, any>) : {};
  return normalizeGuestHomepagePayload(data.guestHomepage || data.guest_homepage || {});
};

const saveGuestHomepageState = async (nextState: any, userId?: string) => {
  const existing = await getHomepageConfigRecord();
  const existingData = isObjectLike(existing?.data) ? (existing!.data as Record<string, any>) : {};
  const mergedGuest = normalizeGuestHomepagePayload(nextState);
  const nextData = {
    ...existingData,
    guestHomepage: mergedGuest
  };

  await prisma.cMSConfig.create({
    data: {
      target: 'HOMEPAGE' as any,
      version: (existing?.version || 0) + 1,
      data: nextData as any,
      updatedById: userId || null
    }
  });

  return mergedGuest;
};

const emitGuestHomepageUpdated = (req: Request, payload: any) => {
  const io = req.app.get('io');
  const communityIo = req.app.get('communityIo');
  io?.emit('homepage:guest_updated', payload);
  communityIo?.emit('homepage:guest_updated', payload);
};

// Apply auth and admin middleware to all admin routes
router.use(authMiddleware);
router.use(adminMiddleware);

// Mount GigsJobs routes
router.use('/gigs-jobs', gigsJobsRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/market-intelligence', marketIntelligenceRoutes);
router.use('/users', usersRoutes);
router.use('/marketing', marketingRoutes);
router.use('/files', filesRoutes);
router.use('/favorites', favoritesAdminRoutes);
router.use('/kyc', kycAdminRoutes);
router.use('/reviews', reviewsAdminRoutes);
router.get('/wallets', getAllWalletsAdmin);
router.use('/cms', cmsRoutes);
router.use('/fraud', fraudRoutes);
router.use('/staff', staffRoutes);
router.use('/rbac', rbacRoutes);
router.use('/policies', policiesRoutes);
router.use('/feature-control', featureControlRoutes);
router.use('/moderation-policies', moderationPoliciesRoutes);
router.use('/trust', trustRoutes);
router.use('/config', configRoutes);
router.use('/carts', cartsAdminRoutes);
router.use('/forms', formsAdminRoutes);
router.use('/withdrawals', withdrawalsAdminRoutes);
router.use('/monetization', monetizationAdminRoutes);
router.use('/payouts/stripe', payoutsStripeAdminRoutes);
router.use('/reco', recoAdminRoutes);
router.use('/scrolitha', scrolithaAdminRoutes);
router.use('/apps', appsAdminRoutes);
router.use('/i18n', i18nAdminRoutes);
router.use('/insights', insightsAdminRoutes);
router.use('/dev', devAdminRoutes);
router.use('/system-backups', systemBackupRoutes);
router.use('/messenger/voice', messengerVoiceAdminRoutes);
router.use('/scroll', scrollAdminRoutes);
router.use('/live', liveAdminRoutes);
// Mount admin community routes (Gcoin + Ads admin panels)
router.use('/community', adminCommunityRoutes);

// Legacy compatibility route used by existing admin bundles.
// Keeps /api/admin/ai/analytics alive while the platform transitions to /admin/scrolitha/analytics.
router.get('/ai/analytics', async (_req, res) => {
  try {
    const analytics = await getScrolithaAnalyticsForAdmin();
    const totals: any = analytics?.totals || {};
    return res.json({
      success: true,
      data: {
        total_conversations: Number(totals.conversations || 0),
        cost_estimate: Number(totals.estimatedCost || 0),
        avg_response_time: Number(totals.avgDurationSeconds || 0) * 1000,
        safety_stats: {
          spam_triggers: Number(totals.failedActions || 0)
        },
        top_roles: Array.isArray(analytics?.topTools)
          ? analytics.topTools.map((entry: any) => ({
              role: entry?.toolKey || 'unknown',
              count: Number(entry?.count || 0)
            }))
          : [],
        conversion_impact: {
          ai_gigs_created: Number(totals.completedActions || 0),
          ai_hire_rate:
            typeof totals.failureRate === 'number'
              ? Math.max(0, Math.round(100 - Number(totals.failureRate) * 100))
              : 0,
          revenue_uplift: Number(totals.estimatedMinutesSaved || 0)
        },
        scrolitha: analytics
      },
      message: 'AI analytics loaded'
    });
  } catch (error: any) {
    console.error('[admin] failed to load legacy AI analytics:', error);
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to load AI analytics'
    });
  }
});

// ============ PLATFORM SETTINGS ============
router.get('/platform/settings', async (req, res) => {
  const defaults = {
    siteName: 'Scrolith Marketplace',
    tagline: 'AI-Powered Social Freelance Marketplace with Secure Escrow & Monetization',
    logoUrl: BRAND_ASSET_URL,
    faviconUrl: BRAND_ASSET_URL,
    adminEmail: 'admin@Scrolith.com',
    supportEmail: 'support@Scrolith.com',
    reactions: {
      enabled: true,
      postsEnabled: true,
      commentsEnabled: true,
      messagesEnabled: true,
      showReactors: true,
      rateLimitPerMinute: 40,
      allowed: [
        { key: 'like', label: 'Like', emoji: '👍', enabled: true },
        { key: 'love', label: 'Love', emoji: '❤️', enabled: true },
        { key: 'good', label: 'Good', emoji: '✅', enabled: true },
        { key: 'happy', label: 'Happy', emoji: '😄', enabled: true },
        { key: 'handwave', label: 'Handwave', emoji: '👋', enabled: true },
        { key: 'angry', label: 'Angry', emoji: '😡', enabled: true },
        { key: 'cry', label: 'Cry', emoji: '😢', enabled: true },
        { key: 'mad', label: 'Mad', emoji: '🤬', enabled: true },
        { key: 'sorry', label: 'Sorry', emoji: '🙏', enabled: true }
      ]
    },
    memberHome: {
      widgets: {
        trendingEnabled: true,
        storiesEnabled: true,
        suggestionsEnabled: true,
        pagesRecommendationsEnabled: true,
        categoriesFilterEnabled: true,
        postComposerEnabled: true,
        recentMessagesEnabled: true,
        profileViewersEnabled: true,
        rightSidebarAdsEnabled: false
      },
      feed: {
        defaultTab: 'latest',
        defaultSort: 'latest',
        defaultScope: 'discover',
        enableTrendingTab: true,
        postDensity: 'comfortable',
        showReactionCounts: true,
        showCommentsPreviewCount: true
      },
      ads: {
        enabled: false,
        rightSidebarTopEnabled: true,
        rightSidebarMiddleEnabled: true,
        inlineFrequency: 6
      }
    },
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
    },
    notifications: {
      enableMentionNotifications: true,
      enableFollowedPostNotifications: true,
      enableFollowNotifications: true,
      enableCommentNotifications: true,
      enableReactionNotifications: true,
      enableRepostNotifications: true,
      enableJobApplicationNotifications: true,
      enableProposalOpenedNotifications: true,
      enableProposalReplyNotifications: true,
      enableTopApplicantNotifications: true,
      enableInterviewScheduledNotifications: true,
      enableJobLifecycleEmails: true
    },
    profileDemographics: {
      enabled: true,
      genderFieldEnabled: true,
      dateOfBirthEnabled: true,
      showBirthMonthDayPublicDefault: true,
      genderOptions: [
        { key: 'male', label: 'Male', active: true },
        { key: 'female', label: 'Female', active: true }
      ]
    },
    messagingControls: {
      enableMoveToOther: true,
      enableLabelAsJobs: true,
      enableMarkUnread: true,
      enableStar: true,
      enableMute: true,
      enableArchive: true,
      enableReportBlock: true,
      enableDeleteConversation: true,
      enableManageMessageSettings: true
    }
  };

  let platform: Record<string, any> | null = null;
  try {
    const record = await prisma.appSetting.findUnique({ where: { scope: 'platform' } });
    if (isObjectLike(record?.data)) {
      platform = record.data as Record<string, any>;
    }
  } catch (error) {
    console.warn('[admin] Failed to read platform settings from DB, falling back to file', error);
  }

  const persisted = readPersistedSettings();
  if (!platform && isObjectLike(persisted?.platform)) {
    platform = persisted.platform as Record<string, any>;
    // Best-effort backfill so settings survive container restarts.
    try {
      await prisma.appSetting.upsert({
        where: { scope: 'platform' },
        create: { scope: 'platform', data: platform },
        update: { data: platform }
      });
      console.log('[admin] Backfilled platform settings from file to DB');
    } catch (error) {
      console.warn('[admin] Failed to backfill platform settings from file to DB', error);
    }
  }

  if (platform) {
    return res.json({
      success: true,
      data: {
        ...defaults,
        ...platform,
        reactions: {
          ...defaults.reactions,
          ...(platform.reactions || {})
        },
        memberHome: {
          ...defaults.memberHome,
          ...(platform.memberHome || {}),
          widgets: {
            ...defaults.memberHome.widgets,
            ...(platform.memberHome?.widgets || {})
          },
          feed: {
            ...defaults.memberHome.feed,
            ...(platform.memberHome?.feed || {})
          },
          ads: {
            ...defaults.memberHome.ads,
            ...(platform.memberHome?.ads || {})
          }
        },
        gigExperience: {
          ...defaults.gigExperience,
          ...(platform.gigExperience || {}),
          quickPrompts: Array.isArray(platform.gigExperience?.quickPrompts) && platform.gigExperience.quickPrompts.length
            ? platform.gigExperience.quickPrompts
            : defaults.gigExperience.quickPrompts
        },
        notifications: {
          ...defaults.notifications,
          ...(platform.notifications || {})
        },
        profileDemographics: {
          ...defaults.profileDemographics,
          ...(platform.profileDemographics || {}),
          genderOptions: Array.isArray(platform.profileDemographics?.genderOptions) && platform.profileDemographics.genderOptions.length
            ? platform.profileDemographics.genderOptions
            : defaults.profileDemographics.genderOptions
        },
        messagingControls: {
          ...defaults.messagingControls,
          ...(platform.messagingControls || {})
        }
      }
    });
  }
  return res.json({ success: true, data: defaults });
});

// ============ MOBILE HOME SETTINGS (ADMIN) ============
// GET /api/admin/homepage/mobile-settings
router.get('/homepage/mobile-settings', async (_req, res) => {
  try {
    let platform: Record<string, any> | null = null;
    try {
      const record = await prisma.appSetting.findUnique({ where: { scope: 'platform' } });
      if (isObjectLike(record?.data)) {
        platform = record.data as Record<string, any>;
      }
    } catch (error) {
      console.warn('[admin] Failed to read platform settings from DB for mobile homepage', error);
    }

    const persisted = readPersistedSettings();
    if (!platform && isObjectLike(persisted?.platform)) {
      platform = persisted.platform as Record<string, any>;
    }

    const raw = (platform as any)?.mobileHomeLayout || (platform as any)?.mobile_home_layout || {};
    const merged = deepMerge(DEFAULT_MOBILE_HOME_LAYOUT, raw);
    return res.json({ success: true, data: merged });
  } catch (error: any) {
    console.error('[admin] Failed to load mobile homepage settings', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load mobile homepage settings' });
  }
});

// PUT /api/admin/homepage/mobile-settings
router.put('/homepage/mobile-settings', async (req, res) => {
  try {
    const io = req.app.get('io');

    let platform: Record<string, any> = {};
    try {
      const record = await prisma.appSetting.findUnique({ where: { scope: 'platform' } });
      if (isObjectLike(record?.data)) {
        platform = record.data as Record<string, any>;
      }
    } catch (error) {
      console.warn('[admin] Failed to read platform settings from DB for mobile homepage update', error);
    }

    const persisted = readPersistedSettings();
    if (!Object.keys(platform).length && isObjectLike(persisted?.platform)) {
      platform = persisted.platform as Record<string, any>;
    }

    const patch =
      (isObjectLike((req.body as any)?.mobileHomeLayout) ? (req.body as any).mobileHomeLayout : null) ||
      (isObjectLike(req.body) ? req.body : {});

    const existingLayout = (platform as any)?.mobileHomeLayout || (platform as any)?.mobile_home_layout || {};
    const nextLayout = deepMerge(deepMerge(DEFAULT_MOBILE_HOME_LAYOUT, existingLayout), patch);
    const nextPlatform = {
      ...(platform || {}),
      mobileHomeLayout: nextLayout
    };

    io?.emit('settings:updated', { scope: 'platform', settings: nextPlatform });

    try {
      await prisma.appSetting.upsert({
        where: { scope: 'platform' },
        create: { scope: 'platform', data: nextPlatform },
        update: { data: nextPlatform }
      });
    } catch (error) {
      console.error('[admin] Failed to persist platform settings (mobile homepage) to DB', error);
    }

    try {
      const nextPersisted = readPersistedSettings() || {};
      nextPersisted.platform = nextPlatform;
      writePersistedSettings(nextPersisted);
    } catch (error) {
      console.error('[admin] Failed to persist platform settings (mobile homepage) to file', error);
    }

    return res.json({ success: true, data: nextLayout, message: 'Mobile homepage settings saved' });
  } catch (error: any) {
    console.error('[admin] Failed to save mobile homepage settings', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to save mobile homepage settings' });
  }
});

// ============ GUEST HOMEPAGE BUILDER (ADMIN) ============
// GET /api/admin/homepage/draft
router.get('/homepage/draft', async (_req, res) => {
  try {
    const state = await getGuestHomepageState();
    return res.json({
      success: true,
      data: {
        draft: state.draft,
        published: state.published,
        updatedAt: state.updatedAt
      }
    });
  } catch (error: any) {
    console.error('[admin] Failed to load guest homepage draft', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load guest homepage draft' });
  }
});

// PUT /api/admin/homepage/section
router.put('/homepage/section', async (req, res) => {
  try {
    const userId = req.user?.id;
    const body = isObjectLike(req.body) ? req.body : {};
    const state = await getGuestHomepageState();
    const draft = clone(state.draft);
    const remove = Boolean(body.remove || body.delete);
    const sectionInput = isObjectLike(body.section) ? body.section : body;
    const sectionId = String(body.sectionId || sectionInput.id || '').trim();

    if (!sectionId) {
      return res.status(400).json({ success: false, error: 'sectionId is required' });
    }

    const currentSections = Array.isArray(draft.sections) ? [...draft.sections] : [];
    const existingIndex = currentSections.findIndex((section: any) => String(section.id) === sectionId);

    if (remove) {
      if (existingIndex >= 0) {
        currentSections.splice(existingIndex, 1);
      }
    } else {
      const normalizedSection = normalizeGuestSection(
        {
          ...(existingIndex >= 0 ? currentSections[existingIndex] : {}),
          ...sectionInput,
          id: sectionId
        },
        existingIndex >= 0 ? existingIndex : currentSections.length
      );

      if (existingIndex >= 0) {
        currentSections[existingIndex] = normalizedSection;
      } else {
        currentSections.push(normalizedSection);
      }
    }

    draft.sections = currentSections
      .map((section: any, index: number) => normalizeGuestSection(section, index))
      .sort((a: any, b: any) => a.position - b.position);

    if (isObjectLike(body.seo)) {
      draft.seo = normalizeGuestSeo({ ...(draft.seo || {}), ...body.seo });
    }

    draft.updatedAt = new Date().toISOString();
    const nextState = {
      ...state,
      draft,
      updatedAt: new Date().toISOString()
    };
    const saved = await saveGuestHomepageState(nextState, userId);

    emitGuestHomepageUpdated(req as Request, {
      mode: 'draft',
      updatedAt: saved.updatedAt,
      sections: saved.draft.sections
    });

    return res.json({ success: true, data: saved });
  } catch (error: any) {
    console.error('[admin] Failed to save guest homepage section', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to save guest homepage section' });
  }
});

// POST /api/admin/homepage/reorder
router.post('/homepage/reorder', async (req, res) => {
  try {
    const userId = req.user?.id;
    const body = isObjectLike(req.body) ? req.body : {};
    const order = Array.isArray(body.order) ? body.order.map((id: any) => String(id)) : [];
    const sectionsInput = Array.isArray(body.sections) ? body.sections : [];

    const state = await getGuestHomepageState();
    const draft = clone(state.draft);
    const currentSections = Array.isArray(draft.sections) ? [...draft.sections] : [];
    let nextSections = currentSections;

    if (sectionsInput.length > 0) {
      nextSections = sectionsInput.map((section: any, index: number) =>
        normalizeGuestSection({ ...section, position: index + 1 }, index)
      );
    } else if (order.length > 0) {
      const rank = new Map<string, number>();
      order.forEach((id: string, index: number) => rank.set(id, index));
      nextSections = [...currentSections]
        .sort((a: any, b: any) => {
          const ai = rank.has(String(a.id)) ? Number(rank.get(String(a.id))) : Number.MAX_SAFE_INTEGER;
          const bi = rank.has(String(b.id)) ? Number(rank.get(String(b.id))) : Number.MAX_SAFE_INTEGER;
          if (ai !== bi) return ai - bi;
          return Number(a.position || 0) - Number(b.position || 0);
        })
        .map((section: any, index: number) => normalizeGuestSection({ ...section, position: index + 1 }, index));
    }

    draft.sections = nextSections;
    draft.updatedAt = new Date().toISOString();

    if (isObjectLike(body.seo)) {
      draft.seo = normalizeGuestSeo({ ...(draft.seo || {}), ...body.seo });
    }

    const nextState = {
      ...state,
      draft,
      updatedAt: new Date().toISOString()
    };
    const saved = await saveGuestHomepageState(nextState, userId);

    emitGuestHomepageUpdated(req as Request, {
      mode: 'draft',
      updatedAt: saved.updatedAt,
      sections: saved.draft.sections
    });

    return res.json({ success: true, data: saved });
  } catch (error: any) {
    console.error('[admin] Failed to reorder guest homepage sections', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to reorder guest homepage sections' });
  }
});

// POST /api/admin/homepage/publish
router.post('/homepage/publish', async (req, res) => {
  try {
    const userId = req.user?.id;
    const state = await getGuestHomepageState();
    const now = new Date().toISOString();
    const nextState = {
      ...state,
      published: {
        sections: clone(state.draft.sections || []),
        seo: normalizeGuestSeo(state.draft.seo || {}),
        publishedAt: now
      },
      updatedAt: now
    };

    const saved = await saveGuestHomepageState(nextState, userId);

    emitGuestHomepageUpdated(req as Request, {
      mode: 'published',
      updatedAt: saved.updatedAt,
      sections: saved.published.sections
    });

    return res.json({
      success: true,
      message: 'Guest homepage published',
      data: saved
    });
  } catch (error: any) {
    console.error('[admin] Failed to publish guest homepage', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to publish guest homepage' });
  }
});

// Ads pricing and refund policy persisted endpoints
router.get('/platform/ads', (req, res) => {
  const persisted = readPersistedSettings();
  if (persisted && persisted.ads) {
    return res.json({ success: true, data: persisted.ads });
  }
  return res.json({ success: true, data: { cpm: { feed: 5, sidebar: 2, forum_top: 8 }, regionalMultipliers: {} } });
});

router.post('/platform/ads', (req, res) => {
  const io = req.app.get('io');
  io?.emit('settings:updated', { scope: 'ads', settings: req.body });
  try {
    const persisted = readPersistedSettings() || {};
    persisted.ads = req.body;
    writePersistedSettings(persisted);
  } catch (e) {
    console.error('[admin] Failed to persist ads settings', e);
  }
  res.json({ success: true, message: 'Ads settings saved' });
});

router.get('/platform/ads/refund-policy', (req, res) => {
  const persisted = readPersistedSettings();
  if (persisted && persisted.ads && persisted.ads.refundPolicy) return res.json({ success: true, data: persisted.ads.refundPolicy });
  return res.json({ success: true, data: { defaultPolicy: 'auto', windowDays: 7 } });
});

router.post('/platform/ads/refund-policy', (req, res) => {
  const io = req.app.get('io');
  io?.emit('settings:updated', { scope: 'ads.refundPolicy', settings: req.body });
  try {
    const persisted = readPersistedSettings() || {};
    persisted.ads = persisted.ads || {};
    persisted.ads.refundPolicy = req.body;
    writePersistedSettings(persisted);
  } catch (e) {
    console.error('[admin] Failed to persist refund policy', e);
  }
  res.json({ success: true, message: 'Refund policy saved' });
});

router.post('/platform/settings', async (req, res) => {
  const io = req.app.get('io');
  const payload = isObjectLike(req.body) ? req.body : {};
  io?.emit('settings:updated', { scope: 'platform', settings: payload });
  // Log payload for debugging persistence issues
  try {
    console.log('[admin] POST /platform/settings payload:', JSON.stringify(payload));
  } catch (e) {
    console.warn('[admin] Failed to stringify platform settings payload', e);
  }

  // Persist in DB first (survives container restarts in production).
  try {
    await prisma.appSetting.upsert({
      where: { scope: 'platform' },
      create: { scope: 'platform', data: payload },
      update: { data: payload }
    });
    console.log('[admin] Persisted platform settings to DB');
  } catch (e) {
    console.error('[admin] Failed to persist platform settings to DB', e);
  }

  // Persist in file as secondary fallback.
  try {
    const persisted = readPersistedSettings() || {};
    persisted.platform = payload;
    writePersistedSettings(persisted);
    console.log('[admin] Persisted platform settings to', SETTINGS_FILE);
  } catch (e) {
    console.error('[admin] Failed to persist platform settings to file', e);
  }
  res.json({ success: true, message: 'Settings saved successfully' });
});

// ============ SYSTEM SETTINGS ============
router.get('/system/settings', getSystemSettings);

router.post('/system/settings', updateSystemSettings);

router.post('/system/email/test', testEmailSettings);
router.post('/system/cache/clear', clearPlatformRuntimeCache);

// ============ GENERAL SETTINGS (for backward compatibility) ============
router.get('/settings', (req, res) => {
  res.json({
    success: true,
    data: {
      siteName: 'Scrolith Marketplace',
      tagline: 'AI-Powered Social Freelance Marketplace with Secure Escrow & Monetization',
      logoUrl: BRAND_ASSET_URL
    }
  });
});

router.post('/settings', (req, res) => {
  const io = req.app.get('io');
  io?.emit('settings:updated', { scope: 'platform', settings: req.body });
  res.json({ success: true, message: 'Settings saved successfully' });
});

router.post('/settings/update', (req, res) => {
  const io = req.app.get('io');
  io?.emit('settings:updated', { scope: 'platform', settings: req.body });
  res.json({ success: true, message: 'Settings saved successfully' });
});

interface AuthRequest extends Request {
  user?: any;
}

// Admin health check
router.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Admin API is working',
    user: (req as AuthRequest).user,
    timestamp: new Date().toISOString()
  });
});

// Test endpoint
router.get('/test', (req, res) => {
  res.json({ 
    success: true, 
    message: 'Admin API is working!',
    user: (req as AuthRequest).user,
    timestamp: new Date().toISOString(),
    endpoints: [
      'GET    /api/admin/test',
      'GET    /api/admin/health',
      'GET    /api/admin/platform/settings',
      'POST   /api/admin/platform/settings',
      'GET    /api/admin/system/settings',
      'POST   /api/admin/system/settings',
      'POST   /api/admin/system/email/test',
      'POST   /api/admin/system/cache/clear',
      'GET    /api/admin/i18n/config',
      'PUT    /api/admin/i18n/config',
      'GET    /api/admin/i18n/keys',
      'PUT    /api/admin/i18n/values',
      'GET    /api/admin/settings',
      'POST   /api/admin/settings',
      'GET    /api/admin/gigs-jobs/gigs',
      'POST   /api/admin/gigs-jobs/gigs/:id/approve',
      'DELETE /api/admin/gigs-jobs/gigs/:id',
      'GET    /api/admin/gigs-jobs/jobs',
      'GET    /api/admin/gigs-jobs/categories/gigs',
      'GET    /api/admin/gigs-jobs/categories/jobs',
      'POST   /api/admin/gigs-jobs/categories',
      'DELETE /api/admin/gigs-jobs/categories/:id',
      'GET    /api/admin/gigs-jobs/plans',
      'POST   /api/admin/gigs-jobs/plans',
      'GET    /api/admin/gigs-jobs/dashboard/stats'
    ]
  });
});

// ============ ADMIN PROFILE ============
// Backwards-compatible endpoint for frontend that expects /api/admin/profile
router.put('/profile', async (req, res) => {
  const io = req.app.get('io');
  const payload = req.body || {};
  // Authenticated user id (authMiddleware ensures req.user exists)
  const authReq = req as AuthRequest;
  const userId = authReq.user?.id;

  try {
    // If request contains user fields, update the user record
    if (
      userId &&
      (payload.email ||
        payload.displayName ||
        payload.username ||
        payload.password ||
        payload.avatar !== undefined ||
        payload.profilePhotoFileId !== undefined)
    ) {
      const updates: any = {};
      const displayName = payload.displayName || payload.username;
      if (displayName) updates.name = displayName;
      if (payload.email) {
        const existingEmail = await prisma.user.findUnique({ where: { email: payload.email } });
        if (existingEmail && existingEmail.id !== userId) {
          return res.status(400).json({ success: false, error: 'Email already in use' });
        }
        updates.email = payload.email;
      }
      if (payload.password) {
        const hashed = await bcrypt.hash(payload.password, 10);
        updates.passwordHash = hashed;
      }
      if (payload.avatar !== undefined) {
        updates.avatar = payload.avatar || null;
      }
      if (payload.profilePhotoFileId !== undefined) {
        updates.profilePhotoFileId = payload.profilePhotoFileId || null;
      }
      if (Object.keys(updates).length) {
        try {
          const updatedUser = await prisma.user.update({ where: { id: userId }, data: updates });
          // Notify the user's other sessions (room + global fallback)
          try { io?.to(userId).emit('user:profile_updated', { userId, updates: updates }); } catch (e) {}
          try { io?.emit('user:profile_updated', { userId, updates: updates }); } catch (e) {}
        } catch (userErr) {
          console.error('[admin] Failed to update user record:', userErr);
          return res.status(500).json({ success: false, error: 'Failed to update user' });
        }
      }
    }

    // Persist admin profile meta in appSetting (for display/legacy usage)
    const existing = await prisma.appSetting.findUnique({ where: { scope: 'admin_profile' } });
    const merged = Object.assign({}, existing?.data ?? {}, payload);
    await prisma.appSetting.upsert({
      where: { scope: 'admin_profile' },
      create: { scope: 'admin_profile', data: merged },
      update: { data: merged }
    });

    // Emit admin-specific event for legacy frontend listeners
    try { io?.emit('admin:profile_updated', { profile: merged }); } catch (e) {}
    try { io?.to('admins').emit('admin:profile_updated', { profile: merged }); } catch (e) {}

    return res.json({ success: true, data: merged });
  } catch (dbErr) {
    console.warn('[admin] admin/profile DB error, attempting file fallback', dbErr);
    try {
      const SETTINGS_DIR = path.resolve(__dirname, '../../../data');
      const SETTINGS_FILE = path.join(SETTINGS_DIR, 'platform-system-settings.json');
      fs.mkdirSync(SETTINGS_DIR, { recursive: true });
      const existingRaw = fs.existsSync(SETTINGS_FILE) ? fs.readFileSync(SETTINGS_FILE, 'utf-8') : '{}';
      let existing: any = {};
      try { existing = existingRaw ? JSON.parse(existingRaw) : {}; } catch (e) { existing = {}; }
      existing['admin_profile'] = Object.assign({}, existing['admin_profile'] || {}, payload);
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(existing, null, 2), 'utf-8');

      // Emit fallback events
      try { io?.emit('admin:profile_updated', { profile: existing['admin_profile'] }); } catch (e) {}
      try { io?.to('admins').emit('admin:profile_updated', { profile: existing['admin_profile'] }); } catch (e) {}

      console.log('[admin] Persisted admin profile to', SETTINGS_FILE);
      return res.json({ success: true, data: existing['admin_profile'], fallback: 'file' });
    } catch (fsErr) {
      console.error('[admin] Failed to persist admin profile', fsErr);
      return res.status(500).json({ success: false, error: 'Failed to save admin profile' });
    }
  }
});

export default router;

