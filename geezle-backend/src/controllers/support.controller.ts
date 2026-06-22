import { Request, Response } from 'express';
import prisma from '../utils/prismaClient';
import realtime from '../utils/realtime';
import { verifyRecaptcha } from '../utils/recaptcha';
import { sendSystemEmail } from '../services/email.service';
import { toAbsoluteFrontendUrl } from '../services/notificationActionUrl.service';
import { sendPushToUser } from '../services/pushNotifications';
import { ensureDefaultSupportTicketCategories } from '../services/defaultCategorySeed.service';
import { publishIntegrationEvent } from '../services/talentCloud.service';

const COMPANY_NAME = 'Scrolith';
const SUPPORT_MAILBOX = 'support@scrolith.com';
const CONTACT_MAILBOX = 'contact@scrolith.com';
const INFO_MAILBOX = 'info@scrolith.com';
const INVESTOR_MAILBOX = 'investors@scrith.com';
const PUBLIC_SUPPORT_ROUTE = '/support';
const USER_SUPPORT_ROUTE = '/dashboard?tab=support';
const ADMIN_SUPPORT_ROUTE = '/admin/dashboard?tab=support';

const isAdmin = (role?: string) => {
  const normalized = String(role || '').toUpperCase();
  return normalized === 'ADMIN' || normalized === 'MODERATOR';
};

const cleanString = (value: unknown) => String(value || '').trim();

const toSafeStringArray = (value: unknown) =>
  Array.isArray(value)
    ? value
        .map((entry) => cleanString(entry))
        .filter(Boolean)
        .slice(0, 10)
    : [];

const summarizeText = (value: string, max = 180) => {
  const normalized = cleanString(value).replace(/\s+/g, ' ');
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1)).trim()}…`;
};

const escapeHtml = (value: unknown) =>
  String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const toAbsoluteUrl = (path: string) => toAbsoluteFrontendUrl(path) || `https://scrolith.com${path}`;

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
  sender_name: reply.senderName || (reply.isFromAdmin ? 'Scrolith Support' : 'User'),
  senderName: reply.senderName || (reply.isFromAdmin ? 'Scrolith Support' : 'User'),
  message: reply.message,
  timestamp: reply.createdAt.toISOString(),
  attachments: Array.isArray(reply.attachments) ? reply.attachments : [],
  internal_note: Boolean(reply.internalNote),
  internalNote: Boolean(reply.internalNote)
});

const mapTicket = (ticket: any) => ({
  id: ticket.id,
  tracking_code: ticket.trackingCode,
  trackingCode: ticket.trackingCode,
  user_id: ticket.userId || '',
  userId: ticket.userId || '',
  full_name: ticket.fullName,
  fullName: ticket.fullName,
  email: ticket.email,
  mobile: ticket.mobile,
  subject: ticket.subject,
  message: ticket.message,
  status: ticket.status,
  priority: ticket.priority,
  category: ticket.category,
  created_at: ticket.createdAt.toISOString(),
  createdAt: ticket.createdAt.toISOString(),
  updated_at: ticket.updatedAt.toISOString(),
  updatedAt: ticket.updatedAt.toISOString(),
  replies: Array.isArray(ticket.replies) ? ticket.replies.map(mapReply) : [],
  is_read_by_admin: ticket.isReadByAdmin,
  isReadByAdmin: ticket.isReadByAdmin,
  is_read_by_user: ticket.isReadByUser,
  isReadByUser: ticket.isReadByUser,
  attachments: Array.isArray(ticket.attachments) ? ticket.attachments : []
});

