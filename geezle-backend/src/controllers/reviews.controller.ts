import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';

const isAdminRole = (role?: string) => (role || '').toString().toLowerCase().includes('admin');

const mapReview = (review: any) => ({
  id: review.id,
  rating: review.rating,
  title: review.title,
  comment: review.comment,
  gig_id: review.gigId,
  order_id: review.orderId,
  author_id: review.authorId,
  subject_id: review.subjectId,
  status: review.status?.toLowerCase(),
  created_at: review.createdAt.toISOString(),
  updated_at: review.updatedAt.toISOString(),
  edited_at: review.editedAt ? review.editedAt.toISOString() : null,
  published_at: review.publishedAt ? review.publishedAt.toISOString() : null,
  author: review.author
    ? {
        id: review.author.id,
        name: review.author.name,
        avatar: review.author.avatar
      }
    : undefined
});

const getSettings = async () => {
  let settings = await prisma.settings.findFirst({ orderBy: { updatedAt: 'desc' } });
  if (!settings) {
    settings = await prisma.settings.create({ data: {} });
  }
  return settings;
};

export const createReview = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { order_id, rating, comment, title } = req.body || {};
    if (!order_id || !rating) {
      return res.status(400).json({ success: false, error: 'order_id and rating are required' });
    }

    const order = await prisma.order.findUnique({ where: { id: order_id } });
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    const settings = await getSettings();
    const requiredStatus = settings.reviewMinOrderStatus || 'COMPLETED';
    if (order.status !== requiredStatus) {
      return res.status(400).json({ success: false, error: 'Order not eligible for review' });
    }

    if (order.clientId !== userId && order.freelancerId !== userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const existing = await prisma.review.findUnique({ where: { orderId: order_id } });
    if (existing) {
      return res.status(400).json({ success: false, error: 'Review already exists for this order' });
    }

    const subjectId = order.clientId === userId ? order.freelancerId : order.clientId;
    const status = settings.reviewsRequireApproval ? 'PENDING' : 'PUBLISHED';

    const review = await prisma.review.create({
      data: {
        rating: Number(rating),
        title: title ? String(title) : null,
        comment: comment ? String(comment) : null,
        orderId: order_id,
        gigId: order.gigId,
        authorId: userId,
        subjectId,
        status,
        publishedAt: status === 'PUBLISHED' ? new Date() : null
      }
    });

    return res.json({ success: true, data: mapReview(review) });
  } catch (error: any) {
    console.error('Create review error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to create review' });
  }
};

export const getUserReviews = async (req: Request, res: Response) => {
  try {
    const reviews = await prisma.review.findMany({
      where: { subjectId: req.params.id, status: 'PUBLISHED' },
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, name: true, avatar: true } }
      }
    });

    return res.json({ success: true, data: reviews.map(mapReview) });
  } catch (error: any) {
    console.error('Get user reviews error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load reviews' });
  }
};

export const getMyReviews = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const reviews = await prisma.review.findMany({
      where: { authorId: userId },
      orderBy: { createdAt: 'desc' }
    });

    return res.json({ success: true, data: reviews.map(mapReview) });
  } catch (error: any) {
    console.error('Get my reviews error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load reviews' });
  }
};

export const getPendingReviews = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const settings = await getSettings();
    const requiredStatus = settings.reviewMinOrderStatus || 'COMPLETED';

    const orders = await prisma.order.findMany({
      where: ({
        clientId: userId,
        status: requiredStatus,
        review: null
      } as any),
      include: {
        gig: { select: { id: true, title: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    const pending = orders.map((order) => ({
      order_id: order.id,
      gig_id: order.gigId,
      gig_title: order.gig?.title || '',
      amount: order.amount,
      completed_at: order.completedAt ? order.completedAt.toISOString() : null
    }));

    return res.json({ success: true, data: pending });
  } catch (error: any) {
    console.error('Get pending reviews error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load pending reviews' });
  }
};

export const updateReview = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const review = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!review) return res.status(404).json({ success: false, error: 'Review not found' });
    if (review.authorId !== userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const settings = await getSettings();
    const editWindow = settings.reviewEditWindowHours || 0;
    if (editWindow > 0) {
      const windowMs = editWindow * 60 * 60 * 1000;
      if (Date.now() - review.createdAt.getTime() > windowMs) {
        return res.status(400).json({ success: false, error: 'Review edit window expired' });
      }
    }

    const { rating, comment, title } = req.body || {};
    const updated = await prisma.review.update({
      where: { id: req.params.id },
      data: {
        rating: rating !== undefined ? Number(rating) : review.rating,
        comment: comment !== undefined ? String(comment) : review.comment,
        title: title !== undefined ? String(title) : review.title,
        editedAt: new Date()
      }
    });

    return res.json({ success: true, data: mapReview(updated) });
  } catch (error: any) {
    console.error('Update review error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update review' });
  }
};

export const adminListReviews = async (req: Request, res: Response) => {
  try {
    const { status } = req.query as { status?: string };
    const where: any = {};
    if (status) where.status = status.toUpperCase();

    const reviews = await prisma.review.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        author: { select: { id: true, name: true, avatar: true } }
      }
    });

    return res.json({ success: true, data: reviews.map(mapReview) });
  } catch (error: any) {
    console.error('Admin list reviews error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load reviews' });
  }
};

export const adminUpdateReviewStatus = async (req: Request, res: Response) => {
  try {
    const { status } = req.body || {};
    if (!status) {
      return res.status(400).json({ success: false, error: 'Status is required' });
    }

    const statusValue = String(status).toUpperCase();
    const updated = await prisma.review.update({
      where: { id: req.params.id },
      data: ({
        status: statusValue,
        publishedAt: statusValue === 'PUBLISHED' ? new Date() : null
      } as any)
    });

    return res.json({ success: true, data: mapReview(updated) });
  } catch (error: any) {
    console.error('Admin update review status error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update review' });
  }
};
