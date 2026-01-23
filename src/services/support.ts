import api from './api';
import { SupportTicket, TicketReply, TicketStatus, TicketPriority, TicketCategory } from '../types';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

const mapReply = (reply: any): TicketReply => ({
  id: reply.id,
  ticket_id: reply.ticket_id ?? reply.ticketId ?? '',
  sender: reply.sender,
  sender_name: reply.sender_name ?? reply.senderName ?? '',
  message: reply.message,
  timestamp: reply.timestamp ?? reply.created_at ?? reply.createdAt,
  attachments: reply.attachments ?? [],
  internal_note: reply.internal_note ?? false,
  ...(reply.ticketId ? { ticketId: reply.ticketId } : {}),
  ...(reply.senderName ? { senderName: reply.senderName } : {})
});

const mapTicket = (ticket: any): SupportTicket => ({
  id: ticket.id,
  tracking_code: ticket.tracking_code ?? ticket.trackingCode,
  user_id: ticket.user_id ?? ticket.userId ?? '',
  full_name: ticket.full_name ?? ticket.fullName ?? '',
  email: ticket.email ?? '',
  mobile: ticket.mobile ?? '',
  subject: ticket.subject ?? '',
  message: ticket.message ?? '',
  status: ticket.status,
  priority: ticket.priority,
  category: ticket.category ?? '',
  created_at: ticket.created_at ?? ticket.createdAt ?? '',
  updated_at: ticket.updated_at ?? ticket.updatedAt ?? '',
  replies: Array.isArray(ticket.replies) ? ticket.replies.map(mapReply) : [],
  is_read_by_admin: ticket.is_read_by_admin ?? ticket.isReadByAdmin ?? false,
  is_read_by_user: ticket.is_read_by_user ?? ticket.isReadByUser ?? false,
  attachments: ticket.attachments ?? [],
  trackingCode: ticket.trackingCode ?? ticket.tracking_code,
  userId: ticket.userId ?? ticket.user_id,
  fullName: ticket.fullName ?? ticket.full_name,
  createdAt: ticket.createdAt ?? ticket.created_at,
  updatedAt: ticket.updatedAt ?? ticket.updated_at,
  isReadByAdmin: ticket.isReadByAdmin ?? ticket.is_read_by_admin,
  isReadByUser: ticket.isReadByUser ?? ticket.is_read_by_user
});

const mapCategory = (category: any): TicketCategory => ({
  id: category.id,
  name: category.name,
  is_active: category.is_active ?? category.isActive ?? true,
  isActive: category.isActive ?? category.is_active ?? true
});

const emitCategoriesUpdate = () => {
  try {
    localStorage.setItem('support_categories_updated', String(Date.now()));
  } catch (e) {
    // ignore storage errors
  }
};

export const SupportService = {
  getCategories: async (): Promise<TicketCategory[]> => {
    const response = await api.get('/support/categories');
    const data = extractData<TicketCategory[]>(response);
    return Array.isArray(data) ? data.map(mapCategory) : [];
  },

  saveCategory: async (category: TicketCategory): Promise<TicketCategory> => {
    const payload = {
      id: category.id,
      name: category.name,
      is_active: category.is_active ?? category.isActive ?? true
    };
    const response = await api.post('/support/categories', payload, { params: { role: 'admin' } });
    const saved = mapCategory(extractData<TicketCategory>(response));
    emitCategoriesUpdate();
    return saved;
  },

  deleteCategory: async (id: string): Promise<void> => {
    await api.delete(`/support/categories/${id}`, { params: { role: 'admin' } });
    emitCategoriesUpdate();
  },

  createTicket: async (data: Partial<SupportTicket>): Promise<SupportTicket> => {
    const response = await api.post('/support/tickets', data);
    return mapTicket(extractData<SupportTicket>(response));
  },

  createTicketAuth: async (data: Partial<SupportTicket>): Promise<SupportTicket> => {
    const response = await api.post('/support/tickets/auth', data);
    return mapTicket(extractData<SupportTicket>(response));
  },

  getTicketById: async (idOrCode: string, email?: string): Promise<SupportTicket | null> => {
    const response = await api.get(`/support/tickets/${idOrCode}`, {
      params: email ? { email } : undefined
    });
    const data = extractData<SupportTicket | null>(response);
    return data ? mapTicket(data) : null;
  },

  replyToTicket: async (ticketId: string, reply: Partial<TicketReply>): Promise<TicketReply> => {
    const response = await api.post(`/support/tickets/${ticketId}/replies`, reply, { params: { role: 'admin' } });
    return mapReply(extractData<TicketReply>(response));
  },

  getAllTickets: async (): Promise<SupportTicket[]> => {
    const response = await api.get('/support/tickets', { params: { role: 'admin' } });
    const data = extractData<SupportTicket[]>(response);
    return Array.isArray(data) ? data.map(mapTicket) : [];
  },

  getMyTickets: async (): Promise<SupportTicket[]> => {
    const response = await api.get('/support/tickets/mine');
    const data = extractData<SupportTicket[]>(response);
    return Array.isArray(data) ? data.map(mapTicket) : [];
  },

  updateTicketStatus: async (id: string, status: TicketStatus): Promise<void> => {
    await api.patch(`/support/tickets/${id}/status`, { status }, { params: { role: 'admin' } });
  },

  updateTicketPriority: async (id: string, priority: TicketPriority): Promise<void> => {
    await api.patch(`/support/tickets/${id}/priority`, { priority }, { params: { role: 'admin' } });
  }
};
