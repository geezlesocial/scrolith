import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';
import { recordClick, recordImpression } from '../services/adService';
import { syncFileUsages } from '../utils/fileUsage';
import { sendSystemEmail } from '../services/email.service';
import { getStripeClient } from '../services/stripeConfig.service';
import { DEFAULT_AD_TARGET_COUNTRIES } from '../constants/defaultAudienceOptions';
import { buildCommunityAdActivationReadiness } from '../services/communityAdActivation.service';
import { buildMarketplaceListingBoostPrefill } from '../services/marketplace.service';

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
  sidebar: 'homepage',
  scroll: 'scroll_preroll',
  scroll_feed: 'scroll_feed',
  scroll_preroll: 'scroll_preroll',
  scroll_video: 'scroll_preroll',
  scroll_overlay: 'scroll_preroll'
};

const DEFAULT_ALLOWED_PLACEMENTS = [
  'homepage',
  'homepage_feed',
  'community_feed',
  'scroll_preroll',
  'scroll_feed',
  'forum_listing',
  'thread_detail',
  'chat_sidebar'
];

const AD_PAYMENT_COMPLETED_STATUSES = ['completed', 'paid', 'succeeded'] as const;
const AD_PAYMENT_SETTLED_AD_STATUSES = new Set(['PAID', 'SUBMITTED_FOR_REVIEW', 'ACTIVE', 'PAUSED']);

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

const normalizeCurrencyCode = (value: any, fallback = 'USD') => {
  const raw = String(value || fallback || 'USD').trim().toUpperCase();
  if (!raw) return String(fallback || 'USD').toUpperCase();
  const directMatch = raw.match(/^[A-Z]{3}$/);
  if (directMatch) return directMatch[0];
  const tokenMatch = raw.match(/[A-Z]{3}/);
  if (tokenMatch) return tokenMatch[0];
  return String(fallback || 'USD').toUpperCase();
};

const createValidationError = (message: string, code = 'VALIDATION_ERROR') => {
  const err: any = new Error(message);
  err.statusCode = 400;
  err.code = code;
  return err;
};

const isPrismaValidationLikeError = (error: any): boolean => {
  if (!error) return false;
  const name = String(error?.name || '').toLowerCase();
  if (name.includes('prismaclientvalidationerror')) return true;
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('unknown arg') ||
    message.includes('invalid value provided') ||
    message.includes('invalid enum value') ||
    (message.includes('argument') && message.includes('missing'))
  );
};

const parseOptionalDateInput = (value: any, fieldLabel: string) => {
  if (value === undefined) return undefined;
  if (value === null || String(value).trim() === '') return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw createValidationError(`${fieldLabel} is invalid.`, 'INVALID_DATE');
  }
  return parsed;
};

const defaultAdsConfig = {
  cpmByPlacement: {
    homepage: 6,
    homepage_feed: 5,
    community_feed: 5,
    feed: 5,
    scroll_preroll: 8,
    scroll_feed: 6,
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
    scroll_preroll: 0.65,
    scroll_feed: 0.45,
    forum_listing: 0.6,
    thread_detail: 0.5,
    chat_sidebar: 0.2,
    chat: 0.2
  },
  regionalMultipliers: {},
  minBudget: 10,
  maxBudget: 10000,
  maxPlacementsPerAd: 8,
  maxImageAssets: 6,
  maxVideoAssets: 1,
  approvalMode: 'manual',
  autoApproveAds: false,
  notifyAdminOnAdCreate: true,
  allowedPlacements: DEFAULT_ALLOWED_PLACEMENTS,
  targetCountries: DEFAULT_AD_TARGET_COUNTRIES,
  allowedMediaTypes: ['text', 'image', 'video'],
  requireLoginToInteract: false,
  scrollAds: {
    enabled: true,
    fallbackToCommunityFeed: true,
    videoSkipDelaySeconds: 10,
    staticSkipDelaySeconds: 3,
    firstAdAfterScrolls: 1,
    repeatEveryScrolls: 5,
    minSecondsBetweenAds: 90,
    maxAdsPerSession: 6,
    maxAdsPerViewerDay: 20,
    perAdCooldownMinutes: 30,
    placementPacing: {
      scroll_preroll: 2,
      scroll_feed: 1
    }
  }
};

