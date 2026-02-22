import { Request, Response } from 'express';
import Stripe from 'stripe';
import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';
import { recordClick, recordImpression } from '../services/adService';
import { syncFileUsages } from '../utils/fileUsage';
import { sendSystemEmail } from '../services/email.service';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock_key', {
  apiVersion: '2023-10-16' as any
});

const ADS_CONFIG_SCOPE = 'community_ads_config';
const PLATFORM_ORIGIN = process.env.PLATFORM_URL || 'https://scrolith.com';

const AD_PLACEMENT_ALIASES: Record<string, string> = {
  feed: 'community_feed',
  community_feed: 'community_feed',
  homepage: 'homepage',
  homepage_feed: 'homepage_feed',
  forum_listing: 'forum_listing',
  forum_top: 'forum_listing',
  thread_detail: 'thread_detail',
  chat: 'chat_sidebar',
  chat_sidebar: 'chat_sidebar',
  sidebar: 'homepage'
};

const DEFAULT_ALLOWED_PLACEMENTS = [
  'homepage',
  'homepage_feed',
  'community_feed',
  'forum_listing',
  'thread_detail',
  'chat_sidebar'
];

const DEFAULT_TARGET_COUNTRIES = [
  'United States',
  'United Kingdom',
  'Canada',
  'Australia',
  'New Zealand',
  'Germany',
  'France',
  'Netherlands',
  'Sweden',
  'Norway',
  'Denmark',
  'Ireland',
  'Spain',
  'Italy',
  'United Arab Emirates',
  'Saudi Arabia',
  'India',
  'Nigeria',
  'South Africa',
  'Brazil',
  'Mexico',
  'Singapore',
  'Malaysia',
  'Philippines'
];

const normalizePlacement = (value: any, fallback = 'community_feed') => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return fallback;
  return AD_PLACEMENT_ALIASES[raw] || raw;
};

const normalizePricingModel = (value: any): 'CPM' | 'CPC' => {
  const normalized = String(value || '').trim().toUpperCase();
  return normalized === 'CPC' ? 'CPC' : 'CPM';
};

const toPositiveNumber = (value: any, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
};

const defaultAdsConfig = {
  cpmByPlacement: {
    homepage: 6,
    homepage_feed: 5,
    community_feed: 5,
    feed: 5,
    forum_listing: 8,
    thread_detail: 6,
    chat_sidebar: 2,
    chat: 2
  },
  cpcByPlacement: {
    homepage: 0.55,
    homepage_feed: 0.4,
    community_feed: 0.4,
    feed: 0.4,
    forum_listing: 0.6,
    thread_detail: 0.5,
    chat_sidebar: 0.2,
    chat: 0.2
  },
  regionalMultipliers: {},
  minBudget: 10,
  maxBudget: 10000,
  maxPlacementsPerAd: 3,
  maxImageAssets: 6,
  maxVideoAssets: 1,
  approvalMode: 'manual',
  autoApproveAds: false,
  notifyAdminOnAdCreate: true,
  allowedPlacements: DEFAULT_ALLOWED_PLACEMENTS,
  targetCountries: DEFAULT_TARGET_COUNTRIES,
  allowedMediaTypes: ['text', 'image', 'video'],
  requireLoginToInteract: false
};

const resolveAllowedPlacements = (raw: any): string[] => {
  const source = Array.isArray(raw) ? raw : [];
  const normalized = source
    .map((item) => normalizePlacement(item))
    .filter((placement) => DEFAULT_ALLOWED_PLACEMENTS.includes(placement));
  return normalized.length ? Array.from(new Set(normalized)) : [...DEFAULT_ALLOWED_PLACEMENTS];
};

const normalizeCountryList = (raw: any, fallback: string[] = []): string[] => {
  const source = Array.isArray(raw) ? raw : [];
  const normalized = Array.from(
    new Set(
      source
        .map((entry: any) => String(entry || '').trim())
        .filter(Boolean)
    )
  );
  return normalized.length ? normalized : [...fallback];
};

const sanitizeTargetCountries = (raw: any, allowedRaw: any): string[] => {
  const requested = normalizeCountryList(raw, []);
  const allowed = normalizeCountryList(allowedRaw, []);
  if (!allowed.length) return requested;
  if (!requested.length) return [];
  const allowedSet = new Set(allowed.map((entry) => entry.toLowerCase()));
  return requested.filter((entry) => allowedSet.has(entry.toLowerCase()));
};

const mergeAdsConfig = (raw: any) => {
  const input = raw && typeof raw === 'object' ? raw : {};
  const cpmByPlacement = { ...defaultAdsConfig.cpmByPlacement, ...(input.cpmByPlacement || {}) } as Record<string, any>;
  const cpcByPlacement = { ...defaultAdsConfig.cpcByPlacement, ...(input.cpcByPlacement || {}) } as Record<string, any>;
  const normalizedAllowedPlacements = resolveAllowedPlacements(input.allowedPlacements);
  const normalizedTargetCountries = normalizeCountryList(input.targetCountries, DEFAULT_TARGET_COUNTRIES);
  const normalized = {
    ...defaultAdsConfig,
    ...input,
    cpmByPlacement,
    cpcByPlacement,
    allowedPlacements: normalizedAllowedPlacements,
    targetCountries: normalizedTargetCountries,
    maxPlacementsPerAd: Math.max(1, Math.min(3, Number(input.maxPlacementsPerAd ?? defaultAdsConfig.maxPlacementsPerAd))),
    maxImageAssets: Math.max(1, Math.min(12, Number(input.maxImageAssets ?? defaultAdsConfig.maxImageAssets))),
    maxVideoAssets: Math.max(1, Math.min(3, Number(input.maxVideoAssets ?? defaultAdsConfig.maxVideoAssets))),
    minBudget: Math.max(0, Number(input.minBudget ?? defaultAdsConfig.minBudget)),
    maxBudget: Math.max(0, Number(input.maxBudget ?? defaultAdsConfig.maxBudget)),
    approvalMode:
      String(input.approvalMode || '').toLowerCase() === 'auto' || Boolean(input.autoApproveAds) ? 'auto' : 'manual',
    autoApproveAds:
      String(input.approvalMode || '').toLowerCase() === 'auto' || Boolean(input.autoApproveAds),
    notifyAdminOnAdCreate: input.notifyAdminOnAdCreate !== false
  };

  for (const placement of normalizedAllowedPlacements) {
    cpmByPlacement[placement] = toPositiveNumber(cpmByPlacement[placement], toPositiveNumber(defaultAdsConfig.cpmByPlacement[placement], 0));
    cpcByPlacement[placement] = toPositiveNumber(cpcByPlacement[placement], toPositiveNumber(defaultAdsConfig.cpcByPlacement[placement], 0));
  }

  return normalized;
};

