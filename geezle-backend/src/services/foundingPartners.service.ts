import Stripe from 'stripe';
import { Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import prisma from '../utils/prismaClient';
import { encryptSecret } from '../utils/secretCipher';
import { getStripeClient } from './stripeConfig.service';
import { creditWallet } from './walletLedger.service';
import { calculateEqualDistribution } from './foundingPartners.math';
import { convertAmount, loadCurrencyConfig } from '../utils/currency';
import { createFxLock } from './fxLock.service';
import { gatewaySupportsCurrency } from './currencyPolicy.service';

export const FOUNDING_PARTNERS_KEY = 'founding-partners';
export const FOUNDING_PARTNERS_TERMS_VERSION = '2026-09-15-v1';

const money = (value: Decimal | number | string) => new Decimal(value).toDecimalPlaces(2);

const getOrCreateProgram = async () => prisma.foundingPartnerProgram.upsert({
  where: { programKey: FOUNDING_PARTNERS_KEY },
  create: { programKey: FOUNDING_PARTNERS_KEY },
  update: {}
});

const audit = async (programId: string, action: string, entityType: string, entityId: string | null, actorUserId?: string | null, metadata?: any) => {
  await prisma.foundingPartnerAuditLog.create({
    data: { programId, action, entityType, entityId, actorUserId: actorUserId || null, metadata }
  });
};

export const getFoundingPartnerProgram = async () => {
  const program = await getOrCreateProgram();
  const currencyConfig = await loadCurrencyConfig();
  const currencyOptions = currencyConfig.currencies.filter((entry) => entry.isActive && gatewaySupportsCurrency('stripe', entry.code)).map((entry) => ({ code: entry.code, amount: money(convertAmount(Number(program.enrollmentFee), program.currency, entry.code, currencyConfig).amount).toFixed(2) }));
  return {
    id: program.id,
    name: program.displayName,
    status: program.status,
    capacity: program.capacity,
    enrolledCount: program.enrolledCount,
    remainingCapacity: Math.max(0, program.capacity - program.enrolledCount),
    profitSharePercent: program.profitSharePercent.toString(),
    termYears: program.termYears,
    enrollmentFee: program.enrollmentFee.toString(),
    currency: program.currency,
    availableCurrencies: currencyOptions,
    termsVersion: FOUNDING_PARTNERS_TERMS_VERSION
  };
};

export const getMyFoundingPartnership = async (userId: string) => {
  const program = await getOrCreateProgram();
  const partner = await prisma.foundingPartner.findUnique({
    where: { userId },
    include: {
      distributions: {
        orderBy: { createdAt: 'desc' },
        take: 100,
        select: { id: true, amount: true, currency: true, status: true, creditedAt: true, createdAt: true }
      }
    }
  });
  const payment = await prisma.foundingPartnerEnrollmentPayment.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } });
  const total = partner?.distributions.reduce((sum, row) => sum.plus(row.amount), new Decimal(0)) || new Decimal(0);
  return {
    program: await getFoundingPartnerProgram(),
    status: partner?.status || 'NOT_ENROLLED',
    enrollmentDate: partner?.enrolledAt || null,
    paymentStatus: payment?.status || null,
    totalEarned: total.toFixed(2),
    distributions: partner?.distributions.map((row) => ({ ...row, amount: row.amount.toFixed(2) })) || []
  };
};

