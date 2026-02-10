import express from 'express';
import { body } from 'express-validator';
import prisma from '../../../prisma';

const router = express.Router();

const ADS_CONFIG_SCOPE = 'community_ads_config';
const defaultAdsConfig = {
  cpmByPlacement: {
    feed: 5,
    forum_listing: 8,
    thread_detail: 6,
    chat: 2
  },
  regionalMultipliers: {},
  minBudget: 5,
  maxBudget: 10000,
  allowedPlacements: ['feed', 'forum_listing', 'thread_detail', 'chat'],
  allowedMediaTypes: ['text', 'image', 'video'],
  requireLoginToInteract: false
};

router.get('/config', async (req: any, res) => {
  try {
    const existing = await prisma.appSetting.findUnique({ where: { scope: ADS_CONFIG_SCOPE } });
    return res.json({ success: true, data: existing?.data || defaultAdsConfig });
  } catch (e: any) {
    return res.status(500).json({ success: false, error: { code: 'ERR_INTERNAL', message: e.message } });
  }
});

router.put('/config', [body('data').exists()], async (req: any, res) => {
  try {
    const payload = req.body?.data ?? req.body ?? {};
    const merged = { ...defaultAdsConfig, ...(payload || {}) };
    const upserted = await prisma.appSetting.upsert({
      where: { scope: ADS_CONFIG_SCOPE },
      create: { scope: ADS_CONFIG_SCOPE, data: merged },
      update: { data: merged }
    });
    (global as any).appCommunityIo?.emit('community:ads_config_updated', { config: upserted.data });
    res.json({ success: true, data: upserted.data });
  } catch (e: any) {
    res.status(500).json({ success:false, error:{code:'ERR_INTERNAL', message:e.message} });
  }
});

router.get('/review-queue', async (req: any, res) => {
  const items = await prisma.communityAd.findMany({ where: { status: 'SUBMITTED_FOR_REVIEW' } });
  res.json({ success:true, data: items });
});

// Admin list all ads
router.get('/list', async (req: any, res) => {
  try {
    const items = await prisma.communityAd.findMany();
    res.json({ success: true, data: items });
  } catch (e: any) { res.status(500).json({ success:false, error:{code:'ERR_INTERNAL', message:e.message} }); }
});

// Admin create ad
router.post('/create', async (req: any, res) => {
  try {
    const data = req.body;
    const ad = await prisma.communityAd.create({ data: { ...data, creatorId: req.user?.id || 'admin', status: (data.status || 'DRAFT') } });
    (global as any).appCommunityIo?.emit('community:ad_status_updated', { adId: ad.id, status: ad.status });
    return res.json({ success: true, data: ad });
  } catch (e: any) { return res.status(500).json({ success:false, error:{code:'ERR_INTERNAL', message:e.message} }); }
});

// Admin update ad
router.put('/:id', async (req: any, res) => {
  try {
    const id = req.params.id;
    const payload = req.body;
    const ad = await prisma.communityAd.update({ where: { id }, data: payload });
    (global as any).appCommunityIo?.emit('community:ad_status_updated', { adId: ad.id, status: ad.status });
    return res.json({ success: true, data: ad });
  } catch (e: any) { return res.status(500).json({ success:false, error:{code:'ERR_INTERNAL', message:e.message} }); }
});

// Admin delete ad
router.delete('/:id', async (req: any, res) => {
  try {
    const id = req.params.id;
    await prisma.communityAd.delete({ where: { id } });
    (global as any).appCommunityIo?.emit('community:ad_status_updated', { adId: id, status: 'DELETED' });
    return res.json({ success: true });
  } catch (e: any) { return res.status(500).json({ success:false, error:{code:'ERR_INTERNAL', message:e.message} }); }
});

router.post('/:id/approve', async (req: any, res) => {
  try { const id = req.params.id; const ad = await prisma.communityAd.update({ where: { id }, data: { status: 'ACTIVE' } }); (global as any).appCommunityIo?.emit('community:ad_status_updated', { adId: id, status: 'ACTIVE' }); res.json({ success:true, data: ad }); } catch (e: any) { res.status(500).json({ success:false, error:{code:'ERR_INTERNAL', message:e.message} }); }
});

router.post('/:id/reject', async (req: any, res) => {
  try { const id = req.params.id; const { reason, refund } = req.body; const ad = await prisma.communityAd.update({ where: { id }, data: { status: 'REJECTED' } }); if (refund) { /* integrate refund logic */ } (global as any).appCommunityIo?.emit('community:ad_status_updated', { adId: id, status: 'REJECTED' }); res.json({ success:true, data: ad }); } catch (e: any) { res.status(500).json({ success:false, error:{code:'ERR_INTERNAL', message:e.message} }); }
});

router.post('/:id/pause', async (req: any, res) => { try { const id = req.params.id; const ad = await prisma.communityAd.update({ where: { id }, data: { status: 'PAUSED' } }); res.json({ success:true, data: ad }); } catch (e: any) { res.status(500).json({ success:false, error:{code:'ERR_INTERNAL', message:e.message} }); } });
router.post('/:id/resume', async (req: any, res) => { try { const id = req.params.id; const ad = await prisma.communityAd.update({ where: { id }, data: { status: 'ACTIVE' } }); res.json({ success:true, data: ad }); } catch (e: any) { res.status(500).json({ success:false, error:{code:'ERR_INTERNAL', message:e.message} }); } });

router.get('/analytics', async (req: any, res) => {
  // aggregate analytics across ads
  const metrics = await prisma.adMetricsDaily.aggregate({ _sum: { impressions: true, clicks: true, spend: true } });
  res.json({ success:true, data: { impressions: metrics._sum.impressions || 0, clicks: metrics._sum.clicks || 0, spend: String(metrics._sum.spend || 0), adminRevenue: '0' } });
});

export default router;
