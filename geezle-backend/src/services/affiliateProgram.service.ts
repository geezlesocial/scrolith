import { randomUUID } from 'crypto';
import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';

export const AFFILIATE_SETTINGS_SCOPE = 'affiliate_program_settings';
export const AFFILIATE_APPLICATIONS_SCOPE = 'affiliate_program_applications';
export const AFFILIATE_PARTNERS_SCOPE = 'affiliate_program_partners';
export const AFFILIATE_REFERRALS_SCOPE = 'affiliate_program_referrals';
export const AFFILIATE_EARNINGS_SCOPE = 'affiliate_program_earnings';
export const AFFILIATE_WITHDRAWALS_SCOPE = 'affiliate_program_withdrawals';

export type AffiliateApplicationStatus = 'pending' | 'approved' | 'rejected';
export type AffiliatePartnerStatus = 'active' | 'inactive';

export type AffiliateProgramSettings = {
  enabled: boolean;
  firstPurchaseCommissionPercent: number;
  minimumWithdrawalAmount: number;
  autoApproveApplications: boolean;
  payoutCurrency: string;
  updatedAt: string;
};

export type AffiliateApplicationRecord = {
  id: string;
  userId: string;
  userName?: string;
  email?: string;
  website?: string;
  promotionStrategy?: string;
  audienceSize?: string;
  status: AffiliateApplicationStatus;
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  reviewNote?: string;
};

export type AffiliatePartnerRecord = {
  id: string;
  userId: string;
  userName?: string;
  email?: string;
  code: string;
  status: AffiliatePartnerStatus;
  commissionRate: number;
  referrals: number;
  earnings: number;
  availableBalance: number;
  approvedAt: string;
  approvedBy?: string;
};

export type AffiliateReferralRecord = {
  id: string;
  affiliateUserId: string;
  affiliateCode: string;
  referredUserId: string;
  referredEmail?: string;
  status: 'linked' | 'paid';
  linkedAt: string;
  firstQualifiedOrderId?: string;
};

export type AffiliateEarningRecord = {
  id: string;
  affiliateUserId: string;
  referredUserId: string;
  orderId: string;
  baseAmount: number;
  commissionRate: number;
  commissionAmount: number;
  currency: string;
  createdAt: string;
  withdrawalId?: string;
  withdrawnAt?: string;
};

export type AffiliateWithdrawalRecord = {
  id: string;
  affiliateUserId: string;
  amount: number;
  currency: string;
  status: 'completed' | 'failed';
  createdAt: string;
  walletTransactionId?: string;
};

const DEFAULT_SETTINGS: AffiliateProgramSettings = {
  enabled: true,
  firstPurchaseCommissionPercent: 10,
  minimumWithdrawalAmount: 25,
  autoApproveApplications: false,
  payoutCurrency: 'USD',
  updatedAt: new Date().toISOString()
};

const asObject = (value: any): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {};