const buildAdminEmailHtml = (ticket: any, actionUrl: string, intro: string) => {
  const attachments = Array.isArray(ticket.attachments) ? ticket.attachments : [];
  const attachmentList = attachments.length
    ? `<ul>${attachments.map((item: string) => `<li><a href="${escapeHtml(item)}">${escapeHtml(item)}</a></li>`).join('')}</ul>`
    : '<p>No attachments included.</p>';

  return `
    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;">
      <h2 style="margin:0 0 12px;">${escapeHtml(intro)}</h2>
      <p style="margin:0 0 16px;">A user sent a new message to the ${COMPANY_NAME} team.</p>
      <table style="border-collapse:collapse;width:100%;max-width:640px;">
        <tr><td style="padding:6px 0;font-weight:700;">Tracking code</td><td style="padding:6px 0;">${escapeHtml(ticket.trackingCode)}</td></tr>
        <tr><td style="padding:6px 0;font-weight:700;">Sender</td><td style="padding:6px 0;">${escapeHtml(ticket.fullName)}</td></tr>
        <tr><td style="padding:6px 0;font-weight:700;">Email</td><td style="padding:6px 0;">${escapeHtml(ticket.email)}</td></tr>
        <tr><td style="padding:6px 0;font-weight:700;">Mobile</td><td style="padding:6px 0;">${escapeHtml(ticket.mobile || 'Not provided')}</td></tr>
        <tr><td style="padding:6px 0;font-weight:700;">Reason</td><td style="padding:6px 0;">${escapeHtml(ticket.category)}</td></tr>
        <tr><td style="padding:6px 0;font-weight:700;">Subject</td><td style="padding:6px 0;">${escapeHtml(ticket.subject)}</td></tr>
      </table>
      <div style="margin:18px 0;padding:16px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
        <div style="font-weight:700;margin-bottom:8px;">Message</div>
        <div>${escapeHtml(ticket.message).replace(/\n/g, '<br/>')}</div>
      </div>
      <div style="margin:18px 0;">
        <div style="font-weight:700;margin-bottom:8px;">Attachments</div>
        ${attachmentList}
      </div>
      <p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:999px;font-weight:700;">Open Admin Inbox</a></p>
    </div>
  `;
};

const buildUserReceiptHtml = (ticket: any, actionUrl: string) => `
  <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;">
    <h2 style="margin:0 0 12px;">We received your message</h2>
    <p style="margin:0 0 14px;">Your message has been delivered to the ${COMPANY_NAME} team.</p>
    <p style="margin:0 0 14px;"><strong>Tracking code:</strong> ${escapeHtml(ticket.trackingCode)}</p>
    <p style="margin:0 0 14px;"><strong>Subject:</strong> ${escapeHtml(ticket.subject)}</p>
    <p style="margin:0 0 14px;">You can follow the conversation in your account support center. We may also email you when the team replies.</p>
    <p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:999px;font-weight:700;">Open Support Center</a></p>
  </div>
`;

const buildReplyEmailHtml = (ticket: any, reply: any, actionUrl: string) => `
  <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.6;">
    <h2 style="margin:0 0 12px;">New reply on your Scrolith conversation</h2>
    <p style="margin:0 0 14px;">There is a new reply on <strong>${escapeHtml(ticket.subject)}</strong>.</p>
    <div style="margin:18px 0;padding:16px;border:1px solid #e2e8f0;border-radius:12px;background:#f8fafc;">
      <div style="font-weight:700;margin-bottom:8px;">${escapeHtml(reply.senderName || 'Scrolith Support')}</div>
      <div>${escapeHtml(reply.message).replace(/\n/g, '<br/>')}</div>
    </div>
    <p><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:999px;font-weight:700;">View Conversation</a></p>
  </div>
`;

const getMailboxRecipients = (category: string) => {
  const normalized = cleanString(category).toLowerCase();
  const recipients = new Set<string>([SUPPORT_MAILBOX]);

  if (/investment|investor|fund/.test(normalized)) recipients.add(INVESTOR_MAILBOX);
  if (/partner|partnership|advert|sponsor|media|press/.test(normalized)) recipients.add(CONTACT_MAILBOX);
  if (/advice|general|enterprise|sales|career|recruit|business/.test(normalized)) recipients.add(INFO_MAILBOX);
  if (/legal|compliance|policy|privacy|copyright|trademark/.test(normalized)) recipients.add(CONTACT_MAILBOX);

  return Array.from(recipients);
};

const getAdminRecipients = async () =>
  prisma.user.findMany({
    where: {
      role: { in: ['ADMIN', 'MODERATOR'] as any },
      isActive: true
    },
    select: { id: true, name: true, email: true, role: true }
  });

const createStoredNotification = async (input: {
  userId: string;
  actorId?: string | null;
  type: string;
  title: string;
  body: string;
  actionUrl: string;
  meta?: Record<string, any>;
}) => {
  const meta = {
    ...(input.meta || {}),
    actionUrl: input.actionUrl,
    action_url: input.actionUrl,
    link: input.actionUrl
  };

  const created = await prisma.notification.create({
    data: {
      userId: input.userId,
      actorId: input.actorId || null,
      type: input.type,
      title: input.title,
      body: input.body,
      meta
    }
  });

  const eventPayload = {
    id: created.id,
    type: input.type,
    title: input.title,
    body: input.body,
    actionUrl: input.actionUrl,
    createdAt: created.createdAt.toISOString(),
    meta
  };

  realtime.emitToUser(input.userId, 'notifications:new', eventPayload);
  await sendPushToUser(input.userId, eventPayload).catch(() => ({ attempted: 0, sent: 0, failed: 0, errors: [] }));
  return created;
};

