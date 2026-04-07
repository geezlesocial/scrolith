import express from 'express';
import {
  createAdminContentTranslationGlossaryEntry,
  deleteAdminContentTranslationGlossaryEntry,
  getAdminContentTranslationConfig,
  listAdminContentTranslationAuditLogs,
  listAdminContentTranslationGlossary,
  runAdminContentTranslationTest,
  updateAdminContentTranslationConfig,
  updateAdminContentTranslationGlossaryEntry
} from '../../controllers/contentTranslation.controller';

const router = express.Router();

router.get('/config', getAdminContentTranslationConfig);
router.put('/config', updateAdminContentTranslationConfig);

router.get('/glossary', listAdminContentTranslationGlossary);
router.post('/glossary', createAdminContentTranslationGlossaryEntry);
router.put('/glossary/:id', updateAdminContentTranslationGlossaryEntry);
router.delete('/glossary/:id', deleteAdminContentTranslationGlossaryEntry);

router.get('/audit', listAdminContentTranslationAuditLogs);
router.post('/test', runAdminContentTranslationTest);

export default router;
