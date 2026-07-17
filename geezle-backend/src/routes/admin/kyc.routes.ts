import express from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { adminMiddleware } from '../../middleware/admin.middleware';
import { requireAnyPermission } from '../../middleware/rbac.middleware';
import {
  listKycRequests,
  updateKycStatus,
  getKycFormConfigAdmin,
  updateKycFormConfig,
  viewKycDocument
} from '../../controllers/kyc.controller';
import { KYC_FINE_PERMISSIONS } from '../../services/kyc/kyc.constants';

const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

// Queue list: case read (legacy kyc.read still accepted)
router.get(
  '/requests',
  requireAnyPermission(KYC_FINE_PERMISSIONS.CASE_READ, KYC_FINE_PERMISSIONS.LEGACY_READ),
  listKycRequests
);

router.post('/submit', (_req, res) => {
  res.status(400).json({ success: false, error: 'Use /api/kyc/submit for user submissions' });
});

// Decision endpoint — fine-grained check also inside controller
router.post(
  '/:id/status',
  requireAnyPermission(
    KYC_FINE_PERMISSIONS.DECISION_APPROVE,
    KYC_FINE_PERMISSIONS.DECISION_REJECT,
    KYC_FINE_PERMISSIONS.DECISION_RESUBMIT,
    KYC_FINE_PERMISSIONS.DECISION_REVOKE,
    KYC_FINE_PERMISSIONS.LEGACY_REVIEW
  ),
  updateKycStatus
);

router.get(
  '/form-config',
  requireAnyPermission(KYC_FINE_PERMISSIONS.CONFIG_READ, KYC_FINE_PERMISSIONS.LEGACY_READ),
  getKycFormConfigAdmin
);
router.post(
  '/form-config',
  requireAnyPermission(KYC_FINE_PERMISSIONS.CONFIG_WRITE, KYC_FINE_PERMISSIONS.LEGACY_REVIEW),
  updateKycFormConfig
);
router.get(
  '/config',
  requireAnyPermission(KYC_FINE_PERMISSIONS.CONFIG_READ, KYC_FINE_PERMISSIONS.LEGACY_READ),
  getKycFormConfigAdmin
);
router.post(
  '/config',
  requireAnyPermission(KYC_FINE_PERMISSIONS.CONFIG_WRITE, KYC_FINE_PERMISSIONS.LEGACY_REVIEW),
  updateKycFormConfig
);

// Secure document viewer — document.view required
router.get(
  '/documents/:documentId/view',
  requireAnyPermission(
    KYC_FINE_PERMISSIONS.DOCUMENT_VIEW,
    KYC_FINE_PERMISSIONS.LEGACY_REVIEW,
    KYC_FINE_PERMISSIONS.LEGACY_READ
  ),
  viewKycDocument
);

export default router;
