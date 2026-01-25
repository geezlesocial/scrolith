import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';

const normalizeRole = (role?: string) => (role || '').toString().toLowerCase();

const mapDbStatusToUi = (status: string | null | undefined) => {
  const normalized = (status || 'PENDING').toString().toUpperCase();
  if (normalized === 'IN_PROGRESS') return 'active';
  if (normalized === 'UNDER_REVIEW') return 'delivered';
  if (normalized === 'COMPLETED') return 'completed';
  if (normalized === 'CANCELLED') return 'cancelled';
  if (normalized === 'DISPUTED') return 'revision_requested';
  if (normalized === 'REFUNDED') return 'refunded';
  if (normalized === 'PENDING' || normalized === 'PAID') return 'pending_delivery';
  return 'active';
};

const mapUiStatusToDb = (status?: string) => {
  const normalized = (status || '').toString().toLowerCase();
  const mapping: Record<string, string[]> = {
    active: ['IN_PROGRESS'],
    pending_delivery: ['PENDING', 'PAID', 'IN_PROGRESS'],
    delivered: ['UNDER_REVIEW'],
    revision_requested: ['DISPUTED'],
    completed: ['COMPLETED'],
    cancelled: ['CANCELLED'],
    refunded: ['REFUNDED']
  };
  return mapping[normalized] || [];
};

const ensureUser = (req: Request) => req.user as { id: string; role?: string } | undefined;

export const listOrders = async (req: Request, res: Response) => {
  try {
    const user = ensureUser(req);
    const role = normalizeRole(req.query.role as string | undefined || user?.role);
    const userId = (req.query.userId as string | undefined) || user?.id || '';

    if (!role) {
      return res.json({ success: true, data: { orders: [], pagination: { page: 1, limit: 0, total: 0, pages: 1 } } });
    }

    let where: any = {};
    if (role.includes('freelancer') || role.includes('seller')) {
      where.freelancerId = userId;
    } else if (role.includes('client') || role.includes('employer') || role.includes('buyer')) {
      where.clientId = userId;
    } else if (!role.includes('admin')) {
      return res.json({ success: true, data: { orders: [], pagination: { page: 1, limit: 0, total: 0, pages: 1 } } });
    }

    const statusFilter = mapUiStatusToDb(req.query.status as string | undefined);
    if (statusFilter.length > 0) {
      where.status = { in: statusFilter };
    }

    const page = Math.max(1, Number(req.query.page || 1));
    const limit = Math.max(1, Number(req.query.limit || 20));

    const [total, orders] = await Promise.all([
      prisma.order.count({ where }),
      prisma.order.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          gig: { select: { id: true, title: true } },
          client: { select: { id: true, name: true, email: true } }
        }
      })
    ]);

    return res.json({
      success: true,
      data: {
        orders: orders.map((order) => ({
          id: order.id,
          gig_id: order.gigId,
          gig_title: order.gig?.title || '',
          buyer_id: order.clientId,
          buyer_name: order.client?.name || order.client?.email || '',
          status: mapDbStatusToUi(order.status),
          amount: order.amount,
          requirements: order.requirements || '',
          delivered_files: [],
          timeline: [],
          created_at: order.createdAt.toISOString(),
          updated_at: order.updatedAt.toISOString(),
          due_date: order.deliveryDate ? order.deliveryDate.toISOString() : null
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit) || 1
        }
      }
    });
  } catch (error: any) {
    console.error('List orders error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load orders' });
  }
};

export const getOrder = async (req: Request, res: Response) => {
  try {
    const user = ensureUser(req);
    const role = normalizeRole(req.query.role as string | undefined || user?.role);
    const userId = user?.id || '';

    const order = await prisma.order.findUnique({
      where: { id: req.params.id },
      include: {
        gig: { select: { id: true, title: true } },
        client: { select: { id: true, name: true, email: true } }
      }
    });

    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });

    if (role.includes('freelancer') && order.freelancerId !== userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    if ((role.includes('client') || role.includes('employer')) && order.clientId !== userId) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    return res.json({
      success: true,
      data: {
        id: order.id,
        gig_id: order.gigId,
        gig_title: order.gig?.title || '',
        buyer_id: order.clientId,
        buyer_name: order.client?.name || order.client?.email || '',
        status: mapDbStatusToUi(order.status),
        amount: order.amount,
        requirements: order.requirements || '',
        delivered_files: [],
        timeline: [],
        created_at: order.createdAt.toISOString(),
        updated_at: order.updatedAt.toISOString(),
        due_date: order.deliveryDate ? order.deliveryDate.toISOString() : null
      }
    });
  } catch (error: any) {
    console.error('Get order error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load order' });
  }
};

export const deliverOrder = async (req: Request, res: Response) => {
  try {
    const user = ensureUser(req);
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    if (order.freelancerId !== user?.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'UNDER_REVIEW' }
    });

    return res.json({ success: true, data: null, message: 'Delivered' });
  } catch (error: any) {
    console.error('Deliver order error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to deliver order' });
  }
};

export const requestOrderInfo = async (req: Request, res: Response) => {
  try {
    const user = ensureUser(req);
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    if (order.freelancerId !== user?.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    return res.json({ success: true, data: null, message: 'Request sent' });
  } catch (error: any) {
    console.error('Request info error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to request info' });
  }
};

export const proposeRevision = async (req: Request, res: Response) => {
  try {
    const user = ensureUser(req);
    const order = await prisma.order.findUnique({ where: { id: req.params.id } });
    if (!order) return res.status(404).json({ success: false, error: 'Order not found' });
    if (order.freelancerId !== user?.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'DISPUTED' }
    });

    return res.json({ success: true, data: null, message: 'Revision proposed' });
  } catch (error: any) {
    console.error('Propose revision error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to propose revision' });
  }
};

export const getOrderSummary = async (req: Request, res: Response) => {
  try {
    const user = ensureUser(req);
    if (!user?.id) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const [active, delivered, completed] = await Promise.all([
      prisma.order.count({ where: { freelancerId: user.id, status: 'IN_PROGRESS' } }),
      prisma.order.count({ where: { freelancerId: user.id, status: 'UNDER_REVIEW' } }),
      prisma.order.count({ where: { freelancerId: user.id, status: 'COMPLETED' } })
    ]);

    return res.json({
      success: true,
      data: {
        active,
        delivered,
        completed
      }
    });
  } catch (error: any) {
    console.error('Order summary error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load order summary' });
  }
};
