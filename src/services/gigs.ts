import api from "./api";

export type GigStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'active' | 'rejected' | 'paused' | 'archived';

export interface Gig {
  id: string;
  title: string;
  description: string;
  category: string;
  subcategory: string;
  status: GigStatus;
  pricing: {
    type: 'fixed' | 'hourly';
    amount: number;
  };
  attachments: string[];
  tags: string[];
  skills: string[];
  views: number;
  clicks: number;
  orders: number;
  rating: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateGigData {
  title: string;
  description: string;
  category: string;
  subcategory: string;
  pricing: {
    type: 'fixed' | 'hourly';
    amount: number;
  };
  attachments: string[];
  tags: string[];
  skills: string[];
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
    status?: GigStatus;
    page?: number;
    limit?: number;
  } = {}): Promise<GigsResponse> => {
    const response = await api.get('/gigs', { params });
    return response.data.data;
  },

  createGig: async (data: CreateGigData): Promise<Gig> => {
    const response = await api.post('/gigs', data);
    return response.data.data;
  },

  updateGig: async (id: string, data: Partial<CreateGigData>): Promise<Gig> => {
    const response = await api.put(`/gigs/${id}`, data);
    return response.data.data;
  },

  deleteGig: async (id: string): Promise<void> => {
    await api.delete(`/gigs/${id}`);
  },

  submitGig: async (id: string): Promise<void> => {
    await api.post(`/gigs/${id}/submit`);
  },

  pauseGig: async (id: string): Promise<void> => {
    await api.post(`/gigs/${id}/pause`);
  },

  activateGig: async (id: string): Promise<void> => {
    await api.post(`/gigs/${id}/activate`);
  },
};