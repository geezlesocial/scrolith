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
import { exchangeApprovedLogin } from '../controllers/auth.controller';
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
import {
  beginPasskeyAuthentication,
  beginPasskeyRegistration,
  completePasskeyAuthentication,
  completePasskeyRegistration,
  listPasskeys,
  renamePasskey,
  revokePasskey
} from '../controllers/passkey.controller';
import {
  admin2faVerifyRateLimiter,
  forgotPasswordRateLimiter,
  loginRateLimiter,
  registerRateLimiter,
  resetPasswordRateLimiter
} from '../middleware/authRateLimit.middleware';

const router = express.Router();

// Health check (no auth)
router.get('/health', (_req, res) => {
  res.json({ success: true, service: 'auth' });
});

// Public routes — dedicated auth rate limits (no client header bypass)
router.post('/register', registerRateLimiter, register);
router.post('/login', loginRateLimiter, login);
router.post('/login/approval/exchange', loginRateLimiter, exchangeApprovedLogin);
router.post('/2fa/verify', admin2faVerifyRateLimiter, verify2FALogin);
router.post('/forgot-password', forgotPasswordRateLimiter, forgotPassword);
router.post('/reset-password', resetPasswordRateLimiter, resetPassword);
router.get('/oauth/:provider', startOAuth);
router.get('/oauth/:provider/callback', handleOAuthCallback);
// Phase 25B — exchange one-time OAuth completion code for session JWT (never in URL).
router.post(
  '/oauth/exchange',
  createRateLimiter({ windowMs: 60 * 1000, max: 30 }),
  exchangeOAuthCode
);

// WebAuthn/passkey ceremonies are feature-flagged server-side so the API can
// ship ahead of controlled user exposure.
const passkeyOptionsRateLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 20 });
const passkeyVerifyRateLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20 });
router.post('/passkeys/authentication/options', passkeyOptionsRateLimiter, beginPasskeyAuthentication);
router.post('/passkeys/authentication/verify', passkeyVerifyRateLimiter, completePasskeyAuthentication);

// Protected routes
router.get('/me', authMiddleware, getCurrentUser);
router.get('/2fa/status', authMiddleware, getMy2FAStatus);
router.post('/2fa/enroll/begin', authMiddleware, begin2FAEnrollment);
router.post('/2fa/enroll/confirm', authMiddleware, confirm2FAEnrollment);
router.post('/2fa/disable', authMiddleware, disableMy2FA);
router.get('/follow-onboarding', authMiddleware, getFollowOnboardingController);
router.post('/follow-onboarding/complete', authMiddleware, completeFollowOnboardingController);
router.post('/logout', authMiddleware, logout);
router.post('/passkeys/registration/options', authMiddleware, passkeyOptionsRateLimiter, beginPasskeyRegistration);
router.post('/passkeys/registration/verify', authMiddleware, passkeyVerifyRateLimiter, completePasskeyRegistration);
router.get('/passkeys', authMiddleware, listPasskeys);
router.patch('/passkeys/:id', authMiddleware, renamePasskey);
router.delete('/passkeys/:id', authMiddleware, revokePasskey);

// Phase 26 — language catalog + understood-language preferences
router.get('/languages/catalog', getLanguageCatalogController);
router.get('/me/language-preferences', authMiddleware, getMyLanguagePreferencesController);
router.put('/me/language-preferences', authMiddleware, updateMyLanguagePreferencesController);
router.patch('/me/language-preferences', authMiddleware, updateMyLanguagePreferencesController);

export default router;
