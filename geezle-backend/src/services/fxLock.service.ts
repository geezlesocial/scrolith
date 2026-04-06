import { PrismaClient } from '@prisma/client';
import prisma from '../utils/prismaClient';
import { resolveEffectiveCurrencies } from './fx.service';

type DbClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

export type FxLockEntityType =
  | 'WALLET_FUNDING_INTENT'
  | 'ORDER_PAYMENT_INTENT'
  | 'WITHDRAWAL_REQUEST';

export type FxLockRateSource = 'identity' | 'base' | 'snapshot' | 'override' | 'manual';

export type FxQuote = {
  fromCurrency: string;
  toCurrency: string;
  sourceAmount: number;
  convertedAmount: number;
  rate: number;
  baseCurrency: string;
  rateSource: FxLockRateSource;
  snapshotId?: string | null;
  overrideId?: string | null;
  stale: boolean;
  isFrozenSnapshot: boolean;
  markupBps: number;
  metadata?: Record<string, any> | null;
};

type FxLockInput = {
  entityType: FxLockEntityType;
  entityId: string;
  fromCurrency: string;
  toCurrency: string;
  sourceAmount: number;
  markupBps?: number;
  metadata?: Record<string, any> | null;
};

const normalizeCurrencyCode = (value: unknown, fallback = '') =>
  String(value || fallback)
    .trim()
    .toUpperCase();

const normalizeAmount = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

const roundTo = (value: number, digits: number) => {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(digits));
};

const deriveRateSource = (fromSource?: string, toSource?: string): FxLockRateSource => {
  const sources = [String(fromSource || '').trim().toLowerCase(), String(toSource || '').trim().toLowerCase()];
  if (sources.includes('override')) return 'override';
  if (sources.includes('manual')) return 'manual';
  if (sources.includes('snapshot')) return 'snapshot';
  if (sources.every((source) => source === 'base')) return 'base';
  if (sources.some((source) => source === 'base')) return 'snapshot';
  return 'manual';
};

export const quoteFxAmount = async (input: Omit<FxLockInput, 'entityType' | 'entityId'>): Promise<FxQuote> => {
  const fromCurrency = normalizeCurrencyCode(input.fromCurrency);
  const toCurrency = normalizeCurrencyCode(input.toCurrency);
  const sourceAmount = normalizeAmount(input.sourceAmount);
  const markupBps = Math.max(0, Math.round(normalizeAmount(input.markupBps, 0)));

  if (!fromCurrency || !toCurrency) {
    throw new Error('fromCurrency and toCurrency are required');
  }
  if (!Number.isFinite(sourceAmount) || sourceAmount <= 0) {
    throw new Error('sourceAmount must be greater than zero');
  }

  const resolved = await resolveEffectiveCurrencies();
  const sourceEntries = new Map(resolved.currencies.map((entry) => [entry.code, entry]));

  if (fromCurrency === toCurrency) {
    return {
      fromCurrency,
      toCurrency,
      sourceAmount: roundTo(sourceAmount, 8),
      convertedAmount: roundTo(sourceAmount, 8),
      rate: 1,
      baseCurrency: resolved.baseCurrency,
      rateSource: 'identity',
      snapshotId: resolved.snapshot?.id || null,
      overrideId: null,
      stale: Boolean(resolved.snapshot?.stale),
      isFrozenSnapshot: Boolean(resolved.snapshot?.isFrozen),
      markupBps,
      metadata: input.metadata || null
    };
  }

  const fromRate = resolved.rates.get(fromCurrency);
  const toRate = resolved.rates.get(toCurrency);
  if (!fromRate || !toRate) {
    throw new Error(`FX rate is unavailable for ${fromCurrency}/${toCurrency}`);
  }

  const baseConverted = (sourceAmount / fromRate) * toRate;
  const multiplier = 1 + markupBps / 10000;
  const convertedAmount = roundTo(baseConverted * multiplier, 8);
  const rate = roundTo((toRate / fromRate) * multiplier, 10);
  const fromEntry = sourceEntries.get(fromCurrency);
  const toEntry = sourceEntries.get(toCurrency);

  return {
    fromCurrency,
    toCurrency,
    sourceAmount: roundTo(sourceAmount, 8),
    convertedAmount,
    rate,
    baseCurrency: resolved.baseCurrency,
    rateSource: deriveRateSource(fromEntry?.rateSource, toEntry?.rateSource),
    snapshotId: resolved.snapshot?.id || null,
    overrideId: null,
    stale: Boolean(resolved.snapshot?.stale),
    isFrozenSnapshot: Boolean(resolved.snapshot?.isFrozen),
    markupBps,
    metadata: input.metadata || null
  };
};

export const createFxLock = async (
  input: FxLockInput,
  db: DbClient = prisma
) => {
  const entityType = String(input.entityType || '').trim().toUpperCase() as FxLockEntityType;
  const entityId = String(input.entityId || '').trim();
  if (!entityType || !entityId) {
    throw new Error('entityType and entityId are required');
  }

  const existing = await db.fxLock.findFirst({
    where: { entityType, entityId }
  });
  if (existing) return existing;

  const quote = await quoteFxAmount(input);
  return db.fxLock.create({
    data: {
      entityType,
      entityId,
      fromCurrency: quote.fromCurrency,
      toCurrency: quote.toCurrency,
      sourceAmount: quote.sourceAmount,
      convertedAmount: quote.convertedAmount,
      rate: quote.rate,
      baseCurrency: quote.baseCurrency,
      rateSource: quote.rateSource,
      snapshotId: quote.snapshotId || null,
      overrideId: quote.overrideId || null,
      stale: quote.stale,
      isFrozenSnapshot: quote.isFrozenSnapshot,
      markupBps: quote.markupBps,
      metadata: quote.metadata || undefined
    }
  });
};

export const listFxLocks = async (options: { limit?: number; entityType?: string; entityId?: string } = {}) => {
  const limit = Math.max(1, Math.min(100, Number(options.limit || 25)));
  return prisma.fxLock.findMany({
    where: {
      ...(options.entityType ? { entityType: String(options.entityType).trim().toUpperCase() } : {}),
      ...(options.entityId ? { entityId: String(options.entityId).trim() } : {})
    },
    orderBy: [{ createdAt: 'desc' }],
    take: limit
  });
};

export const getFxLockById = async (id: string) => {
  const normalized = String(id || '').trim();
  if (!normalized) throw new Error('Fx lock id is required');
  const lock = await prisma.fxLock.findUnique({ where: { id: normalized } });
  if (!lock) throw new Error('FX lock not found');
  return lock;
};
