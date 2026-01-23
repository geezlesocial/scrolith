import api from './api';

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

const mapOrder = (order: any): Order => ({
  id: order.id,
  gigId: order.gig_id ?? order.gigId ?? order.gig?.id ?? '',
  gigTitle: order.gig_title ?? order.gigTitle ?? order.gig?.title ?? '',
  buyerId: order.buyer_id ?? order.buyerId ?? order.client_id ?? order.clientId ?? '',
  buyerName: order.buyer_name ?? order.buyerName ?? order.client_name ?? order.clientName ?? order.buyer?.name ?? '',
  status: order.status ?? '',
  amount: Number(order.amount ?? 0),
  requirements: order.requirements ?? undefined,
  timeline: Array.isArray(order.timeline) ? order.timeline : [],
  milestones: Array.isArray(order.milestones) ? order.milestones : undefined,
  deliveredFiles: Array.isArray(order.delivered_files) ? order.delivered_files : Array.isArray(order.deliveredFiles) ? order.deliveredFiles : [],
  createdAt: order.created_at ?? order.createdAt ?? '',
  updatedAt: order.updated_at ?? order.updatedAt ?? ''
});

const mapOrdersResponse = (payload: any): OrdersResponse => {
  const ordersRaw = Array.isArray(payload?.orders) ? payload.orders : Array.isArray(payload) ? payload : [];
  const pagination = payload?.pagination || {
    page: 1,
    limit: ordersRaw.length,
    total: ordersRaw.length,
    pages: 1
  };

  return {
    orders: ordersRaw.map(mapOrder),
    pagination
  };
};

export interface Order {
  id: string;
  gigId: string;
  gigTitle: string;
  buyerId: string;
  buyerName: string;
  status: string;
  amount: number;
  requirements?: string;
  timeline: Array<{
    status: string;
    timestamp: string;
  }>;
  milestones?: Array<{
    id: string;
    title: string;
    amount: number;
    status: string;
    dueDate: string;
  }>;
  deliveredFiles: string[];
  createdAt: string;
  updatedAt: string;
}

export interface OrdersResponse {
  orders: Order[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface DeliverOrderData {
  files: string[];
  note?: string;
  milestoneId?: string;
}

export type OrderStatus =
  | 'active'
  | 'pending_delivery'
  | 'delivered'
  | 'revision_requested'
  | 'completed'
  | 'cancelled';

export const fetchOrders = async (opts: any = {}) => {
  const q = new URLSearchParams(opts).toString();
  const res = await api.get(`/orders${q ? `?${q}` : ''}`);
  const data = handleApiResponse<any>(res);
  return mapOrdersResponse(data).orders;
};

export const getOrder = async (id: string) => {
  const res = await api.get(`/orders/${id}`);
  const data = handleApiResponse<any>(res);
  return mapOrder(data);
};

export default { fetchOrders, getOrder };

export const ordersApi = {
  getOrders: async (params: {
    role?: string;
    status?: string;
    page?: number;
    limit?: number;
    ownerId?: string;
    owner_id?: string;
  } = {}): Promise<OrdersResponse> => {
    const response = await api.get<ApiResponse<OrdersResponse>>('/orders', { params });
    const data = handleApiResponse<any>(response);
    return mapOrdersResponse(data);
  },

  getOrder: async (id: string, role: string): Promise<Order> => {
    const response = await api.get<ApiResponse<Order>>(`/orders/${id}`, { params: { role } });
    const data = handleApiResponse<any>(response);
    return mapOrder(data);
  },

  deliverOrder: async (id: string, data: DeliverOrderData): Promise<void> => {
    const response = await api.post<ApiResponse<void>>(`/orders/${id}/deliver`, data);
    handleApiResponse(response);
  },

  requestInfo: async (id: string, message: string): Promise<void> => {
    const response = await api.post<ApiResponse<void>>(`/orders/${id}/request-info`, { message });
    handleApiResponse(response);
  },

  proposeRevision: async (id: string, data: { message: string; proposedChanges?: string }): Promise<void> => {
    const response = await api.post<ApiResponse<void>>(`/orders/${id}/propose-revision`, data);
    handleApiResponse(response);
  }
};

export const OrdersService = {
  list: async (params?: { role: 'freelancer' | 'employer'; status?: string }) => {
    const response = await api.get<ApiResponse<Order[] | OrdersResponse>>('/orders', { params });
    const data = handleApiResponse<any>(response);
    return mapOrdersResponse(data).orders;
  },
  getMyOrderSummary: async () => {
    try {
      const response = await api.get<ApiResponse<any>>('/orders/summary');
      return handleApiResponse(response);
    } catch {
      return null;
    }
  },
  invalidateCache: () => {}
};