const getPlacementRate = (
  config: any,
  placement: string,
  kind: 'cpmByPlacement' | 'cpcByPlacement'
) => {
  const source = (config?.[kind] || {}) as Record<string, any>;
  const normalizedPlacement = normalizePlacement(placement);
  const aliasKeys = [normalizedPlacement];
  if (normalizedPlacement === 'community_feed') aliasKeys.push('feed');
  if (normalizedPlacement === 'chat_sidebar') aliasKeys.push('chat');
  for (const key of aliasKeys) {
    const value = Number(source[key]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return 0;
};

const parseTargeting = (value: any): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return { ...value };
};

const extractPlacements = (payload: any, adsConfig: any, existingPrimaryPlacement?: string): string[] => {
  const maxPlacements = Math.max(1, Math.min(3, Number(adsConfig?.maxPlacementsPerAd ?? defaultAdsConfig.maxPlacementsPerAd)));
  const allowedPlacements = resolveAllowedPlacements(adsConfig?.allowedPlacements);
  const listSource = Array.isArray(payload?.placements)
    ? payload.placements
    : typeof payload?.placement === 'string'
      ? payload.placement.split(',')
      : [];
  const normalized = listSource
    .map((placement: any) => normalizePlacement(placement))
    .filter((placement: string) => allowedPlacements.includes(placement));
  const unique = Array.from(new Set(normalized)).slice(0, maxPlacements) as string[];
  if (unique.length) return unique;
  const fallbackPlacement = normalizePlacement(existingPrimaryPlacement || payload?.placement || 'community_feed');
  return [allowedPlacements.includes(fallbackPlacement) ? fallbackPlacement : allowedPlacements[0] || 'community_feed'];
};

const ensureMessageDestinationType = (objective: string, destinationType: string) => {
  return objective === 'messages' ? 'messages' : destinationType;
};

const validateAndNormalizeMedia = async (
  mediaFileIds: any,
  maxImages: number,
  maxVideos: number
) => {
  const ids = Array.from(
    new Set((Array.isArray(mediaFileIds) ? mediaFileIds : []).map((id: any) => String(id || '').trim()).filter(Boolean))
  );
  if (!ids.length) {
    return { ids: [] as string[], imageCount: 0, videoCount: 0 };
  }

  const files = (await prisma.file.findMany({
    where: { id: { in: ids } },
    select: { id: true, mimeType: true }
  })) as Array<{ id: string; mimeType: string | null }>;
  const byId = new Map<string, { id: string; mimeType: string | null }>(
    files.map((file) => [file.id, file])
  );
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) {
    throw new Error('Some selected ad media files are unavailable. Please reselect your media.');
  }

  let imageCount = 0;
  let videoCount = 0;
  for (const id of ids) {
    const mimeType = String(byId.get(id)?.mimeType || '').toLowerCase();
    if (mimeType.startsWith('video/')) videoCount += 1;
    else imageCount += 1;
  }
  if (imageCount > maxImages) {
    throw new Error(`You can upload up to ${maxImages} images per ad campaign.`);
  }
  if (videoCount > maxVideos) {
    throw new Error(`You can upload only ${maxVideos} video per ad campaign.`);
  }

  return { ids, imageCount, videoCount };
};

const estimateAdOutcomes = (
  budget: number,
  pricingModel: 'CPM' | 'CPC',
  cpm: number,
  cpc: number
) => {
  if (pricingModel === 'CPM') {
    const impressions = cpm > 0 ? Math.floor((budget / cpm) * 1000) : 0;
    return { pricingModel, estimatedImpressions: Math.max(0, impressions), estimatedClicks: 0 };
  }
  const clicks = cpc > 0 ? Math.floor(budget / cpc) : 0;
  return { pricingModel, estimatedImpressions: 0, estimatedClicks: Math.max(0, clicks) };
};

const notifyAdminsForNewAd = async (req: Request, ad: any, config: any) => {
  if (!config?.notifyAdminOnAdCreate) return;
  const admins = await prisma.user.findMany({
    where: { role: 'ADMIN', isActive: true },
    select: { id: true, name: true, email: true }
  });
  if (!admins.length) return;

  const creator = await prisma.user.findUnique({
    where: { id: ad.creatorId },
    select: { id: true, name: true, email: true, username: true }
  });
  const creatorLabel =
    creator?.name || creator?.username || creator?.email || 'A customer';
  const title = 'New ad campaign submitted';
  const body = `${creatorLabel} created "${ad.title}" (${ad.currency || 'USD'} ${Number(ad.budget || 0).toFixed(2)}).`;
  const actionUrl = `${PLATFORM_ORIGIN}/admin/dashboard?tab=community&sub=ads`;

  await prisma.notification.createMany({
    data: admins.map((admin) => ({
      userId: admin.id,
      actorId: creator?.id || ad.creatorId,
      type: 'community_ad_created',
      title,
      body,
      meta: { adId: ad.id, actionUrl, status: ad.status }
    }))
  });

  admins.forEach((admin) => {
    realtime.emitToUser(admin.id, 'notifications:new', {
      type: 'community_ad_created',
      title,
      body,
      actionUrl,
      meta: { adId: ad.id, status: ad.status }
    });
  });

  await Promise.all(
    admins
      .filter((admin) => Boolean(admin.email))
      .map((admin) =>
        sendSystemEmail({
          to: String(admin.email),
          subject: `New Ad Campaign: ${ad.title}`,
          text: `${body}\nReview: ${actionUrl}`,
          html: `<p>${body}</p><p><a href="${actionUrl}">Review in Ads Manager</a></p>`
        }).catch(() => ({ success: false }))
      )
  );
};

