import express from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.middleware';
import { deleteFile, getUploadDir, listFiles, serveFileContent, uploadFile } from '../controllers/filesController';

const router = express.Router();
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

const uploadDir = getUploadDir();

const resolveUploadDriver = () =>
  String(process.env.UPLOAD_DRIVER || process.env.STORAGE_DRIVER || 'local')
    .trim()
    .toLowerCase();

const isMemoryUploadDriver = () => {
  const driver = resolveUploadDriver();
  return ['azure_blob', 'azure', 'blob', 'firebase_storage', 'firebase', 'gcs', 'google_cloud_storage'].includes(driver);
};

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({
  storage: isMemoryUploadDriver() ? multer.memoryStorage() : diskStorage,
  limits: {
    fileSize: MAX_UPLOAD_BYTES
  }
});

const handleSingleUpload: express.RequestHandler = (req, res, next) => {
  upload.single('file')(req, res, (error: any) => {
    if (error instanceof multer.MulterError) {
      const message =
        error.code === 'LIMIT_FILE_SIZE'
          ? `File exceeds upload limit (${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB)`
          : error.message || 'Upload failed';
      res.status(400).json({
        success: false,
        error: message,
        code: error.code
      });
      return;
    }

    if (error) {
      res.status(400).json({
        success: false,
        error: error.message || 'Upload failed'
      });
      return;
    }

    next();
  });
};

// Public file content endpoint: supports public assets and authenticated private files.
router.get('/content/:id', serveFileContent);

router.use(authMiddleware);

router.get('/', listFiles);
router.post('/upload', handleSingleUpload, uploadFile);
router.post('/', handleSingleUpload, uploadFile);
router.delete('/:id', deleteFile);

export { upload };
export default router;
