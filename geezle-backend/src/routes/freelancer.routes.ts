import express, { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { authMiddleware } from '../middleware/auth.middleware';

interface AuthRequest extends Request {
  user?: { id?: string } | any;
}

const router = express.Router();

// Get freelancer overview
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
        console.warn('Freelancer overview count failed:', error);
        return 0;
      }
    };

    const safeFindMany = async <T,>(promise: Promise<T[]>) => {
      try {
        return await promise;
      } catch (error) {
        console.warn('Freelancer overview list failed:', error);
        return [] as T[];
      }
    };

    const safeProfile = async () => {
      try {
        return await prisma.profile.findUnique({ where: { userId } });
      } catch (error) {
        console.warn('Freelancer profile lookup failed:', error);
        return null;
      }
    };

    const safeWallet = async () => {
      try {
        return await prisma.wallet.upsert({
          where: { userId },
          update: {},
          create: {
            userId,
            balance: 0,
            pendingClearance: 0,
            escrowBalance: 0,
            frozen: false,
            currency: 'USD'
          }
        });
      } catch (error) {
        console.warn('Freelancer wallet lookup failed:', error);
        return null;
      }
    };

    const [
      activeOrders,
      revisionOrders,
      monthlyCompletedOrders,
      wallet,
      profile,
      reviewsCount
    ] = await Promise.all([
      safeCount(prisma.order.count({ where: { freelancerId: userId, status: 'IN_PROGRESS' } })),
      safeCount(prisma.order.count({ where: { freelancerId: userId, status: 'UNDER_REVIEW' } })),
      safeFindMany(prisma.order.findMany({
        where: { freelancerId: userId, status: 'COMPLETED', completedAt: { gte: startOfMonth } },
        select: { amount: true }
      })),
      safeWallet(),
      safeProfile(),
      safeCount(prisma.review.count({ where: { subjectId: userId, status: 'PUBLISHED' } }))
    ]);

    const earningsThisMonth = (monthlyCompletedOrders as any[]).reduce((sum, order) => sum + Number((order as any).amount), 0);

    const overview = {
      active_orders: activeOrders,
      revision_orders: revisionOrders,
      earnings_this_month: earningsThisMonth,
      wallet_balance: wallet?.balance || 0,
      gig_views: 0,
      gig_clicks: 0,
      rating: profile?.rating || 0,
      reviews: reviewsCount,
      unread_messages: 0,
      unread_notifications: 0
    };

    res.json({
      success: true,
      data: overview
    });
  } catch (error) {
    console.error('Error fetching freelancer overview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch overview data'
    });
  }
});

const serializeGig = (gig: any) => ({
  id: gig.id,
  title: gig.title,
  description: gig.description,
  category: gig.category?.name || gig.categoryId || '',
  subcategory: gig.subcategory || '',
  price: {
    type: 'fixed',
    amount: gig.price,
    minAmount: undefined,
    maxAmount: undefined
  },
  status: gig.status.toLowerCase(),
  rejectionReason: gig.adminStatus === 'REJECTED' ? 'Rejected by admin' : undefined,
  performance: {
    views: 0,
    clicks: 0,
    orders: 0,
    rating: gig.rating || 0,
    reviews: gig.reviewCount || 0
  },
  isFeatured: Boolean(gig.isFeatured),
  isTopSelected: Boolean(gig.isTopSelected),
  isRecommended: Boolean(gig.isRecommended),
  media: [],
  tags: [],
  createdAt: gig.createdAt?.toISOString(),
  updatedAt: gig.updatedAt?.toISOString()
});

// Get freelancer gigs
router.get('/gigs', authMiddleware, async (req: AuthRequest, res: Response, next: express.NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

    const { status } = req.query as Record<string, string | undefined>;
    const where: any = { userId };
    if (status) where.status = status.toUpperCase();

    const gigs = await prisma.gig.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: { category: true }
    });

    res.json({
      success: true,
      data: { gigs: gigs.map(serializeGig) }
    });
  } catch (error) {
    console.error('Error fetching freelancer gigs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch gigs'
    });
  }
});

// Get freelancer contracts
router.get('/contracts', authMiddleware, async (req: AuthRequest, res: Response, next: express.NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

    const contracts = await prisma.contract.findMany({
      where: { freelancerId: userId },
      orderBy: { updatedAt: 'desc' }
    });

    res.json({
      success: true,
      data: contracts.map((c) => ({
        id: c.id,
        title: c.title,
        description: c.description,
        clientName: c.clientName || 'Client',
        status: c.status.toLowerCase(),
        amount: c.hourlyRate || 0,
        createdAt: c.createdAt.toISOString()
      }))
    });
  } catch (error) {
    console.error('Error fetching freelancer contracts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch contracts'
    });
  }
});

// Get freelancer proposals
router.get('/proposals', authMiddleware, async (req: AuthRequest, res: Response, next: express.NextFunction): Promise<void> => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) { res.status(401).json({ success: false, error: 'Unauthorized' }); return; }

    const proposals = await prisma.proposal.findMany({
      where: { freelancerId: userId },
      include: { job: { select: { title: true, categoryId: true, subcategory: true } } },
      orderBy: { createdAt: 'desc' }
    });

    res.json({
      success: true,
      data: {
        proposals: proposals.map((proposal) => ({
          id: proposal.id,
          jobId: proposal.jobId,
          job: {
            title: proposal.job?.title || '',
            category: proposal.job?.categoryId || '',
            subcategory: proposal.job?.subcategory || ''
          },
          price: { amount: proposal.proposedAmount, type: 'fixed' },
          status: proposal.status.toLowerCase(),
          submittedAt: proposal.createdAt.toISOString()
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching freelancer proposals:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch proposals'
    });
  }
});

export default router;
