import express from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import {
  getAdminConfig,
  updateAdminConfig,
  getAdsReviewQueue,
  approveAd,
  rejectAd
} from '../../controllers/community.admin.controller';

const router = express.Router();

// Temporary debug endpoint to confirm router is mounted at runtime
// NOTE: left intentionally before auth middleware so it can be hit without a token
router.get('/_debug_ping', (_req, res) => res.json({ success: true, msg: 'community admin router alive' }));

// Require auth and admin role for all admin community routes
router.use(authMiddleware);
router.use((req, res, next) => {
  const role = (req.user?.role || '').toString().toLowerCase();
  if (!role.includes('admin')) {
    return res.status(403).json({ success: false, error: 'Admin role required' });
  }
  return next();
});

router.get('/config', getAdminConfig);
router.put('/config', updateAdminConfig);

router.get('/ads/review-queue', getAdsReviewQueue);
router.post('/ads/:id/approve', approveAd);
router.post('/ads/:id/reject', rejectAd);

export default router;