const sendEmails = async (recipients: Array<string | null | undefined>, subject: string, html: string, text: string) => {
  const deduped = Array.from(
    new Set(
      recipients
        .map((entry) => cleanString(entry).toLowerCase())
        .filter(Boolean)
    )
  );

  await Promise.allSettled(
    deduped.map((to) =>
      sendSystemEmail({
        to,
        subject,
        html,
        text
      })
    )
  );
};

const notifyAdminsOfTicket = async (ticket: any) => {
  const admins = await getAdminRecipients();
  const actionUrl = ADMIN_SUPPORT_ROUTE;
  const absoluteActionUrl = toAbsoluteUrl(actionUrl);
  const title = ticket.category ? `New ${ticket.category} message` : 'New support ticket';
  const body = `${ticket.fullName} sent "${ticket.subject}".`;
  const meta = {
    ticketId: ticket.id,
    trackingCode: ticket.trackingCode,
    category: ticket.category
  };

  await Promise.allSettled(
    admins.map((admin) =>
      createStoredNotification({
        userId: admin.id,
        actorId: ticket.userId || null,
        type: 'support',
        title,
        body,
        actionUrl,
        meta
      })
    )
  );

  const emailRecipients = [
    ...admins.map((admin) => admin.email),
    ...getMailboxRecipients(ticket.category)
  ];
  await sendEmails(
    emailRecipients,
    `${COMPANY_NAME} Contact Message: ${ticket.subject}`,
    buildAdminEmailHtml(ticket, absoluteActionUrl, title),
    `${title}\nTracking code: ${ticket.trackingCode}\nSender: ${ticket.fullName}\nEmail: ${ticket.email}\nCategory: ${ticket.category}\nSubject: ${ticket.subject}\nMessage: ${ticket.message}\nReview: ${absoluteActionUrl}`
  );
};

const notifyTicketSenderReceived = async (ticket: any) => {
  const actionUrl = ticket.userId ? USER_SUPPORT_ROUTE : PUBLIC_SUPPORT_ROUTE;
  const absoluteActionUrl = toAbsoluteUrl(actionUrl);
  const title = 'Message received';
  const body = `We received your message "${ticket.subject}".`;

  if (ticket.userId) {
    await createStoredNotification({
      userId: ticket.userId,
      type: 'support',
      title,
      body,
      actionUrl: USER_SUPPORT_ROUTE,
      meta: {
        ticketId: ticket.id,
        trackingCode: ticket.trackingCode,
        category: ticket.category
      }
    });
  }

  await sendEmails(
    [ticket.email],
    `We received your message: ${ticket.subject}`,
    buildUserReceiptHtml(ticket, absoluteActionUrl),
    `We received your message "${ticket.subject}". Tracking code: ${ticket.trackingCode}. View your conversation: ${absoluteActionUrl}`
  );
};

const notifyTicketSenderReply = async (ticket: any, reply: any, actorId?: string | null) => {
  const actionUrl = ticket.userId ? USER_SUPPORT_ROUTE : PUBLIC_SUPPORT_ROUTE;
  const absoluteActionUrl = toAbsoluteUrl(actionUrl);
  const title = 'Scrolith replied to your message';
  const body = summarizeText(reply.message, 180);

  if (ticket.userId) {
    await createStoredNotification({
      userId: ticket.userId,
      actorId: actorId || null,
      type: 'support',
      title,
      body,
      actionUrl: USER_SUPPORT_ROUTE,
      meta: {
        ticketId: ticket.id,
        trackingCode: ticket.trackingCode
      }
    });
  }

  await sendEmails(
    [ticket.email],
    `Scrolith replied: ${ticket.subject}`,
    buildReplyEmailHtml(ticket, reply, absoluteActionUrl),
    `Scrolith replied to "${ticket.subject}": ${reply.message}\nView conversation: ${absoluteActionUrl}`
  );
};