export const createEnrollmentCheckout = async (input: {
  userId: string;
  fullName: string;
  country: string;
  city: string;
  stateRegion?: string;
  taxId?: string;
  termsAccepted: boolean;
  idempotencyKey: string;
  requestedCurrency?: string;
  successUrl: string;
  cancelUrl: string;
}) => {
  if (!input.termsAccepted) throw new Error('Founding Partners terms must be accepted');
  if (!input.fullName.trim() || !input.country.trim() || !input.city.trim()) throw new Error('Full name, country, and city are required');
  if (!input.idempotencyKey.trim()) throw new Error('Idempotency-Key is required');
  const program = await getOrCreateProgram();
  if (program.status !== 'ACTIVE') throw new Error('Founding Partners enrollment is currently unavailable');

  const existingPartner = await prisma.foundingPartner.findUnique({ where: { userId: input.userId } });
  if (existingPartner) return { status: existingPartner.status, partnerId: existingPartner.id, checkoutUrl: null };

  const existingPayment = await prisma.foundingPartnerEnrollmentPayment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existingPayment) return { status: existingPayment.status, paymentId: existingPayment.id, checkoutUrl: existingPayment.providerReferenceId ? existingPayment.providerReferenceId : null };

  const stripe = await getStripeClient();
  if (!stripe) throw new Error('Stripe is not configured for Founding Partners enrollment');
  const requestedCurrency = String(input.requestedCurrency || program.currency).trim().toUpperCase();
  if (!gatewaySupportsCurrency('stripe', requestedCurrency)) throw new Error(`No active Stripe payment route supports ${requestedCurrency}`);
  const paymentData = { enrollment: { fullName: input.fullName, country: input.country, city: input.city, stateRegion: input.stateRegion || null, ...protectTaxId(input.taxId) } };
  const { payment, fxLock } = await prisma.$transaction(async (tx) => {
    const created = await tx.foundingPartnerEnrollmentPayment.create({ data: { programId: program.id, userId: input.userId, provider: 'stripe', idempotencyKey: input.idempotencyKey, amount: money(program.enrollmentFee), currency: program.currency, sourceCurrency: requestedCurrency, status: 'PENDING', providerPayload: paymentData } });
    const lock = await createFxLock({ entityType: 'FOUNDING_PARTNER_ENROLLMENT_PAYMENT', entityId: created.id, fromCurrency: program.currency, toCurrency: requestedCurrency, sourceAmount: Number(program.enrollmentFee), metadata: { userId: input.userId, programId: program.id, provider: 'stripe' } }, tx);
    const chargedAmount = money(lock.convertedAmount);
    const updated = await tx.foundingPartnerEnrollmentPayment.update({ where: { id: created.id }, data: { sourceAmount: lock.convertedAmount, sourceCurrency: requestedCurrency, chargedAmount, chargedCurrency: requestedCurrency, fxRate: lock.rate, fxRateSource: lock.rateSource, fxSnapshotId: lock.snapshotId, providerPayload: { ...paymentData, fxLockId: lock.id, settlement: { amount: program.enrollmentFee.toString(), currency: program.currency }, charge: { amount: chargedAmount.toString(), currency: requestedCurrency } } } });
    return { payment: updated, fxLock: lock };
  });
  try {
    const chargedAmount = money(payment.chargedAmount || fxLock.convertedAmount);
    const chargedCurrency = (payment.chargedCurrency || requestedCurrency).toLowerCase();
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price_data: { currency: chargedCurrency, product_data: { name: 'Scrolith Founding Partners enrollment' }, unit_amount: Math.round(Number(chargedAmount) * 100) }, quantity: 1 }],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
      client_reference_id: payment.id,
      metadata: { foundingPartnerPaymentId: payment.id, userId: input.userId },
      payment_intent_data: { metadata: { foundingPartnerPaymentId: payment.id, userId: input.userId } }
    }, { idempotencyKey: `founding-partner-checkout:${input.idempotencyKey}` });
    await prisma.foundingPartnerEnrollmentPayment.update({ where: { id: payment.id }, data: { providerReferenceId: session.id, providerIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : null, providerPayload: { ...(payment.providerPayload as any || {}), stripeSessionId: session.id } } });
    return { status: 'PENDING', paymentId: payment.id, checkoutUrl: session.url };
  } catch (error) {
    await prisma.foundingPartnerEnrollmentPayment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
    throw error;
  }
};

