import prisma from '../utils/prismaClient';

const ADS_CONFIG_SCOPE = 'community_ads_config';
const PLACEMENT_ALIASES: Record<string, string> = {
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

const ALLOWED_PLACEMENTS = [
  'homepage',
  'homepage_feed',
  'community_feed',
  'scroll_preroll',
  'scroll_feed',
  'forum_listing',
  'thread_detail',
  'chat_sidebar'
];

const normalizePlacement = (value: any, fallback = 'community_feed') => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return fallback;
  return PLACEMENT_ALIASES[raw] || raw;
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
  allowedPlacements: ALLOWED_PLACEMENTS,
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

function toBoundedInteger(value: any, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(parsed)));
}

function sanitizeScrollAdsConfig(raw: any) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const fallback = defaultAdsConfig.scrollAds;
  const pacingInput = input.placementPacing && typeof input.placementPacing === 'object' ? input.placementPacing : {};
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
      scroll_preroll: toBoundedInteger(
        pacingInput.scroll_preroll ?? input.scrollPrerollWeight,
        fallback.placementPacing.scroll_preroll,
        0,
        10
      ),
      scroll_feed: toBoundedInteger(
        pacingInput.scroll_feed ?? input.scrollFeedWeight,
        fallback.placementPacing.scroll_feed,
        0,
        10
      )
    }
  };
}

function mergeAdsConfig(raw: any) {
  const input = raw && typeof raw === 'object' ? raw : {};
  const allowedPlacementsSource = Array.isArray(input.allowedPlacements)
    ? input.allowedPlacements
    : ALLOWED_PLACEMENTS;
  const allowedPlacements = Array.from(
    new Set(
      [...allowedPlacementsSource, ...ALLOWED_PLACEMENTS]
        .map((entry: any) => normalizePlacement(entry))
        .filter((placement: string) => ALLOWED_PLACEMENTS.includes(placement))
    )
  );

  return {
    ...defaultAdsConfig,
    ...input,
    cpmByPlacement: { ...defaultAdsConfig.cpmByPlacement, ...(input.cpmByPlacement || {}) },
    cpcByPlacement: { ...defaultAdsConfig.cpcByPlacement, ...(input.cpcByPlacement || {}) },
    allowedPlacements: allowedPlacements.length ? allowedPlacements : [...ALLOWED_PLACEMENTS],
    scrollAds: sanitizeScrollAdsConfig(input.scrollAds)
  };
}

async function getAdsConfig() {
  try {
    const existing = await prisma.appSetting.findUnique({ where: { scope: ADS_CONFIG_SCOPE } });
    return mergeAdsConfig((existing?.data as any) || defaultAdsConfig);
  } catch (e) {
    return mergeAdsConfig(defaultAdsConfig);
  }
}