const notifyAdminsOfReply = async (ticket: any, reply: any) => {
  const admins = await getAdminRecipients();
  const actionUrl = ADMIN_SUPPORT_ROUTE;
  const absoluteActionUrl = toAbsoluteUrl(actionUrl);
  const title = `Reply on ${ticket.subject}`;
  const body = `${reply.senderName || ticket.fullName} responded to ${ticket.trackingCode}.`;
  const meta = {
    ticketId: ticket.id,
    trackingCode: ticket.trackingCode,
    category: ticket.category
  };

  await Promise.allSettled(
    admins.map((admin) =>
      createStoredNotification({
        userId: admin.id,
        actorId: reply.userId || ticket.userId || null,
        type: 'support',
        title,
        body,
        actionUrl,
        meta
      })
    )
  );

  const emailRecipients = [
    ...admins.map((admin) => admin.email),
    ...getMailboxRecipients(ticket.category)
  ];
  await sendEmails(
    emailRecipients,
    `Conversation reply: ${ticket.subject}`,
    buildReplyEmailHtml(ticket, reply, absoluteActionUrl),
    `${reply.senderName || ticket.fullName} replied on "${ticket.subject}": ${reply.message}\nReview: ${absoluteActionUrl}`
  );
};

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

    const recaptchaCheck = await verifyRecaptcha(recaptchaToken, req.ip);
    if (recaptchaCheck.enforced && !recaptchaCheck.success) {
      return res.status(400).json({ success: false, error: recaptchaCheck.error || 'reCAPTCHA verification failed' });
    }

    const fullName = cleanString(payload.full_name ?? payload.fullName);
    const email = cleanString(payload.email);
    const subject = cleanString(payload.subject);
    const message = cleanString(payload.message);
    const category = cleanString(payload.category);

    if (!fullName || !email || !subject || !message || !category) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    const trackingCode = `TKT-${Date.now().toString(36).toUpperCase()}`;
    const ticket = await prisma.supportTicket.create({
      data: {
        trackingCode,
        userId: user?.id || null,
        fullName,
        email,
        mobile: cleanString(payload.mobile) || null,
        subject,
        message,
        category,
        status: cleanString(payload.status) || 'Open',
        priority: cleanString(payload.priority) || 'Low',
        attachments: toSafeStringArray(payload.attachments)
      },
      include: { replies: true }
    });

    await Promise.allSettled([notifyAdminsOfTicket(ticket), notifyTicketSenderReceived(ticket)]);
    await publishIntegrationEvent('dispute.ticket.created', {
      ticketId: ticket.id,
      trackingCode: ticket.trackingCode,
      userId: ticket.userId,
      category: ticket.category,
      status: ticket.status,
      priority: ticket.priority
    });
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
      include: {
        replies: {
          where: { internalNote: false },
          orderBy: { createdAt: 'asc' }
        }
      }
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
    const message = cleanString(req.body?.message);
    const attachments = toSafeStringArray(req.body?.attachments);
    const fromAdmin = isAdmin(user?.role);
    const internalNote = fromAdmin ? Boolean(req.body?.internalNote ?? req.body?.internal_note) : false;

    if (!message && attachments.length === 0) {
      return res.status(400).json({ success: false, error: 'message is required' });
    }

    const ticket = await prisma.supportTicket.findUnique({ where: { id: req.params.id } });
    if (!ticket) return res.status(404).json({ success: false, error: 'Ticket not found' });

    const senderName =
      cleanString(req.body?.senderName || req.body?.sender_name) ||
      (fromAdmin ? 'Scrolith Support' : cleanString(ticket.fullName) || 'User');

    const reply = await prisma.supportTicketReply.create({
      data: {
        ticketId: ticket.id,
        userId: user?.id || null,
        senderName,
        message,
        attachments,
        isFromAdmin: fromAdmin,
        internalNote
      }
    });

    await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: {
        updatedAt: new Date(),
        isReadByAdmin: fromAdmin,
        isReadByUser: !fromAdmin
      }
    });

    if (fromAdmin && !internalNote) {
      await notifyTicketSenderReply(ticket, reply, user?.id || null);
    }

    if (!fromAdmin) {
      await notifyAdminsOfReply(ticket, reply);
    }

    await publishIntegrationEvent('dispute.ticket.replied', {
      ticketId: ticket.id,
      replyId: reply.id,
      userId: user?.id || null,
      isFromAdmin: reply.isFromAdmin,
      internalNote: reply.internalNote
    });

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
      include: {
        replies: { orderBy: { createdAt: 'asc' } }
      }
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
      include: {
        replies: {
          where: { internalNote: false },
          orderBy: { createdAt: 'asc' }
        }
      }
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

    const status = cleanString(req.body?.status);
    if (!status) return res.status(400).json({ success: false, error: 'status is required' });

    await prisma.supportTicket.update({
      where: { id: req.params.id },
      data: { status }
    });
    await publishIntegrationEvent('dispute.ticket.status_changed', {
      ticketId: req.params.id,
      status,
      actorUserId: user?.id || null
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

    const priority = cleanString(req.body?.priority);
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