const resolveAllowedPlacements = (raw: any): string[] => {
  const source = Array.isArray(raw) ? raw : [];
  const normalized = source
    .map((item) => normalizePlacement(item))
    .filter((placement) => DEFAULT_ALLOWED_PLACEMENTS.includes(placement));
  return Array.from(new Set([...(normalized.length ? normalized : DEFAULT_ALLOWED_PLACEMENTS), ...DEFAULT_ALLOWED_PLACEMENTS]));
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

const toBoundedInteger = (value: any, fallback: number, min: number, max: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
};

const sanitizeScrollAdsConfig = (raw: any) => {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const fallback = defaultAdsConfig.scrollAds;
  const pacingInput = input.placementPacing && typeof input.placementPacing === 'object' ? input.placementPacing : {};
  const scrollPrerollWeight = toBoundedInteger(
    pacingInput.scroll_preroll ?? input.scrollPrerollWeight,
    fallback.placementPacing.scroll_preroll,
    0,
    10
  );
  const scrollFeedWeight = toBoundedInteger(
    pacingInput.scroll_feed ?? input.scrollFeedWeight,
    fallback.placementPacing.scroll_feed,
    0,
    10
  );

  return {
    enabled: input.enabled !== false,
    fallbackToCommunityFeed: input.fallbackToCommunityFeed !== false,
    videoSkipDelaySeconds: toBoundedInteger(input.videoSkipDelaySeconds, fallback.videoSkipDelaySeconds, 0, 60),
    staticSkipDelaySeconds: toBoundedInteger(input.staticSkipDelaySeconds, fallback.staticSkipDelaySeconds, 0, 30),
    firstAdAfterScrolls: toBoundedInteger(input.firstAdAfterScrolls, fallback.firstAdAfterScrolls, 1, 50),
    repeatEveryScrolls: toBoundedInteger(input.repeatEveryScrolls, fallback.repeatEveryScrolls, 1, 100),
    minSecondsBetweenAds: toBoundedInteger(input.minSecondsBetweenAds, fallback.minSecondsBetweenAds, 0, 3600),
    maxAdsPerSession: toBoundedInteger(input.maxAdsPerSession, fallback.maxAdsPerSession, 0, 100),
    maxAdsPerViewerDay: toBoundedInteger(input.maxAdsPerViewerDay, fallback.maxAdsPerViewerDay, 0, 500),
    perAdCooldownMinutes: toBoundedInteger(input.perAdCooldownMinutes, fallback.perAdCooldownMinutes, 0, 1440),
    placementPacing: {
      scroll_preroll: scrollPrerollWeight,
      scroll_feed: scrollFeedWeight
    }
  };
};

const resolveAdDeliveryPlacements = (ad: any): string[] => {
  const targeting = parseTargeting(ad?.targeting);
  const rawPlacements: any[] = [];
  if (Array.isArray(targeting.placements)) rawPlacements.push(...targeting.placements);
  if (Array.isArray(ad?.placements)) rawPlacements.push(...ad.placements);
  if (ad?.placement) rawPlacements.push(ad.placement);

  return Array.from(
    new Set(
      rawPlacements
        .map((entry) => normalizePlacement(entry))
        .filter((entry) => DEFAULT_ALLOWED_PLACEMENTS.includes(entry))
    )
  );
};

const hasSettledAdPaymentSnapshot = (ad: any) => {
  if (String(ad?.paymentTransactionId || '').trim()) return true;
  const payments = Array.isArray(ad?.payments) ? ad.payments : [];
  return payments.some((payment) =>
    AD_PAYMENT_COMPLETED_STATUSES.includes(String(payment?.status || '').trim().toLowerCase() as any)
  );
};

const isVideoCreativeAsset = (asset: any) => {
  const mimeType = String(asset?.mimeType || asset?.mime_type || asset?.type || '').trim().toLowerCase();
  const url = String(asset?.url || asset?.downloadUrl || asset?.download_url || '').trim().toLowerCase();
  return mimeType === 'video' || mimeType.startsWith('video/') || /\.(mp4|mov|m4v|webm|ogg)(\?|$)/i.test(url);
};

const buildAdDeliveryDiagnostics = (ad: any, configInput?: any) => {
  const config = mergeAdsConfig(configInput || defaultAdsConfig);
  const allowedPlacements = resolveAllowedPlacements(config.allowedPlacements);
  const allowedSet = new Set(allowedPlacements);
  const scrollAds = sanitizeScrollAdsConfig(config.scrollAds);
  const placements = resolveAdDeliveryPlacements(ad);
  const status = String(ad?.status || '').toUpperCase();
  const now = Date.now();
  const remainingBudget = Number(ad?.remainingBudget ?? ad?.budget ?? 0);
  const startTime = ad?.startAt ? new Date(ad.startAt).getTime() : null;
  const endTime = ad?.endAt ? new Date(ad.endAt).getTime() : null;
  const mediaFileIds = Array.isArray(ad?.mediaFileIds)
    ? ad.mediaFileIds.map((id: any) => String(id || '').trim()).filter(Boolean)
    : [];
  const mediaAssets = Array.isArray(ad?.media) ? ad.media : [];
  const hasVideoCreative = mediaAssets.some((asset) => isVideoCreativeAsset(asset));

  const blockers: string[] = [];
  const warnings: string[] = [];

  if (status !== 'ACTIVE') blockers.push(`Campaign status is ${status || 'UNKNOWN'}, not ACTIVE.`);
  if (!hasSettledAdPaymentSnapshot(ad)) blockers.push('Campaign has no settled payment record.');
  if (remainingBudget <= 0) blockers.push('Campaign has no remaining budget.');
  if (startTime && startTime > now) blockers.push('Campaign flight has not started yet.');
  if (endTime && endTime < now) blockers.push('Campaign flight has ended.');
  if (!placements.length) blockers.push('Campaign has no valid delivery placements.');
  if (!mediaFileIds.length && placements.some((placement) => placement.startsWith('scroll_'))) {
    blockers.push('Scroll placements require at least one creative asset.');
  } else if (!mediaFileIds.length) {
    warnings.push('No creative asset is attached; delivery may be limited on visual placements.');
  }
  if (placements.includes('scroll_preroll') && mediaAssets.length > 0 && !hasVideoCreative) {
    blockers.push('Scroll pre-roll delivery requires at least one video creative.');
  }

  const placementChecks = placements.map((placement) => {
    const placementBlockers: string[] = [];
    if (!allowedSet.has(placement)) placementBlockers.push('Placement is disabled by ads configuration.');
    if (placement.startsWith('scroll_') && !scrollAds.enabled) {
      placementBlockers.push('Scroll ad delivery is disabled by ads configuration.');
    }
    if (placement === 'scroll_preroll' && Number(scrollAds.placementPacing.scroll_preroll || 0) <= 0) {
      placementBlockers.push('Scroll pre-roll pacing weight is zero.');
    }
    if (placement === 'scroll_feed' && Number(scrollAds.placementPacing.scroll_feed || 0) <= 0) {
      placementBlockers.push('Scroll feed pacing weight is zero.');
    }
    return {
      placement,
      eligible: placementBlockers.length === 0,
      blockers: placementBlockers
    };
  });

  const eligiblePlacements = placementChecks
    .filter((check) => check.eligible)
    .map((check) => check.placement);

  if (placements.length > 0 && eligiblePlacements.length === 0) {
    blockers.push('No selected placement is currently eligible for delivery.');
  }

  const isServing = blockers.length === 0 && eligiblePlacements.length > 0;
  const summary = isServing
    ? 'Campaign is eligible for live delivery.'
    : blockers[0] || 'Campaign is not eligible for live delivery.';

  return {
    isServing,
    summary,
    status,
    placements,
    eligiblePlacements,
    placementChecks,
    blockers,
    warnings,
    remainingBudget,
    mediaAssetCount: mediaFileIds.length,
    hasSettledPayment: hasSettledAdPaymentSnapshot(ad),
    hasVideoCreative,
    scrollPolicy: {
      enabled: scrollAds.enabled,
      firstAdAfterScrolls: scrollAds.firstAdAfterScrolls,
      repeatEveryScrolls: scrollAds.repeatEveryScrolls,
      maxAdsPerSession: scrollAds.maxAdsPerSession,
      videoSkipDelaySeconds: scrollAds.videoSkipDelaySeconds,
      placementPacing: scrollAds.placementPacing
    },
    checkedAt: new Date().toISOString()
  };
};

const mergeAdsConfig = (raw: any) => {
  const input = raw && typeof raw === 'object' ? raw : {};
  const cpmByPlacement = { ...defaultAdsConfig.cpmByPlacement, ...(input.cpmByPlacement || {}) } as Record<string, any>;
  const cpcByPlacement = { ...defaultAdsConfig.cpcByPlacement, ...(input.cpcByPlacement || {}) } as Record<string, any>;
  const normalizedAllowedPlacements = resolveAllowedPlacements(input.allowedPlacements);
  const normalizedTargetCountries = normalizeCountryList(input.targetCountries, DEFAULT_AD_TARGET_COUNTRIES);
  const normalized = {
    ...defaultAdsConfig,
    ...input,
    cpmByPlacement,
    cpcByPlacement,
    allowedPlacements: normalizedAllowedPlacements,
    targetCountries: normalizedTargetCountries,
    scrollAds: sanitizeScrollAdsConfig(input.scrollAds),
    maxPlacementsPerAd: Math.max(1, Math.min(8, Number(input.maxPlacementsPerAd ?? defaultAdsConfig.maxPlacementsPerAd))),
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

const buildPublicAdsRuntimeConfig = (config: any) => {
  const merged = mergeAdsConfig(config || defaultAdsConfig);
  return {
    allowedPlacements: merged.allowedPlacements,
    scrollAds: sanitizeScrollAdsConfig(merged.scrollAds)
  };
};

const resolvePostPaymentAdStatus = async (
  ad: any
): Promise<{ status: 'ACTIVE' | 'SUBMITTED_FOR_REVIEW'; blockers: string[] }> => {
  try {
    const adsConfigSetting = await prisma.appSetting.findUnique({ where: { scope: ADS_CONFIG_SCOPE } });
    const adsConfig = mergeAdsConfig((adsConfigSetting?.data as any) || defaultAdsConfig);
    const autoApprove =
      adsConfig.autoApproveAds || String(adsConfig.approvalMode || '').toLowerCase() === 'auto';
    if (!autoApprove) {
      return { status: 'SUBMITTED_FOR_REVIEW', blockers: [] };
    }
    const readiness = await buildCommunityAdActivationReadiness(ad);
    if (!readiness.canActivate) {
      return { status: 'SUBMITTED_FOR_REVIEW', blockers: readiness.blockers };
    }
    return { status: 'ACTIVE', blockers: [] };
  } catch (error) {
    console.warn('[community_ads] Failed to resolve post-payment status; falling back to review queue.', error);
    return { status: 'SUBMITTED_FOR_REVIEW', blockers: [] };
  }
};

const emitAdStatusUpdated = (req: Request, adId: string, status: string) => {
  const io = (req.app as any).get('io');
  const communityIo = (req.app as any).get('communityIo');
  try { io?.emit('community:ad_status_updated', { adId, status }); } catch (e) {}
  try { communityIo?.emit('community:ad_status_updated', { adId, status }); } catch (e) {}
  try { realtime.emitToAd(adId, 'community:ad_status_updated', { adId, status }); } catch (e) {}
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

const sanitizeJsonValue = (value: any): any => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (Array.isArray(value)) {
    return value
      .map((entry) => sanitizeJsonValue(entry))
      .filter((entry) => entry !== undefined);
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  if (typeof value === 'object') {
    const output: Record<string, any> = {};
    Object.entries(value).forEach(([key, entry]) => {
      const normalized = sanitizeJsonValue(entry);
      if (normalized !== undefined) output[key] = normalized;
    });
    return output;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return null;
  return value;
};

const extractPlacements = (payload: any, adsConfig: any, existingPrimaryPlacement?: string): string[] => {
  const maxPlacements = Math.max(1, Math.min(8, Number(adsConfig?.maxPlacementsPerAd ?? defaultAdsConfig.maxPlacementsPerAd)));
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

const getOrCreateWallet = async (userId: string) => {
  let wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (wallet) return wallet;
  wallet = await prisma.wallet.create({
    data: {
      userId,
      balance: 0,
      pendingClearance: 0,
      escrowBalance: 0,
      currency: 'USD',
      isActive: true
    }
  });
  return wallet;
};

const normalizeComparableString = (value: any) => String(value ?? '').trim();

const normalizeComparableList = (value: any): string[] => {
  const source = Array.isArray(value) ? value : value === undefined || value === null ? [] : [value];
  return Array.from(
    new Set(source.map((entry) => String(entry || '').trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
};

const areComparableListsEqual = (left: any, right: any) => {
  const a = normalizeComparableList(left);
  const b = normalizeComparableList(right);
  if (a.length !== b.length) return false;
  return a.every((entry, index) => entry === b[index]);
};

const adPayloadHas = (payload: any, key: string) =>
  Object.prototype.hasOwnProperty.call(payload || {}, key);

const isMajorAdUpdate = (
  payload: any,
  existing: any,
  allowed: any,
  existingTargeting: Record<string, any>,
  nextTargeting: Record<string, any>,
  nextPlacements: string[]
) => {
  const stringFields = [
    'title',
    'body',
    'objective',
    'destinationType',
    'destinationUrl',
    'ctaText'
  ];
  for (const field of stringFields) {
    if (!adPayloadHas(payload, field)) continue;
    const nextValue = normalizeComparableString(allowed[field]);
    const previousValue = normalizeComparableString(existing?.[field]);
    if (nextValue !== previousValue) return true;
  }

  if ((adPayloadHas(payload, 'placement') || adPayloadHas(payload, 'placements')) &&
      !areComparableListsEqual(nextPlacements, resolveAdDeliveryPlacements(existing))) {
    return true;
  }

  if (adPayloadHas(payload, 'mediaFileIds') &&
      !areComparableListsEqual(allowed.mediaFileIds || [], existing?.mediaFileIds || [])) {
    return true;
  }

  if (adPayloadHas(payload, 'targetCountries') &&
      !areComparableListsEqual(nextTargeting.targetCountries || [], existingTargeting.targetCountries || [])) {
    return true;
  }

  if (adPayloadHas(payload, 'targetAudience') &&
      normalizeComparableString(nextTargeting.targetAudience || '') !== normalizeComparableString(existingTargeting.targetAudience || '')) {
    return true;
  }

  if (adPayloadHas(payload, 'targeting')) {
    const reviewKeys = [
      'promotionType',
      'promotionEntityId',
      'promotionEntitySlug',
      'promotionEntityUrl',
      'promotionTitle',
      'promotionSubtitle'
    ];
    for (const key of reviewKeys) {
      if (
        normalizeComparableString(nextTargeting[key]) !==
        normalizeComparableString(existingTargeting[key])
      ) {
        return true;
      }
    }
  }

  return false;
};

const normalizePaymentMethod = (value: any): string => {
  const raw = String(value || 'stripe').trim().toLowerCase();
  if (!raw) return 'stripe';
  const compact = raw.replace(/[\s-]+/g, '_');

  if (compact === 'balance' || compact === 'wallet' || compact === 'wallet_balance' || compact.includes('wallet')) {
    return 'wallet';
  }
  if (compact === 'card' || compact === 'credit_card' || compact === 'debit_card' || compact.includes('stripe')) {
    return 'stripe';
  }
  return compact;
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
  const normalizedIds = ids.filter((id) => byId.has(id));
  const missing = ids.filter((id) => !byId.has(id));
  if (missing.length) {
    console.warn(`[community_ads] Ignoring ${missing.length} missing media file(s) during validation.`);
  }

  let imageCount = 0;
  let videoCount = 0;
  for (const id of normalizedIds) {
    const mimeType = String(byId.get(id)?.mimeType || '').toLowerCase();
    if (mimeType.startsWith('video/')) videoCount += 1;
    else imageCount += 1;
  }
  if (imageCount > maxImages) {
    throw createValidationError(
      `You can upload up to ${maxImages} images per ad campaign.`,
      'MEDIA_IMAGES_LIMIT'
    );
  }
  if (videoCount > maxVideos) {
    throw createValidationError(
      `You can upload only ${maxVideos} video per ad campaign.`,
      'MEDIA_VIDEOS_LIMIT'
    );
  }

  return { ids: normalizedIds, imageCount, videoCount };
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

const normalizePromotionType = (value: any): 'post' | 'page' | null => {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'post') return 'post';
  if (normalized === 'page' || normalized === 'business-page' || normalized === 'business_page') return 'page';
  return null;
};

const buildPlatformPromotionUrl = (type: 'post' | 'page', entityId: string, slug?: string | null) => {
  if (type === 'post') return `${PLATFORM_ORIGIN}/post/${encodeURIComponent(entityId)}`;
  const safeSlug = String(slug || '').trim();
  if (!safeSlug) throw createValidationError('Promotion page slug is required.', 'PROMOTION_PAGE_REQUIRED');
  return `${PLATFORM_ORIGIN}/company/${encodeURIComponent(safeSlug)}`;
};

const resolvePromotionTargeting = async (rawTargeting: Record<string, any>, userId: string) => {
  const targeting = rawTargeting && typeof rawTargeting === 'object' ? { ...rawTargeting } : {};
  const promotionType = normalizePromotionType(targeting.promotionType);

  if (!promotionType) {
    delete targeting.promotionType;
    delete targeting.promotionEntityId;
    delete targeting.promotionEntitySlug;
    delete targeting.promotionEntityUrl;
    delete targeting.promotionTitle;
    delete targeting.promotionSubtitle;
    return targeting;
  }

  if (promotionType === 'post') {
    const postId = String(targeting.promotionEntityId || '').trim();
    if (!postId) throw createValidationError('Promotion post is required.', 'PROMOTION_POST_REQUIRED');

    const post = await prisma.communityPost.findUnique({
      where: { id: postId },
      select: {
        id: true,
        authorId: true,
        title: true,
        content: true,
        businessPage: { select: { name: true } }
      }
    });

    if (!post || post.authorId !== userId) {
      throw createValidationError('You can only promote posts you own.', 'PROMOTION_POST_INVALID');
    }

    targeting.promotionType = 'post';
    targeting.promotionEntityId = post.id;
    targeting.promotionEntitySlug = null;
    targeting.promotionEntityUrl = buildPlatformPromotionUrl('post', post.id);
    targeting.promotionTitle = String(post.title || '').trim() || 'Promoted Post';
    targeting.promotionSubtitle = String(post.businessPage?.name || '').trim() || 'Community Post';
    return targeting;
  }

  const pageId = String(targeting.promotionEntityId || '').trim();
  const pageSlug = String(targeting.promotionEntitySlug || '').trim();
  if (!pageId && !pageSlug) {
    throw createValidationError('Promotion page is required.', 'PROMOTION_PAGE_REQUIRED');
  }

  const page = await prisma.communityBusinessPage.findFirst({
    where: {
      ownerId: userId,
      ...(pageId ? { id: pageId } : { slug: pageSlug })
    },
    select: {
      id: true,
      ownerId: true,
      name: true,
      slug: true,
      tagline: true,
      category: true
    }
  });

  if (!page) {
    throw createValidationError('You can only promote pages you own.', 'PROMOTION_PAGE_INVALID');
  }

  targeting.promotionType = 'page';
  targeting.promotionEntityId = page.id;
  targeting.promotionEntitySlug = page.slug;
  targeting.promotionEntityUrl = buildPlatformPromotionUrl('page', page.id, page.slug);
  targeting.promotionTitle = String(page.name || '').trim() || 'Promoted Page';
  targeting.promotionSubtitle = String(page.tagline || page.category || '').trim() || 'Business Page';
  return targeting;
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
        error: `Minimum ad budget is ${minBudget} ${normalizeCurrencyCode(payload.currency, 'USD')}.`
      });
    }
    if (budget > maxBudget) {
      return res.status(400).json({
        success: false,
        error: `Maximum ad budget is ${maxBudget} ${normalizeCurrencyCode(payload.currency, 'USD')}.`
      });
    }

    const durationDays = Number(payload.durationDays || 0);
    const normalizedDurationDays = Number.isFinite(durationDays) && durationDays > 0 ? Math.floor(durationDays) : 7;
    const parsedStartAt = parseOptionalDateInput(payload.startAt, 'Start date');
    const parsedEndAt = parseOptionalDateInput(payload.endAt, 'End date');
    const startAt = parsedStartAt || new Date();
    const endAt =
      parsedEndAt ||
      new Date(startAt.getTime() + normalizedDurationDays * 24 * 60 * 60 * 1000);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      throw createValidationError('Campaign schedule dates are invalid.', 'INVALID_DATE');
    }
    if (endAt.getTime() <= startAt.getTime()) {
      throw createValidationError('End date must be after start date.', 'INVALID_DATE_RANGE');
    }

    const maxImages = Math.max(1, Math.min(12, Number(adsConfig.maxImageAssets ?? 6)));
    const maxVideos = Math.max(1, Math.min(3, Number(adsConfig.maxVideoAssets ?? 1)));
    const normalizedMedia = await validateAndNormalizeMedia(payload.mediaFileIds || [], maxImages, maxVideos);

    const incomingTargeting = await resolvePromotionTargeting(parseTargeting(payload.targeting), userId);
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
    const targeting = sanitizeJsonValue({
      ...incomingTargeting,
      placements,
      targetCountries,
      targetAudience: normalizedTargetAudience,
      pricingModel,
      dailySpend,
      estimated
    }) || {};

    const ad = await prisma.communityAd.create({
      data: {
        creatorId: userId,
        title: String(payload.title || 'Untitled Ad'),
        body: String(payload.body || ''),
        objective,
        destinationType,
        destinationUrl,
        ctaText: payload.ctaText || null,
        placement: primaryPlacement,
        targeting,
        mediaFileIds: normalizedMedia.ids,
        budget,
        remainingBudget: budget,
        currency: normalizeCurrencyCode(payload.currency, 'USD'),
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
    if (Number(error?.statusCode || 0) === 400) {
      return res.status(400).json({
        success: false,
        code: error?.code || 'VALIDATION_ERROR',
        error: error?.message || 'Invalid ad payload.'
      });
    }
    const prismaCode = String(error?.code || '').toUpperCase();
    if (prismaCode.startsWith('P')) {
      return res.status(400).json({
        success: false,
        code: prismaCode || 'DB_VALIDATION_ERROR',
        error: 'Invalid ad payload. Please review destination URL, targeting, media, and budget values.'
      });
    }
    if (isPrismaValidationLikeError(error)) {
      return res.status(400).json({
        success: false,
        code: 'DB_VALIDATION_ERROR',
        error: 'Invalid ad payload. Please review destination URL, placement, budget, and scheduling values.'
      });
    }
    return res.status(500).json({ success: false, error: error.message || 'Failed to create ad' });
  }
};

export const getListingBoostPrefill = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const listingId = String(req.params.listingId || '').trim();
    if (!listingId) {
      return res.status(400).json({ success: false, error: 'Missing listing id' });
    }

    const data = await buildMarketplaceListingBoostPrefill(userId, listingId);
    return res.json({ success: true, data });
  } catch (error: any) {
    const status = Number(error?.status || error?.statusCode || 500);
    return res.status(status >= 400 && status < 600 ? status : 500).json({
      success: false,
      error: error?.message || 'Failed to prepare marketplace boost prefill.'
    });
  }
};

export const payAd = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const adId = req.params.id;
    const existingAd = await prisma.communityAd.findUnique({ where: { id: adId } });
    const ad = existingAd;
    if (!ad) return res.status(404).json({ success: false, error: 'Ad not found' });
    if (ad.creatorId !== userId) return res.status(403).json({ success: false, error: 'Forbidden' });

    const payload = req.body || {};
    const requestedMethod =
      payload.paymentMethodId ||
      payload.gatewayId ||
      payload.method ||
      payload.gateway ||
      'stripe';
    const paymentMethodId = normalizePaymentMethod(requestedMethod);

    if (payload.currency) {
      await prisma.communityAd.update({
        where: { id: adId },
        data: { currency: normalizeCurrencyCode(payload.currency, String(ad.currency || 'USD')) }
      });
    }

    const currentAd =
      payload.currency !== undefined
        ? await prisma.communityAd.findUnique({ where: { id: adId } })
        : ad;
    if (!currentAd) return res.status(404).json({ success: false, error: 'Ad not found' });

    const amount = Math.max(0, Number(currentAd.budget || 0));
    if (amount <= 0) return res.status(400).json({ success: false, error: 'Invalid budget amount' });

    const normalizedAdStatus = String(currentAd.status || '').toUpperCase();
    if (AD_PAYMENT_SETTLED_AD_STATUSES.has(normalizedAdStatus)) {
      const settledPayment = await prisma.adPayment.findFirst({
        where: {
          adId,
          status: {
            in: [...AD_PAYMENT_COMPLETED_STATUSES]
          }
        },
        orderBy: { createdAt: 'desc' }
      });
      if (settledPayment) {
        let resolvedStatus = normalizedAdStatus;
        let statusBlockers: string[] = [];
        if (normalizedAdStatus === 'PAID') {
          const resolution = await resolvePostPaymentAdStatus({
            ...currentAd,
            payments: settledPayment ? [settledPayment] : []
          });
          resolvedStatus = resolution.status;
          statusBlockers = resolution.blockers;
          await prisma.communityAd.update({
            where: { id: adId },
            data: {
              status: resolvedStatus as any,
              paymentTransactionId:
                currentAd.paymentTransactionId || settledPayment.transactionId || currentAd.paymentTransactionId || null
            }
          });
          emitAdStatusUpdated(req, adId, resolvedStatus);
          if (resolvedStatus === 'ACTIVE') {
            await notifyCreatorAdStatus(adId, 'ACTIVE', null).catch(() => undefined);
          }
        }
        return res.json({
          success: true,
          message:
            resolvedStatus === 'ACTIVE'
              ? 'Ad payment is already completed and the campaign is live.'
              : statusBlockers.length > 0
                ? `Ad payment is already completed. Campaign is queued for review because ${statusBlockers[0].charAt(0).toLowerCase()}${statusBlockers[0].slice(1)}`
                : 'Ad payment is already completed.',
          data: {
            paymentMethodId,
            status: resolvedStatus.toLowerCase(),
            alreadyPaid: true,
            blockers: statusBlockers
          }
        });
      }
    }

    const userRole = String(req.user?.role || '').toLowerCase();
    const frontendBase = process.env.FRONTEND_URL || process.env.APP_URL || PLATFORM_ORIGIN || 'http://localhost:3000';
    const dashboardPath =
      userRole.includes('freelancer') || userRole.includes('seller')
        ? '/freelancer/dashboard'
        : '/client/dashboard';
    const successUrl = `${frontendBase}${dashboardPath}?tab=my-ads&ad_payment=success&ad_id=${encodeURIComponent(adId)}&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${frontendBase}${dashboardPath}?tab=my-ads&ad_payment=cancel&ad_id=${encodeURIComponent(adId)}`;

    if (paymentMethodId === 'wallet') {
      const wallet = await getOrCreateWallet(userId);
      const walletCurrency = normalizeCurrencyCode(wallet.currency, 'USD');
      const adCurrency = normalizeCurrencyCode(currentAd.currency, 'USD');

      if (wallet.frozen) {
        return res.status(400).json({ success: false, error: 'Wallet is frozen.' });
      }
      if (walletCurrency !== adCurrency) {
        return res.status(400).json({
          success: false,
          error: `Wallet currency ${walletCurrency} does not match ${adCurrency}.`
        });
      }

      const walletRef = `ad-wallet-${adId}-${Date.now()}`;
      try {
        const resolution = await resolvePostPaymentAdStatus({
          ...currentAd,
          paymentTransactionId: walletRef,
          payments: [{ status: 'completed' }]
        });
        const nextStatus = resolution.status;
        await prisma.$transaction(async (tx) => {
          const freshWallet = await tx.wallet.findUnique({ where: { id: wallet.id } });
          if (!freshWallet) throw new Error('Wallet not found.');
          if (freshWallet.frozen) throw new Error('Wallet is frozen.');
          if (Number(freshWallet.balance || 0) < amount) throw new Error('Insufficient wallet balance.');

          await tx.wallet.update({
            where: { id: freshWallet.id },
            data: { balance: { decrement: amount } }
          });

          await tx.transaction.create({
            data: {
              walletId: freshWallet.id,
              userId,
              type: 'PAYMENT' as any,
              amount,
              currency: adCurrency,
              status: 'COMPLETED' as any,
              description: `Community ad payment: ${currentAd.title || 'Ad campaign'}`,
              referenceId: walletRef,
              metadata: {
                adId,
                source: 'community_ads',
                paymentMethodId: 'wallet'
              }
            }
          });

          await tx.adPayment.create({
            data: {
              adId,
              transactionId: walletRef,
              amount,
              currency: adCurrency,
              status: 'completed'
            }
          });

          await tx.communityAd.update({
            where: { id: adId },
            data: { status: nextStatus, paymentTransactionId: walletRef }
          });
        });

        emitAdStatusUpdated(req, adId, nextStatus);
        if (nextStatus === 'ACTIVE') {
          await notifyCreatorAdStatus(adId, 'ACTIVE', null).catch(() => undefined);
        }

        return res.json({
          success: true,
          message:
            nextStatus === 'ACTIVE'
              ? 'Ad payment completed and campaign is live.'
              : resolution.blockers.length > 0
                ? `Ad payment completed. Campaign submitted for review because ${resolution.blockers[0].charAt(0).toLowerCase()}${resolution.blockers[0].slice(1)}`
                : 'Ad payment completed and campaign submitted for review.',
          data: {
            paymentMethodId: 'wallet',
            status: nextStatus.toLowerCase(),
            submittedForReview: nextStatus === 'SUBMITTED_FOR_REVIEW',
            active: nextStatus === 'ACTIVE',
            blockers: resolution.blockers
          }
        });
      } catch (walletError: any) {
        const message = String(walletError?.message || '').toLowerCase();
        if (message.includes('insufficient wallet')) {
          return res.status(400).json({ success: false, error: 'Insufficient wallet balance.' });
        }
        if (message.includes('wallet is frozen')) {
          return res.status(400).json({ success: false, error: 'Wallet is frozen.' });
        }
        throw walletError;
      }
    }

    if (paymentMethodId !== 'stripe') {
      return res.status(400).json({
        success: false,
        code: 'PAYMENT_METHOD_UNSUPPORTED',
        error:
          'Selected payment method is not available for direct ad checkout yet. Choose Stripe Payment or Wallet Balance.'
      });
    }

    const stripeClient = await getStripeClient();
    if (!stripeClient) {
      return res.status(400).json({
        success: false,
        error: 'Stripe Payment is not configured. Please contact support or choose another payment method.'
      });
    }

    let checkoutSession = await stripeClient.checkout.sessions.create({
      mode: 'payment',
      ui_mode: 'hosted',
      payment_method_types: ['card'],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: adId,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: normalizeCurrencyCode(currentAd.currency, 'USD').toLowerCase(),
            unit_amount: Math.round(amount * 100),
            product_data: {
              name: currentAd.title || 'Scrolith Ad Campaign',
              description: 'Community ad campaign prepayment'
            }
          }
        }
      ],
      metadata: {
        adId,
        creatorId: userId,
        source: 'community_ads'
      },
      payment_intent_data: {
        metadata: {
          adId,
          creatorId: userId,
          source: 'community_ads'
        }
      }
    });

    if (!checkoutSession?.url) {
      try {
        checkoutSession = await stripeClient.checkout.sessions.retrieve(checkoutSession.id);
      } catch (refreshError) {
        console.warn('Unable to refresh checkout session URL for ad payment:', refreshError);
      }
    }
    const checkoutUrl = checkoutSession?.url || null;
    if (!checkoutUrl) {
      return res.status(400).json({
        success: false,
        code: 'PAYMENT_INIT_FAILED',
        error: 'Unable to create checkout URL for this campaign. Please try again.'
      });
    }

    await prisma.communityAd.update({ where: { id: adId }, data: { status: 'AWAITING_PAYMENT' } });
    const io = (req.app as any).get('io');
    try { io?.emit('community:ad_status_updated', { adId, status: 'AWAITING_PAYMENT' }); } catch (e) {}
    try {
      io?.emit('community:ad_payment_initiated', { adId, checkoutSessionId: checkoutSession.id, paymentMethodId: 'stripe' });
    } catch (e) {}
    try { realtime.emitToAd(adId, 'community:ad_status_updated', { adId, status: 'AWAITING_PAYMENT' }); } catch (e) {}
    try {
      realtime.emitToAd(adId, 'community:ad_payment_initiated', {
        adId,
        checkoutSessionId: checkoutSession.id,
        paymentMethodId: 'stripe'
      });
    } catch (e) {}

    return res.json({
      success: true,
      message: 'Redirecting to checkout.',
      data: {
        paymentMethodId: 'stripe',
        checkoutSessionId: checkoutSession.id,
        redirect_url: checkoutUrl,
        checkout_url: checkoutUrl,
        success_url: successUrl,
        cancel_url: cancelUrl
      }
    });
  } catch (error: any) {
    console.error('Pay ad error:', error);
    if (error?.type === 'StripeAuthenticationError' || Number(error?.statusCode || 0) === 401) {
      return res.status(400).json({
        success: false,
        error: 'Stripe credentials are invalid. Please update Stripe Payment settings in the admin payment gateways.'
      });
    }
    if (
      error?.type === 'StripeInvalidRequestError' ||
      error?.type === 'StripeAPIError' ||
      Number(error?.statusCode || 0) === 400
    ) {
      return res.status(400).json({
        success: false,
        code: 'PAYMENT_INIT_FAILED',
        error: error?.message || 'Unable to initialize checkout with the selected payment method.'
      });
    }
    return res.status(500).json({ success: false, error: error.message || 'Failed to create payment' });
  }
};

