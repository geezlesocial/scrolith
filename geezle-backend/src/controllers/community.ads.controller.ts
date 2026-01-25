import { Request, Response } from 'express';
import Stripe from 'stripe';
import prisma from '../utils/prismaClient';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_mock_key', {
  apiVersion: '2023-10-16' as any
});

export const createAdDraft = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const payload = req.body || {};
    const ad = await prisma.communityAd.create({
      data: {
        creatorId: userId,
        title: payload.title || 'Untitled Ad',
        body: payload.body || '',
        placement: payload.placement || 'feed',
        targeting: payload.targeting || null,
        mediaFileIds: payload.mediaFileIds || [],
        budget: Number(payload.budget || 0),
        remainingBudget: Number(payload.budget || 0)
      }
    });

    const io = (req.app as any).get('io');
    try { io?.emit('community:ad_created', { ad }); } catch(e){}

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

    if (ad.status !== 'PAID' && ad.status !== 'SUBMITTED_FOR_REVIEW' && ad.status !== 'AWAITING_PAYMENT') {
      // If ad isn't paid yet, require payment
      return res.status(400).json({ success: false, error: 'Ad must be paid before submission' });
    }

    const updated = await prisma.communityAd.update({ where: { id: adId }, data: { status: 'SUBMITTED_FOR_REVIEW' } });
    const io = (req.app as any).get('io');
    try { io?.emit('community:ad_status_updated', { adId, status: 'SUBMITTED_FOR_REVIEW' }); } catch(e){}
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
    return res.json({ success: true, data: ads });
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
    return res.json({ success: true, data: ads });
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
    return res.json({ success: true });
  } catch (error: any) {
    console.error('Reject ad error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to reject ad' });
  }
};

export const pauseAd = async (req: Request, res: Response) => {
  try {
    const adId = req.params.id;
    const ad = await prisma.communityAd.update({ where: { id: adId }, data: { status: 'PAUSED' } });
    const io = (req.app as any).get('io');
    try { io?.emit('community:ad_status_updated', { adId, status: 'PAUSED' }); } catch(e){}
    return res.json({ success: true, data: ad });
  } catch (error: any) {
    console.error('Pause ad error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to pause ad' });
  }
};

export const resumeAd = async (req: Request, res: Response) => {
  try {
    const adId = req.params.id;
    const ad = await prisma.communityAd.update({ where: { id: adId }, data: { status: 'ACTIVE' } });
    const io = (req.app as any).get('io');
    try { io?.emit('community:ad_status_updated', { adId, status: 'ACTIVE' }); } catch(e){}
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

    // Prevent creators from changing status via this endpoint
    if ('status' in allowed) delete allowed.status;
    const updated = await prisma.communityAd.update({ where: { id: adId }, data: allowed });
    const io = (req.app as any).get('io');
    try { io?.emit('community:ad_status_updated', { adId, status: updated.status }); } catch(e){}
    return res.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Update ad error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update ad' });
  }
};

// Admin: list all campaigns (for admin UI)
export const getAllCampaigns = async (_req: Request, res: Response) => {
  try {
    const ads = await prisma.communityAd.findMany({ orderBy: { createdAt: 'desc' } });
    return res.json({ success: true, data: ads });
  } catch (error: any) {
    console.error('Get all campaigns error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load campaigns' });
  }
};
