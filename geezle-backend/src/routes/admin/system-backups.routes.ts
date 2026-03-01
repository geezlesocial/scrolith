import express from 'express';
import multer from 'multer';
import {
  createAdminSystemBackup,
  deleteAdminSystemBackup,
  deleteAdminSystemBackupBatch,
  downloadAdminSystemBackup,
  getAdminSystemBackupMeta,
  getAdminSystemBackups,
  importAdminSystemBackup,
  restoreAdminSystemBackup
} from '../../controllers/admin.systemBackup.controller';

const router = express.Router();

const backupImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Math.max(10 * 1024 * 1024, Number(process.env.BACKUP_IMPORT_LIMIT_BYTES || 250 * 1024 * 1024))
  }
});

router.get('/meta', getAdminSystemBackupMeta);
router.get('/', getAdminSystemBackups);
router.post('/create', createAdminSystemBackup);
router.get('/:id/download', downloadAdminSystemBackup);
router.post('/import', backupImportUpload.single('file'), importAdminSystemBackup);
router.post('/:id/restore', restoreAdminSystemBackup);
router.delete('/:id', deleteAdminSystemBackup);
router.post('/delete-batch', deleteAdminSystemBackupBatch);

export default router;
