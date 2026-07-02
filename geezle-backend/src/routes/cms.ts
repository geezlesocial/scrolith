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
import { requirePermission } from '../middleware/rbac.middleware';
import { upload } from './files.routes';

const router = express.Router();

const setPublicCache = (res: Response, seconds = 120) => {
  const maxAge = Math.max(0, Math.trunc(seconds));
  if (!res.headersSent) {
    res.setHeader('Cache-Control', `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${Math.max(60, maxAge * 2)}`);
    res.setHeader('Vary', 'Accept-Encoding');
  }
};

const publicReadRoute = (
  seconds: number,
  handler: (req: Request, res: Response, next: any) => Promise<any> | any
) => (req: Request, res: Response, next: any) => {
  setPublicCache(res, seconds);
  return Promise.resolve(handler(req, res, next)).catch(next);
};

// Public homepage endpoint (no auth required) - MUST be before admin routes
router.get('/homepage', publicReadRoute(60, (req: Request, res: Response, next: any) => {
  console.log('📥 Homepage request received:', req.method, req.path, req.query);
  getHomepage(req, res).catch(next);
}));

// Public homepage data endpoints
router.get('/homepage/sections', publicReadRoute(120, (req: Request, res: Response, next: any) => {
  getHomepageSections(req, res).catch(next);
}));

// Public header/activity/hero-search (read-only)
router.get('/header', publicReadRoute(300, (req: Request, res: Response, next: any) => {
  getHeaderConfig(req, res).catch(next);
}));

// Development helper: accept POST /header without auth so local E2E and dev editors can save
if (process.env.NODE_ENV !== 'production') {
  router.post('/header', (req: Request, res: Response, next: any) => {
    console.log('⚠️ Dev-mode public POST /api/cms/header received — allowing unauthenticated save');
    // Call controller directly
    return saveHeaderConfig(req, res).catch(next);
  });
}

router.get('/activity', publicReadRoute(300, (req: Request, res: Response, next: any) => {
  getActivityConfig(req, res).catch(next);
}));

router.get('/hero-search', publicReadRoute(300, (req: Request, res: Response, next: any) => {
  getHeroSearchConfig(req, res).catch(next);
}));

// Public footer config (read-only)
router.get('/footer', publicReadRoute(300, (req: Request, res: Response, next: any) => {
  getFooterConfig(req, res).catch(next);
}));

router.get('/slides', publicReadRoute(300, (req: Request, res: Response, next: any) => {
  getHomeSlides(req, res).catch(next);
}));

// Public trending config (strip config)
router.get('/trending-config', publicReadRoute(300, (req: Request, res: Response, next: any) => {
  getTrendingConfig(req, res).catch(next);
}));

// Public CMS pages and categories
router.get('/pages', publicReadRoute(300, (req: Request, res: Response, next: any) => {
  getPages(req, res).catch(next);
}));
router.get('/pages/:slug', publicReadRoute(300, (req: Request, res: Response, next: any) => {
  getPageBySlug(req, res).catch(next);
}));
router.get('/categories', publicReadRoute(300, (req: Request, res: Response, next: any) => {
  getPageCategories(req, res).catch(next);
}));
// Public Blog endpoints
router.get('/blog/posts', publicReadRoute(300, (req: Request, res: Response, next: any) => {
  getBlogPosts(req, res).catch(next);
}));
router.get('/blog/posts/:slug', publicReadRoute(300, (req: Request, res: Response, next: any) => {
  getBlogPostBySlug(req, res).catch(next);
}));
router.get('/blog/categories', publicReadRoute(300, (req: Request, res: Response, next: any) => {
  getBlogCategories(req, res).catch(next);
}));
router.get('/blog/settings', publicReadRoute(300, (req: Request, res: Response, next: any) => {
  getBlogSettings(req, res).catch(next);
}));
router.get('/auth-pages', publicReadRoute(300, (req: Request, res: Response, next: any) => {
  getAuthPagesConfig(req, res).catch(next);
}));
router.get('/answers', publicReadRoute(300, (req: Request, res: Response, next: any) => {
  getAnswersPage(req, res).catch(next);
}));
router.get('/guides', publicReadRoute(300, (req: Request, res: Response, next: any) => {
  getGuidesPage(req, res).catch(next);
}));
router.get('/hire', publicReadRoute(300, (req: Request, res: Response, next: any) => {
  getHirePage(req, res).catch(next);
}));
router.get('/freelancer', publicReadRoute(300, (req: Request, res: Response, next: any) => {
  getFreelancerPage(req, res).catch(next);
}));

// Public platform settings (read-only)
router.get('/platform-settings', publicReadRoute(300, (req: Request, res: Response, next: any) => {
  getPlatformSettingsPublic(req, res).catch(next);
}));

// Public Affiliate content endpoint (no auth required)
router.get('/affiliate/content', publicReadRoute(300, (req: Request, res: Response, next: any) => {
  // Serve affiliate landing page content
  (async () => {
    const { getAffiliateContent } = await import('../controllers/cmsController');
    return getAffiliateContent(req, res);
  })().catch(next);
}));

// Apply middleware (will bypass in development) - for admin routes only
const adminRouter = express.Router();
adminRouter.use(authMiddleware);
adminRouter.use(adminMiddleware);

// Admin routes (require authentication)
// Header Config
adminRouter.route('/header')
  .get(requirePermission('cms.read'), getHeaderConfig)
  .post(requirePermission('cms.manage'), saveHeaderConfig);

// Footer Config (admin write-only; public read route above)
adminRouter.post('/footer', requirePermission('cms.manage'), saveFooterConfig);

