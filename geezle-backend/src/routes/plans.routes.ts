import express, { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { authMiddleware } from '../middleware/auth.middleware';
import { listPlans } from '../services/planStore';
import { buildUserPlanSnapshot } from '../utils/proStatus';
import { PlanPurchaseError, purchaseUserPlanWithWallet } from '../services/planPurchase.service';

const router = express.Router();

const nowIso = () => new Date().toISOString();
const getAuthUserId = (req: Request) => req.user?.id as string | undefined;

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

    const result = await purchaseUserPlanWithWallet({
      userId,
      planId: String(planId),
      source: 'plans.purchase',
      allowAdminForType: true
    });
    return res.json({
      success: true,
      data: result.snapshot || { purchased_at: nowIso() },
      message: 'Plan purchased successfully'
    });
  } catch (error: any) {
    console.error('plans/purchase error:', error);
    if (error instanceof PlanPurchaseError || error?.status) {
      return res.status(error.status || 400).json({
        success: false,
        code: error.code || 'PLAN_PURCHASE_FAILED',
        error: error.message || 'Failed to purchase plan'
      });
    }
    return res.status(500).json({ success: false, error: error.message || 'Failed to purchase plan' });
  }
});

export default router;