export const submitAd = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const adId = req.params.id;
    const payload = req.body || {};
    const ad = await prisma.communityAd.findUnique({ where: { id: adId } });
    if (!ad) return res.status(404).json({ success: false, error: 'Ad not found' });
    if (ad.creatorId !== userId) return res.status(403).json({ success: false, error: 'Forbidden' });

    const currentStatus = String(ad.status || '').toUpperCase();
    if (currentStatus === 'SUBMITTED_FOR_REVIEW' || currentStatus === 'ACTIVE') {
      return res.json({
        success: true,
        message: 'Ad is already submitted for review.',
        data: ad
      });
    }

    if (currentStatus !== 'PAID') {
      let completedPayment = await prisma.adPayment.findFirst({
        where: {
          adId,
          status: {
            in: [...AD_PAYMENT_COMPLETED_STATUSES]
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Fallback for delayed/missed webhook: reconcile paid Stripe checkout session directly.
      if (!completedPayment) {
        const requestedSessionId = String(
          payload.sessionId || payload.checkoutSessionId || payload.session_id || ''
        ).trim();
        const stripeClient = await getStripeClient();
        if (stripeClient) {
          try {
            let paidSession: any = null;

            if (requestedSessionId) {
              const session = await stripeClient.checkout.sessions.retrieve(requestedSessionId);
              if (
                String(session?.client_reference_id || '').trim() === adId &&
                String(session?.payment_status || '').toLowerCase() === 'paid'
              ) {
                paidSession = session;
              }
            }

            if (!paidSession) {
              const sessions = await stripeClient.checkout.sessions.list({
                limit: 100
              });
              paidSession =
                sessions.data.find(
                  (session: any) =>
                    String(session?.client_reference_id || '').trim() === adId &&
                    String(session?.payment_status || '').toLowerCase() === 'paid'
                ) || null;
            }

            if (paidSession) {
              const checkoutSessionId = String(paidSession.id || requestedSessionId || '').trim();
              const paymentIntentId =
                typeof paidSession.payment_intent === 'string'
                  ? String(paidSession.payment_intent).trim()
                  : '';
              const transactionId =
                paymentIntentId || checkoutSessionId || `ad-stripe-${adId}-${Date.now()}`;
              const amountFromSession = Number(paidSession.amount_total || 0);
              const amount =
                Number.isFinite(amountFromSession) && amountFromSession > 0
                  ? amountFromSession / 100
                  : Math.max(0, Number(ad.budget || 0));
              const currency = normalizeCurrencyCode(
                paidSession.currency,
                normalizeCurrencyCode(ad.currency, 'USD')
              );

              await prisma.$transaction(async (tx) => {
                const paymentRefs = Array.from(
                  new Set([transactionId, checkoutSessionId].filter(Boolean))
                );
                const existingCompleted = await tx.adPayment.findFirst({
                  where: {
                    adId,
                    status: { in: [...AD_PAYMENT_COMPLETED_STATUSES] },
                    ...(paymentRefs.length ? { transactionId: { in: paymentRefs } } : {})
                  },
                  orderBy: { createdAt: 'desc' }
                });

                if (!existingCompleted) {
                  await tx.adPayment.create({
                    data: {
                      adId,
                      transactionId,
                      amount: Math.max(0, Number(amount || 0)),
                      currency,
                      status: 'completed'
                    }
                  });
                }

                await tx.communityAd.update({
                  where: { id: adId },
                  data: {
                    status: 'PAID',
                    paymentTransactionId: transactionId
                  }
                });
              });

              const io = (req.app as any).get('io');
              try { io?.emit('community:ad_status_updated', { adId, status: 'PAID' }); } catch (e) {}
              try { realtime.emitToAd(adId, 'community:ad_status_updated', { adId, status: 'PAID' }); } catch (e) {}

              completedPayment = await prisma.adPayment.findFirst({
                where: {
                  adId,
                  status: {
                    in: [...AD_PAYMENT_COMPLETED_STATUSES]
                  }
                },
                orderBy: { createdAt: 'desc' }
              });
            }
          } catch (reconcileError) {
            console.warn('[community_ads] submit reconciliation failed:', reconcileError);
          }
        }
      }

      if (!completedPayment) {
        return res.status(400).json({
          success: false,
          code: 'PAYMENT_REQUIRED',
          error: {
            code: 'PAYMENT_REQUIRED',
            message: 'Ad must be paid before submission'
          }
        });
      }

      await prisma.communityAd.update({
        where: { id: adId },
        data: {
          status: 'PAID',
          paymentTransactionId:
            ad.paymentTransactionId || completedPayment.transactionId || ad.paymentTransactionId || null
        }
      });
    }

    const paidAd = await prisma.communityAd.findUnique({ where: { id: adId } });
    const resolution = await resolvePostPaymentAdStatus({
      ...(paidAd || ad),
      payments: []
    });
    const nextStatus = resolution.status;
    const updated = await prisma.communityAd.update({ where: { id: adId }, data: { status: nextStatus as any } });
    const io = (req.app as any).get('io');
    try { io?.emit('community:ad_status_updated', { adId, status: nextStatus }); } catch(e){}
    try { realtime.emitToAd(adId, 'community:ad_status_updated', { adId, status: nextStatus }); } catch (e) {}
    if (nextStatus === 'ACTIVE') {
      await notifyCreatorAdStatus(adId, 'ACTIVE', null).catch(() => undefined);
    }
    return res.json({
      success: true,
      message:
        nextStatus === 'ACTIVE'
          ? 'Ad payment completed and campaign is live.'
          : resolution.blockers.length > 0
            ? `Ad payment completed. Campaign submitted for review because ${resolution.blockers[0].charAt(0).toLowerCase()}${resolution.blockers[0].slice(1)}`
            : 'Ad payment completed and campaign submitted for review.',
      data: {
        ...updated,
        activationBlockers: resolution.blockers
      }
    });
  } catch (error: any) {
    console.error('Submit ad error:', error);
    if (Number(error?.statusCode || 0) === 400) {
      return res.status(400).json({
        success: false,
        code: error?.code || 'VALIDATION_ERROR',
        error: error?.message || 'Invalid submit request.'
      });
    }
    if (isPrismaValidationLikeError(error)) {
      return res.status(400).json({
        success: false,
        code: 'DB_VALIDATION_ERROR',
        error: 'Invalid ad data for submission. Please save your draft again and retry.'
      });
    }
    return res.status(500).json({ success: false, error: error.message || 'Failed to submit ad' });
  }
};

export const getMyAds = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const includeArchived =
      String(req.query.includeArchived || '')
        .trim()
        .toLowerCase() === 'true' ||
      String(req.query.includeArchived || '')
        .trim()
        .toLowerCase() === '1';

    const [ads, adsConfigSetting] = await Promise.all([
      prisma.communityAd.findMany({ where: { creatorId: userId }, orderBy: { createdAt: 'desc' } }),
      prisma.appSetting.findUnique({ where: { scope: ADS_CONFIG_SCOPE } })
    ]);
    const visibleAds = includeArchived
      ? ads
      : ads.filter((ad) => {
          const targeting = parseTargeting(ad.targeting);
          return !Boolean(targeting.userDeleted);
        });
    const hydrated = await hydrateAdsWithMedia(visibleAds);
    const adsConfig = adsConfigSetting?.data || defaultAdsConfig;
    return res.json({
      success: true,
      data: hydrated.map((ad) => ({
        ...ad,
        delivery: buildAdDeliveryDiagnostics(ad, adsConfig)
      }))
    });
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

    const [metrics, adsConfigSetting] = await Promise.all([
      prisma.adMetricsDaily.findMany({ where: { adId }, orderBy: { date: 'desc' } }),
      prisma.appSetting.findUnique({ where: { scope: ADS_CONFIG_SCOPE } })
    ]);
    const hydrated = (await hydrateAdsWithMedia([ad]))[0] || ad;
    const delivery = buildAdDeliveryDiagnostics(hydrated, adsConfigSetting?.data || defaultAdsConfig);
    return res.json({ success: true, data: { ad: hydrated, metrics, delivery } });
  } catch (error: any) {
    console.error('Get ad performance error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load performance' });
  }
};

