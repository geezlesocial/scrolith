import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  getKycStatus,
  submitKyc,
  updateKyc,
  uploadKycDocument,
  uploadKycSecureDocument,
  getKycDocumentTypes,
  getKycFormConfig,
  kycUploadMulter,
  kycUploadRateLimiter,
  kycSubmitRateLimiter
} from '../controllers/kyc.controller';

const router = express.Router();

router.use(authMiddleware);

router.get('/me', getKycStatus);
router.post('/submit', kycSubmitRateLimiter, submitKyc);
router.put('/:id', kycSubmitRateLimiter, updateKyc);

// Phase 20.2: private KYC upload — client cannot set visibility
router.post(
  '/uploads',
  kycUploadRateLimiter,
  kycUploadMulter.single('file'),
  uploadKycSecureDocument
);

// Retired generic attachment path (no public media)
router.post('/documents', uploadKycDocument);

router.get('/document-types', getKycDocumentTypes);
router.get('/form-config', getKycFormConfig);

export default router;
