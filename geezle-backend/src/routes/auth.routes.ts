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
import { startOAuth, handleOAuthCallback, exchangeOAuthCode } from '../controllers/oauth.controller';
import {
  getLanguageCatalogController,
  getMyLanguagePreferencesController,
  updateMyLanguagePreferencesController
} from '../controllers/userLanguagePreferences.controller';
import {
  begin2FAEnrollment,
  confirm2FAEnrollment,
  disableMy2FA,
  getMy2FAStatus,
  verify2FALogin
} from '../controllers/admin2fa.controller';
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
router.post(
  '/2fa/verify',
  createRateLimiter({ windowMs: 60 * 1000, max: 20 }),
  verify2FALogin
);
router.post('/forgot-password', createRateLimiter({ windowMs: 60 * 1000, max: 5 }), forgotPassword);
router.post('/reset-password', createRateLimiter({ windowMs: 60 * 1000, max: 10 }), resetPassword);
router.get('/oauth/:provider', startOAuth);
router.get('/oauth/:provider/callback', handleOAuthCallback);
// Phase 25B — exchange one-time OAuth completion code for session JWT (never in URL).
router.post(
  '/oauth/exchange',
  createRateLimiter({ windowMs: 60 * 1000, max: 30 }),
  exchangeOAuthCode
);

// Protected routes
router.get('/me', authMiddleware, getCurrentUser);
router.get('/2fa/status', authMiddleware, getMy2FAStatus);
router.post('/2fa/enroll/begin', authMiddleware, begin2FAEnrollment);
router.post('/2fa/enroll/confirm', authMiddleware, confirm2FAEnrollment);
router.post('/2fa/disable', authMiddleware, disableMy2FA);
router.get('/follow-onboarding', authMiddleware, getFollowOnboardingController);
router.post('/follow-onboarding/complete', authMiddleware, completeFollowOnboardingController);
router.post('/logout', authMiddleware, logout);

// Phase 26 — language catalog + understood-language preferences
router.get('/languages/catalog', getLanguageCatalogController);
router.get('/me/language-preferences', authMiddleware, getMyLanguagePreferencesController);
router.put('/me/language-preferences', authMiddleware, updateMyLanguagePreferencesController);
router.patch('/me/language-preferences', authMiddleware, updateMyLanguagePreferencesController);

export default router;
