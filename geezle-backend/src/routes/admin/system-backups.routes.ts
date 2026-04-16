import express from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import {
  createAdminSystemBackup,
  deleteAdminSystemBackup,
  deleteAdminSystemBackupBatch,
  downloadAdminSystemBackup,
  getAdminSystemBackupMeta,
  getAdminSystemBackupJobs,
  getAdminSystemBackups,
  importAdminSystemBackup,
  restoreAdminSystemBackup,
  verifyAdminSystemBackup
} from '../../controllers/admin.systemBackup.controller';

const router = express.Router();

const backupImportLimitBytes = Math.max(
  10 * 1024 * 1024,
  Number(process.env.BACKUP_IMPORT_LIMIT_BYTES || 512 * 1024 * 1024)
);
const backupImportTempDir = path.resolve(__dirname, '../../../data/system-backups/tmp-imports');

const backupImportUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      try {
        fs.mkdirSync(backupImportTempDir, { recursive: true });
        cb(null, backupImportTempDir);
      } catch (error: any) {
        cb(error, backupImportTempDir);
      }
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(String(file?.originalname || '')).slice(0, 12).replace(/[^A-Za-z0-9.]/g, '');
      const safeExt = ext || '.bin';
      cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}${safeExt}`);
    }
  }),
  limits: {
    fileSize: backupImportLimitBytes
  }
});

const backupImportUploadMiddleware: express.RequestHandler = (req, res, next) => {
  backupImportUpload.single('file')(req, res, (error: any) => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        success: false,
        code: 'BACKUP_IMPORT_FILE_TOO_LARGE',
        error: `Backup file exceeds the allowed import size (${Math.round(backupImportLimitBytes / (1024 * 1024))} MB).`
      });
    }
    return res.status(400).json({
      success: false,
      code: 'BACKUP_IMPORT_UPLOAD_INVALID',
      error: error?.message || 'Backup upload failed.'
    });
  });
};

router.get('/meta', getAdminSystemBackupMeta);
router.get('/', getAdminSystemBackups);
router.get('/jobs', getAdminSystemBackupJobs);
router.post('/create', createAdminSystemBackup);
router.get('/:id/download', downloadAdminSystemBackup);
router.post('/:id/verify', verifyAdminSystemBackup);
router.post('/import', backupImportUploadMiddleware, importAdminSystemBackup);
router.post('/:id/restore', restoreAdminSystemBackup);
router.delete('/:id', deleteAdminSystemBackup);
router.post('/delete-batch', deleteAdminSystemBackupBatch);

export default router;
