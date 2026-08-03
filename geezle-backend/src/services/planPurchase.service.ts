import prisma from '../utils/prismaClient';
import { getPlanById, PlanRecord, PlanType } from './planStore';
import { buildUserPlanSnapshot, isKycVerified } from '../utils/proStatus';

type PurchaseSource = 'plans.purchase' | 'jobs.submit';

type PurchaseInput = {
  userId: string;
  planId: string;
  requiredType?: PlanType;
  skipIfActiveSamePlan?: boolean;
  allowAdminForType?: boolean;
  source?: PurchaseSource;
  referenceId?: string;
};

export class PlanPurchaseError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code = 'PLAN_PURCHASE_FAILED') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const normalizeRole = (role?: string) => (role || '').toString().toLowerCase();

const getOrCreateWallet = async (userId: string) => {
  const existing = await prisma.wallet.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.wallet.create({
    data: {
      userId,
      balance: 0,
      pendingClearance: 0,
      escrowBalance: 0,
      frozen: false,
      currency: 'USD'
    }
  });
};

const addMonths = (date: Date, months: number) => {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + months);
  return d;
};

const addYears = (date: Date, years: number) => {
  const d = new Date(date.getTime());
  d.setFullYear(d.getFullYear() + years);
  return d;
};

const resolveRoleType = (role: string, plan: PlanRecord, allowAdminForType: boolean, requiredType?: PlanType): PlanType | 'unknown' => {
  const normalized = normalizeRole(role);
  if (normalized.includes('freelancer') || normalized.includes('seller')) return 'freelancer';
  if (normalized.includes('employer') || normalized.includes('client')) return 'employer';
  if (normalized.includes('admin') && allowAdminForType) return requiredType || plan.type;
  return 'unknown';
};

const isSamePlanActive = (user: any, plan: PlanRecord) => {
  const prefix = plan.type === 'freelancer' ? 'freelancer' : 'employer';
  const active = Boolean(user?.[`${prefix}PlanActive`]);
  const planId = String(user?.[`${prefix}PlanId`] || '');
  const expiresAt = user?.[`${prefix}PlanExpiresAt`] ? new Date(user[`${prefix}PlanExpiresAt`]) : null;
  return active && planId === plan.id && (!expiresAt || expiresAt.getTime() > Date.now());
};

export const purchaseUserPlanWithWallet = async (input: PurchaseInput) => {
  const plan = getPlanById(String(input.planId || ''));
  if (!plan || !plan.isActive) {
    throw new PlanPurchaseError(404, 'Plan not found or inactive', 'PLAN_NOT_FOUND');
  }
  if (input.requiredType && plan.type !== input.requiredType) {
    throw new PlanPurchaseError(400, `Plan is for ${plan.type} accounts`, 'PLAN_TYPE_MISMATCH');
  }

  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) throw new PlanPurchaseError(404, 'User not found', 'USER_NOT_FOUND');

  if (!isKycVerified(user.kycStatus)) {
    throw new PlanPurchaseError(403, 'KYC approval required before purchasing this plan', 'KYC_REQUIRED');
  }

  const roleType = resolveRoleType(user.role as string, plan, Boolean(input.allowAdminForType), input.requiredType);
  if (roleType === 'unknown') {
    throw new PlanPurchaseError(403, 'Only freelancers or employers can purchase plans', 'PLAN_ROLE_NOT_ALLOWED');
  }
  if (plan.type !== roleType) {
    throw new PlanPurchaseError(400, `Plan is for ${plan.type} accounts`, 'PLAN_TYPE_MISMATCH');
  }

  if (input.skipIfActiveSamePlan && isSamePlanActive(user, plan)) {
    return {
      plan,
      charged: false,
      alreadyActive: true,
      snapshot: buildUserPlanSnapshot(user)
    };
  }

  const wallet = await getOrCreateWallet(input.userId);
  if (wallet.frozen) {
    throw new PlanPurchaseError(403, 'Wallet is frozen', 'WALLET_FROZEN');
  }

  const price = Number(plan.price || 0);
  const purchasedAt = new Date();
  const expiresAt =
    plan.interval === 'monthly' ? addMonths(purchasedAt, 1) :
    plan.interval === 'yearly' ? addYears(purchasedAt, 1) :
    null;

  const updateData: any =
    plan.type === 'freelancer'
      ? {
          freelancerPlanId: plan.id,
          freelancerPlanName: plan.name,
          freelancerPlanInterval: plan.interval,
          freelancerPlanPrice: price,
          freelancerPlanCurrency: plan.currency,
          freelancerPlanActive: true,
          freelancerPlanPurchasedAt: purchasedAt,
          freelancerPlanExpiresAt: expiresAt
        }
      : {
          employerPlanId: plan.id,
          employerPlanName: plan.name,
          employerPlanInterval: plan.interval,
          employerPlanPrice: price,
          employerPlanCurrency: plan.currency,
          employerPlanActive: true,
          employerPlanPurchasedAt: purchasedAt,
          employerPlanExpiresAt: expiresAt
        };

  await prisma.$transaction(async (tx) => {
    if (price > 0) {
      const deducted = await tx.wallet.updateMany({
        where: {
          id: wallet.id,
          frozen: false,
          balance: { gte: price }
        },
        data: { balance: { decrement: price } }
      });

      if (deducted.count !== 1) {
        throw new PlanPurchaseError(400, 'Insufficient wallet balance', 'INSUFFICIENT_WALLET_BALANCE');
      }

      await tx.transaction.create({
        data: {
          userId: input.userId,
          walletId: wallet.id,
          type: 'PAYMENT',
          amount: price * -1,
          status: 'COMPLETED',
          currency: plan.currency || wallet.currency || 'USD',
          description: input.source === 'jobs.submit' ? `Job posting plan: ${plan.name}` : `Plan purchase: ${plan.name}`,
          referenceId: input.referenceId || plan.id,
          metadata: {
            source: input.source || 'plans.purchase',
            planId: plan.id,
            planName: plan.name,
            planType: plan.type,
            planInterval: plan.interval,
            planCurrency: plan.currency,
            planPrice: price,
            ...(input.referenceId ? { referenceId: input.referenceId } : {})
          }
        }
      });
    }

    await tx.user.update({
      where: { id: input.userId },
      data: updateData
    });
  });

  const updated = await prisma.user.findUnique({ where: { id: input.userId } });
  return {
    plan,
    charged: price > 0,
    alreadyActive: false,
    snapshot: updated ? buildUserPlanSnapshot(updated) : null
  };
};
