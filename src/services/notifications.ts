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
  critical?: number;
  high?: number;
  pinned?: number;
  byCategory?: Record<string, number>;
};

export type NotificationInboxQuery = {
  limit?: number;
  cursor?: string;
  category?: string;
  q?: string;
  unreadOnly?: boolean;
  readOnly?: boolean;
  includeArchived?: boolean;
  archivedOnly?: boolean;
  priority?: string;
  highPriorityOnly?: boolean;
  criticalOnly?: boolean;
  pinnedOnly?: boolean;
  timeRange?: string;
};

export type NotificationInboxPage = {
  items: any[];
  pagination: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
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
  getPage: async (options?: NotificationInboxQuery): Promise<NotificationInboxPage> => {
    const res = await api.get('/notifications', {
      params: {
        limit: Math.max(10, Math.min(100, Number(options?.limit || 40))),
        ...(options?.cursor ? { cursor: options.cursor } : {}),
        ...(options?.category && options.category !== 'all' ? { category: options.category } : {}),
        ...(options?.q ? { q: options.q } : {}),
        ...(options?.unreadOnly ? { unreadOnly: 'true' } : {}),
        ...(options?.readOnly ? { readOnly: 'true' } : {}),
        ...(options?.includeArchived ? { includeArchived: 'true' } : {}),
        ...(options?.archivedOnly ? { archivedOnly: 'true' } : {}),
        ...(options?.priority ? { priority: options.priority } : {}),
        ...(options?.highPriorityOnly ? { highPriorityOnly: 'true' } : {}),
        ...(options?.criticalOnly ? { criticalOnly: 'true' } : {}),
        ...(options?.pinnedOnly ? { pinnedOnly: 'true' } : {}),
        ...(options?.timeRange ? { timeRange: options.timeRange } : {})
      }
    });
    const payload = res.data?.data;
    const pagination = res.data?.pagination || {
      limit: Number(options?.limit || 40),
      hasMore: false,
      nextCursor: null
    };
    if (Array.isArray(payload)) {
      return { items: payload, pagination };
    }
    if (payload && Array.isArray(payload.items)) {
      return {
        items: payload.items,
        pagination: payload.pagination || pagination
      };
    }
    return { items: [], pagination };
  },
  getAll: async (options?: NotificationInboxQuery) => {
    const page = await NotificationService.getPage(options);
    return page.items;
  },
  getSummary: async (): Promise<NotificationSummary> => {
    const res = await api.get('/notifications/summary');
    return (
      res.data?.data || {
        unread: 0,
        total: 0,
        archived: 0,
        critical: 0,
        high: 0,
        pinned: 0,
        byCategory: {}
      }
    );
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
    action:
      | 'read'
      | 'unread'
      | 'archive'
      | 'unarchive'
      | 'delete'
      | 'restore'
      | 'pin'
      | 'unpin',
    ids: string[]
  ) => {
    const res = await api.post('/notifications/bulk', { action, ids });
    return res.data?.data;
  },
  archive: async (ids: string[]) => NotificationService.bulkUpdate('archive', ids),
  delete: async (ids: string[]) => NotificationService.bulkUpdate('delete', ids),
  pin: async (ids: string[]) => NotificationService.bulkUpdate('pin', ids),
  unpin: async (ids: string[]) => NotificationService.bulkUpdate('unpin', ids),
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
