import express from 'express';
import {
  getPublicApiCatalog,
  listPublicGigs,
  listPublicJobs,
  listPublicPages,
  listPublicPosts,
  runPublicApiSearch
} from '../services/phase4.service';

const router = express.Router();

router.use((_req, res, next) => {
  res.setHeader('X-Scrolith-API-Version', 'v1');
  return next();
});

const handleError = (res: express.Response, error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const lower = message.toLowerCase();
  const status = lower.includes('required') || lower.includes('invalid') ? 400 : 500;
  if (status >= 500) console.error('[public-v1] request failed', error);
  return res.status(status).json({ success: false, error: message || fallback });
};

router.get('/catalog', async (_req, res) => {
  try {
    const data = await getPublicApiCatalog();
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to load public API catalog');
  }
});

router.get('/search', async (req, res) => {
  try {
    const data = await runPublicApiSearch({ q: req.query.q, type: req.query.type, limit: req.query.limit });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to run public search');
  }
});

router.get('/posts', async (req, res) => {
  try {
    const data = await listPublicPosts({ q: req.query.q, limit: req.query.limit });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to list public posts');
  }
});

router.get('/jobs', async (req, res) => {
  try {
    const data = await listPublicJobs({ q: req.query.q, limit: req.query.limit });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to list public jobs');
  }
});

router.get('/gigs', async (req, res) => {
  try {
    const data = await listPublicGigs({ q: req.query.q, limit: req.query.limit });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to list public gigs');
  }
});

router.get('/pages', async (req, res) => {
  try {
    const data = await listPublicPages({ q: req.query.q, limit: req.query.limit });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to list public pages');
  }
});

export default router;
