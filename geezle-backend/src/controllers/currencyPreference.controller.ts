import type { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { listActiveCurrenciesForUsers, convertMoney } from '../services/currencyConversion.service';
import { createFxQuote, getFxQuote, consumeFxQuote } from '../services/fxQuote.service';
import { resolveEffectiveCurrencies } from '../services/fx.service';

const normalizeCode = (value: unknown) =>
  String(value || '')
    .trim()
    .toUpperCase();

export const getActiveCurrenciesPublic = async (_req: Request, res: Response) => {
  try {
    const data = await listActiveCurrenciesForUsers();
    return res.json({ success: true, data });
  } catch (error: any) {
    console.error('[currency] list active failed', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load currencies' });
  }
};

export const getMyCurrencyPreference = async (req: Request, res: Response) => {
  try {
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const [user, catalog] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: {
          preferredCurrency: true,
          currencyPreferenceUpdatedAt: true,
          country: true
        }
      }),
      listActiveCurrenciesForUsers()
    ]);

    const preferred = normalizeCode(user?.preferredCurrency || '');
    const valid =
      preferred && catalog.currencies.some((c) => c.code === preferred)
        ? preferred
        : catalog.baseCurrency;

    return res.json({
      success: true,
      data: {
        preferredCurrency: valid,
        currencyPreferenceUpdatedAt: user?.currencyPreferenceUpdatedAt || null,
        baseCurrency: catalog.baseCurrency,
        availableCurrencies: catalog.currencies,
        snapshot: catalog.snapshot
      }
    });
  } catch (error: any) {
    console.error('[currency] get preference failed', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load preference' });
  }
};

export const putMyCurrencyPreference = async (req: Request, res: Response) => {
  try {
    const userId = String((req as any)?.user?.id || '').trim();
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const code = normalizeCode(req.body?.preferredCurrency || req.body?.currency);
    if (!code) {
      return res.status(400).json({ success: false, error: 'preferredCurrency is required' });
    }

    const catalog = await listActiveCurrenciesForUsers();
    const allowed = catalog.currencies.some((c) => c.code === code && c.isActive !== false);
    if (!allowed) {
      return res.status(400).json({
        success: false,
        error: `Currency ${code} is not enabled for users`
      });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: {
        preferredCurrency: code,
        currencyPreferenceUpdatedAt: new Date()
      },
      select: {
        preferredCurrency: true,
        currencyPreferenceUpdatedAt: true
      }
    });

    return res.json({
      success: true,
      data: {
        preferredCurrency: updated.preferredCurrency,
        currencyPreferenceUpdatedAt: updated.currencyPreferenceUpdatedAt,
        baseCurrency: catalog.baseCurrency
      }
    });
  } catch (error: any) {
    console.error('[currency] put preference failed', error);
    return res.status(500).json({ success: false, error: error?.message || 'Failed to save preference' });
  }
};

export const postCurrencyQuote = async (req: Request, res: Response) => {
  try {
    const userId = String((req as any)?.user?.id || '').trim() || null;
    const body = req.body || {};
    const baseCurrency = normalizeCode(body.baseCurrency || body.fromCurrency);
    const displayCurrency = normalizeCode(body.displayCurrency || body.toCurrency || body.preferredCurrency);
    const amount = body.baseAmountMajor ?? body.amount ?? body.baseAmount;
    if (!baseCurrency || !displayCurrency) {
      return res.status(400).json({ success: false, error: 'baseCurrency and displayCurrency are required' });
    }
    if (amount == null) {
      return res.status(400).json({ success: false, error: 'amount is required' });
    }

    const quote = await createFxQuote({
      userId,
      contextType: String(body.contextType || 'preview').trim(),
      contextId: body.contextId || null,
      baseAmountMajor: amount,
      baseCurrency,
      displayCurrency,
      chargeCurrency: body.chargeCurrency || displayCurrency,
      markupBps: body.markupBps,
      ttlSeconds: body.ttlSeconds,
      metadata: body.metadata || null
    });

    return res.json({ success: true, data: quote });
  } catch (error: any) {
    const message = error?.message || 'Failed to create quote';
    const status = /unavailable|invalid|required|greater/i.test(message) ? 400 : 500;
    return res.status(status).json({ success: false, error: message });
  }
};

export const getCurrencyQuote = async (req: Request, res: Response) => {
  try {
    const userId = String((req as any)?.user?.id || '').trim() || null;
    const quote = await getFxQuote(String(req.params.id || ''), userId);
    if (!quote) return res.status(404).json({ success: false, error: 'Quote not found' });
    return res.json({ success: true, data: quote });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load quote' });
  }
};

export const postCurrencyConvertPreview = async (req: Request, res: Response) => {
  try {
    const from = normalizeCode(req.body?.from || req.body?.fromCurrency || 'USD');
    const to = normalizeCode(req.body?.to || req.body?.toCurrency || from);
    const amount = req.body?.amount ?? req.body?.baseAmountMajor ?? 0;
    const result = await convertMoney({ amountMajor: amount, fromCurrency: from, toCurrency: to });
    return res.json({
      success: true,
      data: {
        from: result.from,
        to: result.to,
        fromMajor: result.fromMajor,
        toMajor: result.toMajor,
        rate: result.rate,
        formatted: result.formatted
      }
    });
  } catch (error: any) {
    return res.status(400).json({ success: false, error: error?.message || 'Conversion failed' });
  }
};

export const getCurrencyRates = async (_req: Request, res: Response) => {
  try {
    const resolved = await resolveEffectiveCurrencies();
    return res.json({
      success: true,
      data: {
        baseCurrency: resolved.baseCurrency,
        snapshot: resolved.snapshot,
        rates: Object.fromEntries(resolved.rates.entries()),
        currencies: resolved.currencies
      }
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error?.message || 'Failed to load rates' });
  }
};
