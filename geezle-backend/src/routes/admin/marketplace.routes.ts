import express from 'express';
import {
  adminApproveMarketplaceListing,
  adminDeleteMarketplaceCategory,
  adminDeleteMarketplaceListing,
  adminFeatureMarketplaceListing,
  adminListMarketplaceCategories,
  adminListMarketplaceListings,
  adminListMarketplaceReports,
  adminRejectMarketplaceListing,
  adminResolveMarketplaceReport,
  adminRestoreMarketplaceListing,
  adminSuspendMarketplaceListing,
  adminUpsertMarketplaceCategory,
  createMarketplaceListing,
  getMarketplaceListingByIdOrSlug,
  getMarketplaceSettings,
  reportMarketplaceListing,
  updateMarketplaceListing,
  updateMarketplaceSettings
} from '../../services/marketplace.service';

const router = express.Router();

const handleError = (res: express.Response, error: any, fallbackMessage: string) => {
  const status = Number(error?.status || error?.statusCode || 500);
  return res.status(Number.isFinite(status) ? status : 500).json({
    success: false,
    error: error?.message || fallbackMessage
  });
};

router.get('/settings', async (_req, res) => {
  try {
    const data = await getMarketplaceSettings();
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to load marketplace settings');
  }
});

router.put('/settings', async (req, res) => {
  try {
    const data = await updateMarketplaceSettings(req.body || {}, req.user?.id || null);
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to update marketplace settings');
  }
});

router.get('/categories', async (_req, res) => {
  try {
    const data = await adminListMarketplaceCategories();
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to load marketplace categories');
  }
});

router.post('/categories', async (req, res) => {
  try {
    const data = await adminUpsertMarketplaceCategory(req.body || {}, req.user as any);
    return res.status(201).json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to create marketplace category');
  }
});

router.put('/categories/:id', async (req, res) => {
  try {
    const data = await adminUpsertMarketplaceCategory(req.body || {}, req.user as any, String(req.params.id || '').trim());
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to update marketplace category');
  }
});

router.delete('/categories/:id', async (req, res) => {
  try {
    const data = await adminDeleteMarketplaceCategory(String(req.params.id || '').trim(), req.user as any);
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to delete marketplace category');
  }
});

router.get('/listings', async (req, res) => {
  try {
    const data = await adminListMarketplaceListings({
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 24),
      search: String(req.query.search || '').trim() || undefined,
      status: String(req.query.status || '').trim() || null,
      reviewStatus: String(req.query.reviewStatus || '').trim() || null,
      categoryId: String(req.query.categoryId || '').trim() || null,
      sellerId: String(req.query.sellerId || '').trim() || null,
      reported: String(req.query.reported || '').trim() ? ['1', 'true', 'yes', 'on'].includes(String(req.query.reported).trim().toLowerCase()) : undefined,
      featured: String(req.query.featured || '').trim() ? ['1', 'true', 'yes', 'on'].includes(String(req.query.featured).trim().toLowerCase()) : undefined,
      sort: String(req.query.sort || '').trim() || null
    });
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to load marketplace listings');
  }
});

router.get('/listings/:id', async (req, res) => {
  try {
    const data = await getMarketplaceListingByIdOrSlug(String(req.params.id || '').trim(), req.user?.id || null, req.user?.role || null);
    if (!data) return res.status(404).json({ success: false, error: 'Listing not found' });
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to load marketplace listing');
  }
});

router.post('/listings', async (req, res) => {
  try {
    const data = await createMarketplaceListing(req.user as any, req.body || {}, true);
    return res.status(201).json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to create marketplace listing');
  }
});

router.put('/listings/:id', async (req, res) => {
  try {
    const data = await updateMarketplaceListing(String(req.params.id || '').trim(), req.user as any, req.body || {}, true);
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to update marketplace listing');
  }
});

router.delete('/listings/:id', async (req, res) => {
  try {
    const data = await adminDeleteMarketplaceListing(String(req.params.id || '').trim(), req.user as any);
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to delete marketplace listing');
  }
});

router.post('/listings/:id/approve', async (req, res) => {
  try {
    const data = await adminApproveMarketplaceListing(String(req.params.id || '').trim(), req.user as any);
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to approve marketplace listing');
  }
});

router.post('/listings/:id/reject', async (req, res) => {
  try {
    const data = await adminRejectMarketplaceListing(String(req.params.id || '').trim(), req.user as any, req.body || {});
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to reject marketplace listing');
  }
});

router.post('/listings/:id/suspend', async (req, res) => {
  try {
    const data = await adminSuspendMarketplaceListing(String(req.params.id || '').trim(), req.user as any, req.body?.reason);
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to suspend marketplace listing');
  }
});

router.post('/listings/:id/restore', async (req, res) => {
  try {
    const data = await adminRestoreMarketplaceListing(String(req.params.id || '').trim(), req.user as any);
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to restore marketplace listing');
  }
});

router.post('/listings/:id/feature', async (req, res) => {
  try {
    const data = await adminFeatureMarketplaceListing(String(req.params.id || '').trim(), req.user as any, true);
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to feature marketplace listing');
  }
});

router.post('/listings/:id/unfeature', async (req, res) => {
  try {
    const data = await adminFeatureMarketplaceListing(String(req.params.id || '').trim(), req.user as any, false);
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to unfeature marketplace listing');
  }
});

router.get('/reports', async (req, res) => {
  try {
    const data = await adminListMarketplaceReports({
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || 24),
      status: String(req.query.status || '').trim() || undefined,
      search: String(req.query.search || '').trim() || undefined
    });
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to load marketplace reports');
  }
});

router.post('/reports/:id/resolve', async (req, res) => {
  try {
    const data = await adminResolveMarketplaceReport(String(req.params.id || '').trim(), req.user as any, req.body || {});
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to resolve marketplace report');
  }
});

router.post('/listings/:id/report', async (req, res) => {
  try {
    const data = await reportMarketplaceListing(String(req.params.id || '').trim(), String(req.user?.id || '').trim(), req.body || {});
    return res.json({ success: true, data });
  } catch (error: any) {
    return handleError(res, error, 'Failed to create marketplace report');
  }
});

export default router;