const notifyCreatorAdStatus = async (adId: string, status: string, notes?: string | null) => {
  const ad = await prisma.communityAd.findUnique({
    where: { id: adId },
    include: {
      creator: {
        select: { id: true, name: true, email: true }
      }
    }
  });
  if (!ad?.creatorId || !ad.creator) return;
  const normalizedStatus = String(status || '').toUpperCase();
  const title = `Ad campaign ${normalizedStatus.toLowerCase()}`;
  const body =
    normalizedStatus === 'ACTIVE'
      ? `Your ad "${ad.title}" is now live.`
      : normalizedStatus === 'REJECTED'
        ? `Your ad "${ad.title}" was rejected.${notes ? ` Notes: ${notes}` : ''}`
        : `Your ad "${ad.title}" status changed to ${normalizedStatus}.`;
  const actionUrl = `${PLATFORM_ORIGIN}/my-ads`;
  await prisma.notification.create({
    data: {
      userId: ad.creatorId,
      type: 'community_ad_status',
      title,
      body,
      meta: { adId, status: normalizedStatus, actionUrl }
    }
  });
  realtime.emitToUser(ad.creatorId, 'notifications:new', {
    type: 'community_ad_status',
    title,
    body,
    actionUrl,
    meta: { adId, status: normalizedStatus }
  });
  if (ad.creator.email) {
    await sendSystemEmail({
      to: ad.creator.email,
      subject: `Ad Campaign Update: ${ad.title}`,
      text: `${body}\nTrack campaign: ${actionUrl}`,
      html: `<p>${body}</p><p><a href="${actionUrl}">Open My Ads</a></p>`
    }).catch(() => ({ success: false }));
  }
};

const resolveAdMedia = async (fileIds?: string[] | null) => {
  if (!fileIds || fileIds.length === 0) return [];
  const files = (await prisma.file.findMany({ where: { id: { in: fileIds } } })) as Array<{
    id: string;
    url: string;
    mimeType: string | null;
    originalName: string | null;
  }>;
  const byId = new Map(files.map((file) => [file.id, file]));
  return fileIds
    .map((id) => {
      const file = byId.get(id);
      if (!file) return null;
      return { id: file.id, url: file.url, mimeType: file.mimeType, name: file.originalName };
    })
    .filter((item): item is { id: string; url: string; mimeType: string | null; name: string | null } => Boolean(item));
};

const hydrateAdsWithMedia = async (ads: any[]) =>
  Promise.all(
    ads.map(async (ad) => ({
      ...ad,
      media: await resolveAdMedia(ad.mediaFileIds || [])
    }))
  );

export const createAdDraft = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const payload = req.body || {};
    const adsConfigSetting = await prisma.appSetting.findUnique({ where: { scope: ADS_CONFIG_SCOPE } });
    const adsConfig = mergeAdsConfig((adsConfigSetting?.data as any) || defaultAdsConfig);

    const placements = extractPlacements(payload, adsConfig);
    const primaryPlacement = placements[0];
    const objective = String(payload.objective || 'traffic').toLowerCase() === 'messages' ? 'messages' : 'traffic';
    const destinationType = ensureMessageDestinationType(
      objective,
      String(payload.destinationType || 'url').toLowerCase() === 'messages' ? 'messages' : 'url'
    );
    const destinationUrl =
      destinationType === 'messages'
        ? null
        : String(payload.destinationUrl || payload.targetUrl || '').trim() || null;
    if (destinationType === 'url' && !destinationUrl) {
      return res.status(400).json({ success: false, error: 'Destination URL is required for URL ads.' });
    }

    const budget = Number(payload.budget || 0);
    const minBudget = Math.max(0, Number(adsConfig.minBudget ?? 10));
    const maxBudget = Math.max(minBudget, Number(adsConfig.maxBudget ?? 10000));
    if (!Number.isFinite(budget) || budget < minBudget) {
      return res.status(400).json({
        success: false,
        error: `Minimum ad budget is ${minBudget} ${String(payload.currency || 'USD').toUpperCase()}.`
      });
    }
    if (budget > maxBudget) {
      return res.status(400).json({
        success: false,
        error: `Maximum ad budget is ${maxBudget} ${String(payload.currency || 'USD').toUpperCase()}.`
      });
    }

    const durationDays = Number(payload.durationDays || 0);
    const normalizedDurationDays = Number.isFinite(durationDays) && durationDays > 0 ? Math.floor(durationDays) : 7;
    const startAt = payload.startAt ? new Date(payload.startAt) : new Date();
    const endAt = new Date(startAt.getTime() + normalizedDurationDays * 24 * 60 * 60 * 1000);

    const maxImages = Math.max(1, Math.min(12, Number(adsConfig.maxImageAssets ?? 6)));
    const maxVideos = Math.max(1, Math.min(3, Number(adsConfig.maxVideoAssets ?? 1)));
    const normalizedMedia = await validateAndNormalizeMedia(payload.mediaFileIds || [], maxImages, maxVideos);

    const incomingTargeting = parseTargeting(payload.targeting);
    const targetCountries = sanitizeTargetCountries(
      Array.isArray(payload.targetCountries) ? payload.targetCountries : incomingTargeting.targetCountries || [],
      adsConfig?.targetCountries
    );
    const targetAudience = String(payload.targetAudience || incomingTargeting.targetAudience || 'users')
      .trim()
      .toLowerCase();
    const normalizedTargetAudience =
      targetAudience === 'businesses' || targetAudience === 'users' || targetAudience === 'all'
        ? targetAudience
        : 'users';
    const pricingModel = normalizePricingModel(payload.pricingModel || payload.computeOption || incomingTargeting.pricingModel);
    const cpm = getPlacementRate(adsConfig, primaryPlacement, 'cpmByPlacement');
    const cpc = getPlacementRate(adsConfig, primaryPlacement, 'cpcByPlacement');
    const dailySpendRaw = Number(payload.dailySpend ?? incomingTargeting.dailySpend ?? 0);
    const dailySpend = Number.isFinite(dailySpendRaw) && dailySpendRaw > 0 ? dailySpendRaw : null;
    if (dailySpend !== null && dailySpend > budget) {
      return res.status(400).json({ success: false, error: 'Daily spend cannot exceed total ad budget.' });
    }

    const estimated = estimateAdOutcomes(budget, pricingModel, cpm, cpc);
    const targeting = {
      ...incomingTargeting,
      placements,
      targetCountries,
      targetAudience: normalizedTargetAudience,
      pricingModel,
      dailySpend,
      estimated
    };

    const ad = await prisma.communityAd.create({
      data: {
        creatorId: userId,
        title: payload.title || 'Untitled Ad',
        body: payload.body || '',
        objective,
        destinationType,
        destinationUrl,
        ctaText: payload.ctaText || null,
        placement: primaryPlacement,
        targeting,
        mediaFileIds: normalizedMedia.ids,
        budget,
        remainingBudget: budget,
        currency: String(payload.currency || 'USD').toUpperCase(),
        startAt,
        endAt,
        durationDays: normalizedDurationDays,
        cpm,
        cpc,
        impressionsBought: estimated.estimatedImpressions || 0,
        impressionsLeft: estimated.estimatedImpressions || 0
      }
    });

    try {
      await syncFileUsages('community_ad', ad.id, ad.mediaFileIds || [], 'Community Ad Media');
    } catch (e) {}

    try {
      await notifyAdminsForNewAd(req, ad, adsConfig);
    } catch (notifyError) {
      console.warn('Failed to notify admins about new ad campaign:', notifyError);
    }

    const io = (req.app as any).get('io');
    const communityIo = (req.app as any).get('communityIo');
    try { io?.emit('community:ad_created', { ad }); } catch(e){}
    try { communityIo?.emit('community:ad_created', { ad }); } catch(e){}
    try { realtime.emitToAd(ad.id, 'community:ad_created', { ad }); } catch (e) {}

    return res.json({ success: true, data: ad });
  } catch (error: any) {
    console.error('Create ad draft error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to create ad' });
  }
};

