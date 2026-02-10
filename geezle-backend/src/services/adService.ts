import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const ADS_CONFIG_SCOPE = 'community_ads_config';
const defaultAdsConfig = {
  cpmByPlacement: {
    feed: 5,
    forum_listing: 8,
    thread_detail: 6,
    chat: 2
  },
  cpcByPlacement: {
    feed: 0.4,
    forum_listing: 0.6,
    thread_detail: 0.5,
    chat: 0.2
  }
};

async function getAdsConfig() {
  try {
    const existing = await prisma.appSetting.findUnique({ where: { scope: ADS_CONFIG_SCOPE } });
    return (existing?.data as any) || defaultAdsConfig;
  } catch (e) {
    return defaultAdsConfig;
  }
}

function resolveCpm(ad: any, config: any) {
  const adCpm = Number(ad?.cpm || 0);
  if (adCpm > 0) return adCpm;
  const placement = (ad?.placement || 'feed').toString();
  const byPlacement = config?.cpmByPlacement || {};
  const cfgCpm = Number(byPlacement[placement] || 0);
  return cfgCpm > 0 ? cfgCpm : 0;
}

function resolveCpc(ad: any, config: any) {
  const adCpc = Number(ad?.cpc || 0);
  if (adCpc > 0) return adCpc;
  const placement = (ad?.placement || 'feed').toString();
  const byPlacement = config?.cpcByPlacement || {};
  const cfgCpc = Number(byPlacement[placement] || 0);
  return cfgCpc > 0 ? cfgCpc : 0;
}

export async function selectAdsForPlacement(placement: string, limit = 5) {
  // simple selection: active ads for placement ordered by remainingBudget desc
  const ads = await prisma.communityAd.findMany({ where: { placement, status: 'ACTIVE' }, orderBy: { remainingBudget: 'desc' }, take: limit });
  return ads;
}

export async function recordImpression(adId: string, date = new Date()) {
  const ad = await prisma.communityAd.findUnique({ where: { id: adId } });
  if (!ad) return null;
  if (ad.status !== 'ACTIVE') return null;
  const remaining = Number(ad.remainingBudget || 0);
  if (remaining <= 0) {
    await prisma.communityAd.update({ where: { id: adId }, data: { status: 'ENDED', remainingBudget: 0 } });
    return null;
  }

  const config = await getAdsConfig();
  const cpm = resolveCpm(ad, config);
  const spend = cpm > 0 ? Number((cpm / 1000).toFixed(6)) : 0;
  const nextRemaining = Number((remaining - spend).toFixed(6));
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
        remainingBudget: nextRemaining > 0 ? nextRemaining : 0,
        status: nextRemaining > 0 ? ad.status : 'ENDED'
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
  const day = new Date(date);
  day.setUTCHours(0, 0, 0, 0);

  const config = await getAdsConfig();
  const cpc = resolveCpc(ad, config);
  const clickSpend = cpc > 0 ? Number(cpc.toFixed(6)) : 0;
  const remaining = Number(ad.remainingBudget || 0);
  const nextRemaining = Number((remaining - clickSpend).toFixed(6));

  const [metrics] = await prisma.$transaction(async (tx) => {
    const metrics = await tx.adMetricsDaily.upsert({
      where: { adId_date: { adId, date: day } },
      create: { adId, date: day, impressions: 0, clicks: 1, spend: clickSpend },
      update: { clicks: { increment: 1 }, spend: { increment: clickSpend } }
    });
    await tx.communityAd.update({
      where: { id: adId },
      data: {
        clicks: { increment: 1 },
        remainingBudget: nextRemaining > 0 ? nextRemaining : 0,
        status: nextRemaining > 0 ? ad.status : 'ENDED'
      } as any
    });
    return [metrics] as const;
  });

  return {
    metrics: {
      impressions: metrics.impressions,
      clicks: metrics.clicks,
      spend: metrics.spend
    }
  };
}
