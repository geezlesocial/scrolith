import api from './api';

export const fetchNotifications = async () => {
  const res = await api.get('/notifications');
  return res.data?.data || [];
};

export default { fetchNotifications };

interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

const handleApiResponse = <T>(response: any): T => {
  if (response?.data?.success === false) {
    throw new Error(response.data.error || 'API request failed');
  }
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined && response.data.success !== false) return response.data as T;
  return response as T;
};

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  isRead: boolean;
  actionUrl?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
  pagination?: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface QuietHourRule {
  id: string;
  userId: string;
  label?: string;
  channel: 'ALL' | 'IN_APP' | 'PUSH' | 'EMAIL';
  timezone?: string;
  daysOfWeek: string[];
  startMinute: number;
  endMinute: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export type NotificationSummary = {
  unread: number;
  total: number;
  archived: number;
};

export const notificationsApi = {
  getNotifications: async (): Promise<Notification[]> => {
    const response = await api.get<ApiResponse<Notification[]>>('/notifications');
    return handleApiResponse(response);
  },

  markAsRead: async (ids: string[] | string): Promise<void> => {
    const payload = { ids: Array.isArray(ids) ? ids : [ids] };
    const response = await api.post<ApiResponse<void>>('/notifications/mark-read', payload);
    handleApiResponse(response);
  },

  markAllAsRead: async (): Promise<void> => {
    const response = await api.post<ApiResponse<void>>('/notifications/mark-all-read');
    handleApiResponse(response);
  },

  getUnreadCount: async (): Promise<{ count: number }> => {
    try {
      const response = await api.get<ApiResponse<NotificationSummary>>('/notifications/summary');
      const data = handleApiResponse(response) as NotificationSummary;
      return { count: Number(data?.unread || 0) };
    } catch {
      const response = await api.get<ApiResponse<any>>('/notifications');
      const data: any = handleApiResponse(response);
      return {
        count: Array.isArray(data) ? data.filter((n: Notification) => !n.isRead).length : 0
      };
    }
  }
};

export const NotificationService = {
  getAll: async (options?: {
    limit?: number;
    cursor?: string;
    category?: string;
    unreadOnly?: boolean;
    includeArchived?: boolean;
  }) => {
    const res = await api.get('/notifications', {
      params: {
        limit: Math.max(20, Math.min(100, Number(options?.limit || 80))),
        ...(options?.cursor ? { cursor: options.cursor } : {}),
        ...(options?.category ? { category: options.category } : {}),
        ...(options?.unreadOnly ? { unreadOnly: 'true' } : {}),
        ...(options?.includeArchived ? { includeArchived: 'true' } : {})
      }
    });
    const payload = res.data?.data;
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.items)) return payload.items;
    return [];
  },
  getSummary: async (): Promise<NotificationSummary> => {
    const res = await api.get('/notifications/summary');
    return res.data?.data || { unread: 0, total: 0, archived: 0 };
  },
  getUnread: async () => {
    const res = await api.get('/notifications', { params: { unreadOnly: 'true' } });
    const data = res.data?.data || [];
    return Array.isArray(data) ? data.filter((n: any) => !(n.isRead ?? n.is_read)) : [];
  },
  getForUser: async (userId: string) => {
    const res = await api.get(`/notifications/user/${userId}`);
    return res.data?.data || [];
  },
  markAsRead: async (ids: string[] | string) => {
    const payload = { ids: Array.isArray(ids) ? ids : [ids] };
    await api.post('/notifications/mark-read', payload);
  },
  markAsUnread: async (ids: string[] | string) => {
    const payload = { ids: Array.isArray(ids) ? ids : [ids] };
    await api.post('/notifications/mark-unread', payload);
  },
  markAllAsRead: async () => {
    await api.post('/notifications/mark-all-read');
  },
  bulkUpdate: async (
    action: 'read' | 'unread' | 'archive' | 'unarchive' | 'delete' | 'restore',
    ids: string[]
  ) => {
    const res = await api.post('/notifications/bulk', { action, ids });
    return res.data?.data;
  },
  archive: async (ids: string[]) => NotificationService.bulkUpdate('archive', ids),
  delete: async (ids: string[]) => NotificationService.bulkUpdate('delete', ids),
  emit: async (payload: {
    type: string;
    recipientId?: string;
    recipientIds?: string[];
    title?: string;
    body?: string;
    category?: string;
    priority?: string;
    deepLink?: string;
    metadata?: Record<string, unknown>;
    idempotencyKey?: string;
  }) => {
    const res = await api.post('/notifications/emit', payload);
    return res.data?.data;
  },
  getQuietHours: async (): Promise<QuietHourRule[]> => {
    const res = await api.get('/notifications/quiet-hours');
    const rows = res.data?.data;
    return Array.isArray(rows) ? rows : [];
  },
  createQuietHour: async (payload: {
    label?: string | null;
    channel?: 'ALL' | 'IN_APP' | 'PUSH' | 'EMAIL';
    timezone?: string | null;
    daysOfWeek?: string[];
    startTime?: string;
    endTime?: string;
  }): Promise<QuietHourRule> => {
    const res = await api.post('/notifications/quiet-hours', payload);
    return handleApiResponse<QuietHourRule>(res);
  },
  deleteQuietHour: async (id: string): Promise<void> => {
    await api.delete(`/notifications/quiet-hours/${encodeURIComponent(id)}`);
  }
};
