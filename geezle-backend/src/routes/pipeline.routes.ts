import express from 'express';
import { authMiddleware } from '../middleware/auth.middleware';
import { listSavedPipelineItems, removePipelineItem, savePipelineItem } from '../controllers/pipeline.controller';

const router = express.Router();

router.get('/me', authMiddleware, listSavedPipelineItems);
router.post('/save', authMiddleware, savePipelineItem);
router.delete('/:entityType/:entityId', authMiddleware, removePipelineItem);

export default router;
