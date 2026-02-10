// C:\Projects\Scrolith-backend\src\routes\cms.ts
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
  getHomepage,
  getPages,
  getPageBySlug,
  savePage,
  deletePage,
  getPageCategories,
  savePageCategory,
  deletePageCategory,
  getBlogPosts,
  getBlogPostBySlug,
  getBlogPostsAdmin,
  getBlogPostByIdAdmin,
  saveBlogPost,
  deleteBlogPost,
  getBlogCategories,
  saveBlogCategory,
  deleteBlogCategory,
  getBlogSettings,
  saveBlogSettings,
  getAuthPagesConfig,
  saveAuthPagesConfig,
  getAnswersPage,
  saveAnswersPage,
  getGuidesPage,
  saveGuidesPage,
  getHirePage,
  saveHirePage,
  getFreelancerPage,
  saveFreelancerPage,
  getPlatformSettingsPublic
} from '../controllers/cmsController';
import { getSystemMessagesConfig, saveSystemMessagesConfig } from '../controllers/cms.system-messages.controller';
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

// Public header/activity/hero-search (read-only)
router.get('/header', (req: Request, res: Response, next: any) => {
  getHeaderConfig(req, res).catch(next);
});

// Development helper: accept POST /header without auth so local E2E and dev editors can save
if (process.env.NODE_ENV !== 'production') {
  router.post('/header', (req: Request, res: Response, next: any) => {
    console.log('⚠️ Dev-mode public POST /api/cms/header received — allowing unauthenticated save');
    // Call controller directly
    return saveHeaderConfig(req, res).catch(next);
  });
}

router.get('/activity', (req: Request, res: Response, next: any) => {
  getActivityConfig(req, res).catch(next);
});

router.get('/hero-search', (req: Request, res: Response, next: any) => {
  getHeroSearchConfig(req, res).catch(next);
});

// Public footer config (read-only)
router.get('/footer', (req: Request, res: Response, next: any) => {
  getFooterConfig(req, res).catch(next);
});

router.get('/slides', (req: Request, res: Response, next: any) => {
  getHomeSlides(req, res).catch(next);
});

// Public trending config (strip config)
router.get('/trending-config', (req: Request, res: Response, next: any) => {
  getTrendingConfig(req, res).catch(next);
});

// Public CMS pages and categories
router.get('/pages', (req: Request, res: Response, next: any) => {
  getPages(req, res).catch(next);
});
router.get('/pages/:slug', (req: Request, res: Response, next: any) => {
  getPageBySlug(req, res).catch(next);
});
router.get('/categories', (req: Request, res: Response, next: any) => {
  getPageCategories(req, res).catch(next);
});
// Public Blog endpoints
router.get('/blog/posts', (req: Request, res: Response, next: any) => {
  getBlogPosts(req, res).catch(next);
});
router.get('/blog/posts/:slug', (req: Request, res: Response, next: any) => {
  getBlogPostBySlug(req, res).catch(next);
});
router.get('/blog/categories', (req: Request, res: Response, next: any) => {
  getBlogCategories(req, res).catch(next);
});
router.get('/blog/settings', (req: Request, res: Response, next: any) => {
  getBlogSettings(req, res).catch(next);
});
router.get('/auth-pages', (req: Request, res: Response, next: any) => {
  getAuthPagesConfig(req, res).catch(next);
});
router.get('/answers', (req: Request, res: Response, next: any) => {
  getAnswersPage(req, res).catch(next);
});
router.get('/guides', (req: Request, res: Response, next: any) => {
  getGuidesPage(req, res).catch(next);
});
router.get('/hire', (req: Request, res: Response, next: any) => {
  getHirePage(req, res).catch(next);
});
router.get('/freelancer', (req: Request, res: Response, next: any) => {
  getFreelancerPage(req, res).catch(next);
});

// Public platform settings (read-only)
router.get('/platform-settings', (req: Request, res: Response, next: any) => {
  getPlatformSettingsPublic(req, res).catch(next);
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

// Footer Config (admin write-only; public read route above)
adminRouter.post('/footer', saveFooterConfig);

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

// Admin CMS pages and categories
adminRouter.post('/pages', savePage);
adminRouter.put('/pages/:id', savePage);
adminRouter.delete('/pages/:id', deletePage);

adminRouter.post('/categories', savePageCategory);
adminRouter.put('/categories/:id', savePageCategory);
adminRouter.delete('/categories/:id', deletePageCategory);

// Admin Blog endpoints
adminRouter.get('/admin/blog/posts', getBlogPostsAdmin);
adminRouter.get('/admin/blog/posts/:id', getBlogPostByIdAdmin);
adminRouter.post('/blog/posts', saveBlogPost);
adminRouter.put('/blog/posts/:id', saveBlogPost);
adminRouter.delete('/blog/posts/:id', deleteBlogPost);
adminRouter.post('/blog/categories', saveBlogCategory);
adminRouter.put('/blog/categories/:id', saveBlogCategory);
adminRouter.delete('/blog/categories/:id', deleteBlogCategory);
adminRouter.post('/blog/settings', saveBlogSettings);

adminRouter.post('/auth-pages', saveAuthPagesConfig);
adminRouter.post('/answers', saveAnswersPage);
adminRouter.post('/guides', saveGuidesPage);
adminRouter.post('/hire', saveHirePage);
adminRouter.post('/freelancer', saveFreelancerPage);
adminRouter.get('/system-messages', getSystemMessagesConfig);
adminRouter.post('/system-messages', saveSystemMessagesConfig);

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

