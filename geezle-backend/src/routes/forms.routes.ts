import express from 'express';
import { getFormsConfig } from '../controllers/forms.controller';

const router = express.Router();

router.get('/config', getFormsConfig);

export default router;