// Activity Config
adminRouter.route('/activity')
  .get(requirePermission('cms.read'), getActivityConfig)
  .post(requirePermission('cms.manage'), saveActivityConfig);

// Hero Search Config
adminRouter.route('/hero-search')
  .get(requirePermission('cms.read'), getHeroSearchConfig)
  .post(requirePermission('cms.manage'), saveHeroSearchConfig);

// Trending
adminRouter.route('/trending')
  .get(requirePermission('cms.read'), getTrendingOpportunities)
  .post(requirePermission('cms.manage'), saveTrendingConfig);

// Trending Config
adminRouter.get('/trending-config', requirePermission('cms.read'), getTrendingConfig);

// Homepage Sections
adminRouter.route('/homepage-sections')
  .get(requirePermission('cms.read'), getHomepageSections)
  .post(requirePermission('cms.manage'), saveHomepageSection);

adminRouter.post('/homepage-sections/add', requirePermission('cms.manage'), addHomepageSection);
adminRouter.put('/homepage-sections/order', requirePermission('cms.manage'), updateSectionOrder);
adminRouter.delete('/homepage-sections/:id', requirePermission('cms.manage'), deleteHomepageSection);

// Homepage Sections (new architecture endpoints)
adminRouter.get('/homepage/sections', requirePermission('cms.read'), getHomepageSections);
adminRouter.post('/homepage/sections/update', requirePermission('cms.manage'), saveHomepageSection);
adminRouter.post('/homepage/sections/add', requirePermission('cms.manage'), addHomepageSection);
adminRouter.post('/homepage/sections/reorder', requirePermission('cms.manage'), updateSectionOrder);
adminRouter.post('/homepage/sections/delete', requirePermission('cms.manage'), (req: Request, res: Response) => {
  const fakeReq = { ...req, params: { id: String(req.body?.id ?? req.params?.id ?? '') } } as unknown as Request;
  return deleteHomepageSection(fakeReq, res);
});

// Home Slides
adminRouter.route('/home-slides')
  .get(requirePermission('cms.read'), getHomeSlides)
  .post(requirePermission('cms.manage'), saveHomeSlide);

adminRouter.put('/home-slides/order', requirePermission('cms.manage'), updateHomeSlideOrder);
adminRouter.delete('/home-slides/:id', requirePermission('cms.manage'), deleteHomeSlide);

// Home Slides (new architecture endpoints)
adminRouter.get('/slides', requirePermission('cms.read'), getHomeSlides);
adminRouter.post('/slides/save', requirePermission('cms.manage'), saveHomeSlide);
adminRouter.post('/slides/reorder', requirePermission('cms.manage'), updateHomeSlideOrder);
adminRouter.post('/slides/delete', requirePermission('cms.manage'), (req: Request, res: Response) => {
  const fakeReq = { ...req, params: { id: String(req.body?.id ?? req.params?.id ?? '') } } as unknown as Request;
  return deleteHomeSlide(fakeReq, res);
});

// Analytics
adminRouter.get('/homepage-analytics', requirePermission('cms.read'), getHomepageAnalytics);

// Media upload (admin)
adminRouter.post('/media', requirePermission('cms.manage'), upload.single('file'), uploadMedia);

// Admin CMS pages and categories
adminRouter.post('/pages', requirePermission('cms.manage'), savePage);
adminRouter.put('/pages/:id', requirePermission('cms.manage'), savePage);
adminRouter.delete('/pages/:id', requirePermission('cms.manage'), deletePage);

adminRouter.post('/categories', requirePermission('cms.manage'), savePageCategory);
adminRouter.put('/categories/:id', requirePermission('cms.manage'), savePageCategory);
adminRouter.delete('/categories/:id', requirePermission('cms.manage'), deletePageCategory);

// Admin Blog endpoints
adminRouter.get('/admin/blog/posts', requirePermission('cms.read'), getBlogPostsAdmin);
adminRouter.get('/admin/blog/posts/:id', requirePermission('cms.read'), getBlogPostByIdAdmin);
adminRouter.post('/blog/posts', requirePermission('cms.manage'), saveBlogPost);
adminRouter.put('/blog/posts/:id', requirePermission('cms.manage'), saveBlogPost);
adminRouter.delete('/blog/posts/:id', requirePermission('cms.manage'), deleteBlogPost);
adminRouter.post('/blog/categories', requirePermission('cms.manage'), saveBlogCategory);
adminRouter.put('/blog/categories/:id', requirePermission('cms.manage'), saveBlogCategory);
adminRouter.delete('/blog/categories/:id', requirePermission('cms.manage'), deleteBlogCategory);
adminRouter.post('/blog/settings', requirePermission('cms.manage'), saveBlogSettings);

adminRouter.post('/auth-pages', requirePermission('cms.manage'), saveAuthPagesConfig);
adminRouter.post('/answers', requirePermission('cms.manage'), saveAnswersPage);
adminRouter.post('/guides', requirePermission('cms.manage'), saveGuidesPage);
adminRouter.post('/hire', requirePermission('cms.manage'), saveHirePage);
adminRouter.post('/freelancer', requirePermission('cms.manage'), saveFreelancerPage);
adminRouter.get('/system-messages', requirePermission('cms.read'), getSystemMessagesConfig);
adminRouter.post('/system-messages', requirePermission('cms.manage'), saveSystemMessagesConfig);

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
adminRouter.post('/affiliate/content', requirePermission('cms.manage'), async (req: Request, res: Response, next: any) => {
  const { saveAffiliateContent } = await import('../controllers/cmsController');
  return saveAffiliateContent(req, res).catch(next);
});

export default router;

