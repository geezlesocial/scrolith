// Removed opening markdown fence
import express, { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { authMiddleware } from '../middleware/auth.middleware';

interface AuthRequest extends Request {
  user?: { id?: string } | any;
}

const router = express.Router();

// Get employer overview
router.get('/overview', authMiddleware, async (req: AuthRequest, res: Response, next: express.NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const safeCount = async (promise: Promise<number>) => {
      try {
        return await promise;
      } catch (error) {
        console.warn('Employer overview count failed:', error);
        return 0;
      }
    };

    const safeFindMany = async <T,>(promise: Promise<T[]>) => {
      try {
        return await promise;
      } catch (error) {
        console.warn('Employer overview list failed:', error);
        return [] as T[];
      }
    };

    const [activeContracts, openJobs, proposalsReceived, escrows, monthlyOrders] = await Promise.all([
      safeCount(prisma.contract.count({ where: { clientId: userId, status: 'ACTIVE' } })),
      safeCount(prisma.job.count({ where: { clientId: userId, status: { in: ['DRAFT', 'SUBMITTED', 'ACTIVE', 'UNDER_REVIEW'] } } })),
      safeCount(prisma.proposal.count({ where: { job: { clientId: userId } } })),
      safeFindMany(prisma.escrow.findMany({ where: { clientId: userId, status: 'FUNDED' }, select: { amount: true } })),
      safeFindMany(prisma.order.findMany({
        where: { clientId: userId, status: 'COMPLETED', completedAt: { gte: startOfMonth } },
        select: { amount: true }
      }))
    ]);

    const escrowBalance = (escrows as any[]).reduce((sum, e) => sum + Number((e as any).amount), 0);
    const spendThisMonth = (monthlyOrders as any[]).reduce((sum, o) => sum + Number((o as any).amount), 0);

    const overview = {
      active_contracts: activeContracts,
      open_jobs: openJobs,
      proposals_received: proposalsReceived,
      escrow_balance: escrowBalance,
      spend_this_month: spendThisMonth,
      unread_messages: 0,
      unread_notifications: 0
    };

    res.json({
      success: true,
      data: overview
    });
  } catch (error) {
    console.error('Error fetching employer overview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch overview data'
    });
  }
});

// Get employer jobs
router.get('/jobs', authMiddleware, async (req: AuthRequest, res: Response, next: express.NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

    const { status } = req.query as Record<string, string | undefined>;
    const where: any = { clientId: userId };
    if (status) where.status = status.toUpperCase();

    const jobs = await prisma.job.findMany({
      where,
      orderBy: { updatedAt: 'desc' }
    });

    res.json({
      success: true,
      data: {
        jobs: jobs.map((job) => ({
          id: job.id,
          title: job.title,
          description: job.description,
          category: job.categoryId || '',
          subcategory: job.subcategory || '',
          budget: job.budget || '',
          status: job.status.toLowerCase(),
          proposalsCount: job.proposalsCount || 0,
          createdAt: job.createdAt.toISOString(),
          updatedAt: job.updatedAt.toISOString()
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching employer jobs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch jobs'
    });
  }
});

// Get employer contracts
router.get('/contracts', authMiddleware, async (req: AuthRequest, res: Response, next: express.NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

    const contracts = await prisma.contract.findMany({
      where: { clientId: userId },
      orderBy: { updatedAt: 'desc' }
    });

    res.json({
      success: true,
      data: contracts.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        freelancerName: c.freelancerName || 'Freelancer',
        status: c.status.toLowerCase(),
        amount: c.hourlyRate || 0,
        createdAt: c.createdAt.toISOString()
      }))
    });
  } catch (error) {
    console.error('Error fetching employer contracts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch contracts'
    });
  }
});

// Get employer proposals/offers
router.get('/proposals', authMiddleware, async (req: AuthRequest, res: Response, next: express.NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

    const proposals = await prisma.proposal.findMany({
      where: { job: { clientId: userId } },
      include: { job: { select: { title: true } }, freelancer: { select: { id: true, name: true, avatar: true } } },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: {
        proposals: proposals.map((proposal) => ({
          id: proposal.id,
          jobId: proposal.jobId,
          jobTitle: proposal.job?.title || '',
          freelancer: {
            id: proposal.freelancerId,
            name: proposal.freelancer?.name || 'Freelancer',
            rating: 0,
            reviews: 0
          },
          price: { amount: proposal.proposedAmount, type: 'fixed' },
          coverLetter: proposal.coverLetter,
          status: proposal.status.toLowerCase(),
          submittedAt: proposal.createdAt.toISOString()
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching employer proposals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch proposals'
    });
  }
});

export default router;
