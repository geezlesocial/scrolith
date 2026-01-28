import express from 'express';
import { body } from 'express-validator';
import prisma from '../../prisma';
import { selectAdsForPlacement } from '../../services/adService';
import { idempotency } from '../../middleware/idempotency';

const router = express.Router();

// POST /api/community/ads/draft
router.post('/draft', [body('title').exists(), body('placement').exists()], async (req: any, res) => {
  try {
    const userId = req.user?.id; if (!userId) return res.status(401).json({ success:false, error:{code:'UNAUTHORIZED'} });
    const { title, body: bodyText, placement, targeting, mediaFileIds, currency, budget } = req.body;
    const ad = await prisma.communityAd.create({ data: { creatorId: userId, title, body: bodyText || '', placement, targeting: targeting || {}, mediaFileIds: mediaFileIds || [], currency: currency || 'USD', budget: budget || 0, remainingBudget: budget || 0, status: 'DRAFT' } });
    return res.json({ success:true, data: { adId: ad.id } });
  } catch (e: any) { return res.status(500).json({ success:false, error:{code:'ERR_INTERNAL', message: e?.message ?? String(e)} }); }
});

// POST /api/community/ads/:id/pay
router.post('/:id/pay', idempotency(), async (req: any, res) => {
  try {
    const userId = req.user?.id; if (!userId) return res.status(401).json({ success:false, error:{code:'UNAUTHORIZED'} });
    const adId = req.params.id;
    const ad = await prisma.communityAd.findUnique({ where: { id: adId } });
    if (!ad) return res.status(404).json({ success:false, error:{code:'NOT_FOUND'} });
    // log idempotency key for debugging
    try { console.log('[ads.pay] Idempotency-Key:', req.header('Idempotency-Key')); } catch (e) {}

    // Use an in-memory lock per adId to avoid duplicate payment creation during races
    try {
      const globalAny: any = global as any;
      // Use a promise-based lock to ensure only one creator runs and others await its result
      globalAny.__adPayLocks = globalAny.__adPayLocks || new Map<string, Promise<any>>();
      const existingLock: Promise<any> | undefined = globalAny.__adPayLocks.get(adId);
      if (existingLock) {
        try { console.log('[ads.pay] detected existing lock, awaiting result for adId', adId); } catch (e) {}
        await existingLock;
        const existingPayment = await prisma.adPayment.findFirst({ where: { adId, OR: [{ status: 'pending' }, { status: 'completed' }] } });
        if (existingPayment) return res.json({ success: true, data: { paymentIntentId: existingPayment.transactionId, status: existingPayment.status } });
      }

      // Check again for an existing payment record
      try { console.log('[ads.pay] checking for existing payment before create'); } catch (e) {}
      const existingPayment = await prisma.adPayment.findFirst({ where: { adId, OR: [{ status: 'pending' }, { status: 'completed' }] } });
      if (existingPayment) {
        return res.json({ success: true, data: { paymentIntentId: existingPayment.transactionId, status: existingPayment.status } });
      }

      // Reserve a promise-based lock and create payment
      let resolveLock: (val?: any) => void = () => {};
      const lockPromise = new Promise<void>((resolve) => { resolveLock = resolve; });
      globalAny.__adPayLocks.set(adId, lockPromise as any);
      try {
        try { console.log('[ads.pay] creating payment for adId', adId); } catch (e) {}
        try { console.trace('[ads.pay] create call stack'); } catch (e) {}
        // Create a payment intent using existing payment flow (stubbed)
        // TODO: integrate with payments service
        const paymentIntentId = `pi_${Date.now()}`;
        await prisma.adPayment.create({ data: { adId, transactionId: paymentIntentId, amount: ad.budget, currency: ad.currency, status: 'completed' } });
        try { console.log('[ads.pay] created payment for adId', adId, 'intent', paymentIntentId); } catch (e) {}
        await prisma.communityAd.update({ where: { id: adId }, data: { status: 'PAID' } });
        return res.json({ success: true, data: { paymentIntentId, status: 'completed' } });
      } finally {
        try { resolveLock(); globalAny.__adPayLocks.delete(adId); } catch (e) {}
      }
    } catch (e: any) {
      return res.status(500).json({ success: false, error: { code: 'ERR_INTERNAL', message: e?.message ?? String(e) } });
    }
  } catch (e: any) { return res.status(500).json({ success:false, error:{code:'ERR_INTERNAL', message:e?.message ?? String(e)} }); }
});

// POST /api/community/ads/:id/submit
router.post('/:id/submit', async (req: any, res) => {
  try {
    const userId = req.user?.id; if (!userId) return res.status(401).json({ success:false, error:{code:'UNAUTHORIZED'} });
    const adId = req.params.id;
    const ad = await prisma.communityAd.findUnique({ where: { id: adId } });
    if (!ad) return res.status(404).json({ success:false, error:{code:'NOT_FOUND'} });
    if (ad.status !== 'PAID') return res.status(400).json({ success:false, error:{code:'PAYMENT_REQUIRED', message:'Ad must be paid before submission'} });
    await prisma.communityAd.update({ where: { id: adId }, data: { status: 'SUBMITTED_FOR_REVIEW' } });
    return res.json({ success:true });
  } catch (e: any) { return res.status(500).json({ success:false, error:{code:'ERR_INTERNAL', message:e?.message ?? String(e)} }); }
});

// GET /api/community/ads/me
router.get('/me', async (req: any, res) => {
  try {
    const userId = req.user?.id; if (!userId) return res.status(401).json({ success:false, error:{code:'UNAUTHORIZED'} });
    const ads = await prisma.communityAd.findMany({ where: { creatorId: userId } });
    return res.json({ success:true, data: ads });
  } catch (e: any) { return res.status(500).json({ success:false, error:{code:'ERR_INTERNAL', message:e?.message ?? String(e)} }); }
});

// GET /api/community/ads/:id/performance
router.get('/:id/performance', async (req: any, res) => {
  try {
    const adId = req.params.id;
    const metrics = await prisma.adMetricsDaily.findMany({ where: { adId }, orderBy: { date: 'desc' }, take: 30 });
    const aggregate = metrics.reduce((acc, m) => { acc.impressions += m.impressions; acc.clicks += m.clicks; acc.spend += Number(m.spend || 0); return acc; }, { impressions:0, clicks:0, spend:0 });
    const CTR = aggregate.impressions ? (aggregate.clicks / aggregate.impressions) : 0;
    const ad = await prisma.communityAd.findUnique({ where: { id: adId } });
    return res.json({ success:true, data: { impressions: aggregate.impressions, clicks: aggregate.clicks, CTR, spend: String(aggregate.spend), remainingBudget: String(ad?.remainingBudget || 0), daily: metrics } });
  } catch (e: any) { return res.status(500).json({ success:false, error:{code:'ERR_INTERNAL', message:e?.message ?? String(e)} }); }
});

export default router;
