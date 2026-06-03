import express from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middleware/auth.middleware';
import { ResumeController } from './resume.controller';
import { MAX_RESUME_UPLOAD_BYTES } from './resume.validation';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_RESUME_UPLOAD_BYTES,
    files: 1
  }
});

export const freelancerResumeRoutes = express.Router();
freelancerResumeRoutes.use(authMiddleware);
freelancerResumeRoutes.get('/profile-source', ResumeController.profileSource);
freelancerResumeRoutes.get('/', ResumeController.listResumes);
freelancerResumeRoutes.post('/generate', ResumeController.generateResume);
freelancerResumeRoutes.get('/:id', ResumeController.getResume);
freelancerResumeRoutes.patch('/:id', ResumeController.updateResume);
freelancerResumeRoutes.post('/:id/regenerate', ResumeController.regenerateResume);
freelancerResumeRoutes.post('/:id/render-pdf', ResumeController.renderPdf);
freelancerResumeRoutes.get('/:id/download', ResumeController.downloadResume);
freelancerResumeRoutes.get('/:id/events', ResumeController.resumeEvents);
freelancerResumeRoutes.delete('/:id', ResumeController.deleteResume);

export const clientResumeReviewRoutes = express.Router();
clientResumeReviewRoutes.use(authMiddleware);
clientResumeReviewRoutes.get('/', ResumeController.listReviews);
clientResumeReviewRoutes.post('/upload', upload.single('file'), ResumeController.uploadReview);
clientResumeReviewRoutes.post('/profile-url', ResumeController.profileUrlReview);
clientResumeReviewRoutes.get('/:id', ResumeController.getReview);
clientResumeReviewRoutes.get('/:id/events', ResumeController.reviewEvents);
clientResumeReviewRoutes.delete('/:id', ResumeController.deleteReview);

export const resumePublicRoutes = express.Router();
resumePublicRoutes.get('/info', ResumeController.publicInfo);
