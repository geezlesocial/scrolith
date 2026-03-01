import express from 'express';
import {
  approveAdminDeveloperApp,
  disableAdminDeveloperApp,
  getAdminDeveloperConfig,
  listAdminDeveloperApps,
  listAdminDevelopers,
  rejectAdminDeveloperApp,
  suspendAdminDeveloper,
  unsuspendAdminDeveloper,
  updateAdminDeveloperConfig
} from '../../controllers/admin.dev.controller';
import {
  createAdminDeveloperDocPage,
  deleteAdminDeveloperDocPage,
  getAdminDeveloperDocs,
  updateAdminDeveloperDocPage,
  updateAdminDeveloperDocs
} from '../../controllers/dev.docs.controller';

const router = express.Router();

router.get('/config', getAdminDeveloperConfig);
router.put('/config', updateAdminDeveloperConfig);

router.get('/apps', listAdminDeveloperApps);
router.post('/apps/:id/approve', approveAdminDeveloperApp);
router.post('/apps/:id/reject', rejectAdminDeveloperApp);
router.post('/apps/:id/disable', disableAdminDeveloperApp);

router.get('/developers', listAdminDevelopers);
router.post('/developers/:id/suspend', suspendAdminDeveloper);
router.post('/developers/:id/unsuspend', unsuspendAdminDeveloper);

router.get('/docs', getAdminDeveloperDocs);
router.put('/docs', updateAdminDeveloperDocs);
router.post('/docs/pages', createAdminDeveloperDocPage);
router.put('/docs/pages/:id', updateAdminDeveloperDocPage);
router.delete('/docs/pages/:id', deleteAdminDeveloperDocPage);

export default router;
