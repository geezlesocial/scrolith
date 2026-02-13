import express from 'express';
import {
  getI18nConfigPublic,
  getI18nDictionaryPublic,
  getI18nOverridesPublic
} from '../controllers/i18n.controller';

const router = express.Router();

router.get('/config', getI18nConfigPublic);
router.get('/dictionary', getI18nDictionaryPublic);
router.get('/overrides', getI18nOverridesPublic);

export default router;
