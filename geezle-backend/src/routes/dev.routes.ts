import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { requireDeveloperProfile, requireLinkedDeveloper } from '../middleware/developer.middleware';
import {
  confirmDeveloperLinkScrolithLogin,
  getDevMe,
  requestDeveloperLink,
  verifyDeveloperLinkOtp
} from '../controllers/dev.link.controller';
import {
  addDeveloperAppRedirectUri,
  createDeveloperApp,
  deleteDeveloperAppRedirectUri,
  disableDeveloperApp,
  enableDeveloperApp,
  getDeveloperApp,
  getDeveloperAppLogs,
  getDeveloperAppRedirectUris,
  listDeveloperApps,
  rotateDeveloperAppSecret,
  updateDeveloperApp
} from '../controllers/dev.apps.controller';

const router = express.Router();

router.use(authMiddleware);

router.get('/me', requireDeveloperProfile, getDevMe);
router.post('/link/request', requireDeveloperProfile, requestDeveloperLink);
router.post('/link/verify-otp', requireDeveloperProfile, verifyDeveloperLinkOtp);
router.post('/link/confirm-scrolith-login', requireDeveloperProfile, confirmDeveloperLinkScrolithLogin);

router.use(requireLinkedDeveloper);

router.post('/apps', createDeveloperApp);
router.get('/apps', listDeveloperApps);
router.get('/apps/:id', getDeveloperApp);
router.put('/apps/:id', updateDeveloperApp);
router.post('/apps/:id/rotate-secret', rotateDeveloperAppSecret);
router.post('/apps/:id/disable', disableDeveloperApp);
router.post('/apps/:id/enable', enableDeveloperApp);
router.get('/apps/:id/logs', getDeveloperAppLogs);
router.get('/apps/:id/redirect-uris', getDeveloperAppRedirectUris);
router.post('/apps/:id/redirect-uris', addDeveloperAppRedirectUri);
router.delete('/apps/:id/redirect-uris/:uriId', deleteDeveloperAppRedirectUri);

export default router;
