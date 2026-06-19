import express from 'express';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth.middleware';
import {
  attachMarketplaceMedia,
  archiveMarketplaceListing,
  contactMarketplaceSeller,
  createMarketplaceListing,
  favoriteMarketplaceListing,
  getMarketplaceDashboardCounts,
  getMarketplaceListingByIdOrSlug,
  getMarketplaceSettings,
  listMarketplaceListings,
  listMarketplaceCategories,
  removeMarketplaceMedia,
  reportMarketplaceListing,
  reserveMarketplaceListing,
  markMarketplaceListingSold,
  submitMarketplaceListing,
  unfavoriteMarketplaceListing,
  updateMarketplaceListing
} from '../services/marketplace.service';

const router = express.Router();

const getUserContext = (req: express.Request) => ({
  id: String(req.user?.id || '').trim(),
  role: String(req.user?.role || '').trim()
});

const parseNumber = (value: unknown, fallback?: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseBoolean = (value: unknown, fallback = false) => {
  if (typeof value === 'boolean') return value;
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(normalized);
};

const parseOptionalString = (value: unknown) => {
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

const handleError = (res: express.Response, error: any, fallbackMessage: string) => {
  const status = Number(error?.status || error?.statusCode || 500);
  return res.status(Number.isFinite(status) ? status : 500).json({
    success: false,
    error: error?.message || fallbackMessage
  });
};

router.get('/settings', optionalAuthMiddleware, async (_req, res) => {
  try {
    const data = await getMarketplaceSettings();
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to load marketplace settings');
  }
});

router.get('/categories', optionalAuthMiddleware, async (_req, res) => {
  try {
    const data = await listMarketplaceCategories();
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to load marketplace categories');
  }
});

router.get('/dashboard', authMiddleware, async (req, res) => {
  try {
    const data = await getMarketplaceDashboardCounts(String(req.user?.id || ''));
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to load marketplace dashboard');
  }
});

router.get('/listings', optionalAuthMiddleware, async (req, res) => {
  try {
    const data = await listMarketplaceListings({
      page: parseNumber(req.query.page, 1),
      pageSize: parseNumber(req.query.pageSize, 24),
      search: parseOptionalString(req.query.search) || undefined,
      categoryId: parseOptionalString(req.query.categoryId),
      condition: parseOptionalString(req.query.condition),
      minPrice: parseNumber(req.query.minPrice),
      maxPrice: parseNumber(req.query.maxPrice),
      location: parseOptionalString(req.query.location),
      deliveryOption: parseOptionalString(req.query.deliveryOption),
      status: parseOptionalString(req.query.status),
      sort: parseOptionalString(req.query.sort),
      includeMine: parseBoolean(req.query.includeMine),
      includeAll: parseBoolean(req.query.includeAll),
      viewerId: req.user?.id || null,
      viewerRole: req.user?.role || null
    });
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to load marketplace listings');
  }
});

router.get('/listings/:idOrSlug', optionalAuthMiddleware, async (req, res) => {
  try {
    const data = await getMarketplaceListingByIdOrSlug(
      String(req.params.idOrSlug || '').trim(),
      req.user?.id || null,
      req.user?.role || null
    );
    if (!data) {
      return res.status(404).json({ success: false, error: 'Listing not found' });
    }
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to load marketplace listing');
  }
});

router.post('/listings', authMiddleware, async (req, res) => {
  try {
    const data = await createMarketplaceListing(req.user as any, req.body || {});
    return res.status(201).json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to create marketplace listing');
  }
});

router.put('/listings/:id', authMiddleware, async (req, res) => {
  try {
    const data = await updateMarketplaceListing(String(req.params.id || '').trim(), req.user as any, req.body || {});
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to update marketplace listing');
  }
});

router.delete('/listings/:id', authMiddleware, async (req, res) => {
  try {
    const data = await archiveMarketplaceListing(String(req.params.id || '').trim(), req.user as any);
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to delete marketplace listing');
  }
});

router.post('/listings/:id/submit', authMiddleware, async (req, res) => {
  try {
    const data = await submitMarketplaceListing(String(req.params.id || '').trim(), req.user as any);
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to submit marketplace listing');
  }
});

router.post('/listings/:id/mark-sold', authMiddleware, async (req, res) => {
  try {
    const data = await markMarketplaceListingSold(String(req.params.id || '').trim(), req.user as any);
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to mark marketplace listing sold');
  }
});

router.post('/listings/:id/reserve', authMiddleware, async (req, res) => {
  try {
    const data = await reserveMarketplaceListing(String(req.params.id || '').trim(), req.user as any);
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to reserve marketplace listing');
  }
});

router.post('/listings/:id/favorite', authMiddleware, async (req, res) => {
  try {
    const data = await favoriteMarketplaceListing(String(req.params.id || '').trim(), String(req.user?.id || '').trim());
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to favorite marketplace listing');
  }
});

router.delete('/listings/:id/favorite', authMiddleware, async (req, res) => {
  try {
    const data = await unfavoriteMarketplaceListing(String(req.params.id || '').trim(), String(req.user?.id || '').trim());
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to unfavorite marketplace listing');
  }
});

router.post('/listings/:id/report', authMiddleware, async (req, res) => {
  try {
    const data = await reportMarketplaceListing(String(req.params.id || '').trim(), String(req.user?.id || '').trim(), req.body || {});
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to report marketplace listing');
  }
});

router.post('/listings/:id/contact', authMiddleware, async (req, res) => {
  try {
    const data = await contactMarketplaceSeller(String(req.params.id || '').trim(), req.user as any, req.body || {});
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to contact marketplace seller');
  }
});

router.post('/listings/:id/media', authMiddleware, async (req, res) => {
  try {
    const data = await attachMarketplaceMedia(String(req.params.id || '').trim(), req.user as any, req.body || {});
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to add marketplace media');
  }
});

router.delete('/listings/:id/media/:mediaId', authMiddleware, async (req, res) => {
  try {
    const data = await removeMarketplaceMedia(
      String(req.params.id || '').trim(),
      String(req.params.mediaId || '').trim(),
      req.user as any
    );
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to remove marketplace media');
  }
});

export default router;
