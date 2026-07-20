/**
 * Phase 28 — immutable FX quotes for payment confirmation windows.
 * Quotes are single-use and expire; rates never change after creation.
 */

import prisma from '../utils/prismaClient';
import { convertMoney } from './currencyConversion.service';
import { toMinorUnits } from './money.service';

const DEFAULT_TTL_SECONDS = 600; // 10 minutes

export type CreateFxQuoteInput = {
  userId?: string | null;
  contextType: string;
  contextId?: string | null;
  baseAmountMajor?: string | number;
  baseAmountMinor?: string;
  baseCurrency: string;
  displayCurrency: string;
  chargeCurrency?: string | null;
  markupBps?: number;
  ttlSeconds?: number;
  metadata?: Record<string, unknown> | null;
};

export const createFxQuote = async (input: CreateFxQuoteInput) => {
  const baseCurrency = String(input.baseCurrency || 'USD').trim().toUpperCase();
  const displayCurrency = String(input.displayCurrency || baseCurrency).trim().toUpperCase();
  const chargeCurrency = String(input.chargeCurrency || displayCurrency).trim().toUpperCase();
  const contextType = String(input.contextType || 'generic').trim().toLowerCase();
  if (!contextType) throw new Error('contextType is required');

  const baseMinor =
    input.baseAmountMinor != null
      ? String(input.baseAmountMinor)
      : toMinorUnits(input.baseAmountMajor ?? 0, baseCurrency);

  if (BigInt(baseMinor || '0') <= 0n) {
    throw new Error('base amount must be greater than zero');
  }

  const displayConv = await convertMoney({
    amountMinor: baseMinor,
    fromCurrency: baseCurrency,
    toCurrency: displayCurrency
  });
  const chargeConv =
    chargeCurrency === displayCurrency
      ? displayConv
      : await convertMoney({
          amountMinor: baseMinor,
          fromCurrency: baseCurrency,
          toCurrency: chargeCurrency
        });

  const ttl = Math.max(30, Math.min(3600, Number(input.ttlSeconds || DEFAULT_TTL_SECONDS)));
  const expiresAt = new Date(Date.now() + ttl * 1000);

  const quote = await prisma.fxQuote.create({
    data: {
      userId: input.userId || null,
      contextType,
      contextId: input.contextId || null,
      baseAmountMinor: baseMinor,
      baseCurrency,
      convertedAmountMinor: displayConv.to.amountMinor,
      displayCurrency,
      chargeAmountMinor: chargeConv.to.amountMinor,
      chargeCurrency,
      rateDecimal: displayConv.rate.rateDecimal,
      rateSource: displayConv.rate.source,
      snapshotId: displayConv.rate.snapshotId || null,
      overrideId: displayConv.rate.overrideId || null,
      roundingAdjustmentMinor: displayConv.roundingAdjustmentMinor,
      markupBps: Math.max(0, Math.round(Number(input.markupBps || 0))),
      expiresAt,
      status: 'active',
      metadata: (input.metadata as any) || undefined
    }
  });

  return serializeQuote(quote);
};

export const getFxQuote = async (id: string, userId?: string | null) => {
  const quote = await prisma.fxQuote.findUnique({ where: { id: String(id || '').trim() } });
  if (!quote) return null;
  if (userId && quote.userId && quote.userId !== userId) return null;
  return serializeQuote(quote);
};

export const consumeFxQuote = async (id: string, userId?: string | null) => {
  const quote = await prisma.fxQuote.findUnique({ where: { id: String(id || '').trim() } });
  if (!quote) throw new Error('Quote not found');
  if (userId && quote.userId && quote.userId !== userId) throw new Error('Quote not found');
  if (quote.status !== 'active') throw new Error(`Quote is ${quote.status}`);
  if (quote.expiresAt.getTime() <= Date.now()) {
    await prisma.fxQuote.update({
      where: { id: quote.id },
      data: { status: 'expired' }
    });
    throw new Error('Quote has expired; request a new quote');
  }
  const updated = await prisma.fxQuote.update({
    where: { id: quote.id },
    data: { status: 'consumed', consumedAt: new Date() }
  });
  return serializeQuote(updated);
};

export const expireStaleQuotes = async () => {
  const result = await prisma.fxQuote.updateMany({
    where: { status: 'active', expiresAt: { lte: new Date() } },
    data: { status: 'expired' }
  });
  return result.count;
};

const serializeQuote = (quote: any) => ({
  id: quote.id,
  userId: quote.userId,
  contextType: quote.contextType,
  contextId: quote.contextId,
  baseAmountMinor: quote.baseAmountMinor,
  baseCurrency: quote.baseCurrency,
  convertedAmountMinor: quote.convertedAmountMinor,
  displayCurrency: quote.displayCurrency,
  chargeAmountMinor: quote.chargeAmountMinor,
  chargeCurrency: quote.chargeCurrency,
  rateDecimal: quote.rateDecimal,
  rateSource: quote.rateSource,
  snapshotId: quote.snapshotId,
  overrideId: quote.overrideId,
  roundingAdjustmentMinor: quote.roundingAdjustmentMinor,
  markupBps: quote.markupBps,
  expiresAt: quote.expiresAt?.toISOString?.() || quote.expiresAt,
  consumedAt: quote.consumedAt?.toISOString?.() || quote.consumedAt || null,
  status: quote.status,
  metadata: quote.metadata || null,
  createdAt: quote.createdAt?.toISOString?.() || quote.createdAt
});
