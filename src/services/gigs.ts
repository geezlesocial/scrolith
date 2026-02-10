import api from './api';

export const fetchMyGigs = async () => {
  const res = await api.get('/gigs?ownerId=me&role=freelancer');
  const data = res.data?.data;
  if (Array.isArray(data)) return data;
  if (data?.gigs && Array.isArray(data.gigs)) return data.gigs;
  return [];
};

export const createGig = async (payload: any) => {
  const res = await api.post('/gigs', payload);
  return res.data?.data;
};

export const updateGig = async (id: string, payload: any) => {
  const res = await api.put(`/gigs/${id}`, payload);
  return res.data?.data;
};

export const deleteGig = async (id: string) => {
  const res = await api.delete(`/gigs/${id}`);
  return res.data?.data;
};

export const submitGig = async (id: string) => {
  const res = await api.post(`/gigs/${id}/submit`);
  return res.data?.data;
};

export const pauseGig = async (id: string) => {
  const res = await api.post(`/gigs/${id}/pause`);
  return res.data?.data;
};

export const activateGig = async (id: string) => {
  const res = await api.post(`/gigs/${id}/activate`);
  return res.data?.data;
};

export default { fetchMyGigs, createGig, updateGig, deleteGig, submitGig, pauseGig, activateGig };
 

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

export interface Gig {
  id: string;
  title: string;
  description: string;
  slug?: string;
  category: string;
  subcategory: string;
  price: {
    type: 'fixed' | 'hourly';
    amount: number;
    minAmount?: number;
    maxAmount?: number;
  };
  status: string;
  rejectionReason?: string;
  performance: {
    views: number;
    clicks: number;
    orders: number;
    rating: number;
    reviews: number;
  };
  freelancerId?: string;
  freelancerName?: string;
  freelancerAvatar?: string | null;
  freelancerProfilePhotoFileId?: string | null;
  freelancerIsPro?: boolean;
  media: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateGigData {
  title: string;
  description: string;
  category: string;
  subcategory: string;
  price: Gig['price'];
  media: string[];
  tags: string[];
  requirements?: string[];
  deliveryTime?: number;
  revisions?: number;
}

export interface GigsResponse {
  gigs: Gig[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export const gigsApi = {
  getGigs: async (params: {
    ownerId?: string;
    role?: string;
    status?: string;
    page?: number;
    limit?: number;
    search?: string;
  } = {}): Promise<GigsResponse> => {
    const response = await api.get<ApiResponse<GigsResponse>>('/gigs', { params });
    return handleApiResponse(response);
  },

  createGig: async (data: CreateGigData): Promise<Gig> => {
    const response = await api.post<ApiResponse<Gig>>('/gigs', data);
    return handleApiResponse(response);
  },

  updateGig: async (id: string, data: Partial<CreateGigData>): Promise<Gig> => {
    const response = await api.put<ApiResponse<Gig>>(`/gigs/${id}`, data);
    return handleApiResponse(response);
  },

  deleteGig: async (id: string): Promise<void> => {
    const response = await api.delete<ApiResponse<void>>(`/gigs/${id}`);
    handleApiResponse(response);
  },

  submitGig: async (id: string): Promise<void> => {
    const response = await api.post<ApiResponse<void>>(`/gigs/${id}/submit`);
    handleApiResponse(response);
  },

  pauseGig: async (id: string): Promise<void> => {
    const response = await api.post<ApiResponse<void>>(`/gigs/${id}/pause`);
    handleApiResponse(response);
  },

  activateGig: async (id: string): Promise<void> => {
    const response = await api.post<ApiResponse<void>>(`/gigs/${id}/activate`);
    handleApiResponse(response);
  }
};
