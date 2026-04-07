import express from 'express';
import {
  createAdminI18nKey,
  createAdminI18nOverride,
  deleteAdminI18nKey,
  deleteAdminI18nOverride,
  exportAdminI18n,
  getAdminI18nConfig,
  importAdminI18n,
  listAdminI18nKeys,
  listAdminI18nOverrides,
  listAdminI18nValues,
  updateAdminI18nConfig,
  updateAdminI18nKey,
  updateAdminI18nOverride,
  upsertAdminI18nValue
} from '../../controllers/i18n.controller';
import contentTranslationAdminRoutes from './i18n.translation.routes';

const router = express.Router();

router.get('/config', getAdminI18nConfig);
router.put('/config', updateAdminI18nConfig);

router.get('/keys', listAdminI18nKeys);
router.post('/keys', createAdminI18nKey);
router.put('/keys/:id', updateAdminI18nKey);
router.delete('/keys/:id', deleteAdminI18nKey);

router.get('/values', listAdminI18nValues);
router.put('/values', upsertAdminI18nValue);

router.get('/overrides', listAdminI18nOverrides);
router.post('/overrides', createAdminI18nOverride);
router.put('/overrides/:id', updateAdminI18nOverride);
router.delete('/overrides/:id', deleteAdminI18nOverride);

router.post('/import', importAdminI18n);
router.get('/export', exportAdminI18n);
router.use('/translation', contentTranslationAdminRoutes);

export default router;
