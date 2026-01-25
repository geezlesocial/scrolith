import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';

const normalizeStatus = (status?: string) => (status || '').toString().toLowerCase();

const mapGigStatus = (gig: { status: string; adminStatus: string }) => {
  const status = normalizeStatus(gig.status);
  const adminStatus = normalizeStatus(gig.adminStatus);

  if (status === 'draft') return 'draft';
  if (status === 'active') return 'active';
  if (status === 'paused') return 'paused';
  if (status === 'rejected') return 'rejected';

  if (status === 'pending') {
    if (adminStatus === 'approved') return 'approved';
    if (adminStatus === 'rejected') return 'rejected';
    return 'under_review';
  }

  return status || 'draft';
};

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
  status: mapGigStatus(gig),
  rejectionReason: gig.adminStatus === 'REJECTED' ? 'Rejected by admin' : undefined,
  performance: {
    views: 0,
    clicks: 0,
    orders: 0,
    rating: gig.rating || 0,
    reviews: gig.reviewCount || 0
  },
  media: [],
  tags: [],
  createdAt: gig.createdAt?.toISOString(),
  updatedAt: gig.updatedAt?.toISOString()
});

export const listGigs = async (req: Request, res: Response) => {
  try {
    const { ownerId, status, search, category } = req.query as Record<string, string | undefined>;
    const userId = req.user?.id as string | undefined;

    const where: any = {};

    if (ownerId === 'me') {
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });
      where.userId = userId;
    }

    if (status) {
      const normalized = status.toLowerCase();
      if (normalized === 'under_review') {
        where.status = 'PENDING';
        where.adminStatus = 'PENDING';
      } else if (normalized === 'submitted') {
        where.status = 'PENDING';
      } else if (normalized === 'approved') {
        where.adminStatus = 'APPROVED';
      } else {
        where.status = normalized.toUpperCase();
      }
    }

    if (category) {
      where.category = { name: category };
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    const gigs = await prisma.gig.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: { category: true }
    });

    return res.json({ success: true, data: gigs.map(serializeGig) });
  } catch (error: any) {
    console.error('List gigs error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to fetch gigs' });
  }
};

export const getGig = async (req: Request, res: Response) => {
  try {
    const gig = await prisma.gig.findUnique({
      where: { id: req.params.id },
      include: { category: true }
    });
    if (!gig) return res.status(404).json({ success: false, error: 'Gig not found' });
    return res.json({ success: true, data: serializeGig(gig) });
  } catch (error: any) {
    console.error('Get gig error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to fetch gig' });
  }
};

export const createGig = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const payload = req.body || {};
    const created = await prisma.gig.create({
      data: ({
        title: payload.title,
        slug: payload.slug || `${payload.title || 'gig'}-${Date.now()}`,
        description: payload.description || '',
        price: Number(payload.price?.amount ?? payload.price ?? 0),
        categoryId: payload.categoryId || null,
        userId,
        status: 'DRAFT',
        adminStatus: 'PENDING'
      } as any),
      include: { category: true }
    });

    return res.status(201).json({ success: true, data: serializeGig(created) });
  } catch (error: any) {
    console.error('Create gig error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to create gig' });
  }
};

export const updateGig = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const existing = await prisma.gig.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Gig not found' });
    if (existing.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const payload = req.body || {};
    const updated = await prisma.gig.update({
      where: { id: req.params.id },
      data: ({
        title: payload.title ?? existing.title,
        description: payload.description ?? existing.description,
        price: payload.price?.amount !== undefined ? Number(payload.price.amount) : payload.price !== undefined ? Number(payload.price) : existing.price,
        categoryId: payload.categoryId ?? existing.categoryId
      } as any),
      include: { category: true }
    });

    return res.json({ success: true, data: serializeGig(updated) });
  } catch (error: any) {
    console.error('Update gig error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update gig' });
  }
};

export const deleteGig = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const existing = await prisma.gig.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ success: false, error: 'Gig not found' });
    if (existing.userId !== userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    await prisma.gig.delete({ where: { id: req.params.id } });
    return res.json({ success: true, data: null });
  } catch (error: any) {
    console.error('Delete gig error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to delete gig' });
  }
};

export const submitGig = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const gig = await prisma.gig.findUnique({ where: { id: req.params.id } });
    if (!gig) return res.status(404).json({ success: false, error: 'Gig not found' });
    if (gig.userId !== userId) return res.status(403).json({ success: false, error: 'Not authorized' });

    const updated = await prisma.gig.update({
      where: { id: req.params.id },
      data: { status: 'PENDING', adminStatus: 'PENDING' },
      include: { category: true }
    });

    return res.json({ success: true, data: serializeGig(updated) });
  } catch (error: any) {
    console.error('Submit gig error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to submit gig' });
  }
};

export const pauseGig = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const gig = await prisma.gig.findUnique({ where: { id: req.params.id } });
    if (!gig) return res.status(404).json({ success: false, error: 'Gig not found' });
    if (gig.userId !== userId) return res.status(403).json({ success: false, error: 'Not authorized' });

    const updated = await prisma.gig.update({
      where: { id: req.params.id },
      data: { status: 'PAUSED' },
      include: { category: true }
    });

    return res.json({ success: true, data: serializeGig(updated) });
  } catch (error: any) {
    console.error('Pause gig error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to pause gig' });
  }
};

export const activateGig = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const gig = await prisma.gig.findUnique({ where: { id: req.params.id } });
    if (!gig) return res.status(404).json({ success: false, error: 'Gig not found' });
    if (gig.userId !== userId) return res.status(403).json({ success: false, error: 'Not authorized' });

    const updated = await prisma.gig.update({
      where: { id: req.params.id },
      data: { status: 'ACTIVE', adminStatus: 'APPROVED' },
      include: { category: true }
    });

    return res.json({ success: true, data: serializeGig(updated) });
  } catch (error: any) {
    console.error('Activate gig error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to activate gig' });
  }
};