export const activateFoundingPartnerFromPayment = async (paymentId: string, providerReferenceId: string, settledAmount?: number | null, settledCurrency?: string | null, actorUserId?: string | null) => {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.foundingPartnerEnrollmentPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new Error('Founding Partners enrollment payment was not found');
    if (payment.status === 'COMPLETED' && payment.partnerId) return tx.foundingPartner.findUniqueOrThrow({ where: { id: payment.partnerId } });
    if (settledAmount == null || settledCurrency == null) throw new Error('Verified settlement details are required');
    if (!payment.chargedAmount || !payment.chargedCurrency || money(settledAmount).toFixed(2) !== money(payment.chargedAmount).toFixed(2) || settledCurrency.toUpperCase() !== payment.chargedCurrency.toUpperCase()) throw new Error('Founding Partners enrollment payment amount or currency could not be verified');
    if (money(payment.amount).toFixed(2) !== '2.00' || payment.currency.toUpperCase() !== 'USD') throw new Error('Founding Partners settlement configuration is invalid');
    const program = await tx.foundingPartnerProgram.findUnique({ where: { id: payment.programId } });
    if (!program || program.status !== 'ACTIVE') throw new Error('Founding Partners program is not active');
    const user = await tx.user.findUnique({ where: { id: payment.userId }, select: { id: true, name: true, country: true } });
    if (!user) throw new Error('User account was not found');
    const currentPartner = await tx.foundingPartner.findUnique({ where: { userId: user.id } });
    if (currentPartner) {
      await tx.foundingPartnerEnrollmentPayment.update({ where: { id: payment.id }, data: { status: 'COMPLETED', partnerId: currentPartner.id, providerReferenceId, settledAt: new Date() } });
      return currentPartner;
    }
    const reserved = await tx.foundingPartnerProgram.updateMany({ where: { id: program.id, status: 'ACTIVE', enrolledCount: { lt: program.capacity } }, data: { enrolledCount: { increment: 1 } } });
    if (reserved.count !== 1) throw new Error('Founding Partners capacity has been reached');
    const enrollment: any = (payment.providerPayload as any)?.enrollment || {};
    const partner = await tx.foundingPartner.create({
      data: {
        programId: program.id,
        userId: user.id,
        fullName: enrollment.fullName || user.name || 'Scrolith member',
        country: enrollment.country || user.country || 'Unknown',
        city: enrollment.city || 'Not provided',
        stateRegion: enrollment.stateRegion || null,
        encryptedTaxId: enrollment.encryptedTaxId || null,
        taxIdLast4: enrollment.taxIdLast4 || null,
        termsVersion: FOUNDING_PARTNERS_TERMS_VERSION,
        termsAcceptedAt: new Date()
      }
    });
    await tx.foundingPartnerEnrollmentPayment.update({ where: { id: payment.id }, data: { status: 'COMPLETED', partnerId: partner.id, providerReferenceId, settledAt: new Date() } });
    await tx.foundingPartnerAuditLog.create({ data: { programId: program.id, action: 'ENROLLMENT_COMPLETED', entityType: 'partner', entityId: partner.id, actorUserId: actorUserId || user.id, metadata: { paymentId: payment.id, providerReferenceId } } });
    return partner;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
};

export const upsertProfitPeriod = async (input: { year: number; sources: Array<{ sourceType: string; clearedAmount: number; adjustments?: number; notes?: string }>; notes?: string; actorUserId: string }) => {
  if (!Number.isInteger(input.year) || input.year < 2020 || input.year > 2200) throw new Error('Profit period year is invalid');
  if (!input.sources.length || input.sources.some((source) => !source.sourceType.trim() || !Number.isFinite(source.clearedAmount) || source.clearedAmount < 0 || !Number.isFinite(source.adjustments || 0))) throw new Error('Profit sources must contain valid non-negative cleared amounts');
  const program = await getOrCreateProgram();
  const period = await prisma.foundingPartnerProfitPeriod.upsert({
    where: { programId_periodYear: { programId: program.id, periodYear: input.year } },
    create: { programId: program.id, periodYear: input.year, notes: input.notes || null },
    update: { notes: input.notes || null }
  });
  if (period.status !== 'OPEN') throw new Error('Only open profit periods can be edited');
  await prisma.$transaction(input.sources.map((source) => prisma.foundingPartnerProfitSource.upsert({
    where: { periodId_sourceType: { periodId: period.id, sourceType: source.sourceType } },
    create: { periodId: period.id, sourceType: source.sourceType, clearedAmount: money(source.clearedAmount), adjustments: money(source.adjustments || 0), notes: source.notes || null },
    update: { clearedAmount: money(source.clearedAmount), adjustments: money(source.adjustments || 0), notes: source.notes || null }
  })));
  await audit(program.id, 'PROFIT_PERIOD_SOURCES_UPDATED', 'profit_period', period.id, input.actorUserId, { sourceCount: input.sources.length });
  return prisma.foundingPartnerProfitPeriod.findUniqueOrThrow({ where: { id: period.id }, include: { sources: true } });
};

export const closeProfitPeriod = async (periodId: string, actorUserId: string) => {
  const period = await prisma.foundingPartnerProfitPeriod.findUnique({ where: { id: periodId }, include: { sources: true } });
  if (!period || period.status !== 'OPEN') throw new Error('Profit period is not open');
  const clearedProfit = period.sources.reduce((sum, source) => sum.plus(source.clearedAmount).plus(source.adjustments), new Decimal(0)).toDecimalPlaces(2);
  const program = await prisma.foundingPartnerProgram.findUniqueOrThrow({ where: { id: period.programId } });
  const partnerPool = clearedProfit.mul(program.profitSharePercent).div(100).toDecimalPlaces(2);
  const updated = await prisma.foundingPartnerProfitPeriod.update({ where: { id: periodId }, data: { status: 'CLOSED', clearedProfit, partnerPool, closedAt: new Date() } });
  await audit(program.id, 'PROFIT_PERIOD_CLOSED', 'profit_period', periodId, actorUserId, { clearedProfit: clearedProfit.toFixed(2), partnerPool: partnerPool.toFixed(2) });
  return updated;
};