export const payAd = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const adId = req.params.id;
    const ad = await prisma.communityAd.findUnique({ where: { id: adId } });
    if (!ad) return res.status(404).json({ success: false, error: 'Ad not found' });
    if (ad.creatorId !== userId) return res.status(403).json({ success: false, error: 'Forbidden' });

    const payload = req.body || {};
    const paymentMethodId = (payload.paymentMethodId || payload.method || payload.gateway || 'stripe').toString();
    if (paymentMethodId && paymentMethodId !== 'stripe') {
      return res.status(400).json({ success: false, error: 'Selected payment method is not available for ads yet' });
    }

    if (payload.currency) {
      await prisma.communityAd.update({ where: { id: adId }, data: { currency: String(payload.currency).toUpperCase() } });
    }

    const amount = Math.max(0, Number(ad.budget || 0));
    if (amount <= 0) return res.status(400).json({ success: false, error: 'Invalid budget amount' });

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: (ad.currency || 'USD').toLowerCase(),
      metadata: { adId: ad.id },
      automatic_payment_methods: { enabled: true }
    });

    // Mark ad as awaiting payment and create a pending AdPayment for reconciliation
    try {
      await prisma.communityAd.update({ where: { id: adId }, data: { status: 'AWAITING_PAYMENT' } });
      await prisma.adPayment.create({ data: {
        adId,
        transactionId: paymentIntent.id,
        amount: amount,
        currency: (ad.currency || 'USD').toUpperCase(),
        status: 'pending'
      } });
      const io = (req.app as any).get('io');
      try { io?.emit('community:ad_status_updated', { adId, status: 'AWAITING_PAYMENT' }); } catch(e){}
      try { io?.emit('community:ad_payment_initiated', { adId, paymentIntentId: paymentIntent.id }); } catch(e){}
      try { realtime.emitToAd(adId, 'community:ad_status_updated', { adId, status: 'AWAITING_PAYMENT' }); } catch (e) {}
      try { realtime.emitToAd(adId, 'community:ad_payment_initiated', { adId, paymentIntentId: paymentIntent.id }); } catch (e) {}
    } catch (err) {
      console.error('Failed to create pending ad payment record:', err);
    }

    return res.json({ success: true, data: { clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id } });
  } catch (error: any) {
    console.error('Pay ad error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to create payment' });
  }
};

export const submitAd = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const adId = req.params.id;
    const ad = await prisma.communityAd.findUnique({ where: { id: adId } });
    if (!ad) return res.status(404).json({ success: false, error: 'Ad not found' });
    if (ad.creatorId !== userId) return res.status(403).json({ success: false, error: 'Forbidden' });

    if (ad.status !== 'PAID') {
      return res.status(400).json({ success: false, error: 'Ad must be paid before submission' });
    }

    const adsConfigSetting = await prisma.appSetting.findUnique({ where: { scope: ADS_CONFIG_SCOPE } });
    const adsConfig = mergeAdsConfig((adsConfigSetting?.data as any) || defaultAdsConfig);
    const autoApprove = adsConfig.autoApproveAds || String(adsConfig.approvalMode || '').toLowerCase() === 'auto';
    const nextStatus = autoApprove ? 'ACTIVE' : 'SUBMITTED_FOR_REVIEW';
    const updated = await prisma.communityAd.update({ where: { id: adId }, data: { status: nextStatus as any } });
    const io = (req.app as any).get('io');
    try { io?.emit('community:ad_status_updated', { adId, status: nextStatus }); } catch(e){}
    try { realtime.emitToAd(adId, 'community:ad_status_updated', { adId, status: nextStatus }); } catch (e) {}
    return res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Submit ad error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to submit ad' });
  }
};

