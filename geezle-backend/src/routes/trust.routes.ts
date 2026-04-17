import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { getTrustGraph } from '../services/phase2.service';

const router = express.Router();

const isPrivileged = (role?: string | null) => {
  const normalized = String(role || '').toLowerCase();
  return normalized.includes('admin') || normalized.includes('moderator') || normalized.includes('superadmin');
};

const handleError = (res: express.Response, error: unknown, fallback: string) => {
  const message = error instanceof Error ? error.message : fallback;
  const lower = message.toLowerCase();
  const status = lower.includes('not found') ? 404 : lower.includes('required') ? 400 : 500;
  if (status >= 500) console.error('[trust-graph] request failed', error);
  return res.status(status).json({ success: false, error: message || fallback });
};

router.get('/graph/me', authMiddleware, async (req, res) => {
  try {
    const userId = String(req.user?.id || '').trim();
    const data = await getTrustGraph(userId, userId, { includePrivate: true });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to load trust graph');
  }
});

router.get('/graph/:userId', authMiddleware, async (req, res) => {
  try {
    const viewerId = String(req.user?.id || '').trim();
    const targetUserId = String(req.params.userId || '').trim();
    const includePrivate = viewerId === targetUserId || isPrivileged(req.user?.role);
    const data = await getTrustGraph(viewerId, targetUserId, { includePrivate });
    return res.json({ success: true, data });
  } catch (error) {
    return handleError(res, error, 'Failed to load trust graph');
  }
});

export default router;
