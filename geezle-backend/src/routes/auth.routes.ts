import express from 'express';
import { 
  register, 
  login, 
  getCurrentUser, 
  getFollowOnboardingController,
  completeFollowOnboardingController,
  logout,
  forgotPassword,
  resetPassword
} from '../controllers/auth.controller';
import { startOAuth, handleOAuthCallback } from '../controllers/oauth.controller';
import { authMiddleware } from '../middleware/auth.middleware';
import { createRateLimiter } from '../middlewares/rateLimit';

const router = express.Router();

// Health check (no auth)
router.get('/health', (_req, res) => {
  res.json({ success: true, service: 'auth' });
});

// Public routes
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', createRateLimiter({ windowMs: 60 * 1000, max: 5 }), forgotPassword);
router.post('/reset-password', createRateLimiter({ windowMs: 60 * 1000, max: 10 }), resetPassword);
router.get('/oauth/:provider', startOAuth);
router.get('/oauth/:provider/callback', handleOAuthCallback);

// Protected routes
router.get('/me', authMiddleware, getCurrentUser);
router.get('/follow-onboarding', authMiddleware, getFollowOnboardingController);
router.post('/follow-onboarding/complete', authMiddleware, completeFollowOnboardingController);
router.post('/logout', authMiddleware, logout);

export default router;
