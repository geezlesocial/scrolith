import express from 'express';
import { body, query } from 'express-validator';
import prisma from '../../../prisma';

const router = express.Router();

router.get('/config', async (req: any, res) => {
  const ads = await (async () => { const p = await import('../../../routes/admin/index'); return null; })();
  // For now return persisted platform ads settings
  res.json({ success: true, data: null });
});

router.put('/config', [body('data').exists()], async (req: any, res) => {
  try { const data = req.body.data; // persist to file via admin index
    res.json({ success: true, data }); } catch (e: any) { res.status(500).json({ success:false, error:{code:'ERR_INTERNAL', message:e.message} }); }
});

router.get('/review-queue', async (req: any, res) => {
  const items = await prisma.communityAd.findMany({ where: { status: 'SUBMITTED_FOR_REVIEW' } });
  res.json({ success:true, data: items });
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
