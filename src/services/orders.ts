import api from "./api";

export type OrderStatus = 'active' | 'delivered' | 'revision_requested' | 'completed' | 'cancelled';

export interface Order {
  id: string;
  gigId: string;
  gigTitle: string;
  buyerId: string;
  buyerName: string;
  status: OrderStatus;
  amount: number;
  requirements: string;
  timeline: Array<{
    status: string;
    timestamp: string;
  }>;
  milestones: Array<{
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
  note: string;
  milestoneId?: string;
}

export const ordersApi = {
  getOrders: async (params: {
    role?: string;
    status?: string;
    page?: number;
    limit?: number;
  } = {}): Promise<OrdersResponse> => {
    const response = await api.get('/orders', { params });
    return response.data.data;
  },

  getOrder: async (id: string, role: string): Promise<Order> => {
    const response = await api.get(`/orders/${id}`, { params: { role } });
    return response.data.data;
  },

  deliverOrder: async (id: string, data: DeliverOrderData): Promise<void> => {
    await api.post(`/orders/${id}/deliver`, data);
  },

  requestInfo: async (id: string, message: string): Promise<void> => {
    await api.post(`/orders/${id}/request-info`, { message });
  },

  proposeRevision: async (id: string, data: { message: string; proposedChanges?: string }): Promise<void> => {
    await api.post(`/orders/${id}/propose-revision`, data);
  },

  getMyOrderSummary: async (): Promise<{ active: number; revision: number }> => {
    try {
      const response = await api.get('/orders/summary');
      return response.data.data || { active: 0, revision: 0 };
    } catch {
      return { active: 0, revision: 0 };
    }
  },
};