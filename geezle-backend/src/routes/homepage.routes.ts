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
