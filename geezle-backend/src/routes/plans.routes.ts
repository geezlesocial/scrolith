import express, { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { authMiddleware } from '../middleware/auth.middleware';
import { getPlanById, listPlans } from '../services/planStore';
import { buildUserPlanSnapshot, isKycVerified } from '../utils/proStatus';

const router = express.Router();

const nowIso = () => new Date().toISOString();
const normalizeRole = (role?: string) => (role || '').toString().toLowerCase();

const getAuthUserId = (req: Request) => req.user?.id as string | undefined;

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

router.get('/', (req: Request, res: Response) => {
  const type = (req.query.type || '').toString().toLowerCase();
  const plans = listPlans({ type, activeOnly: true });
  return res.json({ success: true, data: plans });
});

router.get('/me', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    return res.json({ success: true, data: buildUserPlanSnapshot(user) });
  } catch (error: any) {
    console.error('plans/me error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load plan status' });
  }
});

router.post('/purchase', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = getAuthUserId(req);
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { planId } = req.body || {};
    if (!planId) return res.status(400).json({ success: false, error: 'planId is required' });

    const plan = getPlanById(String(planId));
    if (!plan || !plan.isActive) {
      return res.status(404).json({ success: false, error: 'Plan not found or inactive' });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    if (!isKycVerified(user.kycStatus)) {
      return res.status(403).json({ success: false, error: 'KYC approval required before purchasing this plan' });
    }

    const role = normalizeRole(user.role as string);
    const roleType = role.includes('freelancer') || role.includes('seller') ? 'freelancer' : role.includes('employer') || role.includes('client') ? 'employer' : 'unknown';
    if (roleType === 'unknown') {
      return res.status(403).json({ success: false, error: 'Only freelancers or employers can purchase plans' });
    }
    if (plan.type !== roleType) {
      return res.status(400).json({ success: false, error: `Plan is for ${plan.type} accounts` });
    }

    const wallet = await getOrCreateWallet(userId);
    if (wallet.frozen) {
      return res.status(403).json({ success: false, error: 'Wallet is frozen' });
    }

    const price = Number(plan.price || 0);
    if (price > 0 && Number(wallet.balance) < price) {
      return res.status(400).json({ success: false, error: 'Insufficient wallet balance' });
    }

    const purchasedAt = new Date();
    let expiresAt: Date | null = null;
    if (plan.interval === 'monthly') {
      expiresAt = addMonths(purchasedAt, 1);
    } else if (plan.interval === 'yearly') {
      expiresAt = addYears(purchasedAt, 1);
    } else {
      expiresAt = null;
    }

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
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: Number(wallet.balance) - price }
        });

        await tx.transaction.create({
          data: {
            userId,
            walletId: wallet.id,
            type: 'PAYMENT',
            amount: price * -1,
            status: 'COMPLETED',
            description: `Plan purchase: ${plan.name}`,
            referenceId: plan.id,
            metadata: {
              planId: plan.id,
              planName: plan.name,
              planType: plan.type,
              planInterval: plan.interval,
              planCurrency: plan.currency,
              planPrice: price
            }
          }
        });
      }

      await tx.user.update({
        where: { id: userId },
        data: updateData
      });
    });

    const updated = await prisma.user.findUnique({ where: { id: userId } });
    return res.json({
      success: true,
      data: updated ? buildUserPlanSnapshot(updated) : { purchased_at: nowIso() },
      message: 'Plan purchased successfully'
    });
  } catch (error: any) {
    console.error('plans/purchase error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to purchase plan' });
  }
});

export default router;
