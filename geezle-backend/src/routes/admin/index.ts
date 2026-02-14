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
import cartsAdminRoutes from './carts.routes';
import formsAdminRoutes from './forms.routes';
import withdrawalsAdminRoutes from './withdrawals.routes';
import monetizationAdminRoutes from './monetization.routes';
import payoutsStripeAdminRoutes from './payouts.stripe.routes';
import recoAdminRoutes from './reco.routes';
import scrolithaAdminRoutes from './scrolitha.routes';
import appsAdminRoutes from './apps.routes';
import i18nAdminRoutes from './i18n.routes';
import { clearPlatformRuntimeCache } from '../../controllers/admin.cache.controller';

const router = express.Router();

import { getSystemSettings, updateSystemSettings, testEmailSettings } from '../../controllers/admin.systemSettings.controller';
import prisma from '../../utils/prismaClient';
import bcrypt from 'bcryptjs';

// Simple file-backed persistence for platform/system settings in development
// Persist to repository-level `Scrolith-backend/data` so it's easy to find and permissions are typical.
const SETTINGS_DIR = path.resolve(__dirname, '../../../data');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'platform-system-settings.json');
const BRAND_ASSET_URL = 'https://api.scrolith.com/api/files/content/3362f88f-69d6-4cee-9005-49f33411b53f';

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
router.use('/carts', cartsAdminRoutes);
router.use('/forms', formsAdminRoutes);
router.use('/withdrawals', withdrawalsAdminRoutes);
router.use('/monetization', monetizationAdminRoutes);
router.use('/payouts/stripe', payoutsStripeAdminRoutes);
router.use('/reco', recoAdminRoutes);
router.use('/scrolitha', scrolithaAdminRoutes);
router.use('/apps', appsAdminRoutes);
router.use('/i18n', i18nAdminRoutes);
// Mount admin community routes (Gcoin + Ads admin panels)
router.use('/community', adminCommunityRoutes);

// ============ PLATFORM SETTINGS ============
router.get('/platform/settings', async (req, res) => {
  const defaults = {
    siteName: 'Scrolith Marketplace',
    tagline: 'Find, hire, and work with the best talent',
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
      tagline: 'Find, hire, and work with the best talent',
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

