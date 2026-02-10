import express from 'express';
import { getActivePreloaderPublic } from '../controllers/preloader.controller';

const router = express.Router();

router.get('/active', getActivePreloaderPublic);

export default router;

