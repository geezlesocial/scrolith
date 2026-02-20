import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  getKycStatus,
  submitKyc,
  updateKyc,
  uploadKycDocument,
  getKycDocumentTypes,
  getKycFormConfig
} from '../controllers/kyc.controller';

const router = express.Router();

router.use(authMiddleware);

router.get('/me', getKycStatus);
router.post('/submit', submitKyc);
router.put('/:id', updateKyc);
router.post('/documents', uploadKycDocument);
router.get('/document-types', getKycDocumentTypes);
router.get('/form-config', getKycFormConfig);

export default router;
