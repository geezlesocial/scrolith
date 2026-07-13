import express from 'express';
import { optionalAuthMiddleware } from '../middleware/auth.middleware';
import { getDiscoveryV2 } from '../services/phase2.service';
import { getOrchestratedMemberFeed } from '../services/feedOrchestrator.service';

const router = express.Router();

const handleError = (res: express.Response, error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const lower = message.toLowerCase();
  const status = lower.includes('required') || lower.includes('invalid') ? 400 : 500;
  if (status >= 500) console.error('[discovery-v2] request failed', error);
  return res.status(status).json({ success: false, error: message || fallback });
};

const isAnonymousRequest = (req: express.Request) =>
  !req.user?.id &&
  !req.headers.authorization &&
  !req.headers.cookie;

const setPublicCache = (res: express.Response, seconds = 120) => {
  if (res.headersSent) return;
  const maxAge = Math.max(0, Math.trunc(seconds));
  res.setHeader(
    'Cache-Control',
    `public, max-age=${maxAge}, s-maxage=${maxAge}, stale-while-revalidate=${Math.max(60, maxAge * 2)}`
  );
  res.setHeader('Vary', 'Accept-Encoding');
};

router.get('/v2', optionalAuthMiddleware, async (req, res) => {
  try {
    if (isAnonymousRequest(req)) {
      setPublicCache(res, 120);
    }
    const data = await getDiscoveryV2({
      query: req.query.q || req.query.query,
      mode: req.query.mode,
      limit: req.query.limit,
      viewerId: req.user?.id || null
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to load discovery feed');
  }
});

router.get('/v2/feed', optionalAuthMiddleware, async (req, res) => {
  try {
    if (isAnonymousRequest(req)) {
      setPublicCache(res, 120);
    }
    const data = await getDiscoveryV2({
      query: req.query.q || req.query.query,
      mode: req.query.mode,
      limit: req.query.limit,
      viewerId: req.user?.id || null
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to load discovery feed');
  }
});

router.get('/v2/search', optionalAuthMiddleware, async (req, res) => {
  try {
    if (isAnonymousRequest(req)) {
      setPublicCache(res, 90);
    }
    const data = await getDiscoveryV2({
      query: req.query.q || req.query.query,
      mode: req.query.mode || 'for_you',
      limit: req.query.limit || 30,
      viewerId: req.user?.id || null
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to run discovery search');
  }
});

router.get('/v2/briefing', optionalAuthMiddleware, async (req, res) => {
  try {
    if (isAnonymousRequest(req)) {
      setPublicCache(res, 180);
    }
    const [forYou, hire, sell] = await Promise.all([
      getDiscoveryV2({ mode: 'for_you', limit: 8, viewerId: req.user?.id || null }),
      getDiscoveryV2({ mode: 'hire', limit: 6, viewerId: req.user?.id || null }),
      getDiscoveryV2({ mode: 'sell', limit: 6, viewerId: req.user?.id || null })
    ]);
    return res.json({
      success: true,
      data: {
        generatedAt: new Date().toISOString(),
        sections: [
          { key: 'for_you', label: 'For You', items: forYou.items },
          { key: 'hire', label: 'Hiring Signals', items: hire.items },
          { key: 'sell', label: 'Seller Discovery', items: sell.items }
        ],
        personalization: forYou.personalization
      }
    });
  } catch (error) {
    return handleError(res, error, 'Failed to load discovery briefing');
  }
});

/**
 * Unified continuous feed for member-home and /community.
 * Additive; does not replace GET /community/feed or GET /discovery/v2/feed.
 */
router.get('/v2/member-feed', optionalAuthMiddleware, async (req, res) => {
  try {
    if (isAnonymousRequest(req)) {
      // Short public cache only for fully anonymous unpersonalized responses.
      setPublicCache(res, 30);
    } else {
      res.setHeader('Cache-Control', 'private, no-store');
    }
    const data = await getOrchestratedMemberFeed({
      viewerId: req.user?.id || null,
      surface: (req.query.surface as string) || 'member_home',
      mode: (req.query.mode as string) || 'for_you',
      limit: req.query.limit as any,
      cursor: (req.query.cursor as string) || null,
      topic: (req.query.topic as string) || undefined,
      region: (req.query.region as string) || undefined
    });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to load member feed');
  }
});

export default router;
