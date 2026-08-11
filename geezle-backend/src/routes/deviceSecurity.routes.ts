import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  approveLoginApprovalController,
  getDeviceSecurityOverview,
  getLoginApprovalStatusController,
  listPendingLoginApprovalsController,
  registerTrustedDeviceController,
  rejectLoginApprovalController,
  revokeTrustedDeviceController,
  updateDeviceSecurityPreferences
} from '../controllers/deviceSecurity.controller';
import { createRateLimiter } from '../middlewares/rateLimit';

const router = express.Router();
const approvalMutationLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 30 });
const approvalStatusLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 90 });

router.get('/login-approvals/:attemptId/status', approvalStatusLimiter, (_req, res) =>
  res.status(405).json({
    success: false,
    error: 'Use POST for login approval status checks.',
    code: 'METHOD_NOT_ALLOWED'
  })
);
router.post('/login-approvals/:attemptId/status', approvalStatusLimiter, getLoginApprovalStatusController);

router.use(authMiddleware);

router.get('/overview', getDeviceSecurityOverview);
router.put('/preferences', updateDeviceSecurityPreferences);
router.post('/devices/register', registerTrustedDeviceController);
router.delete('/devices/:deviceId', revokeTrustedDeviceController);
router.get('/login-approvals/pending', listPendingLoginApprovalsController);
router.post('/login-approvals/:attemptId/approve', approvalMutationLimiter, approveLoginApprovalController);
router.post('/login-approvals/:attemptId/reject', approvalMutationLimiter, rejectLoginApprovalController);

export default router;
