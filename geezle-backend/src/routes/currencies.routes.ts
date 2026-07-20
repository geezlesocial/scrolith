import express from 'express';
import { getActiveCurrencies } from '../controllers/currencies.controller';
import {
  getCurrencyQuote,
  getCurrencyRates,
  getMyCurrencyPreference,
  postCurrencyConvertPreview,
  postCurrencyQuote,
  putMyCurrencyPreference
} from '../controllers/currencyPreference.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// Public catalog (display)
router.get('/active', getActiveCurrencies);
router.get('/rates', getCurrencyRates);

// Authenticated preference + quotes
router.get('/preference', authMiddleware, getMyCurrencyPreference);
router.put('/preference', authMiddleware, putMyCurrencyPreference);
router.post('/quote', authMiddleware, postCurrencyQuote);
router.get('/quote/:id', authMiddleware, getCurrencyQuote);
router.post('/convert', authMiddleware, postCurrencyConvertPreview);

export default router;
