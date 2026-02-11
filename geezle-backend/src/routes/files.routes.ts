import express from 'express';
import multer from 'multer';
import path from 'path';
import { authMiddleware } from '../middleware/auth.middleware';
import { deleteFile, getUploadDir, listFiles, uploadFile } from '../controllers/filesController';

const router = express.Router();

const uploadDir = getUploadDir();
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 200 * 1024 * 1024
  }
});

router.use(authMiddleware);

router.get('/', listFiles);
router.post('/upload', upload.single('file'), uploadFile);
router.post('/', upload.single('file'), uploadFile);
router.delete('/:id', deleteFile);

export { upload };
export default router;
