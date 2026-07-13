import express from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  deleteFile,
  getUploadDir,
  listFiles,
  serveFileContent,
  shouldUseMemoryUploadMulter,
  uploadFile
} from '../controllers/filesController';
import {
  getFileManifest,
  getFileProcessingStatus,
  serveFileVariantContent
} from '../controllers/files.mediaManifest.controller';

const router = express.Router();
const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

const uploadDir = getUploadDir();

/** Memory multer for GCS/DB/Firebase/Azure — never write product media to Cloud Run uploads/. */
const isMemoryUploadDriver = () => shouldUseMemoryUploadMulter();

const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]+/g, '_');
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
      const isSize = error.code === 'LIMIT_FILE_SIZE';
      const message = isSize
        ? `File exceeds upload limit (${Math.floor(MAX_UPLOAD_BYTES / (1024 * 1024))}MB)`
        : error.message || 'Upload failed';
      res.status(isSize ? 413 : 400).json({
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

// Phase 3A additive APIs (authorization enforced inside handlers).
router.get('/:fileId/processing-status', getFileProcessingStatus);
router.get('/:fileId/manifest', getFileManifest);
router.get('/:fileId/variants/:variantId/content', serveFileVariantContent);

router.use(authMiddleware);

router.get('/', listFiles);
router.post('/upload', handleSingleUpload, uploadFile);
router.post('/', handleSingleUpload, uploadFile);
router.delete('/:id', deleteFile);

export { upload };
export default router;