export const approveProfitPeriod = async (periodId: string, actorUserId: string) => {
  const period = await prisma.foundingPartnerProfitPeriod.findUniqueOrThrow({ where: { id: periodId } });
  if (period.status !== 'CLOSED') throw new Error('Only closed profit periods can be approved');
  const updated = await prisma.foundingPartnerProfitPeriod.update({ where: { id: periodId }, data: { status: 'APPROVED', approvedAt: new Date(), approvedById: actorUserId } });
  await audit(period.programId, 'PROFIT_PERIOD_APPROVED', 'profit_period', periodId, actorUserId);
  return updated;
};

export const createDistributionRun = async (periodId: string, actorUserId: string) => {
  const period = await prisma.foundingPartnerProfitPeriod.findUniqueOrThrow({ where: { id: periodId } });
  if (period.status !== 'APPROVED') throw new Error('Only approved profit periods can be distributed');
  const existing = await prisma.foundingPartnerDistributionRun.findUnique({ where: { periodId } });
  if (existing) return existing;
  const count = await prisma.foundingPartner.count({ where: { programId: period.programId, status: 'ACTIVE' } });
  if (count === 0) throw new Error('No active Founding Partners for this period');
  const perPartnerAmount = period.partnerPool.div(count).toDecimalPlaces(2);
  const run = await prisma.foundingPartnerDistributionRun.create({ data: { periodId, status: 'PENDING_APPROVAL', idempotencyKey: `founding-partners:${periodId}`, poolAmount: period.partnerPool, partnerCount: count, perPartnerAmount } });
  await audit(period.programId, 'DISTRIBUTION_RUN_CREATED', 'distribution_run', run.id, actorUserId, { partnerCount: count, perPartnerAmount: perPartnerAmount.toFixed(2) });
  return run;
};

export const approveDistributionRun = async (runId: string, actorUserId: string) => {
  const run = await prisma.foundingPartnerDistributionRun.findUniqueOrThrow({ where: { id: runId }, include: { period: true } });
  if (run.status !== 'PENDING_APPROVAL') throw new Error('Distribution run is not awaiting approval');
  if (run.period.approvedById === actorUserId) throw new Error('Distribution approval requires a different authorized reviewer');
  const updated = await prisma.foundingPartnerDistributionRun.update({ where: { id: runId }, data: { status: 'APPROVED', approvedById: actorUserId, approvedAt: new Date() } });
  await audit(run.period.programId, 'DISTRIBUTION_RUN_APPROVED', 'distribution_run', runId, actorUserId);
  return updated;
};

export const listProfitPeriods = async () => prisma.foundingPartnerProfitPeriod.findMany({ orderBy: { periodYear: 'desc' }, include: { sources: true, distributionRun: true } });

