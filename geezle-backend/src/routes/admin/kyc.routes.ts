import express from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminMiddleware } from '../../middleware/admin.middleware';
import { listKycRequests, updateKycStatus, getKycFormConfigAdmin, updateKycFormConfig } from '../../controllers/kyc.controller';

const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

router.get('/requests', listKycRequests);
router.post('/submit', (_req, res) => {
  res.status(400).json({ success: false, error: 'Use /api/kyc/submit for user submissions' });
});
router.post('/:id/status', updateKycStatus);
router.get('/form-config', getKycFormConfigAdmin);
router.post('/form-config', updateKycFormConfig);
// Legacy alias used by older admin bundles
router.get('/config', getKycFormConfigAdmin);
router.post('/config', updateKycFormConfig);

export default router;
