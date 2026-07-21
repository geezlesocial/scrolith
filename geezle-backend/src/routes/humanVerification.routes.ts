import express from 'express';
import rateLimit from 'express-rate-limit';
import {
  createHumanVerificationChallenge,
  getPublicHumanVerificationConfig,
  verifyHumanVerificationChallenge
} from '../controllers/humanVerification.controller';

const router = express.Router();

const hvLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many human verification requests' }
});

router.use(hvLimiter);

router.get('/config', getPublicHumanVerificationConfig);
router.post('/create', createHumanVerificationChallenge);
router.post('/verify', verifyHumanVerificationChallenge);

export default router;
