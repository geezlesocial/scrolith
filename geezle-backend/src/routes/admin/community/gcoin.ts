import express from 'express';
import { authMiddleware } from '../../../middleware/auth.middleware';
import { adminMiddleware } from '../../../middleware/admin.middleware';
import {
  getSettings,
  saveSettings,
  getAllWallets,
  getAllTransactions,
  creditUser,
  adminAdjustBalance,
  getConversionRequests,
  processConversion,
  getAdminSummary,
  getFraudReports
} from '../../../controllers/gcoin.controller';

const router = express.Router();

router.use(authMiddleware, adminMiddleware);

router.get('/settings', getSettings);
router.post('/settings', saveSettings);

router.get('/wallets', getAllWallets);
router.get('/transactions', getAllTransactions);
router.post('/credit', creditUser);
router.post('/adjust/:userId', adminAdjustBalance);

router.get('/conversions', getConversionRequests);
router.post('/conversions/:id', processConversion);

router.get('/summary', getAdminSummary);
router.get('/fraud', getFraudReports);

export default router;
// Duplicate/legacy route implementation removed; this file should only export the controller-mapped router above.
