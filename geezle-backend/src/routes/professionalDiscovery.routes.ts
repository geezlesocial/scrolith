import express from 'express';
import { optionalAuthMiddleware } from '../middleware/auth.middleware';
import {
  getBlogRecommendations,
  getGroupRecommendations,
  getMarketplaceRecommendations,
  getProfessionalDiscoveryBundle
} from '../services/professionalDiscovery.service';
import { getGrowthPulse } from '../services/growthIntelligence.service';

const router = express.Router();

const userIdFromReq = (req: any) =>
  String(req?.user?.id || req?.user?.userId || req?.userId || '').trim() || null;

const limitFromReq = (req: any, fallback = 8) => {
  const n = Number(req?.query?.limit || fallback);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(24, Math.trunc(n)));
};

router.get('/home', optionalAuthMiddleware, async (req, res) => {
  try {
    const bundle = await getProfessionalDiscoveryBundle({
      userId: userIdFromReq(req),
      marketplaceLimit: limitFromReq(req, 8),
      groupsLimit: limitFromReq(req, 8),
      blogsLimit: limitFromReq(req, 8)
    });
    return res.json({ success: true, data: bundle });
  } catch (error: any) {
    console.error('[professional-discovery] home failed', error?.message || error);
    return res.status(500).json({ success: false, error: 'Failed to load professional discovery' });
  }
});

router.get('/marketplace', optionalAuthMiddleware, async (req, res) => {
  try {
    const items = await getMarketplaceRecommendations(userIdFromReq(req), limitFromReq(req, 12));
    return res.json({ success: true, data: { items } });
  } catch (error: any) {
    console.error('[professional-discovery] marketplace failed', error?.message || error);
    return res.status(500).json({ success: false, error: 'Failed to load marketplace recommendations' });
  }
});

router.get('/groups', optionalAuthMiddleware, async (req, res) => {
  try {
    const items = await getGroupRecommendations(userIdFromReq(req), limitFromReq(req, 12));
    return res.json({ success: true, data: { items } });
  } catch (error: any) {
    console.error('[professional-discovery] groups failed', error?.message || error);
    return res.status(500).json({ success: false, error: 'Failed to load group recommendations' });
  }
});

router.get('/blogs', optionalAuthMiddleware, async (req, res) => {
  try {
    const items = await getBlogRecommendations(userIdFromReq(req), limitFromReq(req, 12));
    return res.json({ success: true, data: { items } });
  } catch (error: any) {
    console.error('[professional-discovery] blogs failed', error?.message || error);
    return res.status(500).json({ success: false, error: 'Failed to load blog recommendations' });
  }
});

router.get('/career', optionalAuthMiddleware, async (req, res) => {
  try {
    const bundle = await getProfessionalDiscoveryBundle({
      userId: userIdFromReq(req),
      marketplaceLimit: 4,
      groupsLimit: 4,
      blogsLimit: 4
    });
    return res.json({
      success: true,
      data: {
        actions: bundle.career,
        resumeTemplates: bundle.resumeTemplates,
        blogs: bundle.blogs,
        generatedAt: bundle.generatedAt
      }
    });
  } catch (error: any) {
    console.error('[professional-discovery] career failed', error?.message || error);
    return res.status(500).json({ success: false, error: 'Failed to load career intelligence' });
  }
});

/** Phase 20.3 — growth pulse (role + preference aware actions; additive). */
router.get('/growth-pulse', optionalAuthMiddleware, async (req, res) => {
  try {
    const pulse = await getGrowthPulse(userIdFromReq(req));
    return res.json({ success: true, data: pulse });
  } catch (error: any) {
    console.error('[professional-discovery] growth-pulse failed', error?.message || error);
    return res.status(500).json({ success: false, error: 'Failed to load growth pulse' });
  }
});

export default router;
