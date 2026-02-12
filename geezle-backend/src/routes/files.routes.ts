import express from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth.middleware';
import { deleteFile, getUploadDir, listFiles, serveFileContent, uploadFile } from '../controllers/filesController';

const router = express.Router();

const uploadDir = getUploadDir();

const resolveUploadDriver = () =>
  String(process.env.UPLOAD_DRIVER || process.env.STORAGE_DRIVER || 'local')
    .trim()
    .toLowerCase();

const isMemoryUploadDriver = () => {
  const driver = resolveUploadDriver();
  return ['azure_blob', 'azure', 'blob'].includes(driver);
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
    fileSize: 200 * 1024 * 1024
  }
});

// Public file content endpoint: supports public assets and authenticated private files.
router.get('/content/:id', serveFileContent);

router.use(authMiddleware);

router.get('/', listFiles);
router.post('/upload', upload.single('file'), uploadFile);
router.post('/', upload.single('file'), uploadFile);
router.delete('/:id', deleteFile);

export { upload };
export default router;