export const getMyAds = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const ads = await prisma.communityAd.findMany({ where: { creatorId: userId }, orderBy: { createdAt: 'desc' } });
    const hydrated = await hydrateAdsWithMedia(ads);
    return res.json({ success: true, data: hydrated });
  } catch (error: any) {
    console.error('Get my ads error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load ads' });
  }
};

export const getAdPerformance = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const adId = req.params.id;
    const ad = await prisma.communityAd.findUnique({ where: { id: adId } });
    if (!ad) return res.status(404).json({ success: false, error: 'Ad not found' });
    if (ad.creatorId !== userId) return res.status(403).json({ success: false, error: 'Forbidden' });

    const metrics = await prisma.adMetricsDaily.findMany({ where: { adId }, orderBy: { date: 'desc' } });
    return res.json({ success: true, data: { ad, metrics } });
  } catch (error: any) {
    console.error('Get ad performance error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load performance' });
  }
};

// Admin endpoints
export const getReviewQueue = async (_req: Request, res: Response) => {
  try {
    const ads = await prisma.communityAd.findMany({ where: { status: 'SUBMITTED_FOR_REVIEW' }, orderBy: { createdAt: 'asc' } });
    const hydrated = await hydrateAdsWithMedia(ads);
    return res.json({ success: true, data: hydrated });
  } catch (error: any) {
    console.error('Get review queue error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load review queue' });
  }
};

export const approveAd = async (req: Request, res: Response) => {
  try {
    const adId = req.params.id;
    const ad = await prisma.communityAd.update({ where: { id: adId }, data: { status: 'APPROVED' } });
    // When approved, move to ACTIVE
    await prisma.communityAd.update({ where: { id: adId }, data: { status: 'ACTIVE' } });
    const io = (req.app as any).get('io');
    try { io?.emit('community:ad_status_updated', { adId, status: 'ACTIVE' }); } catch(e){}
    try { realtime.emitToAd(adId, 'community:ad_status_updated', { adId, status: 'ACTIVE' }); } catch (e) {}
    await notifyCreatorAdStatus(adId, 'ACTIVE', null).catch(() => undefined);
    return res.json({ success: true, data: ad });
  } catch (error: any) {
    console.error('Approve ad error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to approve ad' });
  }
};

export const rejectAd = async (req: Request, res: Response) => {
  try {
    const adId = req.params.id;
    const { refund, notes } = req.body || {};
    await prisma.communityAd.update({ where: { id: adId }, data: { status: 'REJECTED' } });
    // Refund handling: mark existing payments refunded, attempt gateway refund when possible,
    // and record a refund AdPayment entry linking to gateway refund id.
    if (refund) {
      const payments = await prisma.adPayment.findMany({ where: { adId } });
      for (const p of payments) {
        try {
          // attempt gateway refund if we have a transaction/payment intent id
          let refundResult: any = null;
          if (p.transactionId) {
            try {
              refundResult = await stripe.refunds.create({ payment_intent: p.transactionId } as any);
            } catch (stripeErr) {
              console.error('Stripe refund error for ad payment', p.id, stripeErr);
            }
          }

          // mark original payment as refunded/flagged
          await prisma.adPayment.update({ where: { id: p.id }, data: { status: 'refunded' } });

          // create a refund record (negative amount) linking to refund id when available
          await prisma.adPayment.create({ data: {
            adId,
            transactionId: refundResult?.id || null,
            amount: -Math.abs(Number(p.amount || 0)),
            currency: p.currency || 'USD',
            status: 'refunded'
          } });
        } catch (err) {
          console.error('Error processing ad refund for ad', adId, err);
        }
      }
    }
    const io = (req.app as any).get('io');
    try { io?.emit('community:ad_status_updated', { adId, status: 'REJECTED' }); } catch(e){}
    try { realtime.emitToAd(adId, 'community:ad_status_updated', { adId, status: 'REJECTED' }); } catch (e) {}
    await notifyCreatorAdStatus(adId, 'REJECTED', notes ? String(notes) : null).catch(() => undefined);
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Reject ad error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to reject ad' });
  }
};

export const pauseAd = async (req: Request, res: Response) => {
  try {
    const adId = req.params.id;
    const userId = req.user?.id;
    const role = (req.user?.role || '').toString().toLowerCase();
    const isAdmin = role.includes('admin');
    if (!userId && !isAdmin) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const existing = await prisma.communityAd.findUnique({ where: { id: adId } });
    if (!existing) return res.status(404).json({ success: false, error: 'Ad not found' });
    if (!isAdmin && existing.creatorId !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    if (existing.status !== 'ACTIVE') {
      return res.status(400).json({ success: false, error: 'Only active ads can be paused' });
    }

    const ad = await prisma.communityAd.update({ where: { id: adId }, data: { status: 'PAUSED' } });
    const io = (req.app as any).get('io');
    try { io?.emit('community:ad_status_updated', { adId, status: 'PAUSED' }); } catch(e){}
    try { realtime.emitToAd(adId, 'community:ad_status_updated', { adId, status: 'PAUSED' }); } catch (e) {}
    return res.json({ success: true, data: ad });
  } catch (error: any) {
    console.error('Pause ad error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to pause ad' });
  }
};

