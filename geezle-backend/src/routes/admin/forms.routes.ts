import express from 'express';
import { getFormsConfigAdmin, updateFormsConfig } from '../../controllers/forms.controller';

const router = express.Router();

router.get('/config', getFormsConfigAdmin);
router.post('/config', updateFormsConfig);

export default router;
