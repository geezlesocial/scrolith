import express from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminMiddleware } from '../../middleware/admin.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { listKycRequests, updateKycStatus, getKycFormConfigAdmin, updateKycFormConfig } from '../../controllers/kyc.controller';

const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

router.get('/requests', requirePermission('kyc.read'), listKycRequests);
router.post('/submit', (_req, res) => {
  res.status(400).json({ success: false, error: 'Use /api/kyc/submit for user submissions' });
});
router.post('/:id/status', requirePermission('kyc.review'), updateKycStatus);
router.get('/form-config', requirePermission('kyc.read'), getKycFormConfigAdmin);
router.post('/form-config', requirePermission('kyc.review'), updateKycFormConfig);
// Legacy alias used by older admin bundles
router.get('/config', requirePermission('kyc.read'), getKycFormConfigAdmin);
router.post('/config', requirePermission('kyc.review'), updateKycFormConfig);

export default router;