export const resumeAd = async (req: Request, res: Response) => {
  try {
    const adId = req.params.id;
    const userId = req.user?.id;
    const role = (req.user?.role || '').toString().toLowerCase();
    const isAdmin = role.includes('admin');
    if (!userId && !isAdmin) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const existing = await prisma.communityAd.findUnique({ where: { id: adId } });
    if (!existing) return res.status(404).json({ success: false, error: 'Ad not found' });
    if (!isAdmin && existing.creatorId !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    if (existing.status !== 'PAUSED') {
      return res.status(400).json({ success: false, error: 'Only paused ads can be resumed' });
    }

    const ad = await prisma.communityAd.update({ where: { id: adId }, data: { status: 'ACTIVE' } });
    const io = (req.app as any).get('io');
    try { io?.emit('community:ad_status_updated', { adId, status: 'ACTIVE' }); } catch(e){}
    try { realtime.emitToAd(adId, 'community:ad_status_updated', { adId, status: 'ACTIVE' }); } catch (e) {}
    return res.json({ success: true, data: ad });
  } catch (error: any) {
    console.error('Resume ad error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to resume ad' });
  }
};

export const getAdsAnalytics = async (_req: Request, res: Response) => {
  try {
    // Basic analytics summary: total impressions, clicks, spend
    const agg = await prisma.adMetricsDaily.aggregate({
      _sum: { impressions: true, clicks: true, spend: true }
    });
    const totals = {
      impressions: Number(agg?._sum?.impressions || 0),
      clicks: Number(agg?._sum?.clicks || 0),
      spend: Number(agg?._sum?.spend || 0)
    };
    return res.json({
      success: true,
      data: {
        ...agg,
        ...totals,
        adminRevenue: totals.spend
      }
    });
  } catch (error: any) {
    console.error('Get ads analytics error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load analytics' });
  }
};

export const getAdsConfig = async (_req: Request, res: Response) => {
  try {
    const existing = await prisma.appSetting.findUnique({ where: { scope: ADS_CONFIG_SCOPE } });
    if (!existing) {
      return res.json({ success: true, data: mergeAdsConfig(defaultAdsConfig) });
    }
    return res.json({ success: true, data: mergeAdsConfig(existing.data || defaultAdsConfig) });
  } catch (error: any) {
    console.error('Get ads config error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load ads config' });
  }
};

export const updateAdsConfig = async (req: Request, res: Response) => {
  try {
    const payload = req.body?.data ?? req.body ?? {};
    const merged = mergeAdsConfig(payload || {});
    const upserted = await prisma.appSetting.upsert({
      where: { scope: ADS_CONFIG_SCOPE },
      create: { scope: ADS_CONFIG_SCOPE, data: merged },
      update: { data: merged }
    });
    const io = (req.app as any).get('communityIo') || (req.app as any).get('io');
    try { io?.emit('community:ads_config_updated', { config: upserted.data }); } catch (e) {}
    return res.json({ success: true, data: upserted.data });
  } catch (error: any) {
    console.error('Update ads config error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update ads config' });
  }
};

// Public: list ads available for placement (only ACTIVE/PAID)
export const getPublicAds = async (req: Request, res: Response) => {
  try {
    const requestedPlacement =
      ((req.query.placement as string | undefined) || (req.query.role as string | undefined) || '').trim();
    const normalizedPlacement = requestedPlacement ? normalizePlacement(requestedPlacement) : '';
    const shouldFilterByPlacement = Boolean(
      normalizedPlacement && DEFAULT_ALLOWED_PLACEMENTS.includes(normalizedPlacement)
    );
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(30, Math.floor(limitRaw))) : 8;
    const where: any = { status: 'ACTIVE' };
    const ads = await prisma.communityAd.findMany({ where, orderBy: { createdAt: 'desc' }, take: Math.max(limit * 6, 30) });
    const now = Date.now();
    const filtered = ads.filter((ad) => {
      if (shouldFilterByPlacement) {
        const targeting = parseTargeting(ad.targeting);
        const adPlacementsRaw = Array.isArray(targeting.placements)
          ? targeting.placements
          : [ad.placement];
        const adPlacements = Array.from(new Set(adPlacementsRaw.map((entry) => normalizePlacement(entry))));
        if (!adPlacements.includes(normalizedPlacement)) return false;
      }
      if (ad.remainingBudget !== undefined && Number(ad.remainingBudget) <= 0) return false;
      if (ad.startAt && new Date(ad.startAt).getTime() > now) return false;
      if (ad.endAt && new Date(ad.endAt).getTime() < now) return false;
      return true;
    });
    const selectedAds = filtered.slice(0, limit);
    const adsWithPlacement = selectedAds.map((ad) => {
      const targeting = parseTargeting(ad.targeting);
      const placements = Array.isArray(targeting.placements)
        ? targeting.placements.map((entry: any) => normalizePlacement(entry))
        : [normalizePlacement(ad.placement)];
      return {
        ...ad,
        targeting: { ...targeting, placements }
      };
    });
    const hydrated = await hydrateAdsWithMedia(adsWithPlacement);
    return res.json({ success: true, data: hydrated });
  } catch (error: any) {
    console.error('Get public ads error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load ads' });
  }
};

export const recordAdImpression = async (req: Request, res: Response) => {
  try {
    const adId = req.params.id;
    if (!adId) return res.status(400).json({ success: false, error: 'Missing ad id' });
    const result = await recordImpression(adId);
    if (!result) return res.json({ success: true, data: { recorded: false } });
    const io = (req.app as any).get('communityIo') || (req.app as any).get('io');
    try { io?.emit('community:ad_metrics_updated', { adId, metrics: result.metrics }); } catch (e) {}
    try { realtime.emitToAd(adId, 'community:ad_metrics_updated', { adId, metrics: result.metrics }); } catch (e) {}
    if (result.metrics?.status === 'ENDED') {
      try { io?.emit('community:ad_status_updated', { adId, status: 'ENDED' }); } catch (e) {}
      try { realtime.emitToAd(adId, 'community:ad_status_updated', { adId, status: 'ENDED' }); } catch (e) {}
    }
    return res.json({ success: true, data: { recorded: true } });
  } catch (error: any) {
    console.error('Record ad impression error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to record impression' });
  }
};

