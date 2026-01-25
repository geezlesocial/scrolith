// C:\Projects\geezle-backend\src\routes\cms.ts
import express, { Request, Response } from 'express';
import { 
  getHeaderConfig, 
  saveHeaderConfig,
  getFooterConfig, 
  saveFooterConfig,
  getActivityConfig,
  saveActivityConfig,
  getHomepageSections,
  saveHomepageSection,
  deleteHomepageSection,
  updateSectionOrder,
  addHomepageSection,
  getHomeSlides,
  saveHomeSlide,
  deleteHomeSlide,
  updateHomeSlideOrder,
  getTrendingOpportunities,
  saveTrendingConfig,
  getTrendingConfig,
  getHeroSearchConfig,
  saveHeroSearchConfig,
  getHomepageAnalytics,
  getHomepage
} from '../controllers/cmsController';
import { uploadMedia } from '../controllers/filesController';
import { authMiddleware } from '../middleware/auth.middleware';
import { adminMiddleware } from '../middleware/admin.middleware';
import { upload } from './files.routes';

const router = express.Router();

// Public homepage endpoint (no auth required) - MUST be before admin routes
router.get('/homepage', (req: Request, res: Response, next: any) => {
  console.log('📥 Homepage request received:', req.method, req.path, req.query);
  getHomepage(req, res).catch(next);
});

// Public homepage data endpoints
router.get('/homepage/sections', (req: Request, res: Response, next: any) => {
  getHomepageSections(req, res).catch(next);
});

router.get('/slides', (req: Request, res: Response, next: any) => {
  getHomeSlides(req, res).catch(next);
});

// Public trending config (strip config)
router.get('/trending-config', (req: Request, res: Response, next: any) => {
  getTrendingConfig(req, res).catch(next);
});

// Public Affiliate content endpoint (no auth required)
router.get('/affiliate/content', (req: Request, res: Response, next: any) => {
  // Serve affiliate landing page content
  (async () => {
    const { getAffiliateContent } = await import('../controllers/cmsController');
    return getAffiliateContent(req, res);
  })().catch(next);
});

// Apply middleware (will bypass in development) - for admin routes only
const adminRouter = express.Router();
adminRouter.use(authMiddleware);
adminRouter.use(adminMiddleware);

// Admin routes (require authentication)
// Header Config
adminRouter.route('/header')
  .get(getHeaderConfig)
  .post(saveHeaderConfig);

// Footer Config
adminRouter.route('/footer')
  .get(getFooterConfig)
  .post(saveFooterConfig);

// Activity Config
adminRouter.route('/activity')
  .get(getActivityConfig)
  .post(saveActivityConfig);

// Hero Search Config
adminRouter.route('/hero-search')
  .get(getHeroSearchConfig)
  .post(saveHeroSearchConfig);

// Trending
adminRouter.route('/trending')
  .get(getTrendingOpportunities)
  .post(saveTrendingConfig);

// Trending Config
adminRouter.get('/trending-config', getTrendingConfig);

// Homepage Sections
adminRouter.route('/homepage-sections')
  .get(getHomepageSections)
  .post(saveHomepageSection);

adminRouter.post('/homepage-sections/add', addHomepageSection);
adminRouter.put('/homepage-sections/order', updateSectionOrder);
adminRouter.delete('/homepage-sections/:id', deleteHomepageSection);

// Homepage Sections (new architecture endpoints)
adminRouter.get('/homepage/sections', getHomepageSections);
adminRouter.post('/homepage/sections/update', saveHomepageSection);
adminRouter.post('/homepage/sections/add', addHomepageSection);
adminRouter.post('/homepage/sections/reorder', updateSectionOrder);
adminRouter.post('/homepage/sections/delete', (req: Request, res: Response) => {
  const fakeReq = { ...req, params: { id: String(req.body?.id ?? req.params?.id ?? '') } } as unknown as Request;
  return deleteHomepageSection(fakeReq, res);
});

// Home Slides
adminRouter.route('/home-slides')
  .get(getHomeSlides)
  .post(saveHomeSlide);

adminRouter.put('/home-slides/order', updateHomeSlideOrder);
adminRouter.delete('/home-slides/:id', deleteHomeSlide);

// Home Slides (new architecture endpoints)
adminRouter.get('/slides', getHomeSlides);
adminRouter.post('/slides/save', saveHomeSlide);
adminRouter.post('/slides/reorder', updateHomeSlideOrder);
adminRouter.post('/slides/delete', (req: Request, res: Response) => {
  const fakeReq = { ...req, params: { id: String(req.body?.id ?? req.params?.id ?? '') } } as unknown as Request;
  return deleteHomeSlide(fakeReq, res);
});

// Analytics
adminRouter.get('/homepage-analytics', getHomepageAnalytics);

// Media upload (admin)
adminRouter.post('/media', upload.single('file'), uploadMedia);

// Test route
adminRouter.get('/test', (req: Request, res: Response) => {
  res.json({ 
    message: 'CMS API is working',
    user: req.user,
    timestamp: new Date().toISOString()
  });
});

// Mount admin routes
router.use(adminRouter);

// Admin: save affiliate content (requires auth + admin)
adminRouter.post('/affiliate/content', async (req: Request, res: Response, next: any) => {
  const { saveAffiliateContent } = await import('../controllers/cmsController');
  return saveAffiliateContent(req, res).catch(next);
});

export default router;


