import api from './api';
import type { CartSummary, CartItem } from '../types';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

const normalizeItem = (item: any): CartItem => ({
  id: item.id,
  itemType: (item.item_type ?? item.itemType ?? (item.job_id || item.jobId ? 'job' : 'gig')) as 'gig' | 'job',
  gigId: item.gig_id ?? item.gigId,
  jobId: item.job_id ?? item.jobId,
  title: item.title ?? '',
  price: Number(item.price ?? 0),
  budget: item.budget ?? '',
  type: item.type ?? '',
  image: item.image ?? '',
  quantity: Number(item.quantity ?? 1),
  freelancerId: item.freelancer_id ?? item.freelancerId,
  freelancerName: item.freelancer_name ?? item.freelancerName,
  clientId: item.client_id ?? item.clientId,
  clientName: item.client_name ?? item.clientName,
  rating: Number(item.rating ?? 0),
  reviews: Number(item.reviews ?? 0),
  addedAt: item.added_at ?? item.addedAt
});

const normalizeCart = (payload: any): CartSummary => {
  const items = Array.isArray(payload?.items) ? payload.items.map(normalizeItem) : [];
  const totalItems = Number(payload?.total_items ?? payload?.totalItems ?? items.reduce((sum, item) => sum + (item.quantity || 0), 0));
  const subtotal = Number(payload?.subtotal ?? items.reduce((sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0), 0));
  return {
    id: payload?.id,
    items,
    subtotal,
    totalItems,
    updatedAt: payload?.updated_at ?? payload?.updatedAt
  };
};

export const CartService = {
  getCart: async (): Promise<CartSummary> => {
    const res = await api.get('/cart');
    const data = extractData<any>(res);
    return normalizeCart(data || {});
  },

  addItem: async (gigId: string, quantity = 1): Promise<CartSummary> => {
    const res = await api.post('/cart/items', { gig_id: gigId, quantity });
    const data = extractData<any>(res);
    return normalizeCart(data || {});
  },

  addJobItem: async (jobId: string, quantity = 1): Promise<CartSummary> => {
    const res = await api.post('/cart/items', { job_id: jobId, quantity });
    const data = extractData<any>(res);
    return normalizeCart(data || {});
  },

  updateItem: async (itemId: string, quantity: number): Promise<CartSummary> => {
    const res = await api.patch(`/cart/items/${encodeURIComponent(itemId)}`, { quantity });
    const data = extractData<any>(res);
    return normalizeCart(data || {});
  },

  removeItem: async (itemId: string): Promise<CartSummary> => {
    const res = await api.delete(`/cart/items/${encodeURIComponent(itemId)}`);
    const data = extractData<any>(res);
    return normalizeCart(data || {});
  },

  removeByGigId: async (gigId: string): Promise<CartSummary> => {
    const res = await api.delete('/cart/items', { data: { gig_id: gigId } });
    const data = extractData<any>(res);
    return normalizeCart(data || {});
  },

  removeByJobId: async (jobId: string): Promise<CartSummary> => {
    const res = await api.delete('/cart/items', { data: { job_id: jobId } });
    const data = extractData<any>(res);
    return normalizeCart(data || {});
  },

  clear: async (): Promise<CartSummary> => {
    const res = await api.delete('/cart');
    const data = extractData<any>(res);
    return normalizeCart(data || {});
  }
};