export const executeDistributionRun = async (runId: string, actorUserId: string) => {
  const run = await prisma.foundingPartnerDistributionRun.findUnique({ where: { id: runId }, include: { period: { include: { program: true } } } });
  if (!run || run.status !== 'APPROVED') throw new Error('Distribution run is not approved for execution');
  if (run.approvedById === actorUserId) throw new Error('Distribution execution requires a different authorized operator');
  const currencyConfig = await loadCurrencyConfig();
  await prisma.foundingPartnerDistributionRun.update({ where: { id: runId }, data: { status: 'PROCESSING', executedById: actorUserId, executedAt: new Date() } });
  const partners = await prisma.foundingPartner.findMany({ where: { programId: run.period.programId, status: 'ACTIVE' }, orderBy: { enrolledAt: 'asc' }, select: { id: true, userId: true } });
  if (partners.length !== run.partnerCount) throw new Error('Active partner count changed; recreate the distribution run');
  const { perPartner: base, remainder } = calculateEqualDistribution(run.poolAmount, partners.length);
  try {
    for (let index = 0; index < partners.length; index += 1) {
      const partner = partners[index];
      const amount = index === partners.length - 1 ? base.plus(remainder) : base;
      await prisma.$transaction(async (tx) => {
        const existing = await tx.foundingPartnerDistribution.findUnique({ where: { runId_partnerId: { runId, partnerId: partner.id } } });
        if (existing?.status === 'COMPLETED') return;
        const distribution = existing || await tx.foundingPartnerDistribution.create({ data: { runId, partnerId: partner.id, userId: partner.userId, amount, currency: 'USD', status: 'PENDING', idempotencyKey: `${run.id}:${partner.id}` } });
        const referenceId = `founding-partner:${run.id}:${partner.id}`;
        const existingWalletTransaction = await tx.transaction.findFirst({ where: { userId: partner.userId, referenceId } });
        const wallet = await tx.wallet.findUnique({ where: { userId: partner.userId }, select: { currency: true } });
        const walletCurrency = (wallet?.currency || run.period.program.currency).toUpperCase();
        const conversion = convertAmount(Number(amount.toFixed(2)), run.period.program.currency, walletCurrency, currencyConfig);
        if (!conversion.ok || !Number.isFinite(conversion.amount) || conversion.amount <= 0) throw new Error(`No valid FX rate for ${run.period.program.currency} to ${walletCurrency}`);
        const walletAmount = new Decimal(conversion.amount).toDecimalPlaces(2);
        const walletTransaction = existingWalletTransaction || await creditWallet(tx, { userId: partner.userId, amount: Number(walletAmount.toFixed(2)), currency: walletCurrency, referenceId, description: 'Scrolith Founding Partners annual profit participation', metadata: { distributionId: distribution.id, runId, periodId: run.periodId, sourceAmount: amount.toFixed(2), sourceCurrency: run.period.program.currency, fxRate: conversion.rate } });
        await tx.foundingPartnerDistribution.update({ where: { id: distribution.id }, data: { status: 'COMPLETED', walletTransactionId: walletTransaction.id, walletAmount, walletCurrency, fxRate: new Decimal(conversion.rate).toDecimalPlaces(8), creditedAt: new Date() } });
      });
    }
    const completed = await prisma.foundingPartnerDistribution.count({ where: { runId, status: 'COMPLETED' } });
    if (completed !== partners.length) throw new Error('Distribution reconciliation count mismatch');
    const credited = await prisma.foundingPartnerDistribution.aggregate({ where: { runId, status: 'COMPLETED' }, _sum: { amount: true } });
    if (!credited._sum.amount || new Decimal(credited._sum.amount).toFixed(2) !== new Decimal(run.poolAmount).toFixed(2)) throw new Error('Distribution reconciliation amount mismatch');
    await prisma.$transaction([
      prisma.foundingPartnerDistributionRun.update({ where: { id: runId }, data: { status: 'COMPLETED', completedAt: new Date() } }),
      prisma.foundingPartnerProfitPeriod.update({ where: { id: run.periodId }, data: { status: 'DISTRIBUTED', distributedAt: new Date() } })
    ]);
    await audit(run.period.programId, 'DISTRIBUTION_RUN_EXECUTED', 'distribution_run', runId, actorUserId, { partnerCount: partners.length, remainder: remainder.toFixed(2) });
    return prisma.foundingPartnerDistributionRun.findUniqueOrThrow({ where: { id: runId } });
  } catch (error) {
    await prisma.foundingPartnerDistributionRun.update({ where: { id: runId }, data: { status: 'FAILED', failureReason: error instanceof Error ? error.message : 'Distribution failed' } });
    throw error;
  }
};

export const handleFoundingPartnerStripeEvent = async (event: Stripe.Event) => {
  const object: any = event.data.object;
  const paymentId = object?.metadata?.foundingPartnerPaymentId || object?.client_reference_id;
  if (!paymentId) return false;
  if (event.type === 'checkout.session.completed' || event.type === 'payment_intent.succeeded') {
    const settledAmount = typeof object.amount_total === 'number' ? object.amount_total / 100 : (typeof object.amount_received === 'number' ? object.amount_received / 100 : null);
    const settledCurrency = object.currency || object.payment_currency || null;
    await activateFoundingPartnerFromPayment(String(paymentId), String(object.id), settledAmount, settledCurrency);
    return true;
  }
  if (event.type === 'payment_intent.payment_failed') {
    await prisma.foundingPartnerEnrollmentPayment.updateMany({ where: { id: String(paymentId), status: 'PENDING' }, data: { status: 'FAILED' } });
    return true;
  }
  return false;
};

export const maskTaxId = (taxId?: string | null) => taxId ? `***${taxId.slice(-4)}` : null;
export const protectTaxId = (taxId?: string | null) => taxId ? { encryptedTaxId: encryptSecret(taxId), taxIdLast4: taxId.slice(-4) } : {};