export const recordAdClick = async (req: Request, res: Response) => {
  try {
    const adId = req.params.id;
    if (!adId) return res.status(400).json({ success: false, error: 'Missing ad id' });
    const result = await recordClick(adId);
    if (!result) return res.json({ success: true, data: { recorded: false } });
    const io = (req.app as any).get('communityIo') || (req.app as any).get('io');
    try { io?.emit('community:ad_metrics_updated', { adId, metrics: result.metrics }); } catch (e) {}
    try { realtime.emitToAd(adId, 'community:ad_metrics_updated', { adId, metrics: result.metrics }); } catch (e) {}
    if (result.metrics?.status === 'ENDED') {
      try { io?.emit('community:ad_status_updated', { adId, status: 'ENDED' }); } catch (e) {}
      try { realtime.emitToAd(adId, 'community:ad_status_updated', { adId, status: 'ENDED' }); } catch (e) {}
    }
    return res.json({ success: true, data: { recorded: true } });
  } catch (error: any) {
    console.error('Record ad click error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to record click' });
  }
};

// Get a single ad (public if active/paid, otherwise creator/admin)
export const getAd = async (req: Request, res: Response) => {
  try {
    const adId = req.params.id;
    if (!adId) return res.status(400).json({ success: false, error: 'Missing ad id' });
    const ad = await prisma.communityAd.findUnique({ where: { id: adId }, include: { payments: true } });
    if (!ad) return res.status(404).json({ success: false, error: 'Ad not found' });

    // If ad is not public, restrict to creator or admin
    const userId = (req as any).user?.id;
    const userRole = (req as any).user?.role || '';
    const isAdmin = userRole && userRole.toString().toLowerCase().includes('admin');
    if (!['PAID', 'ACTIVE', 'SUBMITTED_FOR_REVIEW', 'AWAITING_PAYMENT'].includes(ad.status || '') && !isAdmin && ad.creatorId !== userId) {
      return res.status(403).json({ success: false, error: 'Forbidden' });
    }

    return res.json({ success: true, data: ad });
  } catch (error: any) {
    console.error('Get ad error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load ad' });
  }
};