const asNumber = (value: any, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const roundMoney = (value: number) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;

const normalizeCode = (value: string) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

const loadScope = async <T>(scope: string, fallback: T): Promise<T> => {
  const record = await prisma.appSetting.findUnique({ where: { scope } });
  if (!record || record.data === null || record.data === undefined) return fallback;
  return (record.data as T) || fallback;
};

const saveScope = async <T>(scope: string, data: T): Promise<T> => {
  await prisma.appSetting.upsert({
    where: { scope },
    create: { scope, data: data as any },
    update: { data: data as any }
  });
  return data;
};

const loadSettings = async (): Promise<AffiliateProgramSettings> => {
  const stored = asObject(await loadScope<any>(AFFILIATE_SETTINGS_SCOPE, DEFAULT_SETTINGS));
  const merged: AffiliateProgramSettings = {
    enabled: stored.enabled !== false,
    firstPurchaseCommissionPercent: clamp(asNumber(stored.firstPurchaseCommissionPercent, DEFAULT_SETTINGS.firstPurchaseCommissionPercent), 0, 100),
    minimumWithdrawalAmount: clamp(asNumber(stored.minimumWithdrawalAmount, DEFAULT_SETTINGS.minimumWithdrawalAmount), 0, 1_000_000),
    autoApproveApplications: Boolean(stored.autoApproveApplications),
    payoutCurrency: String(stored.payoutCurrency || DEFAULT_SETTINGS.payoutCurrency || 'USD').toUpperCase(),
    updatedAt: String(stored.updatedAt || DEFAULT_SETTINGS.updatedAt)
  };
  return merged;
};

const loadApplications = async (): Promise<AffiliateApplicationRecord[]> => {
  const data = await loadScope<any[]>(AFFILIATE_APPLICATIONS_SCOPE, []);
  return Array.isArray(data) ? data : [];
};

const loadPartners = async (): Promise<AffiliatePartnerRecord[]> => {
  const data = await loadScope<any[]>(AFFILIATE_PARTNERS_SCOPE, []);
  return Array.isArray(data) ? data : [];
};

const loadReferrals = async (): Promise<AffiliateReferralRecord[]> => {
  const data = await loadScope<any[]>(AFFILIATE_REFERRALS_SCOPE, []);
  return Array.isArray(data) ? data : [];
};

const loadEarnings = async (): Promise<AffiliateEarningRecord[]> => {
  const data = await loadScope<any[]>(AFFILIATE_EARNINGS_SCOPE, []);
  return Array.isArray(data) ? data : [];
};

const loadWithdrawals = async (): Promise<AffiliateWithdrawalRecord[]> => {
  const data = await loadScope<any[]>(AFFILIATE_WITHDRAWALS_SCOPE, []);
  return Array.isArray(data) ? data : [];
};

const emitAffiliateEventToUser = (userId: string, event: string, payload: any) => {
  try {
    realtime.emitToUser(userId, event, payload);
  } catch {
    // non-blocking
  }
};

const createInAppNotification = async (params: {
  userId: string;
  title: string;
  body: string;
  meta?: Record<string, any>;
}) => {
  try {
    const created = await prisma.notification.create({
      data: {
        userId: params.userId,
        type: 'affiliate',
        title: params.title,
        body: params.body,
        meta: params.meta || undefined
      }
    });
    emitAffiliateEventToUser(params.userId, 'notifications:new', {
      id: created.id,
      type: 'affiliate',
      title: created.title,
      body: created.body,
      meta: created.meta,
      createdAt: created.createdAt.toISOString()
    });
  } catch {
    // non-blocking
  }
};

const generateUniqueAffiliateCode = (seed: string, existingCodes: Set<string>) => {
  const seedToken = normalizeCode(seed).slice(0, 6) || 'SCROLI';
  for (let index = 0; index < 24; index += 1) {
    const suffix = Math.floor(100 + Math.random() * 900).toString();
    const code = `${seedToken}${suffix}`;
    if (!existingCodes.has(code)) return code;
  }
  return `${seedToken}${Date.now().toString().slice(-4)}`;
};

const recomputePartnerBalances = (partners: AffiliatePartnerRecord[], earnings: AffiliateEarningRecord[], withdrawals: AffiliateWithdrawalRecord[]) => {
  const totalsByAffiliate = new Map<string, number>();
  const withdrawnByAffiliate = new Map<string, number>();

  for (const earning of earnings) {
    totalsByAffiliate.set(
      earning.affiliateUserId,
      roundMoney((totalsByAffiliate.get(earning.affiliateUserId) || 0) + asNumber(earning.commissionAmount))
    );
  }

  for (const withdrawal of withdrawals) {
    if (withdrawal.status !== 'completed') continue;
    withdrawnByAffiliate.set(
      withdrawal.affiliateUserId,
      roundMoney((withdrawnByAffiliate.get(withdrawal.affiliateUserId) || 0) + asNumber(withdrawal.amount))
    );
  }

  return partners.map((partner) => {
    const earningsTotal = roundMoney(totalsByAffiliate.get(partner.userId) || 0);
    const withdrawnTotal = roundMoney(withdrawnByAffiliate.get(partner.userId) || 0);
    return {
      ...partner,
      earnings: earningsTotal,
      availableBalance: roundMoney(Math.max(0, earningsTotal - withdrawnTotal))
    };
  });
};

const upsertPartnerForApprovedApplication = async (
  application: AffiliateApplicationRecord,
  reviewerId: string | undefined,
  settings: AffiliateProgramSettings
) => {
  const partners = await loadPartners();
  const existingCodes = new Set(partners.map((entry) => normalizeCode(entry.code)));
  const existingIndex = partners.findIndex((entry) => entry.userId === application.userId);

  const affiliateCode =
    existingIndex >= 0
      ? normalizeCode(partners[existingIndex].code)
      : generateUniqueAffiliateCode(application.userName || application.email || application.userId, existingCodes);

  const partner: AffiliatePartnerRecord = existingIndex >= 0
    ? {
        ...partners[existingIndex],
        userName: application.userName || partners[existingIndex].userName,
        email: application.email || partners[existingIndex].email,
        code: affiliateCode || partners[existingIndex].code,
        status: 'active',
        commissionRate: clamp(asNumber(partners[existingIndex].commissionRate, settings.firstPurchaseCommissionPercent), 0, 100),
        approvedAt: partners[existingIndex].approvedAt || new Date().toISOString(),
        approvedBy: reviewerId || partners[existingIndex].approvedBy
      }
    : {
        id: randomUUID(),
        userId: application.userId,
        userName: application.userName,
        email: application.email,
        code: affiliateCode,
        status: 'active',
        commissionRate: settings.firstPurchaseCommissionPercent,
        referrals: 0,
        earnings: 0,
        availableBalance: 0,
        approvedAt: new Date().toISOString(),
        approvedBy: reviewerId
      };

  if (existingIndex >= 0) partners[existingIndex] = partner;
  else partners.unshift(partner);

  await saveScope(AFFILIATE_PARTNERS_SCOPE, partners);
  return partner;
};

const getOrCreateWallet = async (userId: string, currency: string) => {
  const existing = await prisma.wallet.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.wallet.create({
    data: {
      userId,
      currency: String(currency || 'USD').toUpperCase()
    }
  });
};

export const getAffiliateProgramSettings = async () => loadSettings();

export const saveAffiliateProgramSettings = async (payload: Partial<AffiliateProgramSettings>) => {
  const current = await loadSettings();
  const next: AffiliateProgramSettings = {
    enabled: payload.enabled !== undefined ? Boolean(payload.enabled) : current.enabled,
    firstPurchaseCommissionPercent: clamp(
      asNumber(payload.firstPurchaseCommissionPercent, current.firstPurchaseCommissionPercent),
      0,
      100
    ),
    minimumWithdrawalAmount: clamp(
      asNumber(payload.minimumWithdrawalAmount, current.minimumWithdrawalAmount),
      0,
      1_000_000
    ),
    autoApproveApplications: payload.autoApproveApplications !== undefined
      ? Boolean(payload.autoApproveApplications)
      : current.autoApproveApplications,
    payoutCurrency: String(payload.payoutCurrency || current.payoutCurrency || 'USD').toUpperCase(),
    updatedAt: new Date().toISOString()
  };
  await saveScope(AFFILIATE_SETTINGS_SCOPE, next);
  return next;
};

export const listAffiliateApplications = async () => {
  const applications = await loadApplications();
  return applications.sort((left, right) => new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime());
};

export const listAffiliatePartners = async () => {
  const partners = await loadPartners();
  const earnings = await loadEarnings();
  const withdrawals = await loadWithdrawals();
  const reconciled = recomputePartnerBalances(partners, earnings, withdrawals);
  await saveScope(AFFILIATE_PARTNERS_SCOPE, reconciled);
  return reconciled.sort((left, right) => asNumber(right.earnings) - asNumber(left.earnings));
};

export const updateAffiliatePartnerStatus = async (partnerId: string, status: AffiliatePartnerStatus) => {
  const partners = await loadPartners();
  const index = partners.findIndex((entry) => entry.id === partnerId);
  if (index < 0) {
    throw new Error('Affiliate partner not found');
  }
  partners[index] = { ...partners[index], status: status === 'inactive' ? 'inactive' : 'active' };
  await saveScope(AFFILIATE_PARTNERS_SCOPE, partners);
  return partners[index];
};

export const submitAffiliateApplication = async (input: {
  userId: string;
  userName?: string | null;
  email?: string | null;
  website?: string;
  promotionStrategy?: string;
  audienceSize?: string;
}) => {
  const settings = await loadSettings();
  const applications = await loadApplications();
  const existingIndex = applications.findIndex((entry) => entry.userId === input.userId);
  const existing = existingIndex >= 0 ? applications[existingIndex] : null;
  const nowIso = new Date().toISOString();

  const nextApplication: AffiliateApplicationRecord = {
    id: existing?.id || randomUUID(),
    userId: input.userId,
    userName: String(input.userName || existing?.userName || '').trim() || undefined,
    email: String(input.email || existing?.email || '').trim() || undefined,
    website: String(input.website || existing?.website || '').trim() || undefined,
    promotionStrategy: String(input.promotionStrategy || existing?.promotionStrategy || '').trim() || undefined,
    audienceSize: String(input.audienceSize || existing?.audienceSize || '').trim() || undefined,
    status: existing?.status === 'approved' ? 'approved' : 'pending',
    submittedAt: nowIso,
    reviewedAt: existing?.status === 'approved' ? existing.reviewedAt : undefined,
    reviewedBy: existing?.status === 'approved' ? existing.reviewedBy : undefined,
    reviewNote: existing?.status === 'approved' ? existing.reviewNote : undefined
  };

  if (existingIndex >= 0) applications[existingIndex] = nextApplication;
  else applications.unshift(nextApplication);

  await saveScope(AFFILIATE_APPLICATIONS_SCOPE, applications);

  if (nextApplication.status === 'approved') {
    const partner = (await loadPartners()).find((entry) => entry.userId === input.userId) || null;
    return { application: nextApplication, partner, autoApproved: false };
  }

  if (settings.autoApproveApplications) {
    const approved = await approveAffiliateApplication(nextApplication.id, 'system-auto');
    return { application: approved.application, partner: approved.partner, autoApproved: true };
  }

  return { application: nextApplication, partner: null, autoApproved: false };
};

export const approveAffiliateApplication = async (applicationId: string, reviewerId?: string, reviewNote?: string) => {
  const applications = await loadApplications();
  const settings = await loadSettings();
  const index = applications.findIndex((entry) => entry.id === applicationId);
  if (index < 0) throw new Error('Application not found');

  const nextApplication: AffiliateApplicationRecord = {
    ...applications[index],
    status: 'approved',
    reviewedAt: new Date().toISOString(),
    reviewedBy: reviewerId || applications[index].reviewedBy,
    reviewNote: reviewNote !== undefined ? reviewNote : applications[index].reviewNote
  };
  applications[index] = nextApplication;
  await saveScope(AFFILIATE_APPLICATIONS_SCOPE, applications);

  const partner = await upsertPartnerForApprovedApplication(nextApplication, reviewerId, settings);
  emitAffiliateEventToUser(partner.userId, 'affiliate:status_updated', { status: 'approved' });
  await createInAppNotification({
    userId: partner.userId,
    title: 'Affiliate application approved',
    body: 'Your affiliate account is now active. You can monitor earnings in your dashboard.',
    meta: { affiliateCode: partner.code }
  });

  return { application: nextApplication, partner };
};

export const rejectAffiliateApplication = async (applicationId: string, reviewerId?: string, reviewNote?: string) => {
  const applications = await loadApplications();
  const index = applications.findIndex((entry) => entry.id === applicationId);
  if (index < 0) throw new Error('Application not found');

  const nextApplication: AffiliateApplicationRecord = {
    ...applications[index],
    status: 'rejected',
    reviewedAt: new Date().toISOString(),
    reviewedBy: reviewerId || applications[index].reviewedBy,
    reviewNote: reviewNote !== undefined ? reviewNote : applications[index].reviewNote
  };
  applications[index] = nextApplication;
  await saveScope(AFFILIATE_APPLICATIONS_SCOPE, applications);

  emitAffiliateEventToUser(nextApplication.userId, 'affiliate:status_updated', { status: 'rejected' });
  await createInAppNotification({
    userId: nextApplication.userId,
    title: 'Affiliate application update',
    body: nextApplication.reviewNote || 'Your affiliate application was not approved at this time.',
    meta: { status: 'rejected' }
  });

  return nextApplication;
};

export const linkAffiliateReferral = async (input: {
  referredUserId: string;
  referralCode: string;
  referredEmail?: string | null;
}) => {
  const code = normalizeCode(input.referralCode);
  if (!code) throw new Error('Referral code is required');

  const partners = await loadPartners();
  const partner = partners.find((entry) => normalizeCode(entry.code) === code && entry.status === 'active');
  if (!partner) throw new Error('Invalid referral code');
  if (partner.userId === input.referredUserId) throw new Error('Self referral is not allowed');

  const referrals = await loadReferrals();
  const existingForUser = referrals.find((entry) => entry.referredUserId === input.referredUserId);
  if (existingForUser) return existingForUser;

  const referral: AffiliateReferralRecord = {
    id: randomUUID(),
    affiliateUserId: partner.userId,
    affiliateCode: partner.code,
    referredUserId: input.referredUserId,
    referredEmail: String(input.referredEmail || '').trim() || undefined,
    status: 'linked',
    linkedAt: new Date().toISOString()
  };
  referrals.unshift(referral);

  const partnerIndex = partners.findIndex((entry) => entry.userId === partner.userId);
  if (partnerIndex >= 0) {
    partners[partnerIndex] = {
      ...partners[partnerIndex],
      referrals: Math.max(0, asNumber(partners[partnerIndex].referrals, 0) + 1)
    };
  }

  await saveScope(AFFILIATE_REFERRALS_SCOPE, referrals);
  await saveScope(AFFILIATE_PARTNERS_SCOPE, partners);
  emitAffiliateEventToUser(partner.userId, 'affiliate:referral_linked', {
    referredUserId: input.referredUserId,
    code: partner.code
  });
  return referral;
};

export const awardAffiliateFirstPurchaseCommission = async (input: {
  referredUserId: string;
  orderId: string;
  orderAmount: number;
  currency?: string;
}) => {
  const settings = await loadSettings();
  if (!settings.enabled) return { awarded: false, reason: 'disabled' };

  const orderAmount = roundMoney(asNumber(input.orderAmount, 0));
  if (orderAmount <= 0) return { awarded: false, reason: 'invalid_amount' };

  const referrals = await loadReferrals();
  const referralIndex = referrals.findIndex((entry) => entry.referredUserId === input.referredUserId);
  if (referralIndex < 0) return { awarded: false, reason: 'no_referral' };

  const earnings = await loadEarnings();
  const alreadyEarnedByUser = earnings.some((entry) => entry.referredUserId === input.referredUserId);
  if (alreadyEarnedByUser) return { awarded: false, reason: 'already_awarded' };
  const duplicateOrder = earnings.some((entry) => entry.orderId === input.orderId);
  if (duplicateOrder) return { awarded: false, reason: 'duplicate_order' };

  const partners = await loadPartners();
  const partnerIndex = partners.findIndex((entry) => entry.userId === referrals[referralIndex].affiliateUserId);
  if (partnerIndex < 0) return { awarded: false, reason: 'missing_partner' };
  if (partners[partnerIndex].status !== 'active') return { awarded: false, reason: 'inactive_partner' };

  const rate = clamp(
    asNumber(partners[partnerIndex].commissionRate, settings.firstPurchaseCommissionPercent),
    0,
    100
  );
  const commissionAmount = roundMoney((orderAmount * rate) / 100);
  if (commissionAmount <= 0) return { awarded: false, reason: 'zero_commission' };

  const earning: AffiliateEarningRecord = {
    id: randomUUID(),
    affiliateUserId: partners[partnerIndex].userId,
    referredUserId: input.referredUserId,
    orderId: input.orderId,
    baseAmount: orderAmount,
    commissionRate: rate,
    commissionAmount,
    currency: String(input.currency || settings.payoutCurrency || 'USD').toUpperCase(),
    createdAt: new Date().toISOString()
  };

  earnings.unshift(earning);
  referrals[referralIndex] = {
    ...referrals[referralIndex],
    status: 'paid',
    firstQualifiedOrderId: input.orderId
  };
  partners[partnerIndex] = {
    ...partners[partnerIndex],
    earnings: roundMoney(asNumber(partners[partnerIndex].earnings) + commissionAmount),
    availableBalance: roundMoney(asNumber(partners[partnerIndex].availableBalance) + commissionAmount)
  };

  await saveScope(AFFILIATE_EARNINGS_SCOPE, earnings);
  await saveScope(AFFILIATE_REFERRALS_SCOPE, referrals);
  await saveScope(AFFILIATE_PARTNERS_SCOPE, partners);

  await createInAppNotification({
    userId: partners[partnerIndex].userId,
    title: 'Referral commission earned',
    body: `You earned ${earning.currency} ${commissionAmount.toFixed(2)} from a referral first purchase.`,
    meta: {
      orderId: input.orderId,
      referredUserId: input.referredUserId,
      commissionAmount
    }
  });

  emitAffiliateEventToUser(partners[partnerIndex].userId, 'affiliate:earning_created', {
    commissionAmount,
    currency: earning.currency,
    orderId: input.orderId
  });

  return {
    awarded: true,
    affiliateUserId: partners[partnerIndex].userId,
    commissionAmount,
    currency: earning.currency,
    rate
  };
};

export const requestAffiliateWithdrawalToWallet = async (input: { userId: string; amount?: number }) => {
  const settings = await loadSettings();
  const partners = await loadPartners();
  const earnings = await loadEarnings();
  const withdrawals = await loadWithdrawals();

  const reconciled = recomputePartnerBalances(partners, earnings, withdrawals);
  const partnerIndex = reconciled.findIndex((entry) => entry.userId === input.userId);
  if (partnerIndex < 0) throw new Error('Affiliate account not found');
  if (reconciled[partnerIndex].status !== 'active') throw new Error('Affiliate account is not active');

  const availableBalance = roundMoney(asNumber(reconciled[partnerIndex].availableBalance));
  if (availableBalance <= 0) throw new Error('No withdrawable balance available');
  if (availableBalance < settings.minimumWithdrawalAmount) {
    throw new Error(`Minimum withdrawal is ${settings.minimumWithdrawalAmount} ${settings.payoutCurrency}`);
  }

  const requestedAmount = input.amount !== undefined ? roundMoney(asNumber(input.amount)) : availableBalance;
  if (requestedAmount <= 0) throw new Error('Invalid withdrawal amount');
  if (requestedAmount > availableBalance) throw new Error('Requested amount exceeds available balance');

  const wallet = await getOrCreateWallet(input.userId, settings.payoutCurrency);
  const nextBalance = roundMoney(asNumber(wallet.balance) + requestedAmount);

  const transaction = await prisma.transaction.create({
    data: {
      walletId: wallet.id,
      userId: input.userId,
      type: 'REWARD',
      amount: requestedAmount,
      currency: settings.payoutCurrency,
      status: 'COMPLETED',
      description: 'Affiliate withdrawal to wallet',
      referenceId: `affiliate-withdrawal-${Date.now()}`,
      metadata: {
        source: 'affiliate_program',
        amount: requestedAmount
      }
    }
  });

  await prisma.wallet.update({
    where: { id: wallet.id },
    data: { balance: nextBalance }
  });

  const withdrawal: AffiliateWithdrawalRecord = {
    id: randomUUID(),
    affiliateUserId: input.userId,
    amount: requestedAmount,
    currency: settings.payoutCurrency,
    status: 'completed',
    createdAt: new Date().toISOString(),
    walletTransactionId: transaction.id
  };

  withdrawals.unshift(withdrawal);
  const partnerNext = {
    ...reconciled[partnerIndex],
    availableBalance: roundMoney(Math.max(0, availableBalance - requestedAmount))
  };
  reconciled[partnerIndex] = partnerNext;

  await saveScope(AFFILIATE_WITHDRAWALS_SCOPE, withdrawals);
  await saveScope(AFFILIATE_PARTNERS_SCOPE, reconciled);

  await createInAppNotification({
    userId: input.userId,
    title: 'Affiliate payout completed',
    body: `${settings.payoutCurrency} ${requestedAmount.toFixed(2)} was moved to your Scrolith wallet.`,
    meta: { transactionId: transaction.id }
  });

  emitAffiliateEventToUser(input.userId, 'wallet:updated', {
    walletId: wallet.id,
    balance: nextBalance
  });
  emitAffiliateEventToUser(input.userId, 'affiliate:withdrawal_completed', {
    amount: requestedAmount,
    currency: settings.payoutCurrency
  });

  return {
    withdrawal,
    partner: partnerNext,
    wallet: { id: wallet.id, balance: nextBalance, currency: wallet.currency }
  };
};

export const getAffiliateDashboardByUserId = async (userId: string) => {
  const [settings, applications, partners, referrals, earnings, withdrawals] = await Promise.all([
    loadSettings(),
    loadApplications(),
    loadPartners(),
    loadReferrals(),
    loadEarnings(),
    loadWithdrawals()
  ]);

  const partnerList = recomputePartnerBalances(partners, earnings, withdrawals);
  await saveScope(AFFILIATE_PARTNERS_SCOPE, partnerList);

  const application = applications.find((entry) => entry.userId === userId) || null;
  const partner = partnerList.find((entry) => entry.userId === userId) || null;
  const referralRows = referrals.filter((entry) => entry.affiliateUserId === userId);
  const earningRows = earnings
    .filter((entry) => entry.affiliateUserId === userId)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  const withdrawalRows = withdrawals
    .filter((entry) => entry.affiliateUserId === userId)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

  const totalEarnings = roundMoney(earningRows.reduce((sum, row) => sum + asNumber(row.commissionAmount), 0));
  const totalWithdrawn = roundMoney(
    withdrawalRows
      .filter((row) => row.status === 'completed')
      .reduce((sum, row) => sum + asNumber(row.amount), 0)
  );
  const availableBalance = roundMoney(Math.max(0, totalEarnings - totalWithdrawn));

  const normalizedPartner = partner
    ? {
        ...partner,
        earnings: totalEarnings,
        availableBalance
      }
    : null;

  return {
    settings,
    application,
    partner: normalizedPartner,
    status: normalizedPartner ? 'approved' : application?.status || 'not_applied',
    referralLink: normalizedPartner ? `${process.env.PLATFORM_URL || 'https://scrolith.com'}/affiliate-program?ref=${normalizedPartner.code}` : null,
    referrals: referralRows,
    earnings: earningRows,
    withdrawals: withdrawalRows,
    summary: {
      totalReferrals: referralRows.length,
      totalEarnings,
      totalWithdrawn,
      availableBalance,
      minimumWithdrawalAmount: settings.minimumWithdrawalAmount,
      payoutCurrency: settings.payoutCurrency
    }
  };
};
