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
    const response = await api.get<ApiResponse<any>>('/notifications');
    const data: any = handleApiResponse(response);
    return {
      count: Array.isArray(data) ? data.filter((n: Notification) => !n.isRead).length : 0
    };
  }
};

export const NotificationService = {
  getAll: async () => {
    const res = await api.get('/notifications');
    return res.data?.data || [];
  },
  getUnread: async () => {
    const res = await api.get('/notifications');
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
  markAllAsRead: async () => {
    await api.post('/notifications/mark-all-read');
  }
};
