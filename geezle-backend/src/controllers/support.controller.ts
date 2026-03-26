import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import { verifyRecaptcha } from '../utils/recaptcha';
import { notifyAdmins, notifyUser } from '../utils/notify';
import { ensureDefaultSupportTicketCategories } from '../services/defaultCategorySeed.service';

const isAdmin = (role?: string) => (role || '').toString().toLowerCase().includes('admin');

const mapCategory = (category: any) => ({
  id: category.id,
  name: category.name,
  is_active: category.isActive,
  isActive: category.isActive
});

const mapReply = (reply: any) => ({
  id: reply.id,
  ticket_id: reply.ticketId,
  sender: reply.isFromAdmin ? 'admin' : 'user',
  sender_name: reply.isFromAdmin ? 'Support' : 'User',
  message: reply.message,
  timestamp: reply.createdAt.toISOString(),
  attachments: [],
  internal_note: false
});

const mapTicket = (ticket: any) => ({
  id: ticket.id,
  tracking_code: ticket.trackingCode,
  user_id: ticket.userId || '',
  full_name: ticket.fullName,
  email: ticket.email,
  mobile: ticket.mobile,
  subject: ticket.subject,
  message: ticket.message,
  status: ticket.status,
  priority: ticket.priority,
  category: ticket.category,
  created_at: ticket.createdAt.toISOString(),
  updated_at: ticket.updatedAt.toISOString(),
  replies: Array.isArray(ticket.replies) ? ticket.replies.map(mapReply) : [],
  is_read_by_admin: ticket.isReadByAdmin,
  is_read_by_user: ticket.isReadByUser,
  attachments: ticket.attachments || []
});

export const getCategories = async (_req: Request, res: Response) => {
  try {
    const categories = await ensureDefaultSupportTicketCategories();
    return res.json({ success: true, data: categories.map(mapCategory) });
  } catch (error: any) {
    console.error('Get support categories error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load categories' });
  }
};

export const saveCategory = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!isAdmin(user?.role)) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const { id, name, is_active } = req.body || {};
    if (!name) return res.status(400).json({ success: false, error: 'name is required' });

    const category = id
      ? await prisma.supportTicketCategory.upsert({
          where: { id },
          update: { name, isActive: Boolean(is_active) },
          create: { id, name, isActive: Boolean(is_active) }
        })
      : await prisma.supportTicketCategory.create({
          data: { name, isActive: Boolean(is_active) }
        });

    return res.json({ success: true, data: mapCategory(category) });
  } catch (error: any) {
    console.error('Save support category error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to save category' });
  }
};

export const deleteCategory = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!isAdmin(user?.role)) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    await prisma.supportTicketCategory.delete({ where: { id: req.params.id } });
    return res.json({ success: true, data: null });
  } catch (error: any) {
    console.error('Delete support category error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to delete category' });
  }
};

export const createTicket = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const payload = req.body || {};
    const recaptchaToken = payload.recaptchaToken || payload.recaptcha_token;

    // Enforce reCAPTCHA if enabled in platform settings
    const recaptchaCheck = await verifyRecaptcha(recaptchaToken, req.ip);
    if (recaptchaCheck.enforced && !recaptchaCheck.success) {
      return res.status(400).json({ success: false, error: recaptchaCheck.error || 'reCAPTCHA verification failed' });
    }

    const fullName = payload.full_name ?? payload.fullName;
    if (!fullName || !payload.email || !payload.subject || !payload.message || !payload.category) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const trackingCode = `TKT-${Date.now().toString(36).toUpperCase()}`;
    const ticket = await prisma.supportTicket.create({
      data: {
        trackingCode,
        userId: user?.id || null,
        fullName,
        email: payload.email,
        mobile: payload.mobile || null,
        subject: payload.subject,
        message: payload.message,
        category: payload.category,
        status: payload.status || 'Open',
        priority: payload.priority || 'Low',
        attachments: Array.isArray(payload.attachments) ? payload.attachments : []
      },
      include: { replies: true }
    });

    notifyAdmins({
      type: 'support',
      title: 'New support ticket',
      body: `${trackingCode}: ${payload.subject}`,
      link: '/admin/dashboard?tab=support',
      meta: { ticketId: ticket.id, trackingCode }
    });
    if (ticket.userId) {
      notifyUser(ticket.userId, {
        type: 'support',
        title: 'Support ticket received',
        body: `We received your ticket ${trackingCode}.`,
        link: '/support',
        meta: { ticketId: ticket.id, trackingCode }
      });
    }

    return res.json({ success: true, data: mapTicket(ticket) });
  } catch (error: any) {
    console.error('Create support ticket error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to create ticket' });
  }
};