function getPlacementRate(ad: any, config: any, kind: 'cpmByPlacement' | 'cpcByPlacement') {
  const source = (config?.[kind] || {}) as Record<string, any>;
  const placement = normalizePlacement(ad?.placement || 'community_feed');
  const aliasKeys = [placement];
  if (placement === 'community_feed') aliasKeys.push('feed');
  if (placement === 'chat_sidebar') aliasKeys.push('chat');
  for (const key of aliasKeys) {
    const value = Number(source[key]);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return 0;
}

function resolveCpm(ad: any, config: any) {
  const adCpm = Number(ad?.cpm || 0);
  if (adCpm > 0) return adCpm;
  return getPlacementRate(ad, config, 'cpmByPlacement');
}

function resolveCpc(ad: any, config: any) {
  const adCpc = Number(ad?.cpc || 0);
  if (adCpc > 0) return adCpc;
  return getPlacementRate(ad, config, 'cpcByPlacement');
}

function parseTargeting(targeting: any): Record<string, any> {
  if (!targeting || typeof targeting !== 'object' || Array.isArray(targeting)) return {};
  return { ...targeting };
}

function getPricingModel(ad: any): 'CPM' | 'CPC' {
  const targeting = parseTargeting(ad?.targeting);
  const model = String(targeting?.pricingModel || '').toUpperCase();
  return model === 'CPC' ? 'CPC' : 'CPM';
}

function getAdPlacements(ad: any): string[] {
  const targeting = parseTargeting(ad?.targeting);
  const rawPlacements = Array.isArray(targeting.placements) ? targeting.placements : [ad?.placement];
  const normalized = rawPlacements.map((entry) => normalizePlacement(entry)).filter(Boolean);
  const unique = Array.from(new Set(normalized));
  return unique.length ? unique : ['community_feed'];
}

export async function selectAdsForPlacement(placement: string, limit = 5) {
  const normalizedPlacement = normalizePlacement(placement);
  const now = Date.now();
  const ads = await prisma.communityAd.findMany({
    where: { status: 'ACTIVE' },
    orderBy: [{ remainingBudget: 'desc' }, { createdAt: 'desc' }],
    take: Math.max(limit * 6, 30)
  });
  const filtered = ads.filter((ad) => {
    const placements = getAdPlacements(ad);
    if (!placements.includes(normalizedPlacement)) return false;
    if (Number(ad.remainingBudget || 0) <= 0) return false;
    if (ad.startAt && new Date(ad.startAt).getTime() > now) return false;
    if (ad.endAt && new Date(ad.endAt).getTime() < now) return false;
    return true;
  });
  return filtered.slice(0, limit);
}

export async function recordImpression(adId: string, date = new Date()) {
  const ad = await prisma.communityAd.findUnique({ where: { id: adId } });
  if (!ad) return null;
  if (ad.status !== 'ACTIVE') return null;
  const pricingModel = getPricingModel(ad);
  const remaining = Number(ad.remainingBudget || 0);
  const shouldCharge = pricingModel === 'CPM';
  if (shouldCharge && remaining <= 0) {
    await prisma.communityAd.update({ where: { id: adId }, data: { status: 'ENDED', remainingBudget: 0 } });
    return null;
  }

  const config = await getAdsConfig();
  const cpm = resolveCpm(ad, config);
  const spend = shouldCharge && cpm > 0 ? Number((cpm / 1000).toFixed(6)) : 0;
  const nextRemaining = shouldCharge ? Number((remaining - spend).toFixed(6)) : remaining;
  const day = new Date(date);
  day.setUTCHours(0, 0, 0, 0);

  const [metrics, updatedAd] = await prisma.$transaction(async (tx) => {
    const metrics = await tx.adMetricsDaily.upsert({
      where: { adId_date: { adId, date: day } },
      create: { adId, date: day, impressions: 1, clicks: 0, spend },
      update: { impressions: { increment: 1 }, spend: { increment: spend } }
    });
    const updatedAd = await tx.communityAd.update({
      where: { id: adId },
      data: {
        impressions: { increment: 1 },
        remainingBudget: shouldCharge ? (nextRemaining > 0 ? nextRemaining : 0) : remaining,
        status: shouldCharge ? (nextRemaining > 0 ? ad.status : 'ENDED') : ad.status
      }
    });
    return [metrics, updatedAd] as const;
  });

  return {
    metrics: {
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      spend: metrics.spend,
      remainingBudget: updatedAd.remainingBudget,
      status: updatedAd.status
    }
  };
}

export async function recordClick(adId: string, date = new Date()) {
  const ad = await prisma.communityAd.findUnique({ where: { id: adId } });
  if (!ad) return null;
  if (ad.status !== 'ACTIVE') return null;
  const pricingModel = getPricingModel(ad);
  const day = new Date(date);
  day.setUTCHours(0, 0, 0, 0);

  const config = await getAdsConfig();
  const cpc = resolveCpc(ad, config);
  const shouldCharge = pricingModel === 'CPC';
  const clickSpend = shouldCharge && cpc > 0 ? Number(cpc.toFixed(6)) : 0;
  const remaining = Number(ad.remainingBudget || 0);
  if (shouldCharge && remaining <= 0) {
    await prisma.communityAd.update({ where: { id: adId }, data: { status: 'ENDED', remainingBudget: 0 } });
    return null;
  }
  const nextRemaining = shouldCharge ? Number((remaining - clickSpend).toFixed(6)) : remaining;

  const [metrics, updatedAd] = await prisma.$transaction(async (tx) => {
    const metrics = await tx.adMetricsDaily.upsert({
      where: { adId_date: { adId, date: day } },
      create: { adId, date: day, impressions: 0, clicks: 1, spend: clickSpend },
      update: { clicks: { increment: 1 }, spend: { increment: clickSpend } }
    });
    const updatedAd = await tx.communityAd.update({
      where: { id: adId },
      data: {
        clicks: { increment: 1 },
        remainingBudget: shouldCharge ? (nextRemaining > 0 ? nextRemaining : 0) : remaining,
        status: shouldCharge ? (nextRemaining > 0 ? ad.status : 'ENDED') : ad.status
      } as any
    });
    return [metrics, updatedAd] as const;
  });

  return {
    metrics: {
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      spend: metrics.spend,
      remainingBudget: updatedAd.remainingBudget,
      status: updatedAd.status
    }
  };
}
