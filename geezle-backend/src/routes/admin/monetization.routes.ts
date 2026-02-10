import express from 'express';
import {
  approveMonetizationApplicationAdmin,
  disableUserMonetizationAdmin,
  getMonetizationApplicationAdmin,
  getMonetizationSettingsAdmin,
  listMonetizationApplicationsAdmin,
  rejectMonetizationApplicationAdmin,
  updateMonetizationSettingsAdmin
} from '../../controllers/monetization.controller';

const router = express.Router();

router.get('/settings', getMonetizationSettingsAdmin);
router.put('/settings', updateMonetizationSettingsAdmin);
router.get('/applications', listMonetizationApplicationsAdmin);
router.get('/applications/:id', getMonetizationApplicationAdmin);
router.post('/applications/:id/approve', approveMonetizationApplicationAdmin);
router.post('/applications/:id/reject', rejectMonetizationApplicationAdmin);
router.post('/users/:userId/disable', disableUserMonetizationAdmin);

export default router;