// Update an ad (creator-only, basic fields)
export const updateAd = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const adId = req.params.id;
    if (!adId) return res.status(400).json({ success: false, error: 'Missing ad id' });

    const existing = await prisma.communityAd.findUnique({ where: { id: adId } });
    if (!existing) return res.status(404).json({ success: false, error: 'Ad not found' });
    if (existing.creatorId !== userId) return res.status(403).json({ success: false, error: 'Forbidden' });

    const payload = req.body || {};
    const adsConfigSetting = await prisma.appSetting.findUnique({ where: { scope: ADS_CONFIG_SCOPE } });
    const adsConfig = mergeAdsConfig((adsConfigSetting?.data as any) || defaultAdsConfig);
    const maxImages = Math.max(1, Math.min(12, Number(adsConfig.maxImageAssets ?? 6)));
    const maxVideos = Math.max(1, Math.min(3, Number(adsConfig.maxVideoAssets ?? 1)));
    const minBudget = Math.max(0, Number(adsConfig.minBudget ?? 10));
    const maxBudget = Math.max(minBudget, Number(adsConfig.maxBudget ?? 10000));
    // Only allow updates when ad is in editable statuses
    const editableStatuses = ['DRAFT', 'REJECTED', 'AWAITING_PAYMENT'];
    if (!editableStatuses.includes((existing.status || '').toString().toUpperCase())) {
      return res.status(403).json({ success: false, error: 'Ad cannot be edited in its current status' });
    }

    const allowed: any = {};
    const existingTargeting = parseTargeting(existing.targeting);
    const nextTargeting = { ...existingTargeting };

    const objective = payload.objective !== undefined
      ? (String(payload.objective || '').toLowerCase() === 'messages' ? 'messages' : 'traffic')
      : String(existing.objective || 'traffic');
    const destinationType = payload.destinationType !== undefined
      ? ensureMessageDestinationType(
          objective,
          String(payload.destinationType || '').toLowerCase() === 'messages' ? 'messages' : 'url'
        )
      : ensureMessageDestinationType(objective, String(existing.destinationType || 'url'));

    if (payload.title !== undefined) allowed.title = String(payload.title);
    if (payload.body !== undefined) allowed.body = String(payload.body);
    if (payload.objective !== undefined) allowed.objective = objective;
    if (payload.destinationType !== undefined || payload.objective !== undefined) allowed.destinationType = destinationType;
    if (payload.destinationUrl !== undefined || payload.destinationType !== undefined || payload.objective !== undefined) {
      const nextDestinationUrl =
        destinationType === 'messages'
          ? null
          : String(payload.destinationUrl ?? existing.destinationUrl ?? '').trim() || null;
      if (destinationType === 'url' && !nextDestinationUrl) {
        return res.status(400).json({ success: false, error: 'Destination URL is required for URL ads.' });
      }
      allowed.destinationUrl = nextDestinationUrl;
    }
    if (payload.ctaText !== undefined) allowed.ctaText = payload.ctaText ? String(payload.ctaText) : null;

    if (payload.targeting !== undefined) {
      Object.assign(nextTargeting, parseTargeting(payload.targeting));
    }

    const placementsFromPayload =
      payload.placements !== undefined || payload.placement !== undefined
        ? extractPlacements(payload, adsConfig, existing.placement)
        : Array.isArray(existingTargeting.placements)
          ? extractPlacements({ placements: existingTargeting.placements }, adsConfig, existing.placement)
          : [normalizePlacement(existing.placement, 'community_feed')];

    allowed.placement = placementsFromPayload[0];
    nextTargeting.placements = placementsFromPayload;

    const pricingModel = payload.pricingModel !== undefined || payload.computeOption !== undefined
      ? normalizePricingModel(payload.pricingModel || payload.computeOption)
      : normalizePricingModel(existingTargeting.pricingModel || 'CPM');
    nextTargeting.pricingModel = pricingModel;

    const targetCountriesSource =
      payload.targetCountries !== undefined
        ? payload.targetCountries
        : nextTargeting.targetCountries;
    const targetCountries = sanitizeTargetCountries(
      targetCountriesSource,
      adsConfig?.targetCountries
    );
    nextTargeting.targetCountries = targetCountries;

    if (payload.targetAudience !== undefined) {
      const targetAudience = String(payload.targetAudience || '').trim().toLowerCase();
      nextTargeting.targetAudience =
        targetAudience === 'businesses' || targetAudience === 'users' || targetAudience === 'all'
          ? targetAudience
          : 'users';
    }

    if (payload.dailySpend !== undefined) {
      const dailySpend = Number(payload.dailySpend || 0);
      if (!Number.isFinite(dailySpend) || dailySpend < 0) {
        return res.status(400).json({ success: false, error: 'Daily spend must be 0 or greater.' });
      }
      nextTargeting.dailySpend = dailySpend > 0 ? dailySpend : null;
    }

    if (payload.mediaFileIds !== undefined) {
      const normalizedMedia = await validateAndNormalizeMedia(payload.mediaFileIds, maxImages, maxVideos);
      allowed.mediaFileIds = normalizedMedia.ids;
    }

    if (payload.budget !== undefined) {
      const newBudget = Number(payload.budget || 0);
      if (!Number.isFinite(newBudget) || newBudget < minBudget) {
        return res.status(400).json({ success: false, error: `Minimum ad budget is ${minBudget}.` });
      }
      if (newBudget > maxBudget) {
        return res.status(400).json({ success: false, error: `Maximum ad budget is ${maxBudget}.` });
      }
      allowed.budget = newBudget;
      const previouslySpent = Math.max(0, Number(existing.budget || 0) - Number(existing.remainingBudget || 0));
      allowed.remainingBudget = Math.max(0, Number((newBudget - previouslySpent).toFixed(6)));
    }

    if (payload.currency !== undefined) allowed.currency = String(payload.currency || 'USD').toUpperCase();

    const selectedBudget = allowed.budget !== undefined ? Number(allowed.budget) : Number(existing.budget || 0);
    if (nextTargeting.dailySpend !== undefined && nextTargeting.dailySpend !== null && Number(nextTargeting.dailySpend) > selectedBudget) {
      return res.status(400).json({ success: false, error: 'Daily spend cannot exceed total ad budget.' });
    }

    const cpm = getPlacementRate(adsConfig, allowed.placement || existing.placement, 'cpmByPlacement');
    const cpc = getPlacementRate(adsConfig, allowed.placement || existing.placement, 'cpcByPlacement');
    allowed.cpm = cpm;
    allowed.cpc = cpc;

    const estimated = estimateAdOutcomes(selectedBudget, pricingModel, cpm, cpc);
    nextTargeting.estimated = estimated;
    if (pricingModel === 'CPM') {
      allowed.impressionsBought = estimated.estimatedImpressions;
      allowed.impressionsLeft = Math.max(
        0,
        estimated.estimatedImpressions - Number(existing.impressions || 0)
      );
    }

    allowed.targeting = nextTargeting;

    if (payload.startAt !== undefined) allowed.startAt = payload.startAt ? new Date(payload.startAt) : null;
    if (payload.endAt !== undefined) allowed.endAt = payload.endAt ? new Date(payload.endAt) : null;
    if (payload.durationDays !== undefined) {
      const durationDays = Number(payload.durationDays || 0);
      allowed.durationDays = Number.isFinite(durationDays) && durationDays > 0 ? Math.floor(durationDays) : null;
    }

    // Prevent creators from changing status via this endpoint
    if ('status' in allowed) delete allowed.status;
    const updated = await prisma.communityAd.update({ where: { id: adId }, data: allowed });
    if (payload.mediaFileIds !== undefined) {
      try { await syncFileUsages('community_ad', adId, updated.mediaFileIds || [], 'Community Ad Media'); } catch (e) {}
    }
    const io = (req.app as any).get('io');
    try { io?.emit('community:ad_status_updated', { adId, status: updated.status }); } catch(e){}
    try { realtime.emitToAd(adId, 'community:ad_status_updated', { adId, status: updated.status }); } catch (e) {}
    return res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Update ad error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update ad' });
  }
};

// Creator: delete own ad when in deletable statuses
export const deleteAd = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const adId = req.params.id;
    const ad = await prisma.communityAd.findUnique({ where: { id: adId } });
    if (!ad) return res.status(404).json({ success: false, error: 'Ad not found' });
    if (ad.creatorId !== userId) return res.status(403).json({ success: false, error: 'Forbidden' });

    const deletable = ['DRAFT', 'REJECTED'];
    if (!deletable.includes((ad.status || '').toString().toUpperCase())) {
      return res.status(403).json({ success: false, error: 'Ad cannot be deleted in its current status' });
    }

    await prisma.communityAd.delete({ where: { id: adId } });
    const io = (req.app as any).get('io');
    try { io?.emit('community:ad_deleted', { adId }); } catch (e) {}
    try { realtime.emitToAd(adId, 'community:ad_deleted', { adId }); } catch (e) {}
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Delete ad error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to delete ad' });
  }
};

// Admin: list all campaigns (for admin UI)
export const getAllCampaigns = async (_req: Request, res: Response) => {
  try {
    const ads = await prisma.communityAd.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        creator: {
          select: { id: true, name: true, email: true, username: true }
        }
      }
    });
    const withClient = ads.map((ad: any) => ({
      ...ad,
      clientName: ad?.creator?.name || ad?.creator?.username || ad?.creator?.email || 'Customer'
    }));
    const hydrated = await hydrateAdsWithMedia(withClient);
    return res.json({ success: true, data: hydrated });
  } catch (error: any) {
    console.error('Get all campaigns error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load campaigns' });
  }
};
