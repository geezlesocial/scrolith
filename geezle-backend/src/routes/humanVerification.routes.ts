import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  createHumanVerificationChallenge,
  getPublicHumanVerificationConfig,
  verifyHumanVerificationChallenge
} from '../controllers/humanVerification.controller';

const router = express.Router();

// Dedicated HV budget — high enough for mobile carrier NATs + legitimate retries,
// still bounded to blunt scripted abuse. Global /api limiter uses a separate key.
const hvLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.HV_RATE_LIMIT_MAX || 600),
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many human verification requests. Please wait a moment and try again.',
    code: 'HV_RATE_LIMIT'
  }
});

router.use(hvLimiter);

router.get('/config', getPublicHumanVerificationConfig);
router.post('/create', createHumanVerificationChallenge);
router.post('/verify', verifyHumanVerificationChallenge);

export default router;
