import api from './api';

export const fetchNotifications = async (opts: { unreadOnly?: boolean } = {}) => {
  const q = opts.unreadOnly ? '?unreadOnly=true' : '';
  const res = await api.get(`/notifications${q}`);
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

export const notificationsApi = {
  getNotifications: async (params: {
    unreadOnly?: boolean;
    page?: number;
    limit?: number;
  } = {}): Promise<NotificationsResponse> => {
    const response = await api.get<ApiResponse<NotificationsResponse>>('/notifications', { params });
    return handleApiResponse(response);
  },

  markAsRead: async (id: string): Promise<void> => {
    const response = await api.post<ApiResponse<void>>(`/notifications/${id}/read`);
    handleApiResponse(response);
  },

  markAllAsRead: async (): Promise<void> => {
    const response = await api.post<ApiResponse<void>>('/notifications/mark-all-read');
    handleApiResponse(response);
  },

  getUnreadCount: async (): Promise<{ count: number }> => {
    const response = await api.get<ApiResponse<{ count: number }>>('/notifications', { params: { unreadOnly: true } });
    const data: any = handleApiResponse(response);
    return {
      count: Array.isArray(data) ? data.filter((n: Notification) => !n.isRead).length : (data?.count || 0)
    };
  }
};

export const NotificationService = {
  getAll: async () => {
    const res = await api.get('/notifications');
    return res.data?.data || [];
  },
  getUnread: async () => {
    const res = await api.get('/notifications', { params: { unreadOnly: true } });
    return res.data?.data || [];
  },
  getForUser: async (userId: string) => {
    const res = await api.get(`/notifications/user/${userId}`);
    return res.data?.data || [];
  },
  markAsRead: async (id: string) => {
    await api.post(`/notifications/${id}/read`);
  }
};
