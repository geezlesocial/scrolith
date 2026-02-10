import { Request, Response } from 'express';
import Stripe from 'stripe';
import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';
import { recordClick, recordImpression } from '../services/adService';
import { syncFileUsages } from '../utils/fileUsage';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock_key', {
  apiVersion: '2023-10-16' as any
});

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
  },
  regionalMultipliers: {},
  minBudget: 5,
  maxBudget: 10000,
  allowedPlacements: ['feed', 'forum_listing', 'thread_detail', 'chat'],
  allowedMediaTypes: ['text', 'image', 'video'],
  requireLoginToInteract: false
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
    const adsConfig = (adsConfigSetting?.data as any) || defaultAdsConfig;
    const placement = payload.placement || 'feed';
    const cpm = Number(adsConfig?.cpmByPlacement?.[placement] ?? 0);
    const cpc = Number(adsConfig?.cpcByPlacement?.[placement] ?? 0);
    const durationDays = payload.durationDays ? Number(payload.durationDays) : null;
    const startAt = payload.startAt ? new Date(payload.startAt) : null;
    const endAt = durationDays && startAt ? new Date(startAt.getTime() + durationDays * 24 * 60 * 60 * 1000) : (payload.endAt ? new Date(payload.endAt) : null);
    const ad = await prisma.communityAd.create({
      data: {
        creatorId: userId,
        title: payload.title || 'Untitled Ad',
        body: payload.body || '',
        objective: payload.objective || 'traffic',
        destinationType: payload.destinationType || 'url',
        destinationUrl: payload.destinationUrl || payload.targetUrl || null,
        ctaText: payload.ctaText || null,
        placement,
        targeting: payload.targeting || null,
        mediaFileIds: payload.mediaFileIds || [],
        budget: Number(payload.budget || 0),
        remainingBudget: Number(payload.budget || 0),
        currency: payload.currency || 'USD',
        startAt,
        endAt,
        durationDays,
        cpm,
        cpc
      }
    });

    try {
      await syncFileUsages('community_ad', ad.id, ad.mediaFileIds || [], 'Community Ad Media');
    } catch (e) {}

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

    const updated = await prisma.communityAd.update({ where: { id: adId }, data: { status: 'SUBMITTED_FOR_REVIEW' } });
    const io = (req.app as any).get('io');
    try { io?.emit('community:ad_status_updated', { adId, status: 'SUBMITTED_FOR_REVIEW' }); } catch(e){}
    try { realtime.emitToAd(adId, 'community:ad_status_updated', { adId, status: 'SUBMITTED_FOR_REVIEW' }); } catch (e) {}
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
    return res.json({ success: true, data: ad });
  } catch (error: any) {
    console.error('Approve ad error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to approve ad' });
  }
};

export const rejectAd = async (req: Request, res: Response) => {
  try {
    const adId = req.params.id;
    const { refund } = req.body || {};
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
    return res.json({ success: true, data: agg });
  } catch (error: any) {
    console.error('Get ads analytics error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load analytics' });
  }
};

export const getAdsConfig = async (_req: Request, res: Response) => {
  try {
    const existing = await prisma.appSetting.findUnique({ where: { scope: ADS_CONFIG_SCOPE } });
    if (!existing) {
      return res.json({ success: true, data: defaultAdsConfig });
    }
    return res.json({ success: true, data: existing.data || defaultAdsConfig });
  } catch (error: any) {
    console.error('Get ads config error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load ads config' });
  }
};

export const updateAdsConfig = async (req: Request, res: Response) => {
  try {
    const payload = req.body?.data ?? req.body ?? {};
    const merged = { ...defaultAdsConfig, ...(payload || {}) };
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
    const placementParam =
      ((req.query.placement as string | undefined) || (req.query.role as string | undefined) || '').trim();
    const limitRaw = Number(req.query.limit);
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(30, Math.floor(limitRaw))) : 8;
    const where: any = { status: { in: ['ACTIVE', 'PAID'] } };
    if (placementParam) {
      where.placement = placementParam;
    }
    const ads = await prisma.communityAd.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit });
    const hydrated = await hydrateAdsWithMedia(ads);
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
    // Only allow updates when ad is in editable statuses
    const editableStatuses = ['DRAFT', 'REJECTED', 'AWAITING_PAYMENT'];
    if (!editableStatuses.includes((existing.status || '').toString().toUpperCase())) {
      return res.status(403).json({ success: false, error: 'Ad cannot be edited in its current status' });
    }
    const allowed: any = {};
    if (payload.title !== undefined) allowed.title = String(payload.title);
    if (payload.body !== undefined) allowed.body = String(payload.body);
    if (payload.objective !== undefined) allowed.objective = String(payload.objective);
    if (payload.destinationType !== undefined) allowed.destinationType = String(payload.destinationType);
    if (payload.destinationUrl !== undefined) allowed.destinationUrl = payload.destinationUrl ? String(payload.destinationUrl) : null;
    if (payload.ctaText !== undefined) allowed.ctaText = payload.ctaText ? String(payload.ctaText) : null;
    if (payload.placement !== undefined) allowed.placement = String(payload.placement);
    if (payload.targeting !== undefined) allowed.targeting = payload.targeting;
    if (payload.mediaFileIds !== undefined) allowed.mediaFileIds = Array.isArray(payload.mediaFileIds) ? payload.mediaFileIds : [];
    if (payload.budget !== undefined) {
      const newBudget = Number(payload.budget || 0);
      if (isNaN(newBudget) || newBudget < 0) return res.status(400).json({ success: false, error: 'Invalid budget' });
      allowed.budget = newBudget;
      // If budget increased, increase remainingBudget accordingly; do not reset remainingBudget when editing
      const delta = newBudget - Number(existing.budget || 0);
      allowed.remainingBudget = Number(existing.remainingBudget || 0) + (delta > 0 ? delta : 0);
    }
    if (payload.cpm !== undefined) {
      const cpm = Number(payload.cpm || 0);
      if (isNaN(cpm) || cpm < 0) return res.status(400).json({ success: false, error: 'Invalid cpm' });
      allowed.cpm = cpm;
    }
    if (payload.currency !== undefined) allowed.currency = String(payload.currency || 'USD');
    if (payload.startAt !== undefined) allowed.startAt = payload.startAt ? new Date(payload.startAt) : null;
    if (payload.endAt !== undefined) allowed.endAt = payload.endAt ? new Date(payload.endAt) : null;
    if (payload.durationDays !== undefined) allowed.durationDays = payload.durationDays ? Number(payload.durationDays) : null;

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
    const ads = await prisma.communityAd.findMany({ orderBy: { createdAt: 'desc' } });
    const hydrated = await hydrateAdsWithMedia(ads);
    return res.json({ success: true, data: hydrated });
  } catch (error: any) {
    console.error('Get all campaigns error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load campaigns' });
  }
};
