import express from 'express';
import { getActiveCurrencies } from '../controllers/currencies.controller';

const router = express.Router();

router.get('/active', getActiveCurrencies);

export default router;