// Admin endpoints
export const getReviewQueue = async (_req: Request, res: Response) => {
  try {
    const [ads, adsConfigSetting] = await Promise.all([
      prisma.communityAd.findMany({
        where: { status: 'SUBMITTED_FOR_REVIEW' },
        orderBy: { createdAt: 'asc' },
        include: { payments: true }
      }),
      prisma.appSetting.findUnique({ where: { scope: ADS_CONFIG_SCOPE } })
    ]);
    const hydrated = await hydrateAdsWithMedia(ads);
    const adsConfig = adsConfigSetting?.data || defaultAdsConfig;
    return res.json({
      success: true,
      data: hydrated.map((ad) => ({
        ...ad,
        delivery: buildAdDeliveryDiagnostics(ad, adsConfig)
      }))
    });
  } catch (error: any) {
    console.error('Get review queue error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load review queue' });
  }
};

export const approveAd = async (req: Request, res: Response) => {
  try {
    const adId = req.params.id;
    const existing = await prisma.communityAd.findUnique({ where: { id: adId } });
    if (!existing) return res.status(404).json({ success: false, error: 'Ad not found' });

    const readiness = await buildCommunityAdActivationReadiness(existing);
    if (!readiness.canActivate) {
      return res.status(400).json({
        success: false,
        code: 'AD_NOT_READY_FOR_DELIVERY',
        error: 'Campaign cannot go live yet.',
        data: { blockers: readiness.blockers, readiness }
      });
    }

    const ad = await prisma.communityAd.update({ where: { id: adId }, data: { status: 'ACTIVE' } });
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
      const stripeClient = await getStripeClient();
      const payments = await prisma.adPayment.findMany({ where: { adId } });
      for (const p of payments) {
        try {
          // attempt gateway refund if we have a transaction/payment intent id
          let refundResult: any = null;
          if (p.transactionId && stripeClient) {
            try {
              refundResult = await stripeClient.refunds.create({ payment_intent: p.transactionId } as any);
            } catch (stripeErr) {
              console.error('Stripe refund error for ad payment', p.id, stripeErr);
            }
          } else if (p.transactionId && !stripeClient) {
            console.warn('Stripe client unavailable while refunding ad payment', p.id);
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

    const readiness = await buildCommunityAdActivationReadiness(existing);
    if (!readiness.canActivate) {
      return res.status(400).json({
        success: false,
        code: 'AD_NOT_READY_FOR_DELIVERY',
        error: 'Campaign cannot be resumed yet.',
        data: { blockers: readiness.blockers, readiness }
      });
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
    const [agg, ads, adsConfigSetting] = await Promise.all([
      prisma.adMetricsDaily.aggregate({
        _sum: { impressions: true, clicks: true, spend: true }
      }),
      prisma.communityAd.findMany({
        include: {
          metrics: true
        }
      }),
      prisma.appSetting.findUnique({ where: { scope: ADS_CONFIG_SCOPE } })
    ]);
    const adsConfig = adsConfigSetting?.data || defaultAdsConfig;
    const totals = {
      impressions: Number(agg?._sum?.impressions || 0),
      clicks: Number(agg?._sum?.clicks || 0),
      spend: Number(agg?._sum?.spend || 0)
    };
    const byPlacementMap = new Map<
      string,
      {
        placement: string;
        campaigns: number;
        activeCampaigns: number;
        impressions: number;
        clicks: number;
        spend: number;
        remainingBudget: number;
      }
    >();
    const topCampaigns: any[] = [];
    const deliveryHealth = {
      serving: 0,
      blocked: 0,
      warning: 0,
      blockers: {} as Record<string, number>
    };

    for (const ad of ads as any[]) {
      const targeting = parseTargeting(ad.targeting);
      const placements = Array.isArray(targeting.placements)
        ? Array.from(new Set(targeting.placements.map((entry: any) => normalizePlacement(entry))))
        : [normalizePlacement(ad.placement)];
      const primaryPlacement = placements[0] || normalizePlacement(ad.placement);
      const metricRows = Array.isArray(ad.metrics) ? ad.metrics : [];
      const adImpressions =
        metricRows.reduce((sum: number, row: any) => sum + Number(row.impressions || 0), 0) ||
        Number(ad.impressions || 0);
      const adClicks =
        metricRows.reduce((sum: number, row: any) => sum + Number(row.clicks || 0), 0) ||
        Number(ad.clicks || 0);
      const adSpend = metricRows.reduce((sum: number, row: any) => sum + Number(row.spend || 0), 0);
      const delivery = buildAdDeliveryDiagnostics(ad, adsConfig);
      if (delivery.isServing) {
        deliveryHealth.serving += 1;
      } else {
        deliveryHealth.blocked += 1;
        const reason = delivery.blockers[0] || 'Unknown delivery blocker.';
        deliveryHealth.blockers[reason] = (deliveryHealth.blockers[reason] || 0) + 1;
      }
      if (delivery.warnings.length > 0) deliveryHealth.warning += 1;

      for (const placement of placements) {
        const current =
          byPlacementMap.get(placement) || {
            placement,
            campaigns: 0,
            activeCampaigns: 0,
            impressions: 0,
            clicks: 0,
            spend: 0,
            remainingBudget: 0
          };
        current.campaigns += 1;
        current.activeCampaigns += String(ad.status || '').toUpperCase() === 'ACTIVE' ? 1 : 0;
        current.impressions += adImpressions;
        current.clicks += adClicks;
        current.spend += adSpend;
        current.remainingBudget += Number(ad.remainingBudget || 0);
        byPlacementMap.set(placement, current);
      }

      if (primaryPlacement === 'scroll_preroll' || primaryPlacement === 'scroll_feed' || placements.includes('scroll_preroll') || placements.includes('scroll_feed')) {
        topCampaigns.push({
          id: ad.id,
          title: ad.title,
          status: ad.status,
          placement: primaryPlacement,
          placements,
          impressions: adImpressions,
          clicks: adClicks,
          spend: Number(adSpend.toFixed(6)),
          ctr: adImpressions > 0 ? Number(((adClicks / adImpressions) * 100).toFixed(2)) : 0,
          remainingBudget: Number(ad.remainingBudget || 0),
          delivery
        });
      }
    }

    const byPlacement = Array.from(byPlacementMap.values()).map((entry) => ({
      ...entry,
      spend: Number(entry.spend.toFixed(6)),
      remainingBudget: Number(entry.remainingBudget.toFixed(2)),
      ctr: entry.impressions > 0 ? Number(((entry.clicks / entry.impressions) * 100).toFixed(2)) : 0
    }));
    const scrollPlacements = byPlacement.filter((entry) => entry.placement === 'scroll_preroll' || entry.placement === 'scroll_feed');
    const scrollTotals = scrollPlacements.reduce(
      (acc, entry) => {
        acc.campaigns += entry.campaigns;
        acc.activeCampaigns += entry.activeCampaigns;
        acc.impressions += entry.impressions;
        acc.clicks += entry.clicks;
        acc.spend += entry.spend;
        acc.remainingBudget += entry.remainingBudget;
        return acc;
      },
      { campaigns: 0, activeCampaigns: 0, impressions: 0, clicks: 0, spend: 0, remainingBudget: 0 }
    );
    return res.json({
      success: true,
      data: {
        ...agg,
        ...totals,
        adminRevenue: totals.spend,
        ctr: totals.impressions > 0 ? Number(((totals.clicks / totals.impressions) * 100).toFixed(2)) : 0,
        deliveryHealth,
        byPlacement,
        scroll: {
          ...scrollTotals,
          spend: Number(scrollTotals.spend.toFixed(6)),
          remainingBudget: Number(scrollTotals.remainingBudget.toFixed(2)),
          ctr: scrollTotals.impressions > 0 ? Number(((scrollTotals.clicks / scrollTotals.impressions) * 100).toFixed(2)) : 0,
          placements: scrollPlacements,
          topCampaigns: topCampaigns
            .sort((a, b) => Number(b.impressions || 0) - Number(a.impressions || 0))
            .slice(0, 10)
        }
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

export const getAdsRuntimeConfig = async (_req: Request, res: Response) => {
  try {
    const existing = await prisma.appSetting.findUnique({ where: { scope: ADS_CONFIG_SCOPE } });
    return res.json({
      success: true,
      data: buildPublicAdsRuntimeConfig(existing?.data || defaultAdsConfig)
    });
  } catch (error: any) {
    console.error('Get ads runtime config error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load ads runtime config' });
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

// Public: list ads available for placement. Delivery is restricted to ACTIVE campaigns.
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
    const [rawAds, adsConfigSetting] = await Promise.all([
      prisma.communityAd.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.max(limit * 6, 30),
        include: { payments: true }
      }),
      prisma.appSetting.findUnique({ where: { scope: ADS_CONFIG_SCOPE } })
    ]);
    const ads = await hydrateAdsWithMedia(rawAds);
    const adsConfig = adsConfigSetting?.data || defaultAdsConfig;
    const filtered = ads.filter((ad) => {
      const diagnostics = buildAdDeliveryDiagnostics(ad, adsConfig);
      const adPlacements = diagnostics.eligiblePlacements;
      if (shouldFilterByPlacement) {
        if (!adPlacements.includes(normalizedPlacement)) return false;
      }
      return diagnostics.isServing;
    });
    const selectedAds = filtered.slice(0, limit);
    const adsWithPlacement = selectedAds.map((ad) => {
      const { payments: _payments, ...publicAd } = ad as any;
      const targeting = parseTargeting(ad.targeting);
      const diagnostics = buildAdDeliveryDiagnostics(ad, adsConfig);
      const placements = diagnostics.placements;
      return {
        ...publicAd,
        placement:
          shouldFilterByPlacement && diagnostics.eligiblePlacements.includes(normalizedPlacement)
            ? normalizedPlacement
            : normalizePlacement(ad.placement || diagnostics.eligiblePlacements[0] || placements[0]),
        targeting: { ...targeting, placements },
        delivery: diagnostics
      };
    });
    return res.json({ success: true, data: adsWithPlacement });
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
    // Campaign owners may tune live ads. Major creative, targeting, destination, or placement
    // edits automatically leave delivery and re-enter review; budget/schedule tuning stays live.
    const currentStatus = (existing.status || '').toString().toUpperCase();
    const editableStatuses = ['DRAFT', 'REJECTED', 'AWAITING_PAYMENT', 'PAID', 'SUBMITTED_FOR_REVIEW', 'APPROVED', 'ACTIVE', 'PAUSED', 'ENDED'];
    if (!editableStatuses.includes(currentStatus)) {
      return res.status(403).json({ success: false, error: 'Ad cannot be edited in its current status' });
    }

    const allowed: any = {};
    const existingTargeting = parseTargeting(existing.targeting);
    let nextTargeting = { ...existingTargeting };

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
    nextTargeting = await resolvePromotionTargeting(nextTargeting, userId);

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

    if (payload.currency !== undefined) {
      allowed.currency = normalizeCurrencyCode(payload.currency, String(existing.currency || 'USD'));
    }

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

    allowed.targeting = sanitizeJsonValue(nextTargeting) || {};
    try {
      allowed.targeting = JSON.parse(JSON.stringify(allowed.targeting || {}));
    } catch (e) {
      allowed.targeting = {};
    }

    Object.keys(allowed).forEach((key) => {
      if ((allowed as any)[key] === undefined) delete (allowed as any)[key];
    });

    if (payload.startAt !== undefined) {
      allowed.startAt = parseOptionalDateInput(payload.startAt, 'Start date');
    }
    if (payload.endAt !== undefined) {
      allowed.endAt = parseOptionalDateInput(payload.endAt, 'End date');
    }
    if (payload.durationDays !== undefined) {
      const durationDays = Number(payload.durationDays || 0);
      allowed.durationDays = Number.isFinite(durationDays) && durationDays > 0 ? Math.floor(durationDays) : null;
    }
    const nextStartAt =
      allowed.startAt !== undefined ? allowed.startAt : (existing.startAt || null);
    const nextEndAt =
      allowed.endAt !== undefined ? allowed.endAt : (existing.endAt || null);
    if (nextStartAt && nextEndAt) {
      const startMs = new Date(nextStartAt).getTime();
      const endMs = new Date(nextEndAt).getTime();
      if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_DATE',
          error: 'Campaign schedule dates are invalid.'
        });
      }
      if (endMs <= startMs) {
        return res.status(400).json({
          success: false,
          code: 'INVALID_DATE_RANGE',
          error: 'End date must be after start date.'
        });
      }
    }

    const majorUpdateRequiresReview =
      ['PAID', 'SUBMITTED_FOR_REVIEW', 'APPROVED', 'ACTIVE'].includes(currentStatus) &&
      isMajorAdUpdate(payload, existing, allowed, existingTargeting, nextTargeting, placementsFromPayload);
    if (majorUpdateRequiresReview) {
      allowed.status = 'SUBMITTED_FOR_REVIEW';
      allowed.adminReviewNotes = 'Major campaign update submitted by the owner. Review is required before live delivery.';
    }

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
    if (Number(error?.statusCode || 0) === 400) {
      return res.status(400).json({
        success: false,
        code: error?.code || 'VALIDATION_ERROR',
        error: error?.message || 'Invalid ad payload.'
      });
    }
    const prismaCode = String(error?.code || '').toUpperCase();
    if (prismaCode.startsWith('P')) {
      return res.status(400).json({
        success: false,
        code: prismaCode || 'DB_VALIDATION_ERROR',
        error: 'Invalid ad payload. Please review date, budget, and targeting fields.'
      });
    }
    if (isPrismaValidationLikeError(error)) {
      return res.status(400).json({
        success: false,
        code: 'DB_VALIDATION_ERROR',
        error: 'Invalid ad payload. Please review destination URL, placement, budget, and scheduling values.'
      });
    }
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

    const status = (ad.status || '').toString().toUpperCase();
    const hardDeletable = ['DRAFT', 'REJECTED', 'AWAITING_PAYMENT'];
    const archiveDeletable = ['PAUSED', 'ENDED', 'PAID', 'SUBMITTED_FOR_REVIEW', 'APPROVED'];

    if (status === 'ACTIVE') {
      return res.status(409).json({
        success: false,
        error: 'Pause the ad before deleting it.'
      });
    }

    if (!hardDeletable.includes(status) && !archiveDeletable.includes(status)) {
      return res.status(403).json({ success: false, error: 'Ad cannot be deleted in its current status' });
    }

    const io = (req.app as any).get('io');
    if (hardDeletable.includes(status)) {
      await prisma.communityAd.delete({ where: { id: adId } });
      try { io?.emit('community:ad_deleted', { adId }); } catch (e) {}
      try { realtime.emitToAd(adId, 'community:ad_deleted', { adId }); } catch (e) {}
      return res.json({ success: true, data: { id: adId, deleted: true } });
    }

    const targeting = parseTargeting(ad.targeting);
    const archivedTargeting = sanitizeJsonValue({
      ...targeting,
      userDeleted: true,
      userDeletedAt: new Date().toISOString(),
      userDeletedBy: userId
    }) || {};

    await prisma.communityAd.update({
      where: { id: adId },
      data: {
        status: 'ENDED',
        targeting: archivedTargeting
      }
    });
    try { io?.emit('community:ad_status_updated', { adId, status: 'ENDED' }); } catch (e) {}
    try { realtime.emitToAd(adId, 'community:ad_status_updated', { adId, status: 'ENDED' }); } catch (e) {}
    try { io?.emit('community:ad_deleted', { adId, archived: true }); } catch (e) {}
    try { realtime.emitToAd(adId, 'community:ad_deleted', { adId, archived: true }); } catch (e) {}
    return res.json({ success: true, data: { id: adId, archived: true } });
  } catch (error: any) {
    console.error('Delete ad error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to delete ad' });
  }
};

// Admin: list all campaigns (for admin UI)
export const getAllCampaigns = async (_req: Request, res: Response) => {
  try {
    const [ads, adsConfigSetting] = await Promise.all([
      prisma.communityAd.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          payments: true,
          creator: {
            select: { id: true, name: true, email: true, username: true }
          }
        }
      }),
      prisma.appSetting.findUnique({ where: { scope: ADS_CONFIG_SCOPE } })
    ]);
    const withClient = ads.map((ad: any) => ({
      ...ad,
      clientName: ad?.creator?.name || ad?.creator?.username || ad?.creator?.email || 'Customer'
    }));
    const hydrated = await hydrateAdsWithMedia(withClient);
    const adsConfig = adsConfigSetting?.data || defaultAdsConfig;
    return res.json({
      success: true,
      data: hydrated.map((ad) => ({
        ...ad,
        delivery: buildAdDeliveryDiagnostics(ad, adsConfig)
      }))
    });
  } catch (error: any) {
    console.error('Get all campaigns error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load campaigns' });
  }
};
