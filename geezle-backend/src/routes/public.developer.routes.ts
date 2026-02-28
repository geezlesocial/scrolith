import express from 'express';
import { getPublicDeveloperConfig } from '../controllers/dev.public.controller';

const router = express.Router();

router.get('/config', getPublicDeveloperConfig);

export default router;