export const getTicketById = async (req: Request, res: Response) => {
  try {
    const { idOrCode } = req.params as any;
    const { email } = req.query as any;

    const ticket = await prisma.supportTicket.findFirst({
      where: {
        OR: [{ id: idOrCode }, { trackingCode: idOrCode }],
        ...(email ? { email: String(email) } : {})
      },
      include: { replies: true }
    });

    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });

    return res.json({ success: true, data: mapTicket(ticket) });
  } catch (error: any) {
    console.error('Get support ticket error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load ticket' });
  }
};

export const replyToTicket = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    const { message } = req.body || {};
    if (!message) return res.status(400).json({ success: false, error: 'message is required' });

    const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });

    const reply = await prisma.supportTicketReply.create({
      data: {
        ticketId: ticket.id,
        userId: user?.id || null,
        message,
        isFromAdmin: isAdmin(user?.role)
      }
    });

    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: { updatedAt: new Date(), isReadByAdmin: isAdmin(user?.role) ? true : false, isReadByUser: !isAdmin(user?.role) }
    });

    const fromAdmin = isAdmin(user?.role);
    if (fromAdmin && ticket.userId) {
      notifyUser(ticket.userId, {
        type: 'support',
        title: 'Support replied',
        body: message,
        link: '/support',
        meta: { ticketId: ticket.id }
      });
    }
    if (!fromAdmin) {
      notifyAdmins({
        type: 'support',
        title: 'Support reply',
        body: message,
        link: '/admin/dashboard?tab=support',
        meta: { ticketId: ticket.id }
      });
    }

    return res.json({ success: true, data: mapReply(reply) });
  } catch (error: any) {
    console.error('Reply to support ticket error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to reply to ticket' });
  }
};

export const listTickets = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!isAdmin(user?.role)) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const tickets = await prisma.supportTicket.findMany({
      orderBy: { updatedAt: 'desc' },
      include: { replies: true }
    });

    return res.json({ success: true, data: tickets.map(mapTicket) });
  } catch (error: any) {
    console.error('List support tickets error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load tickets' });
  }
};

export const listMyTickets = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!user?.id) {
      return res.status(401).json({ success: false, error: 'Not authorized' });
    }

    const tickets = await prisma.supportTicket.findMany({
      where: { userId: user.id },
      orderBy: { updatedAt: 'desc' },
      include: { replies: true }
    });

    return res.json({ success: true, data: tickets.map(mapTicket) });
  } catch (error: any) {
    console.error('List my support tickets error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to load tickets' });
  }
};

export const updateTicketStatus = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!isAdmin(user?.role)) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const status = req.body?.status;
    if (!status) return res.status(400).json({ success: false, error: 'status is required' });

    await prisma.supportTicket.update({
      where: { id: req.params.id },
      data: { status }
    });

    return res.json({ success: true, data: null });
  } catch (error: any) {
    console.error('Update ticket status error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update status' });
  }
};

export const updateTicketPriority = async (req: Request, res: Response) => {
  try {
    const user = req.user;
    if (!isAdmin(user?.role)) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const priority = req.body?.priority;
    if (!priority) return res.status(400).json({ success: false, error: 'priority is required' });

    await prisma.supportTicket.update({
      where: { id: req.params.id },
      data: { priority }
    });

    return res.json({ success: true, data: null });
  } catch (error: any) {
    console.error('Update ticket priority error:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to update priority' });
  }
};
