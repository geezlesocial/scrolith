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
  admin2faIdentifierRateLimiter,
  forgotPasswordRateLimiter,
  forgotPasswordIdentifierRateLimiter,
  loginRateLimiter,
  loginIdentifierRateLimiter,
  registerRateLimiter,
  registerIdentifierRateLimiter,
  resetPasswordRateLimiter,
  resetPasswordIdentifierRateLimiter,
  createIdentifierRateLimiter
} from '../middleware/authRateLimit.middleware';
import { createSensitiveRateLimitStore } from '../middleware/distributedRateLimitStore';

const router = express.Router();

// Health check (no auth)
router.get('/health', (_req, res) => {
  res.json({ success: true, service: 'auth' });
});

// Sensitive public ceremonies use shared Redis-backed stores across replicas.
const oauthRateLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 30, store: createSensitiveRateLimitStore('scrolith:ratelimit:auth:oauth:') });
const oauthIdentifierRateLimiter = createIdentifierRateLimiter({ prefix: 'scrolith:ratelimit:auth:oauth:identifier:', windowMs: 15 * 60 * 1000, max: 30, getIdentifier: (req) => String(req.query?.state || req.query?.code || '') });
const oauthExchangeRateLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 30, store: createSensitiveRateLimitStore('scrolith:ratelimit:auth:oauth-exchange:') });
const oauthExchangeIdentifierRateLimiter = createIdentifierRateLimiter({ prefix: 'scrolith:ratelimit:auth:oauth-exchange:identifier:', windowMs: 60 * 1000, max: 30, getIdentifier: (req) => String(req.body?.code || req.body?.state || '') });
const passkeyOptionsRateLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 20, store: createSensitiveRateLimitStore('scrolith:ratelimit:auth:passkey-options:') });
const passkeyOptionsIdentifierRateLimiter = createIdentifierRateLimiter({ prefix: 'scrolith:ratelimit:auth:passkey-options:identifier:', windowMs: 60 * 1000, max: 20, getIdentifier: (req) => String(req.body?.email || req.body?.username || req.body?.userId || '') });
const passkeyVerifyRateLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 20, store: createSensitiveRateLimitStore('scrolith:ratelimit:auth:passkey-verify:') });
const passkeyVerifyIdentifierRateLimiter = createIdentifierRateLimiter({ prefix: 'scrolith:ratelimit:auth:passkey-verify:identifier:', windowMs: 15 * 60 * 1000, max: 20, getIdentifier: (req) => String(req.body?.challenge || req.body?.challengeToken || req.body?.credentialId || req.body?.userId || '') });

// Public routes — dedicated auth rate limits (no client header bypass)
router.post('/register', registerRateLimiter, registerIdentifierRateLimiter, register);
router.post('/login', loginRateLimiter, loginIdentifierRateLimiter, login);
router.post('/login/approval/exchange', loginRateLimiter, loginIdentifierRateLimiter, exchangeApprovedLogin);
router.post('/2fa/verify', admin2faVerifyRateLimiter, admin2faIdentifierRateLimiter, verify2FALogin);
router.post('/forgot-password', forgotPasswordRateLimiter, forgotPasswordIdentifierRateLimiter, forgotPassword);
router.post('/reset-password', resetPasswordRateLimiter, resetPasswordIdentifierRateLimiter, resetPassword);
router.get('/oauth/:provider', oauthRateLimiter, oauthIdentifierRateLimiter, startOAuth);
router.get('/oauth/:provider/callback', oauthRateLimiter, oauthIdentifierRateLimiter, handleOAuthCallback);
// Phase 25B — exchange one-time OAuth completion code for session JWT (never in URL).
router.post(
  '/oauth/exchange',
  oauthExchangeRateLimiter,
  oauthExchangeIdentifierRateLimiter,
  exchangeOAuthCode
);

// WebAuthn/passkey ceremonies are feature-flagged server-side so the API can
// ship ahead of controlled user exposure.
router.post('/passkeys/authentication/options', passkeyOptionsRateLimiter, passkeyOptionsIdentifierRateLimiter, beginPasskeyAuthentication);
router.post('/passkeys/authentication/verify', passkeyVerifyRateLimiter, passkeyVerifyIdentifierRateLimiter, completePasskeyAuthentication);

// Protected routes
router.get('/me', authMiddleware, getCurrentUser);
router.get('/2fa/status', authMiddleware, getMy2FAStatus);
router.post('/2fa/enroll/begin', authMiddleware, begin2FAEnrollment);
router.post('/2fa/enroll/confirm', authMiddleware, confirm2FAEnrollment);
router.post('/2fa/disable', authMiddleware, disableMy2FA);
router.get('/follow-onboarding', authMiddleware, getFollowOnboardingController);
router.post('/follow-onboarding/complete', authMiddleware, completeFollowOnboardingController);
router.post('/logout', authMiddleware, logout);
router.post('/passkeys/registration/options', authMiddleware, passkeyOptionsRateLimiter, passkeyOptionsIdentifierRateLimiter, beginPasskeyRegistration);
router.post('/passkeys/registration/verify', authMiddleware, passkeyVerifyRateLimiter, passkeyVerifyIdentifierRateLimiter, completePasskeyRegistration);
router.get('/passkeys', authMiddleware, listPasskeys);
router.patch('/passkeys/:id', authMiddleware, renamePasskey);
router.delete('/passkeys/:id', authMiddleware, revokePasskey);

// Phase 26 — language catalog + understood-language preferences
router.get('/languages/catalog', getLanguageCatalogController);
router.get('/me/language-preferences', authMiddleware, getMyLanguagePreferencesController);
router.put('/me/language-preferences', authMiddleware, updateMyLanguagePreferencesController);
router.patch('/me/language-preferences', authMiddleware, updateMyLanguagePreferencesController);

export default router;
